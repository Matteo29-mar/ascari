import express from "express";
import { Prisma, CarMarketStatus } from "@prisma/client";
import { getAuth } from "@clerk/express";
import { prisma } from "../prisma";
import { ensureUserInDb } from "../lib/authUser";
import { geocodeAddress } from "../lib/geocode";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { buildPdfBuffer } from "../lib/buildInspection";
import {
  buildCarAvailabilityResponse,
  runSoldCarsVisualCleanup,
} from "../lib/carSaleLifecycle";

import {
  buildCarQrUrl,
  createCarQrToken,
  ensureCarQrToken,
} from "../lib/carQr";
import { checkDealerCarCreationLimit, getDealerPlanState } from "../services/dealerSubscriptionService";
import { safeRecordArveMarketObservation } from "../services/arve/marketObservationService";

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
  dealerPlanSuspended: false,
};

const GARAGE_VISIBLE_CAR_WHERE: Prisma.CarWhereInput = {
  marketStatus: {
    in: [CarMarketStatus.AVAILABLE, CarMarketStatus.SOLD_PENDING_REMOVAL],
  },
  visuallyRemovedAt: null,
};

const awsRegion = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "eu-west-1";
const carImagesBucket = process.env.ASCARI_CAR_IMAGES_BUCKET || "";
const carImagesPublicBaseUrl = (process.env.ASCARI_CAR_IMAGES_PUBLIC_BASE_URL || "").replace(/\/$/, "");

const s3 = new S3Client({ region: awsRegion });

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

function isDataImage(value: any): value is string {
  return typeof value === "string" && /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value.trim());
}

function isHttpUrl(value: any): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

function isRelativeUploadUrl(value: any): value is string {
  return typeof value === "string" && value.trim().startsWith("/uploads/");
}

function isS3ManagedUrl(value: any): value is string {
  if (!isHttpUrl(value)) return false;

  const trimmed = value.trim();

  if (carImagesPublicBaseUrl && trimmed.startsWith(`${carImagesPublicBaseUrl}/`)) {
    return true;
  }

  return trimmed.includes(`/${carImagesBucket}/`) || trimmed.includes(`${carImagesBucket}.s3`);
}

function getMimeExtension(mimeType: string) {
  switch (mimeType.toLowerCase()) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "jpg";
  }
}

function parseDataImage(dataImage: string) {
  const match = dataImage.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;

  const mimeType = match[1];
  const base64 = match[2];
  const buffer = Buffer.from(base64, "base64");

  return {
    mimeType,
    extension: getMimeExtension(mimeType),
    buffer,
  };
}

function buildS3PublicUrl(key: string) {
  if (carImagesPublicBaseUrl) {
    return `${carImagesPublicBaseUrl}/${key}`;
  }

  return `https://${carImagesBucket}.s3.${awsRegion}.amazonaws.com/${key}`;
}

function extractS3KeyFromUrl(url: string): string | null {
  if (!url || !carImagesBucket) return null;

  const trimmed = url.trim();

  if (carImagesPublicBaseUrl && trimmed.startsWith(`${carImagesPublicBaseUrl}/`)) {
    return decodeURIComponent(trimmed.replace(`${carImagesPublicBaseUrl}/`, ""));
  }

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname;

    if (host === `${carImagesBucket}.s3.${awsRegion}.amazonaws.com`) {
      return decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    }

    if (host.endsWith(".amazonaws.com") && parsed.pathname.includes(`/${carImagesBucket}/`)) {
      const marker = `/${carImagesBucket}/`;
      const idx = parsed.pathname.indexOf(marker);
      return decodeURIComponent(parsed.pathname.slice(idx + marker.length));
    }

    return null;
  } catch {
    return null;
  }
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizePhotoUrls(coverUrl: any, photos: any): string[] {
  const result: string[] = [];

  if (typeof coverUrl === "string" && coverUrl.trim()) {
    result.push(coverUrl.trim());
  }

  if (Array.isArray(photos)) {
    for (const p of photos) {
      if (typeof p === "string" && p.trim()) {
        result.push(p.trim());
      }
    }
  }

  return uniqueStrings(result);
}

function stripBase64Photos(coverUrl: any, photos: any): string[] {
  return normalizePhotoUrls(coverUrl, photos).filter((p) => !isDataImage(p));
}

async function uploadCarImageFromBase64(dataImage: string, ownerId: string, carId: number | "draft", index: number) {
  if (!carImagesBucket) {
    throw new Error("ASCARI_CAR_IMAGES_BUCKET non configurato nel backend .env");
  }

  const parsed = parseDataImage(dataImage);
  if (!parsed) {
    throw new Error("Formato immagine base64 non valido");
  }

  const hash = crypto.createHash("sha256").update(parsed.buffer).digest("hex").slice(0, 16);
  const key = `cars/${ownerId}/${carId}/${Date.now()}-${index}-${hash}.${parsed.extension}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: carImagesBucket,
      Key: key,
      Body: parsed.buffer,
      ContentType: parsed.mimeType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  return buildS3PublicUrl(key);
}

async function normalizeAndUploadCarPhotos(inputPhotos: any, ownerId: string, carId: number | "draft") {
  if (!Array.isArray(inputPhotos)) return [];

  const uploaded: string[] = [];

  for (let i = 0; i < inputPhotos.length; i++) {
    const raw = inputPhotos[i];
    if (typeof raw !== "string") continue;

    const value = raw.trim();
    if (!value) continue;

    if (isDataImage(value)) {
      uploaded.push(await uploadCarImageFromBase64(value, ownerId, carId, i));
      continue;
    }

    if (isHttpUrl(value) || isRelativeUploadUrl(value)) {
      uploaded.push(value);
    }
  }

  return uniqueStrings(uploaded);
}

async function deleteCarImagesFromS3(urls: string[]) {
  if (!carImagesBucket) return;

  const keys = uniqueStrings(
    urls
      .map((url) => extractS3KeyFromUrl(url))
      .filter((key): key is string => Boolean(key))
  );

  for (const key of keys) {
    try {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: carImagesBucket,
          Key: key,
        })
      );
    } catch (err) {
      console.error(`Errore eliminazione immagine S3 ${key}:`, err);
    }
  }
}

async function deleteRemovedS3Images(oldUrls: string[], newUrls: string[]) {
  const newSet = new Set(newUrls);
  const removed = oldUrls.filter((url) => isS3ManagedUrl(url) && !newSet.has(url));
  await deleteCarImagesFromS3(removed);
}

function buildCarCardSelect(userId?: string): Prisma.CarSelect {
  return {
    id: true,
    make: true,
    model: true,
    title: true,
    year: true,
    priceEur: true,
    mileageKm: true,
    fuelType: true,
    transmission: true,
    city: true,
    latitude: true,
    longitude: true,
    coverUrl: true,
    photos: true,
    ownerId: true,

    isPeriziata: true,
    periziaDocUrl: true,
    periziaUploadedAt: true,

    paymentEnabled: true,
    salePriceEur: true,
    ascariFeeEur: true,
    inspectionFeeEur: true,
    sellerNetEur: true,
    paymentStatus: true,

    marketStatus: true,
    soldAt: true,
    removalScheduledAt: true,
    visuallyRemovedAt: true,
    dealerPlanSuspended: true,
    dealerPlanSuspendedAt: true,

    createdAt: true,
    owner: {
      select: {
        clerkId: true,
        dealerProfile: {
          select: {
            id: true,
            dealerName: true,
            logoUrl: true,
          },
        },
      },
    },
    ...(userId
      ? {
          likes: {
            where: { userId },
            select: { id: true },
          },
        }
      : {}),
  };
}

function buildCarDetailInclude(userId?: string): Prisma.CarInclude {
  return {
    owner: {
      select: {
        clerkId: true,
        name: true,
        dealerProfile: {
          select: {
            id: true,
            dealerName: true,
            logoUrl: true,
          },
        },
      },
    },
    ...(userId
      ? {
          likes: {
            where: { userId },
            select: { id: true },
          },
        }
      : {
          likes: {
            select: { id: true },
          },
        }),
  };
}

function dealerSummaryFromCar(car: any) {
  const profile = car?.owner?.dealerProfile;
  if (!profile) return null;

  return {
    id: profile.id,
    name: profile.dealerName,
    logoUrl: profile.logoUrl ?? null,
  };
}

function toCarCard(car: any, hasUser: boolean) {
  const { likes, ...rest } = car;
  const dealer = dealerSummaryFromCar(car);

  return {
    ...rest,
    photos: stripBase64Photos(car.coverUrl, car.photos),
    coverUrl: isDataImage(car.coverUrl) ? null : car.coverUrl,
    likedByMe: hasUser ? (likes?.length ?? 0) > 0 : false,
    sellerType: dealer ? "DEALER" : "PRIVATE",
    dealer,
  };
}

function mapCarCards(cars: any[], hasUser: boolean) {
  return cars.map((car) => toCarCard(car, hasUser));
}

function toCarDetail(car: any, hasUser: boolean) {
  const { likes, ...rest } = car;
  const dealer = dealerSummaryFromCar(car);

  return {
    ...rest,
    photos: stripBase64Photos(car.coverUrl, car.photos),
    coverUrl: isDataImage(car.coverUrl) ? null : car.coverUrl,
    likedByMe: hasUser ? (likes?.length ?? 0) > 0 : false,
    sellerType: dealer ? "DEALER" : "PRIVATE",
    dealer,
  };
}

function safePublicCarSelect(): Prisma.CarSelect {
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
            report: {
              include: {
                ratings: { orderBy: { id: "asc" } },
              },
            },
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

    const dealerLimit = await checkDealerCarCreationLimit(user.id);
    if (dealerLimit.isDealer && !dealerLimit.allowed) {
      return res.status(402).json({
        code: "DEALER_SUBSCRIPTION_REQUIRED",
        error: "Per pubblicare auto come concessionaria devi attivare STARTER o ADVANCED.",
        plan: dealerLimit.plan,
        subscriptionRequired: true,
        upgradeRequired: true,
      });
    }

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

    const loc = String(locationText).trim();
    const c = String(city).trim();

    const geo = await geocodeAddress(loc, c);

    if (!geo) {
      return res.status(400).json({
        error: "Indirizzo/Città non trovati. Controlla e riprova.",
      });
    }

    const uploadedPhotos = await normalizeAndUploadCarPhotos(photos, user.id, "draft");

    if (!uploadedPhotos.length) {
      return res.status(400).json({
        error: "Almeno una foto valida è obbligatoria.",
        fields: ["photos"],
      });
    }

    const qrToken = createCarQrToken();

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

        coverUrl: uploadedPhotos[0],
        photos: uploadedPhotos,
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

        qrToken,
        qrCodeCreatedAt: new Date(),
      },
      select: buildCarCardSelect(user.id),
    });

    await safeRecordArveMarketObservation(prisma, {
      type: "LISTING_CREATED",
      externalKey: `listing:${car.id}`,
      car,
      metadata: {
        source: "CAR_CREATE",
      },
    });

    return res.json({
      ...toCarCard(car, true),
      qrUrl: buildCarQrUrl(qrToken),
      arve: {
        status: "PENDING",
        analyzeUrl: `/api/arve/cars/${car.id}/analyze`,
      },
    });
  } catch (err: any) {
    console.error("POST /api/cars error:", err);
    return res.status(500).json({ error: err?.message || "Error creating car" });
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
        select: buildCarCardSelect(user?.id),
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
    ]);

    return res.json(buildPaginatedResponse(mapCarCards(cars, !!user), total, page, pageSize));
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
        select: buildCarCardSelect(user?.id),
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
    ]);

    return res.json(buildPaginatedResponse(mapCarCards(cars, !!user), total, page, pageSize));
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
  const radiusKm = Number(req.query.radius ?? req.query.radiusKm ?? 5);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return res.status(400).json({
      error: "Invalid coordinates",
    });
  }

  if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
    return res.status(400).json({
      error: "Invalid radius",
    });
  }

  try {
    const user = await getDbUserFromClerk(req);

    const nearbyRows = await prisma.$queryRawUnsafe<
      Array<{
        id: number;
        distanceKm: number;
      }>
    >(`
      SELECT *
      FROM (
        SELECT
          id,
          (
            6371 * acos(
              LEAST(
                1,
                GREATEST(
                  -1,
                  cos(radians(${lat})) *
                  cos(radians(latitude)) *
                  cos(radians(longitude) - radians(${lon})) +
                  sin(radians(${lat})) *
                  sin(radians(latitude))
                )
              )
            )
          ) AS "distanceKm"
        FROM "Car"
        WHERE latitude IS NOT NULL
          AND longitude IS NOT NULL
          AND "marketStatus"::text = 'AVAILABLE'
          AND ("paymentStatus" IS NULL OR "paymentStatus" <> 'SOLD')
          AND "soldAt" IS NULL
          AND "visuallyRemovedAt" IS NULL
          AND "dealerPlanSuspended" = false
      ) AS nearby
      WHERE nearby."distanceKm" <= ${radiusKm}
      ORDER BY nearby."distanceKm" ASC, nearby.id DESC
    `);

    const ids = nearbyRows.map((row) => Number(row.id));

    if (ids.length === 0) {
      return res.json({
        items: [],
        total: 0,
      });
    }

    const cars = await prisma.car.findMany({
      where: {
        id: {
          in: ids,
        },
        ...AVAILABLE_CAR_WHERE,
      },
      select: buildCarCardSelect(user?.id),
    });

    const carMap = new Map(
      cars.map((car) => [car.id, car])
    );

    const distanceMap = new Map(
      nearbyRows.map((row) => [
        Number(row.id),
        Number(row.distanceKm),
      ])
    );

    const orderedCars = ids
      .map((id) => carMap.get(id))
      .filter((car): car is NonNullable<typeof car> => Boolean(car))
      .map((car) => ({
        ...car,
        distanceKm: distanceMap.get(car.id) ?? null,
      }));

    console.log("[NEARBY]", {
      center: {
        lat,
        lon,
      },
      radiusKm,
      total: orderedCars.length,
      ids,
    });

    return res.json({
      items: mapCarCards(orderedCars, Boolean(user)),
      total: orderedCars.length,
    });
  } catch (error) {
    console.error("GET /api/cars/nearby error:", error);

    return res.status(500).json({
      error: "Nearby search error",
    });
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
        alternatives.push(toCarCard(row, false));
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
      dealerPlanSuspended: false,
    };

    const [total, cars] = await Promise.all([
      prisma.car.count({ where }),
      prisma.car.findMany({
        where,
        select: buildCarCardSelect(user?.id),
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
    ]);

    return res.json(buildPaginatedResponse(mapCarCards(cars, !!user), total, page, pageSize));
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
      select: buildCarCardSelect(user.id),
      orderBy: { createdAt: "desc" },
    });

    const likedCars = await prisma.car.findMany({
      where: {
        ...AVAILABLE_CAR_WHERE,
        likes: {
          some: { userId: user.id },
        },
      },
      select: buildCarCardSelect(user.id),
      orderBy: { createdAt: "desc" },
    });

    return res.json({
      myCars: mapCarCards(myCars, true),
      likedCars: mapCarCards(likedCars, true),
    });
  } catch (err) {
    console.error("GET /api/cars/my-garage error:", err);
    return res.status(500).json({ error: "Error fetching my garage" });
  }
});

/**
 * GET /api/cars/:id/availability
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
        dealerPlanSuspended: true,
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
      car.marketStatus === "AVAILABLE" &&
      !car.visuallyRemovedAt &&
      !car.dealerPlanSuspended;

    let alternatives: any[] = [];

    if (!isAvailable) {
      const selectedIds = new Set<number>([car.id]);

      async function pushCandidates(whereExtra: any, take: number) {
        if (alternatives.length >= 3) return;

        const rows = await prisma.car.findMany({
          where: {
            marketStatus: "AVAILABLE",
            visuallyRemovedAt: null,
            dealerPlanSuspended: false,
            id: {
              notIn: Array.from(selectedIds),
            },
            ...whereExtra,
          },
          select: safePublicCarSelect(),
          orderBy: {
            createdAt: "desc",
          },
          take,
        });

        for (const row of rows) {
          if (alternatives.length >= 3) break;

          selectedIds.add(row.id);
          alternatives.push(toCarCard(row, false));
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
 * GET /api/cars/:id/qr
 */
router.get("/:id/qr", async (req, res) => {
  const { userId: clerkUserId } = getAuth(req);
  const carId = Number(req.params.id);

  if (!clerkUserId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  if (!Number.isFinite(carId) || carId <= 0) {
    return res.status(400).json({ error: "Car id non valido" });
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
      select: {
        id: true,
        ownerId: true,
        make: true,
        model: true,
        qrToken: true,
      },
    });

    if (!car) {
      return res.status(404).json({ error: "Car not found" });
    }

    if (car.ownerId !== user.id) {
      return res.status(403).json({ error: "Not allowed" });
    }

    const qrToken = await ensureCarQrToken(car.id);

    if (!qrToken) {
      return res.status(500).json({ error: "Impossibile generare QR" });
    }

    return res.json({
      carId: car.id,
      make: car.make,
      model: car.model,
      qrUrl: buildCarQrUrl(qrToken),
    });
  } catch (e) {
    console.error("GET /api/cars/:id/qr error:", e);
    return res.status(500).json({ error: "Errore QR" });
  }
});

/**
 * GET /api/cars/:id/qr-stats
 */
router.get("/:id/qr-stats", async (req, res) => {
  const { userId: clerkUserId } = getAuth(req);
  const carId = Number(req.params.id);

  if (!clerkUserId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  if (!Number.isFinite(carId) || carId <= 0) {
    return res.status(400).json({ error: "Car id non valido" });
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
      select: {
        id: true,
        ownerId: true,
        make: true,
        model: true,
        title: true,
      },
    });

    if (!car) {
      return res.status(404).json({ error: "Car not found" });
    }

    if (car.ownerId !== user.id) {
      return res.status(403).json({ error: "Not allowed" });
    }

    const dealerProfile = await prisma.dealerProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (dealerProfile) {
      const planState = await getDealerPlanState(user.id, { reconcile: false });
      if (!planState.statsEnabled) {
        return res.status(403).json({
          code: "DEALER_ADVANCED_REQUIRED",
          error: "Le statistiche delle auto sono disponibili solo con il piano ADVANCED.",
        });
      }
    }

    const now = new Date();

    const startToday = new Date(now);
    startToday.setHours(0, 0, 0, 0);

    const start7Days = new Date(now);
    start7Days.setDate(start7Days.getDate() - 7);

    const start30Days = new Date(now);
    start30Days.setDate(start30Days.getDate() - 30);

    const [
      totalScans,
      scansToday,
      scansLast7Days,
      scansLast30Days,
      offersReceived,
      likesReceived,
      lastScan,
      uniqueVisitorsRaw,
    ] = await Promise.all([
      prisma.qrScan.count({
        where: { carId },
      }),

      prisma.qrScan.count({
        where: {
          carId,
          scannedAt: { gte: startToday },
        },
      }),

      prisma.qrScan.count({
        where: {
          carId,
          scannedAt: { gte: start7Days },
        },
      }),

      prisma.qrScan.count({
        where: {
          carId,
          scannedAt: { gte: start30Days },
        },
      }),

      prisma.offer.count({
        where: { carId },
      }),

      prisma.like.count({
        where: { carId },
      }),

      prisma.qrScan.findFirst({
        where: { carId },
        orderBy: { scannedAt: "desc" },
        select: { scannedAt: true },
      }),

      prisma.qrScan.groupBy({
        by: ["visitorHash"],
        where: { carId },
      }),
    ]);

    const uniqueVisitors = uniqueVisitorsRaw.length;

    const conversionRate =
      uniqueVisitors > 0
        ? Math.round((offersReceived / uniqueVisitors) * 10000) / 100
        : 0;

    return res.json({
      carId: car.id,
      title: car.title,
      make: car.make,
      model: car.model,
      totalScans,
      uniqueVisitors,
      scansToday,
      scansLast7Days,
      scansLast30Days,
      offersReceived,
      likesReceived,
      conversionRate,
      lastScanAt: lastScan?.scannedAt ?? null,
    });
  } catch (e) {
    console.error("GET /api/cars/:id/qr-stats error:", e);
    return res.status(500).json({ error: "Errore statistiche QR" });
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
    const user = await getDbUserFromClerk(req);

    const car = await prisma.car.findUnique({
      where: { id },
      include: buildCarDetailInclude(user?.id),
    });

    if (!car) {
      return res.status(404).json({ error: "Car not found" });
    }

    if (car.dealerPlanSuspended && car.ownerId !== user?.id) {
      return res.status(404).json({ error: "Car not found" });
    }

    return res.json(toCarDetail(car, !!user));
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

    if (
      car.marketStatus !== "AVAILABLE" ||
      car.visuallyRemovedAt ||
      car.dealerPlanSuspended
    ) {
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

    const inputPhotos = Array.isArray(req.body.photos) ? req.body.photos : [];
    const oldUrls = normalizePhotoUrls(car.coverUrl, car.photos);
    const newPhotos = await normalizeAndUploadCarPhotos(inputPhotos, user.id, carId);

    if (!newPhotos.length) {
      return res.status(400).json({
        error: "Almeno una foto valida è obbligatoria.",
        fields: ["photos"],
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
      photos: newPhotos,
      coverUrl: newPhotos[0],
    };

    data.offerPrice1 = Number(offerPrice1);
    data.offerPrice2 = Number(offerPrice2);
    data.offerPrice3 = Number(offerPrice3);

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
      select: buildCarCardSelect(user.id),
    });

    await deleteRemovedS3Images(oldUrls, newPhotos);

    return res.json(toCarCard(updated, true));
  } catch (err: any) {
    console.error("PUT /api/cars/:id error:", err);
    return res.status(500).json({ error: err?.message || "Error updating car" });
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

    const imageUrls = normalizePhotoUrls(car.coverUrl, car.photos);

    if (car.marketStatus === "SOLD_PENDING_REMOVAL") {
      await prisma.car.update({
        where: { id: carId },
        data: {
          marketStatus: "REMOVED_AFTER_SALE",
          visuallyRemovedAt: new Date(),
          paymentEnabled: false,
        },
      });

      await deleteCarImagesFromS3(imageUrls);

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
        error: "Non puoi eliminare un'auto con una perizia in corso. Attendi la fine dell'appuntamento.",
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
    await deleteCarImagesFromS3(imageUrls);

    return res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/cars/:id error:", err);
    return res.status(500).json({ error: "Error deleting car" });
  }
});

export default router;
