import { Router } from "express";
import { prisma } from "../prisma";
import { getAuth } from "@clerk/express";
import { ensureUserInDb } from "../lib/authUser";
import {
  isCarRemovedAfterSale,
  isCarSold,
  isCarSoldPendingRemoval,
  runSoldCarsVisualCleanup,
} from "../lib/carSaleLifecycle";

const router = Router();

async function requireMe(req: any) {
  const { userId: clerkId } = getAuth(req);

  if (!clerkId) {
    const err: any = new Error("Not authenticated");
    err.status = 401;
    throw err;
  }

  return ensureUserInDb(clerkId);
}

function parseChatId(raw: any) {
  if (!raw || raw === "undefined") return null;

  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;

  return n;
}

function getChatCar(chat: any) {
  return chat?.offer?.car ?? chat?.inspectionRequest?.car ?? null;
}

function getChatKind(chat: any) {
  if (chat?.offerId) return "OFFER";
  if (chat?.inspectionRequestId) return "INSPECTION";
  return "GENERIC";
}

function canShowChatInList(chat: any, meId: string) {
  const car = getChatCar(chat);

  if (isCarRemovedAfterSale(car)) {
    return false;
  }

  if (!chat.inspectionRequestId) {
    return true;
  }

  const status = chat.inspectionRequest?.status;

  if (status !== "CANCELLED") {
    return true;
  }

  return chat.sellerId === meId;
}

function normalizeChat(chat: any, meId: string) {
  const peer = chat.buyerId === meId ? chat.seller : chat.buyer;
  const car = getChatCar(chat);
  const kind = getChatKind(chat);

  return {
    id: chat.id,
    createdAt: chat.createdAt,
    buyerId: chat.buyerId,
    sellerId: chat.sellerId,
    offerId: chat.offerId ?? null,
    inspectionRequestId: chat.inspectionRequestId ?? null,
    kind,
    peer,
    car,
    carSold: isCarSold(car),
    carSoldPendingRemoval: isCarSoldPendingRemoval(car),
    carRemovedAfterSale: isCarRemovedAfterSale(car),
    offer: chat.offer
      ? {
          id: chat.offer.id,
          amount: chat.offer.amount,
          status: chat.offer.status,
        }
      : null,
    messages: chat.messages ?? [],
    inspectionStatus: chat.inspectionRequest?.status ?? null,
  };
}

const offerCarSelect = {
  id: true,
  make: true,
  model: true,
  title: true,
  year: true,
  trimLevel: true,
  coverUrl: true,
  photos: true,

  paymentEnabled: true,
  salePriceEur: true,
  ascariFeeEur: true,
  sellerNetEur: true,
  paymentStatus: true,

  marketStatus: true,
  soldAt: true,
  removalScheduledAt: true,
  visuallyRemovedAt: true,
};

const inspectionCarSelect = {
  id: true,
  make: true,
  model: true,
  title: true,
  year: true,
  coverUrl: true,
  photos: true,

  paymentStatus: true,
  marketStatus: true,
  soldAt: true,
  removalScheduledAt: true,
  visuallyRemovedAt: true,
};

/**
 * GET /api/chat/unread/count
 *
 * Conteggio totale messaggi non letti per l'utente autenticato.
 * Le chat collegate ad auto REMOVED_AFTER_SALE non vengono contate.
 */
router.get("/unread/count", async (req, res) => {
  try {
    await runSoldCarsVisualCleanup(prisma);

    const me = await requireMe(req);

    const unreadMessages = await prisma.message.findMany({
      where: {
        readAt: null,
        senderId: { not: me.id },
        chat: {
          OR: [{ buyerId: me.id }, { sellerId: me.id }],
        },
      },
      select: {
        id: true,
        chat: {
          include: {
            offer: {
              include: {
                car: {
                  select: {
                    id: true,
                    marketStatus: true,
                    paymentStatus: true,
                    visuallyRemovedAt: true,
                  },
                },
              },
            },
            inspectionRequest: {
              include: {
                car: {
                  select: {
                    id: true,
                    marketStatus: true,
                    paymentStatus: true,
                    visuallyRemovedAt: true,
                  },
                },
              },
            },
          },
        },
      },
      take: 1000,
    });

    const count = unreadMessages.filter((m) => {
      const car = getChatCar(m.chat);
      return !isCarRemovedAfterSale(car);
    }).length;

    return res.json({ count });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return res.status(status).json({ error: e?.message ?? "Error" });
  }
});

/**
 * GET /api/chat
 *
 * Regole:
 * - chat auto AVAILABLE: visibile
 * - chat auto SOLD_PENDING_REMOVAL: visibile nei 5 giorni
 * - chat auto REMOVED_AFTER_SALE: nascosta dalla lista
 * - chat perizia CANCELLED: resta visibile solo al venditore
 */
router.get("/", async (req, res) => {
  try {
    await runSoldCarsVisualCleanup(prisma);

    const me = await requireMe(req);

    const chats = await prisma.chat.findMany({
      where: {
        OR: [{ buyerId: me.id }, { sellerId: me.id }],
      },
      include: {
        buyer: { select: { id: true, name: true, email: true } },
        seller: { select: { id: true, name: true, email: true } },
        offer: {
          include: {
            car: {
              select: offerCarSelect,
            },
          },
        },
        inspectionRequest: {
          include: {
            car: {
              select: inspectionCarSelect,
            },
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    });

    const normalized = chats
      .filter((chat) => canShowChatInList(chat, me.id))
      .map((chat) => normalizeChat(chat, me.id));

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
 * Regole:
 * - durante SOLD_PENDING_REMOVAL la chat resta apribile
 * - dopo REMOVED_AFTER_SALE la chat viene bloccata
 * - se chat perizia è CANCELLED il periziatore non può più aprirla
 */
router.get("/:id", async (req, res) => {
  const chatId = parseChatId(req.params.id);

  if (!chatId) {
    return res.status(400).json({ error: "Chat id non valido" });
  }

  try {
    await runSoldCarsVisualCleanup(prisma);

    const me = await requireMe(req);

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        buyer: { select: { id: true, name: true, email: true } },
        seller: { select: { id: true, name: true, email: true } },
        messages: { orderBy: { createdAt: "asc" } },
        offer: {
          include: {
            car: {
              select: offerCarSelect,
            },
          },
        },
        inspectionRequest: {
          include: {
            car: {
              select: inspectionCarSelect,
            },
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

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    if (chat.buyerId !== me.id && chat.sellerId !== me.id) {
      return res.status(403).json({ error: "Not allowed" });
    }

    const car = getChatCar(chat);

    if (isCarRemovedAfterSale(car)) {
      return res.status(403).json({
        error:
          "Questa chat è stata rimossa perché la vendita è conclusa e il periodo di gestione è terminato.",
      });
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

    return res.json({
      ok: true,
      ...normalizeChat(chat, me.id),
      meId: me.id,
    });
  } catch (err: any) {
    console.error("Chat GET error", err);
    const status = err?.status ?? 500;
    return res.status(status).json({ error: err?.message ?? "Chat load error" });
  }
});

/**
 * POST /api/chat/:id/message
 *
 * Durante SOLD_PENDING_REMOVAL si può ancora scrivere.
 * Dopo REMOVED_AFTER_SALE viene bloccato.
 */
router.post("/:id/message", async (req, res) => {
  const chatId = parseChatId(req.params.id);

  if (!chatId) {
    return res.status(400).json({ error: "Chat id non valido" });
  }

  const rawContent = req.body?.content;

  if (typeof rawContent !== "string") {
    return res.status(400).json({ error: "Message empty" });
  }

  const content = rawContent.replace(/\r\n/g, "\n");

  if (content.trim() === "") {
    return res.status(400).json({ error: "Message empty" });
  }

  try {
    await runSoldCarsVisualCleanup(prisma);

    const me = await requireMe(req);

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        inspectionRequest: {
          include: {
            car: true,
          },
        },
        offer: {
          include: {
            car: true,
          },
        },
      },
    });

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    if (chat.buyerId !== me.id && chat.sellerId !== me.id) {
      return res.status(403).json({ error: "Not allowed" });
    }

    const car = getChatCar(chat);

    if (isCarRemovedAfterSale(car)) {
      return res.status(403).json({
        error:
          "Questa chat è stata chiusa perché la vendita è conclusa e il periodo di gestione è terminato.",
      });
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
 *
 * Rimane cancellazione reale come nel tuo flusso attuale.
 * Per auto vendute, però, il sistema nasconde automaticamente dopo 5 giorni senza cancellare DB.
 */
router.delete("/:id", async (req, res) => {
  const chatId = parseChatId(req.params.id);

  if (!chatId) {
    return res.status(400).json({ error: "Chat id non valido" });
  }

  try {
    const me = await requireMe(req);

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
    });

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    if (chat.buyerId !== me.id && chat.sellerId !== me.id) {
      return res.status(403).json({ error: "Not allowed" });
    }

    await prisma.chat.delete({
      where: { id: chatId },
    });

    return res.json({ ok: true });
  } catch (err: any) {
    console.error("Chat DELETE error", err);
    const status = err?.status ?? 500;
    return res.status(status).json({ error: err?.message ?? "Chat delete error" });
  }
});

export default router;