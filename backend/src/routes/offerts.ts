// backend/src/routes/offers.ts
import { Router } from "express";
import { prisma } from "../prisma";
import { getAuth } from "@clerk/express";
import { ensureUserInDb } from "../lib/authUser";

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

    // ✅ buyer: se non esiste nel DB lo creo al volo
    const buyer = await ensureUserInDb(clerkUserId);

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
    const acceptedAmounts = [car.offerPrice1, car.offerPrice2, car.offerPrice3]
      .filter((v): v is number => typeof v === "number");

    if (!acceptedAmounts.includes(Number(amount))) {
      return res.status(400).json({
        error:
          "Prezzo non valido. Devi scegliere una delle 3 offerte disponibili.",
      });
    }

    // (opzionale) evita doppie offerte pending identiche per la stessa auto
    // Se non lo vuoi, rimuovi questo blocco.
    const existing = await prisma.offer.findFirst({
      where: {
        carId: car.id,
        buyerId: buyer.id,
        status: "PENDING",
      },
      orderBy: { createdAt: "desc" },
    });

    if (existing) {
      return res.status(400).json({
        error: "Hai già un'offerta in sospeso per questa auto.",
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
 * Accetta un'offerta (solo seller)
 * - crea chat se non esiste
 * - aggiorna status = ACCEPTED
 */
router.post("/:id/accept", async (req, res) => {
  try {
    const offerId = Number(req.params.id);
    const { userId: clerkUserId } = getAuth(req);

    if (!clerkUserId) {
      return res.status(401).json({ error: "Non autenticato" });
    }

    const me = await ensureUserInDb(clerkUserId);

    // 1️⃣ Trovo l’offerta
    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: { car: true },
    });

    if (!offer) {
      return res.status(404).json({ error: "Offerta non trovata" });
    }

    // ✅ solo seller può accettare
    if (offer.sellerId !== me.id) {
      return res.status(403).json({ error: "Non autorizzato" });
    }

    // (opzionale) se già accepted, ritorna chat esistente (idempotenza)
    if (offer.status === "ACCEPTED") {
      const existingChat = await prisma.chat.findUnique({
        where: { offerId: offer.id },
      });

      return res.json({
        ok: true,
        offer,
        chatId: existingChat?.id ?? null,
      });
    }

    // 2️⃣ Se non esiste già una chat, la creo
    let chat = await prisma.chat.findUnique({
      where: { offerId: offer.id },
    });

    if (!chat) {
      chat = await prisma.chat.create({
        data: {
          offerId: offer.id,
          carId: offer.carId,
          buyerId: offer.buyerId,
          sellerId: offer.sellerId,
        },
      });
    }

    // 3️⃣ Aggiorno lo stato dell’offerta
    const updatedOffer = await prisma.offer.update({
      where: { id: offer.id },
      data: { status: "ACCEPTED" },
    });

    return res.json({
      ok: true,
      offer: updatedOffer,
      chatId: chat.id, // 👈 fondamentale per il frontend
    });
  } catch (err) {
    console.error("Errore accept:", err);
    return res.status(500).json({ error: "Errore accettazione offerta" });
  }
});

/**
 * DELETE /api/offers/:id
 * Elimina un'offerta (solo buyer o seller)
 * - se ACCEPTED e non forzato -> blocco
 * - elimina chat e poi offerta
 */
router.delete("/:id", async (req, res) => {
  try {
    const offerId = Number(req.params.id);
    const force = req.query.force === "true";
    const { userId: clerkUserId } = getAuth(req);

    if (!clerkUserId) {
      return res.status(401).json({ error: "Non autenticato" });
    }

    const me = await ensureUserInDb(clerkUserId);

    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
    });

    if (!offer) {
      return res.status(404).json({ error: "Offerta non trovata" });
    }

    // ✅ solo buyer o seller possono eliminare
    if (offer.buyerId !== me.id && offer.sellerId !== me.id) {
      return res.status(403).json({ error: "Non autorizzato" });
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

/**
 * POST /api/offers/:id/decline
 * Rifiuta un'offerta (solo seller)
 */
router.post("/:id/decline", async (req, res) => {
  const { userId: clerkUserId } = getAuth(req);
  const offerId = Number(req.params.id);

  if (!clerkUserId) return res.status(401).json({ error: "Non autenticato" });

  try {
    const me = await ensureUserInDb(clerkUserId);

    const offer = await prisma.offer.findUnique({ where: { id: offerId } });

    if (!offer) {
      return res.status(404).json({ error: "Offerta non trovata" });
    }

    if (offer.sellerId !== me.id) {
      return res.status(403).json({ error: "Non autorizzato" });
    }

    const updated = await prisma.offer.update({
      where: { id: offerId },
      data: { status: "DECLINED" },
    });

    return res.json(updated);
  } catch (err) {
    console.error("Errore decline:", err);
    return res.status(500).json({ error: "Errore rifiuto offerta" });
  }
});

/**
 * GET /api/offers/received
 * Restituisce tutte le offerte ricevute dal proprietario
 */
router.get("/received", async (req, res) => {
  try {
    const { userId: clerkUserId } = getAuth(req);

    if (!clerkUserId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    // ✅ garantisco esistenza user (così non esplode su utenti nuovi)
    const user = await ensureUserInDb(clerkUserId);

    const offers = await prisma.offer.findMany({
      where: { sellerId: user.id },
      include: {
        buyer: true,
        car: true,
        chat: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json(offers);
  } catch (err) {
    console.error("GET /offers/received ERROR", err);
    return res.status(500).json({ error: "Errore caricamento offerte" });
  }
});

/**
 * POST /api/offers/:id/reject
 * (prima era aperta) -> ora protetta, solo seller può fare reject
 * Nota: tu hai sia DECLINED che REJECTED, li tengo entrambi.
 */
router.post("/:id/reject", async (req, res) => {
  try {
    const offerId = Number(req.params.id);
    const { userId: clerkUserId } = getAuth(req);

    if (!clerkUserId) {
      return res.status(401).json({ error: "Non autenticato" });
    }

    const me = await ensureUserInDb(clerkUserId);

    const offer = await prisma.offer.findUnique({ where: { id: offerId } });

    if (!offer) {
      return res.status(404).json({ error: "Offerta non trovata" });
    }

    if (offer.sellerId !== me.id) {
      return res.status(403).json({ error: "Non autorizzato" });
    }

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
