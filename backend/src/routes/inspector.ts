// backend/src/routes/inspector.ts
import { Router } from "express";
import { prisma } from "../prisma";
import { getAuth } from "@clerk/express";
import { InspectionStatus, MatchType } from "@prisma/client";
import { geocodeAddress } from "../lib/geocode";

const router = Router();

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
    const geo = await geocodeAddress(cleanAddress || cleanCity, cleanCity || undefined);
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
      userName,
    } = req.body ?? {};

    if (!workshopName || !email || !phone) {
      return res
        .status(400)
        .json({ error: "Dati mancanti (workshopName, email, phone)" });
    }

    const user = await ensureUser(clerkId, email, userName);

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

    const profile = await prisma.inspectorProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        workshopName,
        workshopAddress: workshopAddress ?? null,
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

    const updated = await prisma.inspectorProfile.update({
      where: { userId: user.id },
      data: {
        workshopName: workshopName ?? existing.workshopName,
        workshopAddress: nextWorkshopAddress ?? null,
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

    const profile = await prisma.inspectorProfile.findUnique({
      where: { userId: user.id },
    });
    if (!profile) {
      return res.status(404).json({ error: "Profilo periziatore non trovato" });
    }

    const created = await prisma.inspectorSlot.create({
      data: {
        inspectorId: profile.id,
        startAt: start,
        endAt: end,
        isAvailable: true,
      },
    });

    return res.json({ ok: true, slot: created });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Errore server" });
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

    const requestedStartAt = new Date(`${requestedDate}T${startTime}:00`);
    const requestedEndAt = new Date(`${requestedDate}T${endTime}:00`);

    if (
      Number.isNaN(requestedStartAt.getTime()) ||
      Number.isNaN(requestedEndAt.getTime())
    ) {
      return res.status(400).json({
        ok: false,
        error: "Data/ora non valida",
      });
    }

    if (requestedEndAt <= requestedStartAt) {
      return res.status(400).json({
        ok: false,
        error: "endTime deve essere > startTime",
      });
    }

    const requestedStartMin = hhmmToMinutes(startTime);
    const requestedEndMin = hhmmToMinutes(endTime);
    const requestedDurationMin = minutesBetween(
      requestedStartAt,
      requestedEndAt
    );

    async function createInspectionFromSlot(
      slotId: number,
      matchType: MatchType
    ) {
      return prisma.$transaction(async (tx) => {
        const slotNow = await tx.inspectorSlot.findUnique({
          where: { id: slotId },
          include: {
            inspector: true,
          },
        });

        if (!slotNow || !slotNow.isAvailable) {
          throw new Error("Slot non più disponibile");
        }

        const request = await tx.inspectionRequest.create({
          data: {
            carId: car.id,
            sellerId: sellerUser.id,
            inspectorId: slotNow.inspectorId,
            inspectorSlotId: slotNow.id,
            startAt: slotNow.startAt,
            endAt: slotNow.endAt,
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
                email: true,
                phone: true,
                city: true,
                radiusKm: true,
              },
            },
            inspectorSlot: true,
          },
        });

        await tx.inspectorSlot.update({
          where: { id: slotNow.id },
          data: { isAvailable: false },
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

      const created = await createInspectionFromSlot(
        suggestedSlotIdNum,
        MatchType.FLEXIBLE_TIME
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

        const delta = absMs(slot.startAt, requestedStartAt);

        if (!bestSuggestion || delta < bestSuggestion.deltaMs) {
          bestSuggestion = {
            slotId: slot.id,
            inspectorId: inspector.id,
            inspectorName: inspector.workshopName,
            inspectorCity: inspector.city ?? null,
            startAt: slot.startAt,
            endAt: slot.endAt,
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
      select: { id: true, userId: true, workshopName: true },
    });
    if (!myProfile) {
      return res.status(404).json({ error: "Profilo periziatore non trovato" });
    }

    const ir = await prisma.inspectionRequest.findUnique({
      where: { id: inspectionId },
      include: {
        car: { select: { make: true, model: true, year: true } },
        seller: { select: { id: true, name: true, email: true } },
        inspector: { select: { id: true, userId: true } },
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

      const startTxt = new Date(ir.startAt).toLocaleString();
      const endTxt = new Date(ir.endAt).toLocaleString();

      const autoText =
        `La sua richiesta di perizia è stata accettata ✅\n` +
        `Giorno/ora: ${startTxt} → ${endTxt}\n` +
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

      await tx.inspectorSlot.update({
        where: { id: ir.inspectorSlotId },
        data: { isAvailable: true },
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