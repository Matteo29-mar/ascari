import express from 'express';
import { getAuth } from '@clerk/express';
import { prisma } from '../prisma';
import { ensureUserInDb } from '../lib/authUser';

const router = express.Router();


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
    // prendo email e nome dai claim della sessione Clerk
    const email = sessionClaims?.email as string | undefined;
    const name = (sessionClaims as any)?.fullName || undefined;

    // ⬇️ ora ensureUserInDb RITORNA SEMPRE un User valido
    const user = await ensureUserInDb(clerkUserId, email ?? null, name ?? null);

    const {
      make,
      model,
      title,
      year,
      fuelType,
      horsepower,
      mileageKm,
      description,
      coverUrl,
      photos,
    } = req.body;

    // 🔑 fallback sicuro per il titolo
    const finalTitle =
      typeof title === 'string' && title.trim().length > 0
        ? title.trim()
        : [make, model, year].filter(Boolean).join(' ') || 'Nuova auto';

    const car = await prisma.car.create({
      data: {
        make,
        model,
        title: finalTitle,
        year,
        fuelType,
        horsepower,
        mileageKm,
        description,
        coverUrl,
        photos, // String[] come da schema
        ownerId: user.id, // ✅ sempre definito
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
 * GET /api/cars/nearby
 * 📍 Mostra le auto nel raggio indicato
 * es: /api/cars/nearby?lat=45.32&lon=8.42&radius=5
 */
router.get('/nearby', async (req, res) => {
  const lat = parseFloat(String(req.query.lat));
  const lon = parseFloat(String(req.query.lon));
  const radiusKm = parseFloat(String(req.query.radius || '5'));

  if (isNaN(lat) || isNaN(lon)) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }

  try {
    const cars = await prisma.$queryRawUnsafe(`
      SELECT *, 
        (
          6371 * acos(
            cos(radians(${lat})) * 
            cos(radians(latitude)) *
            cos(radians(longitude) - radians(${lon})) +
            sin(radians(${lat})) * sin(radians(latitude))
          )
        ) AS distance
      FROM "Car"
      WHERE latitude IS NOT NULL AND longitude IS NOT NULL
      HAVING distance <= ${radiusKm}
      ORDER BY distance ASC;
    `);

    return res.json(cars);
  } catch (err) {
    console.error('GET /api/cars/nearby error:', err);
    return res.status(500).json({ error: 'Nearby search error' });
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

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
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


    return res.json({ myCars, likedCars });
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
