import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { clerkMiddleware, getAuth } from "@clerk/express";
import path from "path";
import cookieParser from "cookie-parser";

import carsRouter from "./routes/cars";
import offerRoutes from "./routes/offerts";
import chatRoutes from "./routes/chat";
import inspectorRoutes from "./routes/inspector";
import dealerRoutes from "./routes/dealers";
import inspectionsRoutes from "./routes/inspections";
import inspectionReportsRouter from "./routes/inspectionReports";
import stripeRoutes from "./routes/stripe";
import historyRouter from "./routes/history";
import soldCarsRoutes from "./routes/soldCars";
import qrRoutes from "./routes/qr";
import arvePricingRoutes from "./routes/arvePricing";
import dealerSubscriptionRoutes from "./routes/dealerSubscriptions";
import { dealerSubscriptionWebhook } from "./routes/dealerSubscriptionWebhook";
import { registerDealerDevice } from "./services/dealerSubscriptionService";

import { startSoldCarsCleanupJob } from "./jobs/soldCarsCleanup";

const app = express();
const prisma = new PrismaClient();
const port = Number(process.env.PORT) || 4002;

const ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";

// Il webhook Stripe deve ricevere il body RAW per verificare la firma.
// Va dichiarato prima di express.json().
app.post(
  "/api/stripe/dealer-subscriptions/webhook",
  express.raw({ type: "application/json" }),
  dealerSubscriptionWebhook
);

// body parser
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));
app.use(cookieParser());
// CORS
app.use(
  cors({
    origin: ORIGIN,
    credentials: true,
  })
);

// Clerk
app.use(clerkMiddleware());

// Limite dispositivi concessionaria.
// Le route di onboarding/profilo/abbonamento restano accessibili anche prima
// dell'attivazione del piano; sulle altre API un dealer deve avere un piano
// attivo e un dispositivo registrabile entro il limite STARTER/ADVANCED.
app.use(async (req, res, next) => {
  try {
    if (!req.path.startsWith("/api/")) return next();

    const exempt =
      req.path.startsWith("/api/dealer-subscriptions") ||
      req.path.startsWith("/api/dealers") ||
      req.path === "/api/ping";
    if (exempt) return next();

    const { userId: clerkId } = getAuth(req);
    if (!clerkId) return next();

    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true, dealerProfile: { select: { id: true } } },
    });
    if (!user?.dealerProfile) return next();

    const deviceId = String(req.headers["x-ascari-device-id"] || "").trim();
    if (!deviceId) {
      return res.status(403).json({
        code: "DEALER_DEVICE_REQUIRED",
        error: "Dispositivo concessionaria non identificato. Ricarica ASCARI.",
      });
    }

    await registerDealerDevice({
      userId: user.id,
      deviceId,
      label: String(req.headers["x-ascari-device-label"] || "Browser"),
      userAgent: req.headers["user-agent"] || null,
    });

    return next();
  } catch (error: any) {
    return res.status(error?.status || 500).json({
      code: error?.code,
      error: error?.message || "Accesso concessionaria non disponibile",
    });
  }
});

// log
app.use(morgan("dev"));

// disattiva cache su API dinamiche
app.set("etag", false);
app.use((req, res, next) => {
  if (
    req.path.startsWith("/api/cars") ||
    req.path.startsWith("/api/chat") ||
    req.path.startsWith("/api/offers") ||
    req.path.startsWith("/api/sold-cars") ||
    req.path.startsWith("/api/history") ||
    req.path.startsWith("/api/arve") ||
    req.path.startsWith("/api/dealer-subscriptions")
  ) {
    res.set("Cache-Control", "no-store");
  }

  next();
});

// health / ping
app.get("/api/ping", (_req, res) => {
  res.json({ ok: true });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// static uploads
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));


// route qr tracking pubblico
app.use("/qr", qrRoutes);
// API routes
app.use("/api/cars", carsRouter);
app.use("/api/offers", offerRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/inspector", inspectorRoutes);
app.use("/api/dealers", dealerRoutes);
app.use("/api/inspections", inspectionsRoutes);
app.use("/api/inspection-reports", inspectionReportsRouter);
app.use("/api/stripe", stripeRoutes);
app.use("/api/history", historyRouter);
app.use("/api/arve", arvePricingRoutes);
app.use("/api/dealer-subscriptions", dealerSubscriptionRoutes);

// Route dedicata al ciclo auto vendute
app.use("/api/sold-cars", soldCarsRoutes);


// Avvio job automatico rimozione visuale auto vendute.
// Ogni 60 minuti controlla le auto SOLD_PENDING_REMOVAL con removalScheduledAt scaduto
// e le passa a REMOVED_AFTER_SALE senza cancellare i dati dal database.
startSoldCarsCleanupJob({
  intervalMinutes: 60,
  runImmediately: true,
});

// --------------------
// Legacy endpoints
// --------------------
const RegisterBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const NearbyQuery = z.object({
  lat: z.coerce.number(),
  lon: z.coerce.number(),
  radiusKm: z.coerce.number().default(5),
});

// Endpoint legacy disabilitato: la creazione deve passare da /api/cars,
// dove vengono applicati autenticazione, validazioni e limiti del piano dealer.
app.post("/cars", (_req, res) => {
  return res.status(410).json({
    error: "Endpoint legacy disabilitato. Usa /api/cars.",
  });
});

app.get("/cars/nearby", async (req, res) => {
  const parsed = NearbyQuery.safeParse(req.query);

  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { lat, lon, radiusKm } = parsed.data;
  const maxLatDelta = radiusKm / 111;
  const maxLonDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));

  const candidates = await prisma.car.findMany({
    where: {
      marketStatus: "AVAILABLE",
      visuallyRemovedAt: null,
      dealerPlanSuspended: false,
      latitude: { gte: lat - maxLatDelta, lte: lat + maxLatDelta },
      longitude: { gte: lon - maxLonDelta, lte: lon + maxLonDelta },
    },
    orderBy: { id: "asc" },
  });

  function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
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

  const withDist = candidates
    .map((c) => {
      const d =
        c.latitude != null && c.longitude != null
          ? haversine(lat, lon, c.latitude, c.longitude)
          : 9999;

      return { ...c, distanceKm: Math.round(d * 10) / 10 };
    })
    .filter((c) => c.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  res.json(withDist);
});

app.get("/cars/search", async (req, res) => {
  const q = String(req.query.q || "").trim();

  if (!q) return res.json([]);

  const parts = q.split(/\s+/);

  const where = {
    marketStatus: "AVAILABLE",
    visuallyRemovedAt: null,
    dealerPlanSuspended: false,
    AND: parts.map((p) => ({
      OR: [
        { make: { contains: p, mode: "insensitive" } },
        { model: { contains: p, mode: "insensitive" } },
      ],
    })),
  } as any;

  const cars = await prisma.car.findMany({
    where,
    orderBy: { id: "asc" },
  });

  res.json(cars);
});

app.get("/cars", async (_req, res) => {
  const cars = await prisma.car.findMany({
    where: {
      marketStatus: "AVAILABLE",
      visuallyRemovedAt: null,
      dealerPlanSuspended: false,
    },
    orderBy: { id: "asc" },
  });

  res.json(cars);
});

app.get("/cars/:id", async (req, res) => {
  const id = Number(req.params.id);

  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid id" });
  }

  const car = await prisma.car.findUnique({ where: { id } });

  if (!car || car.dealerPlanSuspended) {
    return res.status(404).json({ error: "Not found" });
  }

  res.json(car);
});

app.delete("/cars/:id", async (req, res) => {
  const id = Number(req.params.id);

  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid id" });
  }

  try {
    await prisma.car.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e: any) {
    if (e.code === "P2025") {
      return res.status(404).json({ error: "Not found" });
    }

    throw e;
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

export default app;