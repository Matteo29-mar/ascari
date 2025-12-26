// backend/src/routes/offers.ts
import { Router } from "express";
import { prisma } from "../prisma";
import { getAuth } from "@clerk/express";

const router = Router();

/**
 * POST /api/offers
 * Crea una nuova offerta su un'auto
 */
router.post("/", async (req, res) => {
  try {
    const { userId: clerkUserId } = getAuth(req);

    if (!clerkUserId) {
      return res.status(401).json({ error: "Non autenticato" });
    }

    const { carId, amount } = req.body;

    if (!carId || amount == null) {
      return res.status(400).json({ error: "Dati mancanti" });
    }

    // 🔍 Buyer
    const buyer = await prisma.user.findUnique({
      where: { clerkId: clerkUserId },
    });

    // ⚠️ utente autenticato ma non ancora nel DB
    if (!buyer) {
      return res.status(400).json({ error: "Utente non inizializzato" });
    }

    // 🔍 Auto + owner
    const car = await prisma.car.findUnique({
      where: { id: Number(carId) },
      include: { owner: true },
    });

    if (!car) {
      return res.status(404).json({ error: "Auto non trovata" });
    }

    // ❌ no auto propria
    if (car.ownerId === buyer.id) {
      return res
        .status(400)
        .json({ error: "Non puoi fare un'offerta sulla tua auto" });
    }

    // ❌ valida prezzo
    const acceptedAmounts = [
      car.offerPrice1,
      car.offerPrice2,
      car.offerPrice3,
    ].filter((v): v is number => typeof v === "number");

    if (!acceptedAmounts.includes(Number(amount))) {
      return res.status(400).json({
        error: "Prezzo non valido. Devi scegliere una delle 3 offerte disponibili.",
      });
    }

    // ✅ crea offerta
    const offer = await prisma.offer.create({
      data: {
        carId: car.id,
        buyerId: buyer.id,
        sellerId: car.ownerId,
        amount: Number(amount),
        status: "PENDING",
      },
    });

    return res.status(201).json({ ok: true, offer });

  } catch (err) {
    console.error("❌ Errore POST /offers", err);
    return res.status(500).json({ error: "Errore creazione offerta" });
  }
});



/**
 * POST /api/offers/:id/accept
 */
router.post("/:id/accept", async (req, res) => {
  try {
    const offerId = Number(req.params.id);

    
    // 1️⃣ Trovo l’offerta
    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: { car: true }
    });

    if (!offer) {
      return res.status(404).json({ error: "Offerta non trovata" });
    }
    

    // 2️⃣ Se non esiste già una chat, la creo
    let chat = await prisma.chat.findUnique({
      where: { offerId: offer.id }
    });

    if (!chat) {
      chat = await prisma.chat.create({
        data: {
          offerId: offer.id,
          carId: offer.carId,
          buyerId: offer.buyerId,
          sellerId: offer.sellerId
        }
      });
    }

    // 3️⃣ Aggiorno lo stato dell’offerta
    const updatedOffer = await prisma.offer.update({
      where: { id: offer.id },
      data: { status: "ACCEPTED" }
    });

    return res.json({
      ok: true,
      offer: updatedOffer,
      chatId: chat.id   // 👈 fondamentale per il frontend
    });

  } catch (err) {
    console.error("Errore accept:", err);
    return res.status(500).json({ error: "Errore accettazione offerta" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const offerId = Number(req.params.id);
    const force = req.query.force === "true";

    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
    });

    if (!offer) {
      return res.status(404).json({ error: "Offerta non trovata" });
    }

    // 🔒 se ACCEPTED e non forzato → blocco
    if (offer.status === "ACCEPTED" && !force) {
      return res.status(400).json({
        error: "Offer accepted, confirmation required",
      });
    }

    // 🧹 elimina chat (cascade → message)
    await prisma.chat.deleteMany({
      where: { offerId },
    });

    // 🧹 elimina offerta
    await prisma.offer.delete({
      where: { id: offerId },
    });

    return res.json({ ok: true });

  } catch (err) {
    console.error("Errore delete offer:", err);
    return res.status(500).json({ error: "Errore eliminazione offerta" });
  }
});



// POST /api/offers/:id/decline
router.post("/:id/decline", async (req, res) => {
  const { userId: clerkUserId } = getAuth(req);
  const offerId = Number(req.params.id);

  if (!clerkUserId) return res.status(401).json({ error: "Non autenticato" });

  try {
    const owner = await prisma.user.findUnique({
      where: { clerkId: clerkUserId },
    });

    const offer = await prisma.offer.findUnique({ where: { id: offerId } });

    if (!offer || offer.sellerId !== owner?.id) {
      return res.status(403).json({ error: "Non autorizzato" });
    }

    const updated = await prisma.offer.update({
      where: { id: offerId },
      data: { status: "DECLINED" },
    });

    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Errore rifiuto offerta" });
  }
});

/**
 * GET /api/offers/received
 * Restituisce tutte le offerte ricevute dal proprietario
 */
router.get("/received", async (req, res) => {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const offers = await prisma.offer.findMany({
      where: { sellerId: user.id },
      include: {
        buyer: true,
        car: true,
        chat: true,
      },
      orderBy: { createdAt: "desc" }
    });

    return res.json(offers);   // 👈 UNICO INVIO, CORRETTO

  } catch (err) {
    console.error("GET /offers/received ERROR", err);

    if (!res.headersSent) {
      return res.status(500).json({ error: "Errore caricamento offerte" });
    }
  }
});

/**
 * POST /api/offers/:id/reject
 */
router.post("/:id/reject", async (req, res) => {
  try {
    const offerId = Number(req.params.id);

    const updated = await prisma.offer.update({
      where: { id: offerId },
      data: { status: "REJECTED" },
    });

    return res.json(updated);
  } catch (err) {
    console.error("Reject error", err);
    return res.status(500).json({ error: "Errore rifiuto" });
  }
});




export default router;
