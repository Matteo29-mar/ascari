import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { clerkMiddleware } from '@clerk/express';
import carsRouter from './routes/cars'; 
import offerRoutes from "./routes/offerts";
import chatRoutes from "./routes/chat";
import path from "path";


const app = express();
const prisma = new PrismaClient();
const port = Number(process.env.PORT) || 4002;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me';

// 🔧 body più grande per le immagini base64
// body parser
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// CORS PRIMA di tutto il resto
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
}));

// Clerk
app.use(clerkMiddleware());

// log
app.use(morgan('dev'));

// ✅ health check semplice
// Health check semplice per il frontend (sync bozze ecc.) prima di /api/cars se no che senso ha 
app.get('/api/ping', (_req, res) => {
  res.json({ ok: true });
});

// Router (una sola volta!)
app.use('/api/cars', carsRouter);

//offerte
app.use("/api/offers", offerRoutes);

// Chat utente
app.use("/api/chat", chatRoutes);

//uploads
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));




export default app;

// 🔧 CORS (se usi la variabile, altrimenti metti direttamente l'URL del frontend)
const ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173'
app.use(cors({ origin: ORIGIN }))

// (opzionale, ma utile) disattiva cache su /cars
app.set('etag', false)
app.use((req, res, next) => {
  if (req.path.startsWith('/cars')) res.set('Cache-Control', 'no-store')
  next()
})

// disattiva ETag/global caching per evitare 304 su API dinamiche
app.set('etag', false);
app.use((req, res, next) => {
  if (req.path.startsWith('/cars')) {
    res.set('Cache-Control', 'no-store');
  }
  next();
});
// qui monti le route protette / semi-protette
//app.use('/api', carsRouter);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});




app.get('/health', (_req, res) => res.json({ ok: true }));

const RegisterBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1)
});

app.post('/cars', async (req, res) => {
  const car = await prisma.car.create({ data: req.body })
  res.status(201).json(car)
})
const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});


const NearbyQuery = z.object({
  lat: z.coerce.number(),
  lon: z.coerce.number(),
  radiusKm: z.coerce.number().default(5)
});
app.get('/cars/nearby', async (req, res) => {
  const parsed = NearbyQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { lat, lon, radiusKm } = parsed.data;
  const maxLatDelta = radiusKm / 111;
  const maxLonDelta = radiusKm / (111 * Math.cos(lat * Math.PI/180));

  const candidates = await prisma.car.findMany({
    where: {
      latitude: { gte: lat - maxLatDelta, lte: lat + maxLatDelta },
      longitude: { gte: lon - maxLonDelta, lte: lon + maxLonDelta },
    },
    orderBy: { id: 'asc' }
  });

  function haversine(lat1:number, lon1:number, lat2:number, lon2:number) {
    const toRad = (d:number) => d * Math.PI/180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  const withDist = candidates.map(c => {
    const d = (c.latitude != null && c.longitude != null) ? haversine(lat, lon, c.latitude, c.longitude) : 9999;
    return { ...c, distanceKm: Math.round(d*10)/10 };
  }).filter(c => c.distanceKm <= radiusKm).sort((a,b) => a.distanceKm - b.distanceKm);

  res.json(withDist);
});

app.get('/cars/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json([]);
  const parts = q.split(/\s+/);
  const where = {
    AND: parts.map(p => ({
      OR: [
        { make: { contains: p, mode: 'insensitive' } },
        { model: { contains: p, mode: 'insensitive' } }
      ]
    }))
  } as any;
  const cars = await prisma.car.findMany({ where, orderBy: { id: 'asc' } });
  res.json(cars);
});

app.get('/cars', async (_req, res) => {
  const cars = await prisma.car.findMany({ orderBy: { id: 'asc' } });
  res.json(cars);
});
// GET /cars/:id  -> dettaglio completo (inclusi 'photos' e campi tecnici)
app.get('/cars/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  const car = await prisma.car.findUnique({ where: { id } });
  if (!car) return res.status(404).json({ error: 'Not found' });

  res.json(car);
});

//VEDERE SE ELIMINARE
/* // AGGIORNA (PUT) — per "Modifica"
app.put('/cars/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  const car = await prisma.car.update({ where: { id }, data: req.body });
  res.json(car);
}); */

// DELETE /cars/:id  → elimina un veicolo
app.delete('/cars/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    await prisma.car.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e:any) {
    // se l'id non esiste
    if (e.code === 'P2025') return res.status(404).json({ error: 'Not found' });
    throw e;
  }
});

