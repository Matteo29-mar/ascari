// backend/src/routes/inspections.ts
import { Router } from "express";
import { prisma } from "../prisma";
import { getAuth } from "@clerk/express";

const router = Router();

function hhmmToMinutes(v: string) {
  const [hh, mm] = v.split(":").map((x) => Number(x));
  return hh * 60 + mm;
}

function isValidDateYYYYMMDD(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function isValidHHMM(s: string) {
  return /^\d{2}:\d{2}$/.test(s);
}

async function ensureUser(clerkId: string, email?: string, name?: string) {
  const existing = await prisma.user.findUnique({ where: { clerkId } });
  if (existing) return existing;

  return prisma.user.create({
    data: {
      clerkId,
      email: email ?? `${clerkId}@placeholder.local`,
      name: name ?? null,
    },
  });
}

/**
 * POST /api/inspections/request
 * Body:
 * - carId: number
 * - requestedDate: YYYY-MM-DD
 * - startTime: HH:MM
 * - endTime: HH:MM
 */
router.post("/request", async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Non autenticato" });

    const { carId, requestedDate, startTime, endTime } = req.body ?? {};

    const parsedCarId = Number(carId);
    if (!parsedCarId || Number.isNaN(parsedCarId)) {
      return res.status(400).json({ error: "carId non valido" });
    }
    if (!requestedDate || !isValidDateYYYYMMDD(requestedDate)) {
      return res.status(400).json({ error: "requestedDate non valida (YYYY-MM-DD)" });
    }
    if (!startTime || !isValidHHMM(startTime)) {
      return res.status(400).json({ error: "startTime non valida (HH:MM)" });
    }
    if (!endTime || !isValidHHMM(endTime)) {
      return res.status(400).json({ error: "endTime non valida (HH:MM)" });
    }

    // costruiamo start/end Date
    const startAt = new Date(`${requestedDate}T${startTime}:00`);
    const endAt = new Date(`${requestedDate}T${endTime}:00`);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      return res.status(400).json({ error: "Data/ora non valide" });
    }
    if (endAt <= startAt) {
      return res.status(400).json({ error: "endTime deve essere > startTime" });
    }

    // user nel DB
    const sellerUser = await ensureUser(clerkId);

    // car deve essere del venditore + non periziata + deve avere city
    const car = await prisma.car.findUnique({
      where: { id: parsedCarId },
      select: {
        id: true,
        ownerId: true,
        isPeriziata: true,
        city: true,
      },
    });

    if (!car) return res.status(404).json({ error: "Auto non trovata" });
    if (car.ownerId !== sellerUser.id) {
      return res.status(403).json({ error: "Non sei il proprietario di questa auto" });
    }
    if (car.isPeriziata) {
      return res.status(400).json({ error: "Auto già periziata" });
    }
    const carCity = (car.city ?? "").trim();
    if (!carCity) {
      return res.status(400).json({ error: "L'auto non ha la città impostata (car.city)" });
    }

    // match: stessa città + slot disponibile che CONTIENE l'intervallo richiesto
    const slot = await prisma.inspectorSlot.findFirst({
      where: {
        isAvailable: true,
        startAt: { lte: startAt },
        endAt: { gte: endAt },
        inspector: {
          city: carCity,
        },
      },
      orderBy: { startAt: "asc" },
      select: {
        id: true,
        inspectorId: true,
        startAt: true,
        endAt: true,
        inspector: {
          select: { id: true, workshopName: true, city: true },
        },
      },
    });

    if (!slot) {
      return res.json({
        ok: true,
        match: false,
        message: "Nessun match: prova un altro giorno/orario.",
      });
    }

    // transaction: crea request + blocca slot
    const created = await prisma.$transaction(async (tx) => {
      const reqCreated = await tx.inspectionRequest.create({
  data: {
    carId: car.id,
    sellerId: sellerUser.id,
    inspectorId: slot.inspectorId,

    // ✅ coerenti con lo schema
    startAt: startAt,
    endAt: endAt,

    // ✅ OBBLIGATORIO
    inspectorSlotId: slot.id,

    status: "ASSIGNED",
    matchType: "PERFECT",

    notes: `requestedDate=${requestedDate}; startTime=${startTime}; endTime=${endTime}`,
  },
});


      await tx.inspectorSlot.update({
        where: { id: slot.id },
        data: { isAvailable: false },
      });

      return reqCreated;
    });

    return res.json({
      ok: true,
      match: true,
      request: created,
      inspector: slot.inspector,
      matchedSlot: { id: slot.id, startAt: slot.startAt, endAt: slot.endAt },
    });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e?.message ?? "Errore server" });
  }
});

export default router;
