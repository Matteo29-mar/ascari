// backend/src/routes/inspector.ts
import { Router } from "express";
import crypto from "crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { prisma } from "../prisma";
import { getAuth } from "@clerk/express";
import { InspectionStatus, MatchType } from "@prisma/client";
import { geocodeAddress } from "../lib/geocode";

const router = Router();

const awsRegion = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "eu-west-1";
const carImagesBucket = process.env.ASCARI_CAR_IMAGES_BUCKET || "";
const carImagesPublicBaseUrl = (process.env.ASCARI_CAR_IMAGES_PUBLIC_BASE_URL || "").replace(/\/$/, "");
const s3 = new S3Client({ region: awsRegion });

function text(value: unknown) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v ? v : null;
}

function isDataImage(value: unknown): value is string {
  return typeof value === "string" && /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value.trim());
}

function extensionForMime(mime: string) {
  const normalized = mime.toLowerCase();
  if (normalized === "image/png") return "png";
  if (normalized === "image/webp") return "webp";
  if (normalized === "image/gif") return "gif";
  return "jpg";
}

function publicS3Url(key: string) {
  if (carImagesPublicBaseUrl) return `${carImagesPublicBaseUrl}/${key}`;
  return `https://${carImagesBucket}.s3.${awsRegion}.amazonaws.com/${key}`;
}

async function storeInspectorLogo(value: unknown, userId: string) {
  const logo = text(value);
  if (!logo) return null;
  if (!isDataImage(logo)) return logo;

  if (!carImagesBucket) {
    throw new Error("ASCARI_CAR_IMAGES_BUCKET non configurato: impossibile salvare il logo");
  }

  const match = logo.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error("Formato logo non valido");

  const mime = match[1];
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length) throw new Error("Logo vuoto");
  if (buffer.length > 5 * 1024 * 1024) throw new Error("Il logo non può superare 5 MB");

  const hash = crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  const key = `inspectors/${userId}/logo-${Date.now()}-${hash}.${extensionForMime(mime)}`;

  await s3.send(new PutObjectCommand({
    Bucket: carImagesBucket,
    Key: key,
    Body: buffer,
    ContentType: mime,
    CacheControl: "public, max-age=31536000, immutable",
  }));

  return publicS3Url(key);
}

/**
 * Helper: assicura che l'utente esista nel DB
 */
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

function normCity(v?: string | null) {
  return (v ?? "").trim().toLowerCase();
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function minutesBetween(start: Date, end: Date) {
  return Math.floor((end.getTime() - start.getTime()) / 60000);
}

function absMs(a: Date, b: Date) {
  return Math.abs(a.getTime() - b.getTime());
}

function hhmmToMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function getRomeDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};

  for (const p of parts) {
    if (p.type !== "literal") {
      map[p.type] = p.value;
    }
  }

  return {
    date: `${map.year}-${map.month}-${map.day}`,
    hour: Number(map.hour),
    minute: Number(map.minute),
    minutesOfDay: Number(map.hour) * 60 + Number(map.minute),
  };
}

function slotMatchesRequestedLocalTime(
  slotStartAt: Date,
  slotEndAt: Date,
  requestedDate: string,
  requestedStartMin: number,
  requestedEndMin: number
) {
  const start = getRomeDateParts(slotStartAt);
  const end = getRomeDateParts(slotEndAt);

  if (start.date !== requestedDate || end.date !== requestedDate) {
    return false;
  }

  return (
    start.minutesOfDay <= requestedStartMin &&
    end.minutesOfDay >= requestedEndMin
  );
}

function slotIsSameDayLocal(slotStartAt: Date, requestedDate: string) {
  const start = getRomeDateParts(slotStartAt);
  return start.date === requestedDate;
}

function formatDateTimeRome(date: Date) {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function buildGoogleMapsLink(address?: string | null, city?: string | null) {
  const full = [address?.trim(), city?.trim()].filter(Boolean).join(", ");
  if (!full) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(full)}`;
}

async function geocodeWorkshopIfPossible(
  workshopAddress?: string | null,
  city?: string | null
) {
  const cleanAddress = (workshopAddress ?? "").trim();
  const cleanCity = (city ?? "").trim();

  if (!cleanAddress && !cleanCity) {
    return null;
  }

  try {
    const geo = await geocodeAddress(
      cleanAddress || cleanCity,
      cleanCity || undefined
    );
    if (!geo) return null;

    return {
      latitude: geo.lat,
      longitude: geo.lng,
    };
  } catch (e) {
    console.error("Errore geocode officina:", e);
    return null;
  }
}

/**
 * GET /api/inspector/me
 * Ritorna il profilo periziatore se esiste
 */
router.get("/me", async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Non autenticato" });

    const user = await prisma.user.findUnique({
      where: { clerkId },
      include: { inspectorProfile: true },
    });

    return res.json({ inspectorProfile: user?.inspectorProfile ?? null });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Errore server" });
  }
});

/**
 * POST /api/inspector/register
 * Crea/aggiorna il profilo periziatore
 */
router.post("/register", async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Non autenticato" });

    const {
      workshopName,
      workshopAddress,
      email,
      phone,
      city,
      latitude,
      longitude,
      radiusKm,
      workStartMin,
      workEndMin,
      logoUrl,
      userName,
    } = req.body ?? {};

    if (!workshopName || !email || !phone) {
      return res
        .status(400)
        .json({ error: "Dati mancanti (workshopName, email, phone)" });
    }

    const user = await ensureUser(clerkId, email, userName);

    const dealerProfile = await prisma.dealerProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });

    if (dealerProfile) {
      return res.status(409).json({
        error: "Questo account è già registrato come concessionario e non può diventare periziatore.",
      });
    }

    const geocoded = await geocodeWorkshopIfPossible(
      workshopAddress ?? null,
      city ?? null
    );

    const finalLatitude =
      geocoded?.latitude ??
      (typeof latitude === "number" ? latitude : null);

    const finalLongitude =
      geocoded?.longitude ??
      (typeof longitude === "number" ? longitude : null);

    const storedLogoUrl = logoUrl !== undefined ? await storeInspectorLogo(logoUrl, user.id) : undefined;

    const profile = await prisma.inspectorProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        workshopName,
        workshopAddress: workshopAddress ?? null,
        logoUrl: storedLogoUrl ?? null,
        email,
        phone,
        city: city ?? null,
        latitude: finalLatitude,
        longitude: finalLongitude,
        radiusKm: typeof radiusKm === "number" ? radiusKm : 70,
        workStartMin: typeof workStartMin === "number" ? workStartMin : 540,
        workEndMin: typeof workEndMin === "number" ? workEndMin : 1080,
      },
      update: {
        workshopName,
        workshopAddress: workshopAddress ?? null,
        ...(storedLogoUrl !== undefined ? { logoUrl: storedLogoUrl } : {}),
        email,
        phone,
        city: city ?? null,
        latitude: finalLatitude,
        longitude: finalLongitude,
        radiusKm: typeof radiusKm === "number" ? radiusKm : 70,
        workStartMin: typeof workStartMin === "number" ? workStartMin : 540,
        workEndMin: typeof workEndMin === "number" ? workEndMin : 1080,
      },
    });

    return res.json({ ok: true, inspectorProfile: profile });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Errore server" });
  }
});

/**
 * PUT /api/inspector/me
 */
router.put("/me", async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Non autenticato" });

    const {
      workshopName,
      workshopAddress,
      email,
      phone,
      city,
      radiusKm,
      workStartMin,
      workEndMin,
      latitude,
      longitude,
      calendarConfirmedColor,
      logoUrl,
    } = req.body ?? {};

    const user = await prisma.user.findUnique({ where: { clerkId } });
    if (!user) {
      return res.status(400).json({ error: "Utente non presente nel DB" });
    }

    const existing = await prisma.inspectorProfile.findUnique({
      where: { userId: user.id },
    });
    if (!existing) {
      return res.status(404).json({ error: "Profilo periziatore non trovato" });
    }

    const nextWorkshopAddress =
      workshopAddress !== undefined ? workshopAddress : existing.workshopAddress;
    const nextCity = city ?? existing.city;

    const addressChanged =
      (nextWorkshopAddress ?? "") !== (existing.workshopAddress ?? "");
    const cityChanged = (nextCity ?? "") !== (existing.city ?? "");

    let nextLatitude = existing.latitude;
    let nextLongitude = existing.longitude;

    if (addressChanged || cityChanged) {
      const geocoded = await geocodeWorkshopIfPossible(
        nextWorkshopAddress ?? null,
        nextCity ?? null
      );

      if (geocoded) {
        nextLatitude = geocoded.latitude;
        nextLongitude = geocoded.longitude;
      }
    } else {
      if (typeof latitude === "number") nextLatitude = latitude;
      if (typeof longitude === "number") nextLongitude = longitude;
    }

    const storedLogoUrl = logoUrl !== undefined ? await storeInspectorLogo(logoUrl, user.id) : undefined;

    const updated = await prisma.inspectorProfile.update({
      where: { userId: user.id },
      data: {
        workshopName: workshopName ?? existing.workshopName,
        workshopAddress: nextWorkshopAddress ?? null,
        ...(storedLogoUrl !== undefined ? { logoUrl: storedLogoUrl } : {}),
        email: email ?? existing.email,
        phone: phone ?? existing.phone,
        city: nextCity ?? null,
        latitude: nextLatitude,
        longitude: nextLongitude,
        calendarConfirmedColor:
          calendarConfirmedColor ?? existing.calendarConfirmedColor,
        radiusKm: typeof radiusKm === "number" ? radiusKm : existing.radiusKm,
        workStartMin:
          typeof workStartMin === "number"
            ? workStartMin
            : existing.workStartMin,
        workEndMin:
          typeof workEndMin === "number" ? workEndMin : existing.workEndMin,
      },
    });

    return res.json({ ok: true, inspectorProfile: updated });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Errore server" });
  }
});

/**
 * GET /api/inspector/slots
 */
router.get("/slots", async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Non autenticato" });

    const user = await prisma.user.findUnique({ where: { clerkId } });
    if (!user) return res.status(400).json({ error: "Utente non presente nel DB" });

    const profile = await prisma.inspectorProfile.findUnique({
      where: { userId: user.id },
    });
    if (!profile) {
      return res.status(404).json({ error: "Profilo periziatore non trovato" });
    }

    const slots = await prisma.inspectorSlot.findMany({
      where: { inspectorId: profile.id },
      orderBy: { startAt: "asc" },
      take: 200,
    });

    return res.json({ ok: true, slots });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Errore server" });
  }
});

/**
 * POST /api/inspector/slots
 */
router.post("/slots", async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Non autenticato" });

    const { startAt, endAt } = req.body ?? {};
    if (!startAt || !endAt) {
      return res.status(400).json({ error: "Dati mancanti (startAt, endAt)" });
    }

    const start = new Date(startAt);
    const end = new Date(endAt);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: "Date non valide" });
    }
    if (end <= start) {
      return res.status(400).json({ error: "endAt deve essere maggiore di startAt" });
    }

    const user = await prisma.user.findUnique({ where: { clerkId } });
    if (!user) return res.status(400).json({ error: "Utente non presente nel DB" });

    const profile = await prisma.inspectorProfile.findUnique({ where: { userId: user.id } });
    if (!profile) return res.status(404).json({ error: "Profilo periziatore non trovato" });

    const overlapping = await prisma.inspectorSlot.findFirst({
      where: {
        inspectorId: profile.id,
        startAt: { lt: end },
        endAt: { gt: start },
      },
    });

    if (overlapping) {
      return res.status(409).json({ error: "Esiste già una disponibilità che si sovrappone a questa fascia." });
    }

    const created = await prisma.inspectorSlot.create({
      data: { inspectorId: profile.id, startAt: start, endAt: end, isAvailable: true },
    });

    return res.json({ ok: true, slot: created });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Errore server" });
  }
});

/**
 * POST /api/inspector/slots/bulk
 * Crea più giornate di disponibilità in una sola operazione.
 */
router.post("/slots/bulk", async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Non autenticato" });

    type BulkSlotInput = {
      startAt?: string;
      endAt?: string;
    };

    type ParsedBulkSlot = {
      startAt: Date;
      endAt: Date;
    };

    const input: BulkSlotInput[] = Array.isArray(req.body?.slots)
      ? (req.body.slots as BulkSlotInput[])
      : [];

    if (!input.length || input.length > 31) {
      return res
        .status(400)
        .json({ error: "Invia da 1 a 31 fasce di disponibilità." });
    }

    const parsed: ParsedBulkSlot[] = input.map((item: BulkSlotInput) => ({
      startAt: new Date(item.startAt ?? ""),
      endAt: new Date(item.endAt ?? ""),
    }));

    if (
      parsed.some(
        (slot: ParsedBulkSlot) =>
          isNaN(slot.startAt.getTime()) ||
          isNaN(slot.endAt.getTime()) ||
          slot.endAt <= slot.startAt
      )
    ) {
      return res
        .status(400)
        .json({ error: "Una o più fasce hanno data/orario non valido." });
    }

    const sorted = [...parsed].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].startAt < sorted[i - 1].endAt) {
        return res.status(400).json({ error: "Le fasce inviate si sovrappongono tra loro." });
      }
    }

    const user = await prisma.user.findUnique({ where: { clerkId } });
    if (!user) return res.status(400).json({ error: "Utente non presente nel DB" });
    const profile = await prisma.inspectorProfile.findUnique({ where: { userId: user.id } });
    if (!profile) return res.status(404).json({ error: "Profilo periziatore non trovato" });

    const firstStart = sorted[0].startAt;
    const lastEnd = sorted[sorted.length - 1].endAt;
    const existing = await prisma.inspectorSlot.findMany({
      where: {
        inspectorId: profile.id,
        startAt: { lt: lastEnd },
        endAt: { gt: firstStart },
      },
      select: { id: true, startAt: true, endAt: true },
    });

    const conflict = sorted.some((candidate) =>
      existing.some((slot) => slot.startAt < candidate.endAt && slot.endAt > candidate.startAt)
    );
    if (conflict) {
      return res.status(409).json({ error: "Una o più giornate si sovrappongono a disponibilità già presenti." });
    }

    const created = await prisma.$transaction(
      sorted.map((slot) => prisma.inspectorSlot.create({
        data: { inspectorId: profile.id, startAt: slot.startAt, endAt: slot.endAt, isAvailable: true },
      }))
    );

    return res.json({ ok: true, slots: created });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e?.message ?? "Errore server" });
  }
});

/**
 * DELETE /api/inspector/slots/:id
 */
router.delete("/slots/:id", async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Non autenticato" });

    const slotId = Number(req.params.id);
    if (!slotId) return res.status(400).json({ error: "Slot id non valido" });

    const user = await prisma.user.findUnique({ where: { clerkId } });
    if (!user) return res.status(400).json({ error: "Utente non presente nel DB" });

    const profile = await prisma.inspectorProfile.findUnique({
      where: { userId: user.id },
    });
    if (!profile) {
      return res.status(404).json({ error: "Profilo periziatore non trovato" });
    }

    const slot = await prisma.inspectorSlot.findUnique({ where: { id: slotId } });
    if (!slot || slot.inspectorId !== profile.id) {
      return res.status(404).json({ error: "Slot non trovato" });
    }
    if (!slot.isAvailable) {
      return res.status(409).json({ error: "Una fascia occupata da una perizia non può essere rimossa dal calendario." });
    }

    await prisma.inspectorSlot.delete({ where: { id: slotId } });
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Errore server" });
  }
});

/* ============================================================
   INSPECTIONS (MATCH) - VENDITORE -> CONTATTA PERIZIATORE
   Base path: /api/inspector/inspections/...
   ============================================================ */

/**
 * POST /api/inspector/inspections/request
 *
 * Body:
 * - carId: number
 * - requestedDate: "YYYY-MM-DD"
 * - startTime: "HH:MM"
 * - endTime: "HH:MM"
 * - expandedRadiusKm?: number
 * - suggestedSlotId?: number
 */
router.post("/inspections/request", async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) {
      return res.status(401).json({ ok: false, error: "Non autenticato" });
    }

    const {
      carId,
      requestedDate,
      startTime,
      endTime,
      expandedRadiusKm,
      suggestedSlotId,
    } = req.body ?? {};

    const carIdNum = Number(carId);
    const suggestedSlotIdNum =
      suggestedSlotId != null ? Number(suggestedSlotId) : null;
    const expandedRadiusKmNum =
      expandedRadiusKm != null ? Number(expandedRadiusKm) : null;

    if (!carIdNum || !requestedDate || !startTime || !endTime) {
      return res.status(400).json({
        ok: false,
        error: "Dati mancanti (carId, requestedDate, startTime, endTime)",
      });
    }

    const foundSellerUser = await prisma.user.findUnique({
      where: { clerkId },
    });

    if (!foundSellerUser) {
      return res.status(400).json({
        ok: false,
        error: "Utente non presente nel DB",
      });
    }

    const sellerUser = foundSellerUser;

    const foundCar = await prisma.car.findUnique({
      where: { id: carIdNum },
      include: { owner: true },
    });

    if (!foundCar) {
      return res.status(404).json({
        ok: false,
        error: "Auto non trovata",
      });
    }

    const car = foundCar;
    const carLatitude = car.latitude;
    const carLongitude = car.longitude;
    const carHasGeo = carLatitude != null && carLongitude != null;
    const carCityNorm = normCity(car.city);
    const rawCarCity = (car.city ?? "").trim();

    if (car.ownerId !== sellerUser.id) {
      return res.status(403).json({
        ok: false,
        error: "Non sei il proprietario di quest'auto",
      });
    }

    if (car.isPeriziata) {
      return res.status(400).json({
        ok: false,
        error: "Auto già periziata",
      });
    }

    const requestedStartMin = hhmmToMinutes(startTime);
    const requestedEndMin = hhmmToMinutes(endTime);

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ||
      !/^\d{2}:\d{2}$/.test(startTime) ||
      !/^\d{2}:\d{2}$/.test(endTime) ||
      requestedStartMin < 0 ||
      requestedEndMin > 24 * 60 ||
      requestedEndMin <= requestedStartMin
    ) {
      return res.status(400).json({
        ok: false,
        error: "Data/ora non valida",
      });
    }

    const requestedDurationMin = requestedEndMin - requestedStartMin;

    async function createInspectionFromSlot(
      slotId: number,
      matchType: MatchType,
      explicitAppointmentStartAt?: Date,
      explicitAppointmentEndAt?: Date
    ) {
      return prisma.$transaction(async (tx) => {
        const slotNow = await tx.inspectorSlot.findUnique({
          where: { id: slotId },
          include: { inspector: true },
        });

        if (!slotNow || !slotNow.isAvailable) {
          throw new Error("Slot non più disponibile");
        }

        const slotLocalStart = getRomeDateParts(slotNow.startAt);
        const appointmentStartAt = explicitAppointmentStartAt ?? new Date(
          slotNow.startAt.getTime() + (requestedStartMin - slotLocalStart.minutesOfDay) * 60000
        );
        const appointmentEndAt = explicitAppointmentEndAt ?? new Date(
          appointmentStartAt.getTime() + requestedDurationMin * 60000
        );

        if (appointmentStartAt < slotNow.startAt || appointmentEndAt > slotNow.endAt || appointmentEndAt <= appointmentStartAt) {
          throw new Error("L'orario richiesto non è più contenuto nella disponibilità del periziatore");
        }

        // Lo slot originale diventa esattamente la fascia occupata dalla perizia.
        // Le porzioni libere prima/dopo vengono ricreate come nuovi slot disponibili.
        const originalStart = slotNow.startAt;
        const originalEnd = slotNow.endAt;

        const claimed = await tx.inspectorSlot.updateMany({
          where: { id: slotNow.id, isAvailable: true },
          data: {
            startAt: appointmentStartAt,
            endAt: appointmentEndAt,
            isAvailable: false,
          },
        });

        if (claimed.count !== 1) {
          throw new Error("Slot non più disponibile");
        }

        if (originalStart < appointmentStartAt) {
          await tx.inspectorSlot.create({
            data: {
              inspectorId: slotNow.inspectorId,
              startAt: originalStart,
              endAt: appointmentStartAt,
              isAvailable: true,
            },
          });
        }

        if (appointmentEndAt < originalEnd) {
          await tx.inspectorSlot.create({
            data: {
              inspectorId: slotNow.inspectorId,
              startAt: appointmentEndAt,
              endAt: originalEnd,
              isAvailable: true,
            },
          });
        }

        const request = await tx.inspectionRequest.create({
          data: {
            carId: car.id,
            sellerId: sellerUser.id,
            inspectorId: slotNow.inspectorId,
            inspectorSlotId: slotNow.id,
            startAt: appointmentStartAt,
            endAt: appointmentEndAt,
            status: InspectionStatus.ASSIGNED,
            matchType,
            notes: null,
          },
          include: {
            car: {
              select: {
                id: true,
                title: true,
                make: true,
                model: true,
                year: true,
                city: true,
              },
            },
            seller: {
              select: {
                id: true,
                name: true,
                email: true,
                clerkId: true,
              },
            },
            inspector: {
              select: {
                id: true,
                workshopName: true,
                workshopAddress: true,
                logoUrl: true,
                email: true,
                phone: true,
                city: true,
                radiusKm: true,
              },
            },
            inspectorSlot: true,
          },
        });

        return request;
      });
    }

    function isWithinInspectorCoverage(profile: {
      latitude: number | null;
      longitude: number | null;
      radiusKm: number | null;
    }) {
      if (!carHasGeo) return true;
      if (profile.latitude == null || profile.longitude == null) return true;

      const d = haversineKm(
        carLatitude as number,
        carLongitude as number,
        profile.latitude,
        profile.longitude
      );

      return d <= (profile.radiusKm ?? 70);
    }

    if (suggestedSlotIdNum) {
      const slot = await prisma.inspectorSlot.findUnique({
        where: { id: suggestedSlotIdNum },
        include: {
          inspector: true,
        },
      });

      if (!slot || !slot.isAvailable) {
        return res.json({
          ok: true,
          match: false,
          step: "NO_MATCH",
          message:
            "Lo slot proposto non è più disponibile. Riprova una nuova ricerca.",
        });
      }

      if (!slotIsSameDayLocal(slot.startAt, requestedDate)) {
        return res.json({
          ok: true,
          match: false,
          step: "NO_MATCH",
          message:
            "Lo slot proposto non appartiene più al giorno richiesto. Riprova.",
        });
      }

      const slotDurationMin = minutesBetween(slot.startAt, slot.endAt);
      if (slotDurationMin < requestedDurationMin) {
        return res.json({
          ok: true,
          match: false,
          step: "NO_MATCH",
          message:
            "Lo slot proposto non ha più durata sufficiente. Riprova una nuova ricerca.",
        });
      }

      if (carCityNorm && normCity(slot.inspector.city) !== carCityNorm) {
        return res.json({
          ok: true,
          match: false,
          step: "NO_MATCH",
          message:
            "La proposta non appartiene più alla città richiesta. Riprova.",
        });
      }

      if (!isWithinInspectorCoverage(slot.inspector)) {
        return res.json({
          ok: true,
          match: false,
          step: "NO_MATCH",
          message:
            "La proposta non è più compatibile con il raggio del periziatore.",
        });
      }

      const suggestionStart = slot.startAt;
      const suggestionEnd = new Date(suggestionStart.getTime() + requestedDurationMin * 60000);
      const created = await createInspectionFromSlot(
        suggestedSlotIdNum,
        MatchType.FLEXIBLE_TIME,
        suggestionStart,
        suggestionEnd
      );

      return res.json({
        ok: true,
        match: true,
        step: "ACCEPTED_SUGGESTION",
        request: created,
        inspector: created.inspector,
      });
    }

    const perfectCandidates = await prisma.inspectorProfile.findMany({
      where: carCityNorm
        ? {
            city: {
              equals: rawCarCity,
              mode: "insensitive",
            },
          }
        : {},
      include: {
        slots: {
          where: {
            isAvailable: true,
          },
          orderBy: { startAt: "asc" },
          take: 100,
        },
      },
      take: 200,
    });

    const perfectFiltered = perfectCandidates.filter(isWithinInspectorCoverage);

    let matchedPerfectSlotId: number | null = null;

    for (const inspector of perfectFiltered) {
      const slot = (inspector.slots ?? []).find((s) =>
        slotMatchesRequestedLocalTime(
          s.startAt,
          s.endAt,
          requestedDate,
          requestedStartMin,
          requestedEndMin
        )
      );

      if (slot) {
        matchedPerfectSlotId = slot.id;
        break;
      }
    }

    if (matchedPerfectSlotId != null) {
      const created = await createInspectionFromSlot(
        matchedPerfectSlotId,
        MatchType.PERFECT
      );

      return res.json({
        ok: true,
        match: true,
        step: "PERFECT_MATCH",
        request: created,
        inspector: created.inspector,
      });
    }

    const sameCityProfiles = await prisma.inspectorProfile.findMany({
      where: carCityNorm
        ? {
            city: {
              equals: rawCarCity,
              mode: "insensitive",
            },
          }
        : {},
      include: {
        slots: {
          where: {
            isAvailable: true,
          },
          orderBy: { startAt: "asc" },
          take: 100,
        },
      },
      take: 200,
    });

    const sameCityFiltered = sameCityProfiles.filter(isWithinInspectorCoverage);

    let bestSuggestion:
      | {
          slotId: number;
          inspectorId: string;
          inspectorName: string;
          inspectorCity: string | null;
          startAt: Date;
          endAt: Date;
          deltaMs: number;
        }
      | null = null;

    for (const inspector of sameCityFiltered) {
      for (const slot of inspector.slots ?? []) {
        if (!slotIsSameDayLocal(slot.startAt, requestedDate)) continue;

        const slotDurationMin = minutesBetween(slot.startAt, slot.endAt);
        if (slotDurationMin < requestedDurationMin) continue;

        const slotLocal = getRomeDateParts(slot.startAt);
        const delta = Math.abs(slotLocal.minutesOfDay - requestedStartMin) * 60000;

        if (!bestSuggestion || delta < bestSuggestion.deltaMs) {
          bestSuggestion = {
            slotId: slot.id,
            inspectorId: inspector.id,
            inspectorName: inspector.workshopName,
            inspectorCity: inspector.city ?? null,
            startAt: slot.startAt,
            endAt: new Date(slot.startAt.getTime() + requestedDurationMin * 60000),
            deltaMs: delta,
          };
        }
      }
    }

    if (bestSuggestion) {
      return res.json({
        ok: true,
        match: false,
        step: "CITY_OTHER_TIME",
        message:
          "Nessun periziatore disponibile all’orario richiesto, ma ne abbiamo trovato uno nella tua città in un altro orario.",
        suggestion: {
          slotId: bestSuggestion.slotId,
          inspectorId: bestSuggestion.inspectorId,
          inspectorName: bestSuggestion.inspectorName,
          inspectorCity: bestSuggestion.inspectorCity,
          startAt: bestSuggestion.startAt,
          endAt: bestSuggestion.endAt,
        },
      });
    }

    if (expandedRadiusKmNum == null || Number.isNaN(expandedRadiusKmNum)) {
      return res.json({
        ok: true,
        match: false,
        step: "ASK_EXPAND_RADIUS",
        message:
          "Nessun periziatore disponibile nella tua città. Prova ad allargare il raggio di ricerca.",
      });
    }

    if (!carHasGeo) {
      return res.json({
        ok: true,
        match: false,
        step: "NO_MATCH",
        message:
          "L’auto non ha coordinate geografiche. Non è possibile cercare nel raggio. Prova un’altra data.",
      });
    }

    const allProfiles = await prisma.inspectorProfile.findMany({
      include: {
        slots: {
          where: {
            isAvailable: true,
          },
          orderBy: { startAt: "asc" },
          take: 100,
        },
      },
      take: 500,
    });

    const radiusMatches = allProfiles
      .map((profile) => {
        if (profile.latitude == null || profile.longitude == null) {
          return null;
        }

        const distanceKm = haversineKm(
          carLatitude as number,
          carLongitude as number,
          profile.latitude,
          profile.longitude
        );

        if (distanceKm > expandedRadiusKmNum) return null;
        if (distanceKm > (profile.radiusKm ?? 70)) return null;

        const slot = (profile.slots ?? []).find((s) =>
          slotMatchesRequestedLocalTime(
            s.startAt,
            s.endAt,
            requestedDate,
            requestedStartMin,
            requestedEndMin
          )
        );

        if (!slot) return null;

        return {
          inspector: profile,
          slot,
          distanceKm,
        };
      })
      .filter(
        (
          item
        ): item is {
          inspector: (typeof allProfiles)[number];
          slot: (typeof allProfiles)[number]["slots"][number];
          distanceKm: number;
        } => item !== null
      )
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const radiusMatch = radiusMatches[0];

    if (radiusMatch) {
      const created = await createInspectionFromSlot(
        radiusMatch.slot.id,
        MatchType.RADIUS
      );

      return res.json({
        ok: true,
        match: true,
        step: "RADIUS_MATCH",
        request: created,
        inspector: created.inspector,
        radiusUsedKm: expandedRadiusKmNum,
        distanceKm: radiusMatch.distanceKm,
      });
    }

    return res.json({
      ok: true,
      match: false,
      step: "NO_MATCH",
      message:
        "Nessun periziatore disponibile nemmeno allargando il raggio. Prova una nuova data o un altro orario.",
    });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({
      ok: false,
      error: e?.message ?? "Errore server",
    });
  }
});

/**
 * GET /api/inspector/inspections/received
 * Perizie ricevute dal periziatore loggato
 */
router.get("/inspections/received", async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Non autenticato" });

    const user = await prisma.user.findUnique({ where: { clerkId } });
    if (!user) return res.status(400).json({ error: "Utente non presente nel DB" });

    const profile = await prisma.inspectorProfile.findUnique({
      where: { userId: user.id },
    });
    if (!profile) {
      return res.status(404).json({ error: "Profilo periziatore non trovato" });
    }

    const requests = await prisma.inspectionRequest.findMany({
      where: { inspectorId: profile.id },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        car: {
          select: {
            id: true,
            title: true,
            make: true,
            model: true,
            year: true,
            city: true,
            coverUrl: true,
            photos: true,
            isPeriziata: true,
          },
        },
        seller: { select: { id: true, name: true, email: true, clerkId: true } },
        inspectorSlot: true,
      },
    });

    return res.json({ ok: true, requests });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Errore server" });
  }
});

/**
 * POST /api/inspector/inspections/:id/confirm
 * Periziatore conferma la perizia:
 * - setta status = CONFIRMED
 * - crea (se non esiste) la chat legata alla inspectionRequest
 * - invia messaggio automatico nella chat
 * - ritorna chatId
 */
router.post("/inspections/:id/confirm", async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Non autenticato" });

    const inspectionId = Number(req.params.id);
    if (!inspectionId) {
      return res.status(400).json({ error: "ID perizia non valido" });
    }

    const meUser = await prisma.user.findUnique({ where: { clerkId } });
    if (!meUser) return res.status(400).json({ error: "Utente non presente nel DB" });

    const myProfile = await prisma.inspectorProfile.findUnique({
      where: { userId: meUser.id },
      select: {
        id: true,
        userId: true,
        workshopName: true,
        workshopAddress: true,
        city: true,
      },
    });
    if (!myProfile) {
      return res.status(404).json({ error: "Profilo periziatore non trovato" });
    }

    const ir = await prisma.inspectionRequest.findUnique({
      where: { id: inspectionId },
      include: {
        car: { select: { make: true, model: true, year: true } },
        seller: { select: { id: true, name: true, email: true } },
        inspector: {
          select: {
            id: true,
            userId: true,
            workshopName: true,
            workshopAddress: true,
            city: true,
          },
        },
      },
    });

    if (!ir) return res.status(404).json({ error: "Richiesta perizia non trovata" });

    if (ir.inspectorId !== myProfile.id) {
      return res.status(403).json({ error: "Non autorizzato su questa perizia" });
    }

    if (ir.status === "CANCELLED") {
      return res.status(400).json({ error: "Perizia cancellata" });
    }
    if (ir.status === "DONE") {
      return res.status(400).json({ error: "Perizia già completata" });
    }

    const out = await prisma.$transaction(async (tx) => {
      const updated = await tx.inspectionRequest.update({
        where: { id: inspectionId },
        data: { status: "CONFIRMED" },
      });

      let chat = await tx.chat.findUnique({
        where: { inspectionRequestId: inspectionId },
        select: { id: true },
      });

      if (!chat) {
        chat = await tx.chat.create({
          data: {
            inspectionRequestId: inspectionId,
            buyerId: myProfile.userId,
            sellerId: ir.sellerId,
          },
          select: { id: true },
        });
      }

      const workshopAddress =
        ir.inspector.workshopAddress ??
        myProfile.workshopAddress ??
        null;

      const workshopCity =
        ir.inspector.city ??
        myProfile.city ??
        null;

      const mapsLink = buildGoogleMapsLink(workshopAddress, workshopCity);

      const startTxt = formatDateTimeRome(new Date(ir.startAt));
      const endTxt = formatDateTimeRome(new Date(ir.endAt));

      const addressLine = workshopAddress
        ? workshopCity
          ? `${workshopAddress}, ${workshopCity}`
          : workshopAddress
        : workshopCity || "Indirizzo non disponibile";

      const autoText =
        `La sua richiesta di perizia è stata accettata ✅\n` +
        `Giorno/ora: ${startTxt} → ${endTxt}\n` +
        `Indirizzo officina: ${addressLine}\n` +
        `${mapsLink ? `Google Maps: ${mapsLink}\n` : ""}` +
        `A presto.`;

      await tx.message.create({
        data: {
          chatId: chat.id,
          senderId: myProfile.userId,
          content: autoText,
        },
      });

      return { updated, chatId: chat.id };
    });

    return res.json({
      ok: true,
      request: out.updated,
      chatId: out.chatId,
    });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e?.message ?? "Errore server" });
  }
});

/**
 * POST /api/inspector/inspections/:id/cancel
 * Il periziatore annulla una perizia:
 * - status = CANCELLED
 * - libera lo slot (isAvailable=true)
 * - manda messaggio automatico al venditore nella chat
 * - la chat sparisce per il periziatore (filtrata in /api/chat), rimane al venditore
 */
router.post("/inspections/:id/cancel", async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Non autenticato" });

    const inspectionId = Number(req.params.id);
    if (!inspectionId) {
      return res.status(400).json({ error: "ID perizia non valido" });
    }

    const meUser = await prisma.user.findUnique({ where: { clerkId } });
    if (!meUser) return res.status(400).json({ error: "Utente non presente nel DB" });

    const myProfile = await prisma.inspectorProfile.findUnique({
      where: { userId: meUser.id },
      select: { id: true, userId: true, workshopName: true },
    });
    if (!myProfile) {
      return res.status(404).json({ error: "Profilo periziatore non trovato" });
    }

    const ir = await prisma.inspectionRequest.findUnique({
      where: { id: inspectionId },
      include: {
        car: { select: { id: true, title: true, make: true, model: true, year: true } },
        seller: { select: { id: true, name: true, email: true } },
        inspectorSlot: { select: { id: true } },
        chat: { select: { id: true } },
      },
    });

    if (!ir) return res.status(404).json({ error: "Richiesta perizia non trovata" });

    if (ir.inspectorId !== myProfile.id) {
      return res.status(403).json({ error: "Non autorizzato su questa perizia" });
    }

    if (ir.status === "CANCELLED") {
      return res.json({ ok: true, alreadyCancelled: true });
    }
    if (ir.status === "DONE") {
      return res.status(400).json({ error: "Perizia già completata" });
    }

    const out = await prisma.$transaction(async (tx) => {
      const updated = await tx.inspectionRequest.update({
        where: { id: inspectionId },
        data: { status: "CANCELLED" },
      });

      const reopened = await tx.inspectorSlot.update({
        where: { id: ir.inspectorSlotId },
        data: { isAvailable: true },
      });

      // Ricompone le fasce adiacenti create dallo split della disponibilità.
      // Esempio: 09:00-11:30 + 11:30-12:30 + 12:30-18:00 torna 09:00-18:00.
      const previous = await tx.inspectorSlot.findFirst({
        where: {
          inspectorId: reopened.inspectorId,
          isAvailable: true,
          id: { not: reopened.id },
          endAt: reopened.startAt,
        },
        orderBy: { startAt: "desc" },
      });

      const next = await tx.inspectorSlot.findFirst({
        where: {
          inspectorId: reopened.inspectorId,
          isAvailable: true,
          id: { not: reopened.id },
          startAt: reopened.endAt,
        },
        orderBy: { endAt: "asc" },
      });

      const mergedStart = previous?.startAt ?? reopened.startAt;
      const mergedEnd = next?.endAt ?? reopened.endAt;
      const toDelete = [previous?.id, next?.id].filter((id): id is number => typeof id === "number");

      if (toDelete.length) {
        await tx.inspectorSlot.deleteMany({ where: { id: { in: toDelete } } });
        await tx.inspectorSlot.update({
          where: { id: reopened.id },
          data: { startAt: mergedStart, endAt: mergedEnd },
        });
      }

      let chat = await tx.chat.findUnique({
        where: { inspectionRequestId: inspectionId },
        select: { id: true },
      });

      if (!chat) {
        chat = await tx.chat.create({
          data: {
            inspectionRequestId: inspectionId,
            buyerId: myProfile.userId,
            sellerId: ir.sellerId,
          },
          select: { id: true },
        });
      }

      const autoText =
        `Ci dispiace ma per questa data non è più possibile la perizia ❌\n` +
        `Riprova in altri giorni.`;

      await tx.message.create({
        data: {
          chatId: chat.id,
          senderId: myProfile.userId,
          content: autoText,
        },
      });

      return { updated, chatId: chat.id };
    });

    return res.json({ ok: true, request: out.updated, chatId: out.chatId });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e?.message ?? "Errore server" });
  }
});

export default router;