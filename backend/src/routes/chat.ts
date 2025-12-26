import { Router } from "express";
import { prisma } from "../prisma";
import { getAuth } from "@clerk/express";

const router = Router();

/**
 * GET /api/chat
 * Lista di tutte le chat dell'utente loggato
 */
router.get("/", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const me = await prisma.user.findUnique({
      where: { clerkId },
    });

    if (!me) {
      return res.status(401).json({ error: "User not found" });
    }

    const chats = await prisma.chat.findMany({
      where: {
        OR: [
          { buyerId: me.id },
          { sellerId: me.id },
        ],
      },
      include: {
        offer: {
          include: {
            car: true,
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1, // ultimo messaggio (preview)
        },
      }
    });

    return res.json(chats);
  } catch (err) {
    console.error("Chat LIST error", err);
    return res.status(500).json({ error: "Chat list error" });
  }
});


/**
 * GET /api/chat/:id
 * Carica la chat + messaggi, se l'utente è buyer o seller
 */
router.get("/:id", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const chatId = Number(req.params.id);

  try {
    // recupero l'utente nel DB (per avere l'id interno cmj...)
    const me = await prisma.user.findUnique({
      where: { clerkId },
    });

    if (!me) {
      return res.status(401).json({ error: "User not found" });
    }

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
        offer: {
          include: {
            buyer: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            seller: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            car: true,
          },
        },
      },
    });


    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    // 👮 controllo permessi usando gli ID INTERNI
    if (chat.buyerId !== me.id && chat.sellerId !== me.id) {
      return res.status(403).json({ error: "Not allowed" });
    }

    // ✅ SEGNA COME LETTI I MESSAGGI DELL’ALTRO
    await prisma.message.updateMany({
      where: {
        chatId: chatId,
        senderId: { not: me.id },
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });


    // ritorno anche meId per il frontend (per capire quali messaggi sono miei)
    return res.json({
      ...chat,
      meId: me.id,
    });
  } catch (err) {
    console.error("Chat GET error", err);
    return res.status(500).json({ error: "Chat load error" });
  }
});

// GET /api/chat/unread/count
router.get("/unread/count", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) return res.status(401).json({ error: "Not auth" });

  const me = await prisma.user.findUnique({ where: { clerkId } });
  if (!me) return res.status(401).json({ error: "User not found" });

  const count = await prisma.message.count({
    where: {
      readAt: null,
      senderId: { not: me.id },
      chat: {
        OR: [{ buyerId: me.id }, { sellerId: me.id }],
      },
    },
  });

  res.json({ count });
});


/**
 * POST /api/chat/:id/message
 * Invia un nuovo messaggio
 */
router.post("/:id/message", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const chatId = Number(req.params.id);
  const { content } = req.body;

  if (!content || content.trim() === "") {
    return res.status(400).json({ error: "Message empty" });
  }

  try {
    // di nuovo mi prendo l'utente interno
    const me = await prisma.user.findUnique({
      where: { clerkId },
    });

    if (!me) {
      return res.status(401).json({ error: "User not found" });
    }

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
    });

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    // permessi
    if (chat.buyerId !== me.id && chat.sellerId !== me.id) {
      return res.status(403).json({ error: "Not allowed" });
    }

    const msg = await prisma.message.create({
      data: {
        chatId,
        senderId: me.id, // 👈 ID interno dell'utente
        content,
      },
    });

    return res.json(msg);
  } catch (err) {
    console.error("Chat POST error", err);
    return res.status(500).json({ error: "Message send error" });
  }
});

export default router;
