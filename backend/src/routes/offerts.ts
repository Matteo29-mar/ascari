import { Router } from "express";
import { prisma } from "../prisma";
import { getAuth } from "@clerk/express";
import { ensureUserInDb } from "../lib/authUser";
import {
  isCarAvailable,
  isCarRemovedAfterSale,
  isCarSold,
  runSoldCarsVisualCleanup,
} from "../lib/carSaleLifecycle";

const router = Router();

/**
 * POST /api/offers
 * Crea una nuova offerta su un'auto.
 * Consentito solo se auto AVAILABLE.
 */
router.post("/", async (req, res) => {
  try {
    await runSoldCarsVisualCleanup(prisma);

    const { userId: clerkUserId } = getAuth(req);

    if (!clerkUserId) {
      return res.status(401).json({ error: "Non autenticato" });
    }

    const { carId, amount } = req.body;

    if (!carId || amount == null) {
      return res.status(400).json({ error: "Dati mancanti" });
    }

    const buyer = await ensureUserInDb(clerkUserId);

    const car = await prisma.car.findUnique({
      where: { id: Number(carId) },
      include: { owner: true },
    });

    if (!car) {
      return res.status(404).json({ error: "Auto non trovata" });
    }

    if (!isCarAvailable(car)) {
      return res.status(400).json({
        error:
          "Questa auto non è più disponibile. La vendita potrebbe essere già conclusa.",
        code: "CAR_NOT_AVAILABLE",
      });
    }

    if (car.ownerId === buyer.id) {
      return res.status(400).json({
        error: "Non puoi fare un'offerta sulla tua auto",
      });
    }

    const acceptedAmounts = [car.offerPrice1, car.offerPrice2, car.offerPrice3].filter(
      (v): v is number => typeof v === "number"
    );

    if (!acceptedAmounts.includes(Number(amount))) {
      return res.status(400).json({
        error: "Prezzo non valido. Devi scegliere una delle 3 offerte disponibili.",
      });
    }

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
    console.error("Errore POST /offers", err);
    return res.status(500).json({ error: "Errore creazione offerta" });
  }
});

/**
 * POST /api/offers/:id/accept
 * Accetta un'offerta.
 *
 * Consentito solo se:
 * - seller corretto
 * - offerta PENDING oppure già ACCEPTED
 * - auto ancora AVAILABLE
 */
router.post("/:id/accept", async (req, res) => {
  try {
    await runSoldCarsVisualCleanup(prisma);

    const offerId = Number(req.params.id);
    const { userId: clerkUserId } = getAuth(req);

    if (!clerkUserId) {
      return res.status(401).json({ error: "Non autenticato" });
    }

    const me = await ensureUserInDb(clerkUserId);

    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: { car: true },
    });

    if (!offer) {
      return res.status(404).json({ error: "Offerta non trovata" });
    }

    if (offer.sellerId !== me.id) {
      return res.status(403).json({ error: "Non autorizzato" });
    }

    if (isCarSold(offer.car) || !isCarAvailable(offer.car)) {
      return res.status(400).json({
        error: "Questa auto non è più disponibile. Non puoi accettare nuove offerte.",
        code: "CAR_NOT_AVAILABLE",
      });
    }

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

    if (offer.status !== "PENDING") {
      return res.status(400).json({
        error: `Non puoi accettare un'offerta in stato ${offer.status}.`,
      });
    }

    let chat = await prisma.chat.findUnique({
      where: { offerId: offer.id },
    });

    if (!chat) {
      chat = await prisma.chat.create({
        data: {
          offerId: offer.id,
          buyerId: offer.buyerId,
          sellerId: offer.sellerId,
        },
      });
    }

    const updatedOffer = await prisma.offer.update({
      where: { id: offer.id },
      data: { status: "ACCEPTED" },
    });

    return res.json({
      ok: true,
      offer: updatedOffer,
      chatId: chat.id,
    });
  } catch (err) {
    console.error("Errore accept:", err);
    return res.status(500).json({ error: "Errore accettazione offerta" });
  }
});

/**
 * DELETE /api/offers/:id
 * Elimina un'offerta manualmente.
 *
 * Nota:
 * Questo mantiene il tuo comportamento attuale.
 * Il flusso automatico post-vendita invece non cancella dal DB:
 * nasconde le offerte tramite marketStatus/visuallyRemovedAt dell'auto.
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

    if (offer.buyerId !== me.id && offer.sellerId !== me.id) {
      return res.status(403).json({ error: "Non autorizzato" });
    }

    if (offer.status === "ACCEPTED" && !force) {
      return res.status(400).json({
        error: "Offer accepted, confirmation required",
      });
    }

    await prisma.chat.deleteMany({
      where: { offerId },
    });

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
 * Rifiuta un'offerta.
 *
 * Se l'auto è venduta/rimossa, le offerte non sono più operative.
 */
router.post("/:id/decline", async (req, res) => {
  const { userId: clerkUserId } = getAuth(req);
  const offerId = Number(req.params.id);

  if (!clerkUserId) {
    return res.status(401).json({ error: "Non autenticato" });
  }

  try {
    await runSoldCarsVisualCleanup(prisma);

    const me = await ensureUserInDb(clerkUserId);

    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: { car: true },
    });

    if (!offer) {
      return res.status(404).json({ error: "Offerta non trovata" });
    }

    if (offer.sellerId !== me.id) {
      return res.status(403).json({ error: "Non autorizzato" });
    }

    if (isCarSold(offer.car) || isCarRemovedAfterSale(offer.car)) {
      return res.status(400).json({
        error: "Questa auto è già stata venduta. Le offerte non sono più operative.",
        code: "CAR_NOT_AVAILABLE",
      });
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
 *
 * Restituisce le offerte ricevute dal proprietario.
 *
 * Mostra:
 * - offerte su auto AVAILABLE
 * - offerte ACCEPTED su auto SOLD_PENDING_REMOVAL, così durante i 5 giorni puoi ancora aprire chat
 *
 * Nasconde:
 * - offerte su auto REMOVED_AFTER_SALE
 * - offerte CLOSED_SOLD
 */
router.get("/received", async (req, res) => {
  try {
    await runSoldCarsVisualCleanup(prisma);

    const { userId: clerkUserId } = getAuth(req);

    if (!clerkUserId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = await ensureUserInDb(clerkUserId);

    const offers = await prisma.offer.findMany({
      where: {
        sellerId: user.id,
        status: {
          notIn: ["CLOSED_SOLD"],
        },
        car: {
          visuallyRemovedAt: null,
          marketStatus: {
            in: ["AVAILABLE", "SOLD_PENDING_REMOVAL"],
          },
        },
      },
      include: {
        buyer: true,
        car: true,
        chat: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const normalized = offers.filter((offer) => {
      if (offer.car.marketStatus === "AVAILABLE") {
        return true;
      }

      if (offer.car.marketStatus === "SOLD_PENDING_REMOVAL") {
        return offer.status === "ACCEPTED";
      }

      return false;
    });

    return res.json(normalized);
  } catch (err) {
    console.error("GET /offers/received ERROR", err);
    return res.status(500).json({ error: "Errore caricamento offerte" });
  }
});

/**
 * POST /api/offers/:id/reject
 * Alias di decline.
 */
router.post("/:id/reject", async (req, res) => {
  try {
    await runSoldCarsVisualCleanup(prisma);

    const offerId = Number(req.params.id);
    const { userId: clerkUserId } = getAuth(req);

    if (!clerkUserId) {
      return res.status(401).json({ error: "Non autenticato" });
    }

    const me = await ensureUserInDb(clerkUserId);

    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: { car: true },
    });

    if (!offer) {
      return res.status(404).json({ error: "Offerta non trovata" });
    }

    if (offer.sellerId !== me.id) {
      return res.status(403).json({ error: "Non autorizzato" });
    }

    if (isCarSold(offer.car) || isCarRemovedAfterSale(offer.car)) {
      return res.status(400).json({
        error: "Questa auto è già stata venduta. Le offerte non sono più operative.",
        code: "CAR_NOT_AVAILABLE",
      });
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