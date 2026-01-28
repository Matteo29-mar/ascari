import express from 'express';
import { getAuth } from '@clerk/express';
import { prisma } from '../prisma';
import { ensureUserInDb } from '../lib/authUser';
import { geocodeAddress } from "../lib/geocode";
import multer from "multer";
import path from "path";
import fs from "fs";


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
    // accetta solo pdf (puoi allargare dopo)
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Solo PDF consentiti"));
    }
    cb(null, true);
  },
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

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

    // URL pubblico del file (servito da express static /uploads)
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
      select: { isPeriziata: true, periziaDocUrl: true },
    });

    if (!car) return res.status(404).json({ error: "Car not found" });

    if (!car.isPeriziata || !car.periziaDocUrl) {
      return res.status(403).json({ error: "Perizia not available" });
    }

    return res.redirect(car.periziaDocUrl);
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

      // ✅ campi extra
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

    // ✅ cover fallback (come nel PUT)
    const finalCover =
      typeof coverUrl === 'string' && coverUrl.trim() !== ''
        ? coverUrl
        : Array.isArray(photos) && photos.length > 0
        ? photos[0]
        : null;

    // ✅ GEOCODING in CREATE (fondamentale per farla apparire in mappa)
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

        // ✅ extra
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
 * 🔍 Cerca auto per marca, modello o titolo
 */
router.get('/search', async (req, res) => {
  const query = String(req.query.query || '').trim();

  if (!query) {
    return res.status(200).json([]); // nessun termine → nessun errore
  }

  try {
    const cars = await prisma.car.findMany({
      where: {
        OR: [
          { make: { contains: query, mode: 'insensitive' } },
          { model: { contains: query, mode: 'insensitive' } },
          { title: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: { owner: true },
      orderBy: { createdAt: 'desc' },
    });

    return res.json(cars);
  } catch (err) {
    console.error('GET /api/cars/search error:', err);
    return res.status(500).json({ error: 'Search error' });
  }
});

/**
 * GET /cars/filter
 * Case-insensitive filtering
 */
router.get("/filter", async (req, res) => {
  let brands = req.query.brands?.toString().split(",").filter(Boolean) || [];
  let models = req.query.models?.toString().split(",").filter(Boolean) || [];

  try {
    const cars = await prisma.car.findMany({
      where: {
        AND: [
          brands.length
            ? {
                OR: brands.map((b) => ({
                  make: { equals: b, mode: "insensitive" },
                })),
              }
            : {},
          models.length
            ? {
                OR: models.map((m) => ({
                  model: { equals: m, mode: "insensitive" },
                })),
              }
            : {},
        ],
      },
      include: { owner: true },
    });

    res.json(cars);
  } catch (e) {
    console.error("Errore filtro auto:", e);
    res.status(500).json({ error: "Errore filtraggio" });
  }
});




/**
 * GET /api/cars/nearby
 * 📍 Mostra le auto nel raggio indicato
 * es: /api/cars/nearby?lat=45.32&lon=8.42&radius=5
 */
router.get("/nearby", async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const radius = Number(req.query.radius ?? 5);

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return res.status(400).json({ error: "Invalid coordinates" });
  }

  try {
    const cars = await prisma.$queryRawUnsafe<any[]>(`
      SELECT *
      FROM (
        SELECT
          *,
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
      ORDER BY t."distanceKm" ASC
    `);

    res.json(cars);
  } catch (e) {
    console.error("GET /cars/nearby error", e);
    res.status(500).json({ error: "Nearby search error" });
  }
});




/**
 * GET /api/cars
 * 🔥 Tutte le auto, con info se l'utente ha messo “like”
 */
router.get('/', async (req, res) => {
  try {
    const { userId: clerkUserId } = getAuth(req);

    let user = null;

    // Se è loggato, prendo l'utente dal DB
    if (clerkUserId) {
      user = await prisma.user.findUnique({
        where: { clerkId: clerkUserId },
      });
    }

    
    // Prendo tutte le auto
    const cars = await prisma.car.findMany({
      include: user
        ? {
            owner: true,
            likes: {
              where: { userId: user.id },
            },
          }
        : { owner: true },
      orderBy: { createdAt: 'desc' },
    });

    // Aggiungo likedByMe
    const result = cars.map((c: any) => ({
      ...c,
      likedByMe: user ? c.likes?.length > 0 : false,
    }));

    return res.json(result);
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
    // Trova l'utente nel DB
    const user = await prisma.user.findUnique({
      where: { clerkId: clerkUserId },
    });

    // ✅ dopo
    if (!user) {
      return res.json({
        myCars: [],
        likedCars: [],
      });
    }


    // ✅ Auto create da me
    const myCars = await prisma.car.findMany({
      where: { ownerId: user.id },
      include: { likes: true, owner: true },
      orderBy: { createdAt: 'desc' },
    });

    // ✅ Auto che mi piacciono
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

    // controlla che l'auto esista
    const car = await prisma.car.findUnique({ where: { id: carId } });
    if (!car) {
      return res.status(404).json({ error: 'Car not found' });
    }

    // crea il like se non esiste (grazie a @@unique userId+carId)
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
    // ✔ Trova utente
    const user = await prisma.user.findUnique({
      where: { clerkId: clerkUserId },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // ✔ Trova auto
    const car = await prisma.car.findUnique({
      where: { id: carId },
    });

    if (!car) {
      return res.status(404).json({ error: 'Car not found' });
    }

    // ✔ Controllo permessi
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


    // ⭐ Normalizzatore per nullable
    const normalize = (v: any) => (v === '' ? null : v);

    // ⭐ FISSA: aggiorniamo TUTTI i campi arrivati dal frontend
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


    // ⭐ AGGIORNAMENTO FOTO
    if (Array.isArray(req.body.photos)) {
      data.photos = req.body.photos; // ⬅️ salva array completo
    }

    // ⭐ FIX COVER
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


    // ⭐ Ora aggiorno davvero tutto
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
router.delete('/:id', async (req, res) => {
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
      include: { owner: true },
    });

    if (!car) {
      return res.status(404).json({ error: 'Car not found' });
    }

    const offerCount = await prisma.offer.count({
      where: { carId: carId }
    });

    if (offerCount > 0) {
      return res.status(400).json({
        error: "Non puoi eliminare un'auto che ha offerte attive o passate."
      });
    }

    // 🚫 non è la sua → 403
    if (car.ownerId !== user.id) {
      return res.status(403).json({ error: 'Not allowed to delete this car' });
    }

    await prisma.car.delete({ where: { id: carId } });

    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/cars/:id error:', err);
    return res.status(500).json({ error: 'Error deleting car' });
  }
});

export default router;
