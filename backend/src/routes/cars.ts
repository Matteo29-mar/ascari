import express from "express";
import { Prisma, CarMarketStatus } from "@prisma/client";
import { getAuth } from "@clerk/express";
import { prisma } from "../prisma";
import { ensureUserInDb } from "../lib/authUser";
import { geocodeAddress } from "../lib/geocode";
import multer from "multer";
import path from "path";
import fs from "fs";
import { buildPdfBuffer } from "../lib/buildInspection";
import {
  buildCarAvailabilityResponse,
  runSoldCarsVisualCleanup,
} from "../lib/carSaleLifecycle";


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

const AVAILABLE_CAR_WHERE: Prisma.CarWhereInput = {
  marketStatus: CarMarketStatus.AVAILABLE,
  visuallyRemovedAt: null,
};

const GARAGE_VISIBLE_CAR_WHERE: Prisma.CarWhereInput = {
  marketStatus: {
    in: [
      CarMarketStatus.AVAILABLE,
      CarMarketStatus.SOLD_PENDING_REMOVAL,
    ],
  },
  visuallyRemovedAt: null,
};


function parsePositiveInt(value: any, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function parseOptionalNumber(value: any): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function parseCsvParam(value: any): string[] {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
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

  return prisma.user.findUnique({
    where: { clerkId: clerkUserId },
  });
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

function normalize(value: any) {
  if (value === undefined || value === null || value === "") return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }

  return value;
}

function isBlankString(value: any) {
  return typeof value !== "string" || value.trim() === "";
}

function validateCarRequiredFields(body: any) {
  const missing: string[] = [];

  if (isBlankString(body.make)) missing.push("make");
  if (isBlankString(body.model)) missing.push("model");

  if (!Number.isFinite(Number(body.year)) || Number(body.year) <= 0) {
    missing.push("year");
  }

  if (isBlankString(body.locationText)) missing.push("locationText");
  if (isBlankString(body.city)) missing.push("city");
  if (isBlankString(body.fuelType)) missing.push("fuelType");
  if (isBlankString(body.transmission)) missing.push("transmission");

  if (!Array.isArray(body.photos) || body.photos.length === 0) {
    missing.push("photos");
  }

  if (body.offerPrice1 === undefined || Number(body.offerPrice1) <= 0) {
    missing.push("offerPrice1");
  }

  if (body.offerPrice2 === undefined || Number(body.offerPrice2) <= 0) {
    missing.push("offerPrice2");
  }

  if (body.offerPrice3 === undefined || Number(body.offerPrice3) <= 0) {
    missing.push("offerPrice3");
  }

  return missing;
}

function safePublicCarSelect() {
  return {
    id: true,
    make: true,
    model: true,
    title: true,
    year: true,
    coverUrl: true,
    photos: true,
    priceEur: true,
    mileageKm: true,
    fuelType: true,
    transmission: true,
    city: true,
    marketStatus: true,
  };
}

/**
 * POST /api/cars/:id/perizia/upload
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
    const user = await prisma.user.findUnique({
      where: { clerkId: clerkUserId },
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    const car = await prisma.car.findUnique({
      where: { id: carId },
    });

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
 */
router.post("/", async (req, res) => {
  const { userId: clerkUserId, sessionClaims } = getAuth(req);

  if (!clerkUserId) {
    return res.status(401).json({ error: "Not authenticated" });
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

    const missingFields = validateCarRequiredFields(req.body);

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: "Campi obbligatori mancanti",
        fields: missingFields,
      });
    }

    const finalTitle =
      typeof title === "string" && title.trim().length > 0
        ? title.trim()
        : [make, model, year].filter(Boolean).join(" ") || "Nuova auto";

    const finalCover =
      typeof coverUrl === "string" && coverUrl.trim() !== ""
        ? coverUrl.trim()
        : Array.isArray(photos) && photos.length > 0
        ? photos[0]
        : null;

    const loc = String(locationText).trim();
    const c = String(city).trim();

    const geo = await geocodeAddress(loc, c);

    if (!geo) {
      return res.status(400).json({
        error: "Indirizzo/Città non trovati. Controlla e riprova.",
      });
    }

    const car = await prisma.car.create({
      data: {
        make: String(make).trim(),
        model: String(model).trim(),
        title: finalTitle,
        year: Number(year),

        offerPrice1: Number(offerPrice1),
        offerPrice2: Number(offerPrice2),
        offerPrice3: Number(offerPrice3),

        fuelType: String(fuelType).trim(),
        horsepower: horsepower === "" || horsepower === undefined ? null : Number(horsepower),
        mileageKm: mileageKm === "" || mileageKm === undefined ? null : Number(mileageKm),
        description: normalize(description),

        coverUrl: finalCover,
        photos: Array.isArray(photos) ? photos : [],
        ownerId: user.id,

        locationText: loc,
        city: c,
        latitude: geo.lat,
        longitude: geo.lng,

        engine: normalize(engine),
        trimLevel: normalize(trimLevel),
        color: normalize(color),
        drivetrain: normalize(drivetrain),
        transmission: String(transmission).trim(),
        torqueNm: torqueNm === "" || torqueNm === undefined ? null : Number(torqueNm),
        seats: seats === "" || seats === undefined ? null : Number(seats),
        doors: doors === "" || doors === undefined ? null : Number(doors),
        priceEur: priceEur === "" || priceEur === undefined ? null : Number(priceEur),

        marketStatus: "AVAILABLE",
      },
    });

    return res.json(car);
  } catch (err) {
    console.error("POST /api/cars error:", err);
    return res.status(500).json({ error: "Error creating car" });
  }
});

/**
 * GET /api/cars/search
 */
router.get("/search", async (req, res) => {
  await runSoldCarsVisualCleanup(prisma);

  const query = String(req.query.query || "").trim();
  const page = parsePage(req);
  const pageSize = parsePageSize(req);
  const skip = (page - 1) * pageSize;

  try {
    const user = await getDbUserFromClerk(req);

    if (!query) {
      return res.json(buildPaginatedResponse([], 0, page, pageSize));
    }

    const where = {
      AND: [
        AVAILABLE_CAR_WHERE,
        {
          OR: [
            { make: { contains: query, mode: "insensitive" as const } },
            { model: { contains: query, mode: "insensitive" as const } },
            { title: { contains: query, mode: "insensitive" as const } },
          ],
        },
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
  } catch (err) {
    console.error("GET /api/cars/search error:", err);
    return res.status(500).json({ error: "Search error" });
  }
});

/**
 * GET /api/cars/filter
 */
router.get("/filter", async (req, res) => {
  await runSoldCarsVisualCleanup(prisma);

  const brands = parseCsvParam(req.query.brands);
  const models = parseCsvParam(req.query.models);
  const fuelTypes = parseCsvParam(req.query.fuelTypes);
  const transmissions = parseCsvParam(req.query.transmissions);

  const yearMin = parseOptionalNumber(req.query.yearMin);
  const yearMax = parseOptionalNumber(req.query.yearMax);

  const mileageMin = parseOptionalNumber(req.query.mileageMin);
  const mileageMax = parseOptionalNumber(req.query.mileageMax);

  const horsepowerMin = parseOptionalNumber(req.query.horsepowerMin);
  const horsepowerMax = parseOptionalNumber(req.query.horsepowerMax);

  const page = parsePage(req);
  const pageSize = parsePageSize(req);
  const skip = (page - 1) * pageSize;

  try {
    const user = await getDbUserFromClerk(req);

    const andFilters: any[] = [AVAILABLE_CAR_WHERE];

    if (brands.length) {
      andFilters.push({
        OR: brands.map((b) => ({
          make: { equals: b, mode: "insensitive" as const },
        })),
      });
    }

    if (models.length) {
      andFilters.push({
        OR: models.map((m) => ({
          model: { equals: m, mode: "insensitive" as const },
        })),
      });
    }

    if (fuelTypes.length) {
      andFilters.push({
        OR: fuelTypes.map((f) => ({
          fuelType: { equals: f, mode: "insensitive" as const },
        })),
      });
    }

    if (transmissions.length) {
      andFilters.push({
        OR: transmissions.map((t) => ({
          transmission: { equals: t, mode: "insensitive" as const },
        })),
      });
    }

    if (yearMin !== null || yearMax !== null) {
      andFilters.push({
        year: {
          ...(yearMin !== null ? { gte: Math.floor(yearMin) } : {}),
          ...(yearMax !== null ? { lte: Math.floor(yearMax) } : {}),
        },
      });
    }

    if (mileageMin !== null || mileageMax !== null) {
      andFilters.push({
        mileageKm: {
          ...(mileageMin !== null ? { gte: Math.floor(mileageMin) } : {}),
          ...(mileageMax !== null ? { lte: Math.floor(mileageMax) } : {}),
        },
      });
    }

    if (horsepowerMin !== null || horsepowerMax !== null) {
      andFilters.push({
        horsepower: {
          ...(horsepowerMin !== null ? { gte: Math.floor(horsepowerMin) } : {}),
          ...(horsepowerMax !== null ? { lte: Math.floor(horsepowerMax) } : {}),
        },
      });
    }

    const where = { AND: andFilters };

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
 */
router.get("/nearby", async (req, res) => {
  await runSoldCarsVisualCleanup(prisma);

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
          AND "marketStatus"::text = 'AVAILABLE'
          AND "paymentStatus" <> 'SOLD'
          AND "soldAt" IS NULL
          AND "visuallyRemovedAt" IS NULL
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
          AND "marketStatus"::text = 'AVAILABLE'
          AND "paymentStatus" <> 'SOLD'
          AND "soldAt" IS NULL
          AND "visuallyRemovedAt" IS NULL
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
      where: {
        id: { in: ids },
        ...AVAILABLE_CAR_WHERE,
      },
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
 * GET /api/cars/:id/alternatives
 */
router.get("/:id/alternatives", async (req, res) => {
  await runSoldCarsVisualCleanup(prisma);

  const id = Number(req.params.id);

  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid car id" });
  }

  try {
    const car = await prisma.car.findUnique({
      where: { id },
      select: {
        id: true,
        make: true,
        model: true,
      },
    });

    if (!car) {
      return res.status(404).json({ error: "Car not found" });
    }

    const selectedIds = new Set<number>([car.id]);
    const alternatives: any[] = [];

    async function pushCandidates(whereExtra: any, take: number) {
      if (alternatives.length >= 3) return;

      const rows = await prisma.car.findMany({
        where: {
          ...AVAILABLE_CAR_WHERE,
          id: { notIn: Array.from(selectedIds) },
          ...whereExtra,
        },
        select: safePublicCarSelect(),
        orderBy: { createdAt: "desc" },
        take,
      });

      for (const row of rows) {
        if (alternatives.length >= 3) break;
        selectedIds.add(row.id);
        alternatives.push(row);
      }
    }

    await pushCandidates(
      {
        make: { equals: car.make, mode: "insensitive" },
        model: { equals: car.model, mode: "insensitive" },
      },
      3
    );

    await pushCandidates(
      {
        make: { equals: car.make, mode: "insensitive" },
      },
      3
    );

    await pushCandidates({}, 3);

    return res.json({
      ok: true,
      soldCarId: car.id,
      alternatives: alternatives.slice(0, 3),
    });
  } catch (e) {
    console.error("GET /api/cars/:id/alternatives error:", e);
    return res.status(500).json({ error: "Errore caricamento alternative" });
  }
});

/**
 * GET /api/cars
 */
router.get("/", async (req, res) => {
  await runSoldCarsVisualCleanup(prisma);

  try {
    const user = await getDbUserFromClerk(req);
    const page = parsePage(req);
    const pageSize = parsePageSize(req);
    const skip = (page - 1) * pageSize;

  const where: Prisma.CarWhereInput = {
    marketStatus: CarMarketStatus.AVAILABLE,
    paymentStatus: {
      not: "SOLD",
    },
    soldAt: null,
    visuallyRemovedAt: null,
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
    console.error("GET /api/cars error:", e);
    return res.status(500).json({ error: "Error fetching cars" });
  }
});

/**
 * GET /api/cars/my-garage
 */
router.get("/my-garage", async (req, res) => {
  await runSoldCarsVisualCleanup(prisma);

  const { userId: clerkUserId } = getAuth(req);

  if (!clerkUserId) {
    return res.status(401).json({ error: "Not authenticated" });
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
      where: {
        ownerId: user.id,
        ...GARAGE_VISIBLE_CAR_WHERE,
      },
      include: { likes: true, owner: true },
      orderBy: { createdAt: "desc" },
    });

    const likedCars = await prisma.car.findMany({
      where: {
        ...AVAILABLE_CAR_WHERE,
        likes: {
          some: { userId: user.id },
        },
      },
      include: { owner: true, likes: true },
      orderBy: { createdAt: "desc" },
    });

    const myCarsWithLikes = myCars.map((c: any) => ({
      ...c,
      likedByMe: Array.isArray(c.likes) ? c.likes.length > 0 : false,
    }));

    const likedCarsWithLikes = likedCars.map((c: any) => ({
      ...c,
      likedByMe: true,
    }));

    return res.json({
      myCars: myCarsWithLikes,
      likedCars: likedCarsWithLikes,
    });
  } catch (err) {
    console.error("GET /api/cars/my-garage error:", err);
    return res.status(500).json({ error: "Error fetching my garage" });
  }
});

/**
 * GET /api/cars/:id/availability
 *
 * Controlla se l'auto è ancora disponibile.
 * Se è venduta, restituisce 3 alternative disponibili.
 */
router.get("/:id/availability", async (req, res) => {
  const carId = Number(req.params.id);

  if (!Number.isFinite(carId) || carId <= 0) {
    return res.status(400).json({
      error: "Car id non valido",
    });
  }

  try {
    await runSoldCarsVisualCleanup(prisma);

    const car = await prisma.car.findUnique({
      where: {
        id: carId,
      },
      select: {
        id: true,
        make: true,
        model: true,
        title: true,
        year: true,
        paymentStatus: true,
        marketStatus: true,
        soldAt: true,
        removalScheduledAt: true,
        visuallyRemovedAt: true,
      },
    });

    if (!car) {
      return res.status(404).json(
        buildCarAvailabilityResponse({
          car: null,
          alternatives: [],
        })
      );
    }

    const isAvailable =
      car.marketStatus === "AVAILABLE" && !car.visuallyRemovedAt;

    let alternatives: any[] = [];

    if (!isAvailable) {
      const selectedIds = new Set<number>([car.id]);

      async function pushCandidates(whereExtra: any, take: number) {
        if (alternatives.length >= 3) return;

        const rows = await prisma.car.findMany({
          where: {
            marketStatus: "AVAILABLE",
            visuallyRemovedAt: null,
            id: {
              notIn: Array.from(selectedIds),
            },
            ...whereExtra,
          },
          select: {
            id: true,
            make: true,
            model: true,
            title: true,
            year: true,
            coverUrl: true,
            photos: true,
            priceEur: true,
            mileageKm: true,
            fuelType: true,
            transmission: true,
            city: true,
            marketStatus: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          take,
        });

        for (const row of rows) {
          if (alternatives.length >= 3) break;

          selectedIds.add(row.id);
          alternatives.push(row);
        }
      }

      await pushCandidates(
        {
          make: {
            equals: car.make,
            mode: "insensitive",
          },
          model: {
            equals: car.model,
            mode: "insensitive",
          },
        },
        3
      );

      await pushCandidates(
        {
          make: {
            equals: car.make,
            mode: "insensitive",
          },
        },
        3
      );

      await pushCandidates({}, 3);

      alternatives = alternatives.slice(0, 3);
    }

    return res.json(
      buildCarAvailabilityResponse({
        car,
        alternatives,
      })
    );
  } catch (error) {
    console.error("GET /cars/:id/availability error:", error);

    return res.status(500).json({
      error: "Errore controllo disponibilità auto",
    });
  }
});

/**
 * GET /api/cars/:id
 */
router.get("/:id", async (req, res) => {
  await runSoldCarsVisualCleanup(prisma);

  const id = Number(req.params.id);

  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid car id" });
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
      return res.status(404).json({ error: "Car not found" });
    }

    return res.json(car);
  } catch (err) {
    console.error("GET /api/cars/:id error:", err);
    return res.status(500).json({ error: "Error fetching car" });
  }
});

/**
 * POST /api/cars/:carId/like
 */
router.post("/:carId/like", async (req, res) => {
  const { userId: clerkUserId } = getAuth(req);
  const carId = Number(req.params.carId);

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

    const car = await prisma.car.findUnique({ where: { id: carId } });

    if (!car) {
      return res.status(404).json({ error: "Car not found" });
    }

    if (car.marketStatus !== "AVAILABLE" || car.visuallyRemovedAt) {
      return res.status(400).json({
        error: "Questa auto non è più disponibile.",
      });
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
    console.error("POST /api/cars/:carId/like error:", err);
    return res.status(500).json({ error: "Error adding like" });
  }
});

/**
 * DELETE /api/cars/:carId/like
 */
router.delete("/:carId/like", async (req, res) => {
  const { userId: clerkUserId } = getAuth(req);
  const carId = Number(req.params.carId);

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

    await prisma.like.deleteMany({
      where: {
        userId: user.id,
        carId,
      },
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/cars/:carId/like error:", err);
    return res.status(500).json({ error: "Error removing like" });
  }
});

/**
 * PUT /api/cars/:id
 */
router.put("/:id", async (req, res) => {
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
    });

    if (!car) {
      return res.status(404).json({ error: "Car not found" });
    }

    if (car.ownerId !== user.id) {
      return res.status(403).json({ error: "Not allowed to edit this car" });
    }

    if (car.marketStatus !== "AVAILABLE") {
      return res.status(400).json({
        error: "Non puoi modificare un'auto venduta o in rimozione.",
      });
    }

    const { offerPrice1, offerPrice2, offerPrice3 } = req.body;

    const missingFields = validateCarRequiredFields(req.body);

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: "Campi obbligatori mancanti",
        fields: missingFields,
      });
    }

    const data: any = {
      make: String(req.body.make).trim(),
      model: String(req.body.model).trim(),
      title: normalize(req.body.title),
      year: Number(req.body.year),
      fuelType: String(req.body.fuelType).trim(),
      horsepower: normalize(req.body.horsepower),
      mileageKm: normalize(req.body.mileageKm),
      description: normalize(req.body.description),
      locationText: String(req.body.locationText).trim(),
      city: String(req.body.city).trim(),
      latitude: normalize(req.body.latitude),
      longitude: normalize(req.body.longitude),

      engine: normalize(req.body.engine),
      trimLevel: normalize(req.body.trimLevel),
      color: normalize(req.body.color),
      drivetrain: normalize(req.body.drivetrain),
      transmission: String(req.body.transmission).trim(),
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
      typeof req.body.coverUrl === "string" && req.body.coverUrl.trim() !== ""
        ? req.body.coverUrl.trim()
        : Array.isArray(req.body.photos) && req.body.photos.length > 0
        ? req.body.photos[0]
        : car.coverUrl;

    if (data.locationText || data.city) {
      const geo = await geocodeAddress(data.locationText ?? "", data.city ?? undefined);

      if (!geo) {
        return res.status(400).json({
          error: "Indirizzo/Città non trovati. Controlla e riprova.",
        });
      }

      data.latitude = geo.lat;
      data.longitude = geo.lng;
    }

    const updated = await prisma.car.update({
      where: { id: carId },
      data,
    });

    return res.json(updated);
  } catch (err) {
    console.error("PUT /api/cars/:id error:", err);
    return res.status(500).json({ error: "Error updating car" });
  }
});

/**
 * DELETE /api/cars/:id
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

    if (car.marketStatus === "SOLD_PENDING_REMOVAL") {
      await prisma.car.update({
        where: { id: carId },
        data: {
          marketStatus: "REMOVED_AFTER_SALE",
          visuallyRemovedAt: new Date(),
          paymentEnabled: false,
        },
      });

      return res.json({
        success: true,
        mode: "VISUAL_REMOVAL_AFTER_SALE",
      });
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