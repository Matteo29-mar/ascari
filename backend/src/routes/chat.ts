import { Router } from "express";
import { prisma } from "../prisma";
import { getAuth } from "@clerk/express";
import { ensureUserInDb } from "../lib/authUser";

const router = Router();

async function requireMe(req: any) {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    const err: any = new Error("Not authenticated");
    err.status = 401;
    throw err;
  }

  const me = await ensureUserInDb(clerkId);
  return me;
}

function parseChatId(raw: any) {
  if (!raw || raw === "undefined") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * GET /api/chat/unread/count
 * Conteggio totale messaggi non letti per l'utente autenticato
 */
router.get("/unread/count", async (req, res) => {
  try {
    const me = await requireMe(req);

    const count = await prisma.message.count({
      where: {
        readAt: null,
        senderId: { not: me.id },
        chat: {
          OR: [{ buyerId: me.id }, { sellerId: me.id }],
        },
      },
    });

    return res.json({ count });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return res.status(status).json({ error: e?.message ?? "Error" });
  }
});

/**
 * GET /api/chat
 *
 * Regola:
 * - se chat è di perizia e la perizia è CANCELLED
 *   la chat resta visibile solo al venditore
 */
router.get("/", async (req, res) => {
  try {
    const me = await requireMe(req);

    const chats = await prisma.chat.findMany({
      where: {
        OR: [{ buyerId: me.id }, { sellerId: me.id }],
      },
      include: {
        buyer: { select: { id: true, name: true, email: true } },
        seller: { select: { id: true, name: true, email: true } },
        offer: { include: { car: true } },
        inspectionRequest: {
          include: { car: true },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    });

    const filtered = chats.filter((c) => {
      if (!c.inspectionRequestId) return true;
      const status = c.inspectionRequest?.status;
      if (status !== "CANCELLED") return true;
      return c.sellerId === me.id;
    });

    const normalized = filtered.map((c) => {
      const peer = c.buyerId === me.id ? c.seller : c.buyer;
      const car = c.offer?.car ?? c.inspectionRequest?.car ?? null;
      const kind = c.offerId
        ? "OFFER"
        : c.inspectionRequestId
        ? "INSPECTION"
        : "GENERIC";

      return {
        id: c.id,
        createdAt: c.createdAt,
        buyerId: c.buyerId,
        sellerId: c.sellerId,
        offerId: c.offerId ?? null,
        inspectionRequestId: c.inspectionRequestId ?? null,
        kind,
        peer,
        car,
        messages: c.messages,
        inspectionStatus: c.inspectionRequest?.status ?? null,
      };
    });

    return res.json({ ok: true, chats: normalized });
  } catch (err: any) {
    console.error("Chat LIST error", err);
    const status = err?.status ?? 500;
    return res.status(status).json({ error: err?.message ?? "Chat list error" });
  }
});

/**
 * GET /api/chat/:id
 *
 * - se chat perizia è CANCELLED
 *   il periziatore non può più aprirla
 *   il venditore può ancora aprirla
 */
router.get("/:id", async (req, res) => {
  const chatId = parseChatId(req.params.id);
  if (!chatId) return res.status(400).json({ error: "Chat id non valido" });

  try {
    const me = await requireMe(req);

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        buyer: { select: { id: true, name: true, email: true } },
        seller: { select: { id: true, name: true, email: true } },
        messages: { orderBy: { createdAt: "asc" } },
        offer: { include: { car: true } },
        inspectionRequest: {
          include: {
            car: true,
            seller: { select: { id: true, name: true, email: true } },
            inspector: {
              select: {
                id: true,
                workshopName: true,
                user: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
      },
    });

    if (!chat) return res.status(404).json({ error: "Chat not found" });

    if (chat.buyerId !== me.id && chat.sellerId !== me.id) {
      return res.status(403).json({ error: "Not allowed" });
    }

    if (
      chat.inspectionRequestId &&
      chat.inspectionRequest?.status === "CANCELLED" &&
      chat.buyerId === me.id
    ) {
      return res.status(403).json({ error: "Chat chiusa (perizia annullata)" });
    }

    await prisma.message.updateMany({
      where: {
        chatId,
        senderId: { not: me.id },
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    const peer = chat.buyerId === me.id ? chat.seller : chat.buyer;
    const car = chat.offer?.car ?? chat.inspectionRequest?.car ?? null;
    const kind = chat.offerId
      ? "OFFER"
      : chat.inspectionRequestId
      ? "INSPECTION"
      : "GENERIC";

    return res.json({
      ok: true,
      id: chat.id,
      createdAt: chat.createdAt,
      buyerId: chat.buyerId,
      sellerId: chat.sellerId,
      offerId: chat.offerId ?? null,
      inspectionRequestId: chat.inspectionRequestId ?? null,
      kind,
      peer,
      car,
      messages: chat.messages,
      meId: me.id,
      inspectionStatus: chat.inspectionRequest?.status ?? null,
    });
  } catch (err: any) {
    console.error("Chat GET error", err);
    const status = err?.status ?? 500;
    return res.status(status).json({ error: err?.message ?? "Chat load error" });
  }
});

/**
 * POST /api/chat/:id/message
 * se perizia CANCELLED: blocca invio dal periziatore
 */
router.post("/:id/message", async (req, res) => {
  const chatId = parseChatId(req.params.id);
  if (!chatId) return res.status(400).json({ error: "Chat id non valido" });

  const rawContent = req.body?.content;

  if (typeof rawContent !== "string") {
    return res.status(400).json({ error: "Message empty" });
  }

  const content = rawContent.replace(/\r\n/g, "\n");

  if (content.trim() === "") {
    return res.status(400).json({ error: "Message empty" });
  }

  try {
    const me = await requireMe(req);

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: { inspectionRequest: true },
    });

    if (!chat) return res.status(404).json({ error: "Chat not found" });

    if (chat.buyerId !== me.id && chat.sellerId !== me.id) {
      return res.status(403).json({ error: "Not allowed" });
    }

    if (
      chat.inspectionRequestId &&
      chat.inspectionRequest?.status === "CANCELLED" &&
      chat.buyerId === me.id
    ) {
      return res.status(403).json({ error: "Chat chiusa (perizia annullata)" });
    }

    const msg = await prisma.message.create({
      data: {
        chatId,
        senderId: me.id,
        content,
      },
    });

    return res.json(msg);
  } catch (err: any) {
    console.error("Chat POST error", err);
    const status = err?.status ?? 500;
    return res.status(status).json({ error: err?.message ?? "Message send error" });
  }
});

/**
 * DELETE /api/chat/:id
 */
router.delete("/:id", async (req, res) => {
  const chatId = parseChatId(req.params.id);
  if (!chatId) return res.status(400).json({ error: "Chat id non valido" });

  try {
    const me = await requireMe(req);

    const chat = await prisma.chat.findUnique({ where: { id: chatId } });
    if (!chat) return res.status(404).json({ error: "Chat not found" });

    if (chat.buyerId !== me.id && chat.sellerId !== me.id) {
      return res.status(403).json({ error: "Not allowed" });
    }

    await prisma.chat.delete({ where: { id: chatId } });
    return res.json({ ok: true });
  } catch (err: any) {
    console.error("Chat DELETE error", err);
    const status = err?.status ?? 500;
    return res.status(status).json({ error: err?.message ?? "Chat delete error" });
  }
});

export default router;