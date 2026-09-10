import { Router } from "express";
import crypto from "crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { CarMarketStatus, Prisma } from "@prisma/client";
import { getAuth } from "@clerk/express";
import { prisma } from "../prisma";
import { ensureUserInDb } from "../lib/authUser";
import { geocodeAddress } from "../lib/geocode";

const router = Router();

const awsRegion = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "eu-west-1";
const carImagesBucket = process.env.ASCARI_CAR_IMAGES_BUCKET || "";
const carImagesPublicBaseUrl = (process.env.ASCARI_CAR_IMAGES_PUBLIC_BASE_URL || "").replace(/\/$/, "");
const s3 = new S3Client({ region: awsRegion });

const PUBLIC_DEALER_SELECT: Prisma.DealerProfileSelect = {
  id: true,
  dealerName: true,
  businessName: true,
  vatNumber: true,
  description: true,
  logoUrl: true,
  address: true,
  city: true,
  province: true,
  country: true,
  email: true,
  phone: true,
  website: true,
  latitude: true,
  longitude: true,
  createdAt: true,
  updatedAt: true,
};

const PUBLIC_DEALER_CAR_SELECT: Prisma.CarSelect = {
  id: true,
  make: true,
  model: true,
  title: true,
  year: true,
  priceEur: true,
  offerPrice1: true,
  offerPrice2: true,
  offerPrice3: true,
  mileageKm: true,
  fuelType: true,
  transmission: true,
  city: true,
  coverUrl: true,
  photos: true,
  isPeriziata: true,
  createdAt: true,
};

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

async function storeDealerLogo(value: unknown, userId: string) {
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
  const key = `dealers/${userId}/logo-${Date.now()}-${hash}.${extensionForMime(mime)}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: carImagesBucket,
      Key: key,
      Body: buffer,
      ContentType: mime,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  return publicS3Url(key);
}

async function getDealerCars(userId: string) {
  const cars = await prisma.car.findMany({
    where: {
      ownerId: userId,
      marketStatus: CarMarketStatus.AVAILABLE,
      paymentStatus: { not: "SOLD" },
      soldAt: null,
      visuallyRemovedAt: null,
      dealerPlanSuspended: false,
    },
    select: PUBLIC_DEALER_CAR_SELECT,
    orderBy: { createdAt: "desc" },
  });

  return cars.map((car) => ({
    ...car,
    coverUrl: isDataImage(car.coverUrl) ? null : car.coverUrl,
    photos: Array.isArray(car.photos) ? car.photos.filter((photo) => !isDataImage(photo)) : [],
    sellerType: "DEALER" as const,
  }));
}


async function getDealerReviewData(dealerProfileId: string, viewerUserId?: string | null) {
  const [aggregate, reviews] = await Promise.all([
    prisma.dealerReview.aggregate({
      where: { dealerProfileId },
      _avg: { rating: true },
      _count: { rating: true },
    }),
    prisma.dealerReview.findMany({
      where: { dealerProfileId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        updatedAt: true,
        authorId: true,
        author: { select: { name: true } },
      },
    }),
  ]);

  return {
    reviewSummary: {
      average: aggregate._avg.rating
        ? Math.round(aggregate._avg.rating * 10) / 10
        : 0,
      count: aggregate._count.rating,
    },
    reviews: reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
      authorName: review.author.name || "Utente ASCARI",
      isMine: viewerUserId ? review.authorId === viewerUserId : false,
    })),
  };
}

/**
 * GET /api/dealers/me
 * Profilo concessionario autenticato + vetrina corrente.
 */
router.get("/me", async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Non autenticato" });

    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: {
        id: true,
        dealerProfile: { select: PUBLIC_DEALER_SELECT },
      },
    });

    if (!user?.dealerProfile) {
      return res.json({ dealer: null, cars: [], carCount: 0, isOwner: true });
    }

    const cars = await getDealerCars(user.id);
    const reviewData = await getDealerReviewData(user.dealerProfile.id, user.id);
    return res.json({
      dealer: user.dealerProfile,
      cars,
      carCount: cars.length,
      isOwner: true,
      ...reviewData,
    });
  } catch (e) {
    console.error("GET /api/dealers/me error:", e);
    return res.status(500).json({ error: "Errore caricamento concessionaria" });
  }
});

/**
 * POST /api/dealers/register
 * Crea o aggiorna il profilo concessionario. Un account periziatore non può
 * diventare anche concessionario.
 */
router.post("/register", async (req, res) => {
  try {
    const { userId: clerkId, sessionClaims } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Non autenticato" });

    const dealerName = text(req.body?.dealerName);
    const address = text(req.body?.address);
    const city = text(req.body?.city);
    const email = text(req.body?.email);
    const phone = text(req.body?.phone);

    if (!dealerName || !address || !city || !email || !phone) {
      return res.status(400).json({
        error: "Compila nome concessionaria, indirizzo, città, email e telefono.",
      });
    }

    const claimName = (sessionClaims as any)?.fullName || undefined;
    // L'email del profilo concessionario può essere commerciale e diversa da quella login.
    // ensureUserInDb recupera l'email reale direttamente da Clerk quando riceve null.
    const user = await ensureUserInDb(clerkId, null, claimName);

    const incompatible = await prisma.inspectorProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (incompatible) {
      return res.status(409).json({
        error: "Questo account è già registrato come periziatore e non può diventare concessionario.",
      });
    }

    const geo = await geocodeAddress(address, city);
    if (!geo) {
      return res.status(400).json({
        error: "Indirizzo concessionaria non trovato. Controlla indirizzo e città.",
      });
    }

    const logoUrl = await storeDealerLogo(req.body?.logoUrl, user.id);

    const profile = await prisma.dealerProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        dealerName,
        businessName: text(req.body?.businessName),
        vatNumber: text(req.body?.vatNumber),
        description: text(req.body?.description),
        logoUrl,
        address,
        city,
        province: text(req.body?.province),
        country: text(req.body?.country) ?? "Italia",
        email,
        phone,
        website: text(req.body?.website),
        latitude: geo.lat,
        longitude: geo.lng,
      },
      update: {
        dealerName,
        businessName: text(req.body?.businessName),
        vatNumber: text(req.body?.vatNumber),
        description: text(req.body?.description),
        ...(logoUrl ? { logoUrl } : {}),
        address,
        city,
        province: text(req.body?.province),
        country: text(req.body?.country) ?? "Italia",
        email,
        phone,
        website: text(req.body?.website),
        latitude: geo.lat,
        longitude: geo.lng,
      },
      select: PUBLIC_DEALER_SELECT,
    });

    // Il profilo concessionario nasce senza accesso commerciale:
    // STARTER o ADVANCED devono essere attivati tramite Stripe.
    await prisma.dealerSubscription.upsert({
      where: { dealerProfileId: profile.id },
      create: {
        dealerProfileId: profile.id,
        plan: "STARTER",
        status: "INACTIVE",
      },
      update: {},
    });

    return res.json({ ok: true, dealer: profile });
  } catch (e: any) {
    console.error("POST /api/dealers/register error:", e);
    return res.status(500).json({ error: e?.message || "Errore registrazione concessionario" });
  }
});

/**
 * PUT /api/dealers/me
 * Alias esplicito per la modifica del profilo esistente.
 */
router.put("/me", async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Non autenticato" });

    const user = await prisma.user.findUnique({
      where: { clerkId },
      include: { dealerProfile: true },
    });
    if (!user?.dealerProfile) {
      return res.status(404).json({ error: "Profilo concessionario non trovato" });
    }

    const dealerName = text(req.body?.dealerName) ?? user.dealerProfile.dealerName;
    const address = text(req.body?.address) ?? user.dealerProfile.address;
    const city = text(req.body?.city) ?? user.dealerProfile.city;
    const email = text(req.body?.email) ?? user.dealerProfile.email;
    const phone = text(req.body?.phone) ?? user.dealerProfile.phone;

    const addressChanged = address !== user.dealerProfile.address || city !== user.dealerProfile.city;
    let latitude = user.dealerProfile.latitude;
    let longitude = user.dealerProfile.longitude;

    if (addressChanged) {
      const geo = await geocodeAddress(address, city);
      if (!geo) {
        return res.status(400).json({ error: "Indirizzo concessionaria non trovato." });
      }
      latitude = geo.lat;
      longitude = geo.lng;
    }

    const nextLogo = await storeDealerLogo(req.body?.logoUrl, user.id);

    const updated = await prisma.dealerProfile.update({
      where: { userId: user.id },
      data: {
        dealerName,
        businessName: req.body?.businessName !== undefined ? text(req.body.businessName) : user.dealerProfile.businessName,
        vatNumber: req.body?.vatNumber !== undefined ? text(req.body.vatNumber) : user.dealerProfile.vatNumber,
        description: req.body?.description !== undefined ? text(req.body.description) : user.dealerProfile.description,
        ...(nextLogo ? { logoUrl: nextLogo } : {}),
        address,
        city,
        province: req.body?.province !== undefined ? text(req.body.province) : user.dealerProfile.province,
        country: req.body?.country !== undefined ? text(req.body.country) : user.dealerProfile.country,
        email,
        phone,
        website: req.body?.website !== undefined ? text(req.body.website) : user.dealerProfile.website,
        latitude,
        longitude,
      },
      select: PUBLIC_DEALER_SELECT,
    });

    return res.json({ ok: true, dealer: updated });
  } catch (e: any) {
    console.error("PUT /api/dealers/me error:", e);
    return res.status(500).json({ error: e?.message || "Errore aggiornamento concessionario" });
  }
});

/**
 * GET /api/dealers/:id
 * Vetrina pubblica concessionaria, visibile anche senza login.
 */
router.get("/:id", async (req, res) => {
  try {
    const dealer = await prisma.dealerProfile.findUnique({
      where: { id: req.params.id },
      select: {
        ...PUBLIC_DEALER_SELECT,
        userId: true,
      },
    });

    if (!dealer) {
      return res.status(404).json({ error: "Concessionaria non trovata" });
    }

    const { userId, ...publicDealer } = dealer;
    const cars = await getDealerCars(userId);

    const { userId: viewerClerkId } = getAuth(req);
    const viewer = viewerClerkId
      ? await prisma.user.findUnique({
          where: { clerkId: viewerClerkId },
          select: { id: true },
        })
      : null;
    const reviewData = await getDealerReviewData(dealer.id, viewer?.id);

    return res.json({
      dealer: publicDealer,
      cars,
      carCount: cars.length,
      isOwner: viewer?.id === userId,
      ...reviewData,
    });
  } catch (e) {
    console.error("GET /api/dealers/:id error:", e);
    return res.status(500).json({ error: "Errore caricamento concessionaria" });
  }
});

/**
 * POST /api/dealers/:id/reviews
 * Solo utenti privati autenticati. Una recensione per concessionaria, modificabile.
 */
router.post("/:id/reviews", async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return res.status(401).json({ error: "Accedi per lasciare una recensione" });

    const user = await ensureUserInDb(clerkId);
    const [dealerRole, inspectorRole, dealer] = await Promise.all([
      prisma.dealerProfile.findUnique({ where: { userId: user.id }, select: { id: true } }),
      prisma.inspectorProfile.findUnique({ where: { userId: user.id }, select: { id: true } }),
      prisma.dealerProfile.findUnique({ where: { id: req.params.id }, select: { id: true, userId: true } }),
    ]);

    if (!dealer) return res.status(404).json({ error: "Concessionaria non trovata" });
    if (dealerRole || inspectorRole) {
      return res.status(403).json({
        code: "PRIVATE_USER_REQUIRED",
        error: "Le recensioni possono essere inserite solo da utenti privati.",
      });
    }
    if (dealer.userId === user.id) {
      return res.status(403).json({ error: "Non puoi recensire la tua concessionaria" });
    }

    const rating = Number(req.body?.rating);
    const comment = text(req.body?.comment);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Il rating deve essere compreso tra 1 e 5" });
    }
    if (comment && comment.length > 1500) {
      return res.status(400).json({ error: "La recensione non può superare 1500 caratteri" });
    }

    const review = await prisma.dealerReview.upsert({
      where: {
        dealerProfileId_authorId: {
          dealerProfileId: dealer.id,
          authorId: user.id,
        },
      },
      create: {
        dealerProfileId: dealer.id,
        authorId: user.id,
        rating,
        comment,
      },
      update: { rating, comment },
    });

    const reviewData = await getDealerReviewData(dealer.id, user.id);
    return res.json({ ok: true, review, ...reviewData });
  } catch (e: any) {
    console.error("POST /api/dealers/:id/reviews error:", e);
    return res.status(500).json({ error: e?.message || "Errore salvataggio recensione" });
  }
});

export default router;
