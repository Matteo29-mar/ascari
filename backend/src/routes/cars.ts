import express from 'express';
import { getAuth } from '@clerk/express';
import { prisma } from '../prisma';
import { ensureUserInDb } from '../lib/authUser';
import { geocodeAddress } from "../lib/geocode";
import multer from "multer";
import path from "path";
import fs from "fs";
import { buildPdfBuffer } from "../lib/buildInspection";

const router = express.Router();

const uploadDir = path.join(process.cwd(), "uploads", "perizie");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const carId = req.params.id;
    const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    cb(null, `car_${carId}_${Date.now()}_${safe}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Solo PDF consentiti"));
    }
    cb(null, true);
  },
  limits: { fileSize: 15 * 1024 * 1024 },
});

function parsePositiveInt(value: any, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function parsePage(req: express.Request) {
  return parsePositiveInt(req.query.page, 1);
}

function parsePageSize(req: express.Request) {
  const raw = parsePositiveInt(req.query.pageSize, 6);
  if (raw <= 6) return 6;
  if (raw <= 9) return 9;
  return 12;
}

function buildPaginatedResponse(items: any[], total: number, page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    items,
    total,
    page,
    pageSize,
    totalPages,
  };
}

async function getDbUserFromClerk(req: express.Request) {
  const { userId: clerkUserId } = getAuth(req);
  if (!clerkUserId) return null;

  const user = await prisma.user.findUnique({
    where: { clerkId: clerkUserId },
  });

  return user;
}

function buildCarsInclude(userId?: string) {
  if (!userId) {
    return {
      owner: {
        select: {
          clerkId: true,
        },
      },
    };
  }

  return {
    owner: {
      select: {
        clerkId: true,
      },
    },
    likes: {
      where: { userId },
      select: { id: true },
    },
  };
}

function addLikedByMe(cars: any[], hasUser: boolean) {
  return cars.map((c: any) => ({
    ...c,
    likedByMe: hasUser ? (c.likes?.length ?? 0) > 0 : false,
  }));
}

/**
 * POST /api/cars/:id/perizia/upload
 * 🔒 Solo owner: carica PDF perizia e setta isPeriziata=true
 */
router.post("/:id/perizia/upload", upload.single("file"), async (req, res) => {
  const { userId: clerkUserId } = getAuth(req);
  const carId = Number(req.params.id);

  if (!clerkUserId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  if (Number.isNaN(carId)) {
    return res.status(400).json({ error: "Invalid car id" });
  }
  if (!req.file) {
    return res.status(400).json({ error: "Missing file" });
  }

  try {
    const user = await prisma.user.findUnique({ where: { clerkId: clerkUserId } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const car = await prisma.car.findUnique({ where: { id: carId } });
    if (!car) return res.status(404).json({ error: "Car not found" });

    if (car.ownerId !== user.id) {
      return res.status(403).json({ error: "Not allowed" });
    }

    const docUrl = `/uploads/perizie/${req.file.filename}`;

    const updated = await prisma.car.update({
      where: { id: carId },
      data: {
        isPeriziata: true,
        periziaDocUrl: docUrl,
        periziaUploadedAt: new Date(),
      },
    });

    return res.json({ success: true, car: updated });
  } catch (e: any) {
    console.error("POST /api/cars/:id/perizia/upload error:", e);
    return res.status(500).json({ error: e?.message || "Upload error" });
  }
});

/**
 * GET /api/cars/:id/perizia/download
 * 🔒 Autenticato: scarica PDF perizia se disponibile
 */
router.get("/:id/perizia/download", async (req, res) => {
  const { userId: clerkUserId } = getAuth(req);
  const carId = Number(req.params.id);

  if (!clerkUserId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  if (Number.isNaN(carId)) {
    return res.status(400).json({ error: "Invalid car id" });
  }

  try {
    const car = await prisma.car.findUnique({
      where: { id: carId },
      include: {
        inspectionRequests: {
          orderBy: { createdAt: "desc" },
          include: {
            report: true,
            inspector: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!car) {
      return res.status(404).json({ error: "Car not found" });
    }

    const latestInspectionWithReport = car.inspectionRequests.find((r) => r.report);

    if (!latestInspectionWithReport?.report) {
      return res.status(404).json({ error: "Perizia not available" });
    }

    const report = latestInspectionWithReport.report;

    const pdfBuffer = await buildPdfBuffer({
      ...report,
      car,
      inspectionRequest: latestInspectionWithReport,
      inspectorUser: latestInspectionWithReport.inspector?.user ?? null,
    });

    const safeMake = car.make?.replace(/\s+/g, "-") || "auto";
    const safeModel = car.model?.replace(/\s+/g, "-") || "veicolo";

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="perizia-${safeMake}-${safeModel}-${car.id}.pdf"`
    );

    return res.send(pdfBuffer);
  } catch (e) {
    console.error("GET /api/cars/:id/perizia/download error:", e);
    return res.status(500).json({ error: "Download error" });
  }
});

/**
 * POST /api/cars
 * ✅ Crea una nuova auto dell'utente loggato
 */
router.post('/', async (req, res) => {
  const { userId: clerkUserId, sessionClaims } = getAuth(req);

  if (!clerkUserId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const email = sessionClaims?.email as string | undefined;
    const name = (sessionClaims as any)?.fullName || undefined;

    const user = await ensureUserInDb(clerkUserId, email ?? null, name ?? null);

    const {
      make,
      model,
      title,
      year,
      offerPrice1,
      offerPrice2,
      offerPrice3,
      fuelType,
      horsepower,
      mileageKm,
      description,
      coverUrl,
      photos,
      locationText,
      city,
      color,
      torqueNm,
      drivetrain,
      transmission,
      seats,
      doors,
      priceEur,
      engine,
      trimLevel,
    } = req.body;

    if (
      offerPrice1 === undefined ||
      offerPrice2 === undefined ||
      offerPrice3 === undefined
    ) {
      return res.status(400).json({ error: "I tre prezzi sono obbligatori" });
    }

    const normalize = (v: any) => (v === '' ? null : v);

    const finalTitle =
      typeof title === 'string' && title.trim().length > 0
        ? title.trim()
        : [make, model, year].filter(Boolean).join(' ') || 'Nuova auto';

    const finalCover =
      typeof coverUrl === 'string' && coverUrl.trim() !== ''
        ? coverUrl
        : Array.isArray(photos) && photos.length > 0
        ? photos[0]
        : null;

    let latitude: number | null = null;
    let longitude: number | null = null;

    const loc = normalize(locationText);
    const c = normalize(city);

    if (loc || c) {
      const geo = await geocodeAddress(loc ?? "", c ?? undefined);

      if (!geo) {
        return res.status(400).json({
          error: "Indirizzo/Città non trovati. Controlla e riprova.",
        });
      }

      latitude = geo.lat;
      longitude = geo.lng;
    }

    const car = await prisma.car.create({
      data: {
        make,
        model,
        title: finalTitle,
        year,

        offerPrice1: Number(offerPrice1),
        offerPrice2: Number(offerPrice2),
        offerPrice3: Number(offerPrice3),

        fuelType: normalize(fuelType),
        horsepower: horsepower === '' || horsepower === undefined ? null : Number(horsepower),
        mileageKm: mileageKm === '' || mileageKm === undefined ? null : Number(mileageKm),
        description: normalize(description),

        coverUrl: finalCover,
        photos: Array.isArray(photos) ? photos : [],
        ownerId: user.id,

        locationText: normalize(locationText),
        city: normalize(city),
        latitude,
        longitude,

        engine: normalize(engine),
        trimLevel: normalize(trimLevel),
        color: normalize(color),
        drivetrain: normalize(drivetrain),
        transmission: normalize(transmission),
        torqueNm: torqueNm === '' || torqueNm === undefined ? null : Number(torqueNm),
        seats: seats === '' || seats === undefined ? null : Number(seats),
        doors: doors === '' || doors === undefined ? null : Number(doors),
        priceEur: priceEur === '' || priceEur === undefined ? null : Number(priceEur),
      },
    });

    return res.json(car);
  } catch (err) {
    console.error('POST /api/cars error:', err);
    return res.status(500).json({ error: 'Error creating car' });
  }
});

/**
 * GET /api/cars/search
 * 🔍 Cerca auto per marca, modello o titolo con paginazione
 */
router.get('/search', async (req, res) => {
  const query = String(req.query.query || '').trim();
  const page = parsePage(req);
  const pageSize = parsePageSize(req);
  const skip = (page - 1) * pageSize;

  try {
    const user = await getDbUserFromClerk(req);

    if (!query) {
      return res.json(buildPaginatedResponse([], 0, page, pageSize));
    }

    const where = {
      OR: [
        { make: { contains: query, mode: 'insensitive' as const } },
        { model: { contains: query, mode: 'insensitive' as const } },
        { title: { contains: query, mode: 'insensitive' as const } },
      ],
    };

    const [total, cars] = await Promise.all([
      prisma.car.count({ where }),
      prisma.car.findMany({
        where,
        include: buildCarsInclude(user?.id),
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    return res.json(
      buildPaginatedResponse(addLikedByMe(cars, !!user), total, page, pageSize)
    );
  } catch (err) {
    console.error('GET /api/cars/search error:', err);
    return res.status(500).json({ error: 'Search error' });
  }
});

/**
 * GET /api/cars/filter
 * 🔍 Filtri avanzati con paginazione
 */
router.get("/filter", async (req, res) => {
  const brands = req.query.brands?.toString().split(",").filter(Boolean) || [];
  const models = req.query.models?.toString().split(",").filter(Boolean) || [];
  const page = parsePage(req);
  const pageSize = parsePageSize(req);
  const skip = (page - 1) * pageSize;

  try {
    const user = await getDbUserFromClerk(req);

    const where = {
      AND: [
        brands.length
          ? {
              OR: brands.map((b) => ({
                make: { equals: b, mode: "insensitive" as const },
              })),
            }
          : {},
        models.length
          ? {
              OR: models.map((m) => ({
                model: { equals: m, mode: "insensitive" as const },
              })),
            }
          : {},
      ],
    };

    const [total, cars] = await Promise.all([
      prisma.car.count({ where }),
      prisma.car.findMany({
        where,
        include: buildCarsInclude(user?.id),
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
    ]);

    return res.json(
      buildPaginatedResponse(addLikedByMe(cars, !!user), total, page, pageSize)
    );
  } catch (e) {
    console.error("GET /api/cars/filter error:", e);
    return res.status(500).json({ error: "Errore filtraggio" });
  }
});

/**
 * GET /api/cars/nearby
 * 📍 Mostra le auto nel raggio indicato con paginazione
 * es: /api/cars/nearby?lat=45.32&lon=8.42&radius=5&page=1&pageSize=6
 */
router.get("/nearby", async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const radius = Number(req.query.radius ?? req.query.radiusKm ?? 5);
  const page = parsePage(req);
  const pageSize = parsePageSize(req);
  const offset = (page - 1) * pageSize;

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return res.status(400).json({ error: "Invalid coordinates" });
  }

  try {
    const user = await getDbUserFromClerk(req);

    const totalRows = await prisma.$queryRawUnsafe<Array<{ count: bigint | number }>>(`
      SELECT COUNT(*)::bigint AS count
      FROM (
        SELECT
          id,
          (
            6371 * acos(
              cos(radians(${lat})) *
              cos(radians(latitude)) *
              cos(radians(longitude) - radians(${lon})) +
              sin(radians(${lat})) * sin(radians(latitude))
            )
          ) AS "distanceKm"
        FROM "Car"
        WHERE latitude IS NOT NULL
          AND longitude IS NOT NULL
      ) t
      WHERE t."distanceKm" <= ${radius}
    `);

    const totalRaw = totalRows?.[0]?.count ?? 0;
    const total = typeof totalRaw === "bigint" ? Number(totalRaw) : Number(totalRaw);

    const nearbyRows = await prisma.$queryRawUnsafe<Array<{ id: number; distanceKm: number }>>(`
      SELECT *
      FROM (
        SELECT
          id,
          (
            6371 * acos(
              cos(radians(${lat})) *
              cos(radians(latitude)) *
              cos(radians(longitude) - radians(${lon})) +
              sin(radians(${lat})) * sin(radians(latitude))
            )
          ) AS "distanceKm"
        FROM "Car"
        WHERE latitude IS NOT NULL
          AND longitude IS NOT NULL
      ) t
      WHERE t."distanceKm" <= ${radius}
      ORDER BY t."distanceKm" ASC, t.id DESC
      LIMIT ${pageSize}
      OFFSET ${offset}
    `);

    const ids = nearbyRows.map((r) => r.id);

    if (!ids.length) {
      return res.json(buildPaginatedResponse([], total, page, pageSize));
    }

    const cars = await prisma.car.findMany({
      where: { id: { in: ids } },
      include: buildCarsInclude(user?.id),
    });

    const distanceMap = new Map<number, number>();
    for (const row of nearbyRows) {
      distanceMap.set(row.id, Number(row.distanceKm));
    }

    const orderedCars = ids
      .map((id) => cars.find((c) => c.id === id))
      .filter(Boolean)
      .map((car: any) => ({
        ...car,
        distanceKm: distanceMap.get(car.id) ?? null,
      }));

    return res.json(
      buildPaginatedResponse(addLikedByMe(orderedCars, !!user), total, page, pageSize)
    );
  } catch (e) {
    console.error("GET /api/cars/nearby error", e);
    return res.status(500).json({ error: "Nearby search error" });
  }
});

/**
 * GET /api/cars
 * 🔥 Tutte le auto con paginazione
 */
router.get('/', async (req, res) => {
  try {
    const user = await getDbUserFromClerk(req);
    const page = parsePage(req);
    const pageSize = parsePageSize(req);
    const skip = (page - 1) * pageSize;

    const [total, cars] = await Promise.all([
      prisma.car.count(),
      prisma.car.findMany({
        include: buildCarsInclude(user?.id),
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    return res.json(
      buildPaginatedResponse(addLikedByMe(cars, !!user), total, page, pageSize)
    );
  } catch (e) {
    console.error('GET /api/cars error:', e);
    return res.status(500).json({ error: 'Error fetching cars' });
  }
});

/**
 * GET /api/cars/my-garage
 * 🟢 “Il mio garage” (auto create da me + auto che mi piacciono)
 */
router.get('/my-garage', async (req, res) => {
  const { userId: clerkUserId } = getAuth(req);

  if (!clerkUserId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId: clerkUserId },
    });

    if (!user) {
      return res.json({
        myCars: [],
        likedCars: [],
      });
    }

    const myCars = await prisma.car.findMany({
      where: { ownerId: user.id },
      include: { likes: true, owner: true },
      orderBy: { createdAt: 'desc' },
    });

    const likedCars = await prisma.car.findMany({
      where: {
        likes: {
          some: { userId: user.id },
        },
      },
      include: { owner: true, likes: true },
      orderBy: { createdAt: 'desc' },
    });

    const myCarsWithLikes = myCars.map(c => ({
      ...c,
      likedByMe: c.likes.length > 0,
    }));

    const likedCarsWithLikes = likedCars.map(c => ({
      ...c,
      likedByMe: true,
    }));

    return res.json({
      myCars: myCarsWithLikes,
      likedCars: likedCarsWithLikes,
    });
  } catch (err) {
    console.error('GET /api/cars/my-garage error:', err);
    return res.status(500).json({ error: 'Error fetching my garage' });
  }
});

/**
 * GET /api/cars/:id
 * ✅ Dettaglio singola auto (pubblico)
 */
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);

  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Invalid car id' });
  }

  try {
    const car = await prisma.car.findUnique({
      where: { id },
      include: {
        owner: true,
        likes: true,
      },
    });

    if (!car) {
      return res.status(404).json({ error: 'Car not found' });
    }

    return res.json(car);
  } catch (err) {
    console.error('GET /api/cars/:id error:', err);
    return res.status(500).json({ error: 'Error fetching car' });
  }
});

/**
 * POST /api/cars/:carId/like
 * 🟢 Metti "mi piace" a un'auto
 */
router.post('/:carId/like', async (req, res) => {
  const { userId: clerkUserId } = getAuth(req);
  const carId = Number(req.params.carId);

  if (!clerkUserId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId: clerkUserId },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const car = await prisma.car.findUnique({ where: { id: carId } });
    if (!car) {
      return res.status(404).json({ error: 'Car not found' });
    }

    await prisma.like.upsert({
      where: {
        userId_carId: {
          userId: user.id,
          carId,
        },
      },
      update: {},
      create: {
        userId: user.id,
        carId,
      },
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('POST /api/cars/:carId/like error:', err);
    return res.status(500).json({ error: 'Error adding like' });
  }
});

/**
 * DELETE /api/cars/:carId/like
 * 🟢 Togli "mi piace" a un'auto
 */
router.delete('/:carId/like', async (req, res) => {
  const { userId: clerkUserId } = getAuth(req);
  const carId = Number(req.params.carId);

  if (!clerkUserId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId: clerkUserId },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await prisma.like.deleteMany({
      where: {
        userId: user.id,
        carId,
      },
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/cars/:carId/like error:', err);
    return res.status(500).json({ error: 'Error removing like' });
  }
});

/**
 * PUT /api/cars/:id
 * 🔧 UPDATE car: solo il proprietario può modificare
 */
router.put('/:id', async (req, res) => {
  const { userId: clerkUserId } = getAuth(req);
  const carId = Number(req.params.id);

  if (!clerkUserId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId: clerkUserId },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const car = await prisma.car.findUnique({
      where: { id: carId },
    });

    if (!car) {
      return res.status(404).json({ error: 'Car not found' });
    }

    if (car.ownerId !== user.id) {
      return res.status(403).json({ error: 'Not allowed to edit this car' });
    }

    const { offerPrice1, offerPrice2, offerPrice3 } = req.body;

    if (
      offerPrice1 === undefined ||
      offerPrice2 === undefined ||
      offerPrice3 === undefined
    ) {
      return res.status(400).json({ error: "I tre prezzi sono obbligatori" });
    }

    const normalize = (v: any) => (v === '' ? null : v);

    const data: any = {
      make: normalize(req.body.make),
      model: normalize(req.body.model),
      title: normalize(req.body.title),
      year: normalize(req.body.year),
      fuelType: normalize(req.body.fuelType),
      horsepower: normalize(req.body.horsepower),
      mileageKm: normalize(req.body.mileageKm),
      description: normalize(req.body.description),
      locationText: normalize(req.body.locationText),
      city: normalize(req.body.city),
      latitude: normalize(req.body.latitude),
      longitude: normalize(req.body.longitude),

      engine: normalize(req.body.engine),
      trimLevel: normalize(req.body.trimLevel),
      color: normalize(req.body.color),
      drivetrain: normalize(req.body.drivetrain),
      transmission: normalize(req.body.transmission),
      torqueNm: normalize(req.body.torqueNm),
      seats: normalize(req.body.seats),
      doors: normalize(req.body.doors),
      priceEur: normalize(req.body.priceEur),
    };

    data.offerPrice1 = Number(offerPrice1);
    data.offerPrice2 = Number(offerPrice2);
    data.offerPrice3 = Number(offerPrice3);

    if (Array.isArray(req.body.photos)) {
      data.photos = req.body.photos;
    }

    data.coverUrl =
      typeof req.body.coverUrl === 'string' && req.body.coverUrl.trim() !== ''
        ? req.body.coverUrl
        : Array.isArray(req.body.photos) && req.body.photos.length > 0
        ? req.body.photos[0]
        : car.coverUrl;

    if (data.locationText || data.city) {
      const geo = await geocodeAddress(
        data.locationText ?? "",
        data.city ?? undefined
      );

      if (geo) {
        data.latitude = geo.lat;
        data.longitude = geo.lng;
      }
    }

    const updated = await prisma.car.update({
      where: { id: carId },
      data,
    });

    return res.json(updated);
  } catch (err) {
    console.error('PUT /api/cars/:id error:', err);
    return res.status(500).json({ error: 'Error updating car' });
  }
});

/**
 * DELETE /api/cars/:id
 * 🔧 DELETE car: solo il proprietario può eliminarla
 */
router.delete("/:id", async (req, res) => {
  const { userId: clerkUserId } = getAuth(req);
  const carId = Number(req.params.id);

  if (!clerkUserId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId: clerkUserId },
    });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const car = await prisma.car.findUnique({
      where: { id: carId },
      include: { owner: true },
    });
    if (!car) {
      return res.status(404).json({ error: "Car not found" });
    }

    if (car.ownerId !== user.id) {
      return res.status(403).json({ error: "Not allowed to delete this car" });
    }

    const offerCount = await prisma.offer.count({
      where: { carId },
    });

    if (offerCount > 0) {
      return res.status(400).json({
        error: "Non puoi eliminare un'auto che ha offerte attive o passate.",
      });
    }

    const now = new Date();

    const inProgressInspection = await prisma.inspectionRequest.findFirst({
      where: {
        carId,
        status: { in: ["PENDING", "ASSIGNED", "SEEN", "CONFIRMED"] },
        endAt: { gte: now },
      },
      select: { id: true, status: true, startAt: true, endAt: true },
      orderBy: { createdAt: "desc" },
    });

    if (inProgressInspection) {
      return res.status(400).json({
        error:
          "Non puoi eliminare un'auto con una perizia in corso. Attendi la fine dell'appuntamento.",
      });
    }

    await prisma.inspectionRequest.updateMany({
      where: {
        carId,
        status: { in: ["PENDING", "ASSIGNED", "SEEN", "CONFIRMED"] },
        endAt: { lt: now },
      },
      data: { status: "CANCELLED" },
    });

    await prisma.car.delete({ where: { id: carId } });

    return res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/cars/:id error:", err);
    return res.status(500).json({ error: "Error deleting car" });
  }
});

export default router;