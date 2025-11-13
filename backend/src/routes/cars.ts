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

  const email = sessionClaims?.email as string | undefined;
  const name = (sessionClaims as any)?.fullName || undefined;
  const user = await ensureUserInDb(clerkUserId, email, name);

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
      (typeof title === 'string' && title.trim().length > 0)
        ? title.trim()
        : [make, model, year].filter(Boolean).join(' ') || 'Nuova auto';

  try {
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
        photos,       // 👈 array di immagini (se nel modello è tipo Json)
        ownerId: user.id,
      },
    });

    return res.json(car);
  } catch (err) {
    console.error('POST /api/cars error:', err);
    return res.status(500).json({ error: 'Error creating car' });
  }
});

/**
 * GET /api/cars
 * ✅ Tutte le auto (visibili pubblicamente)
 */
router.get('/', async (_req, res) => {
  try {
    const cars = await prisma.car.findMany({
      include: { owner: true },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(cars);
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
    // 1) prendo l'utente dal DB tramite clerkId
    const user = await prisma.user.findUnique({
      where: { clerkId: clerkUserId },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // 2) prendo l'auto
    const car = await prisma.car.findUnique({
      where: { id: carId },
    });

    if (!car) {
      return res.status(404).json({ error: 'Car not found' });
    }

    // 3) controllo proprietà confrontando ownerId con user.id (NON con clerkUserId)
    if (car.ownerId !== user.id) {
      return res.status(403).json({ error: 'Not allowed to edit this car' });
    }

    // 4) aggiorno l’auto
    const updated = await prisma.car.update({
      where: { id: carId },
      data: req.body,
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
