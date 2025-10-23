import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const app = express();
const prisma = new PrismaClient();
const port = Number(process.env.PORT) || 4001;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me';

// 🔧 body più grande per le immagini base64
app.use(express.json({ limit: '25mb' }))
app.use(express.urlencoded({ extended: true, limit: '25mb' }))
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());
app.use(morgan('dev'));

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

app.post('/auth/register', async (req, res) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password, name } = parsed.data;
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return res.status(409).json({ error: 'Email already registered' });
  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { email, password: hash, name } });
  const token = jwt.sign({ sub: user.id, email }, JWT_SECRET, { expiresIn: '7d' });
  res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});
app.post('/auth/login', async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ sub: user.id, email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

function auth(req: any, res: any, next: any) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const payload: any = jwt.verify(token, JWT_SECRET);
    req.user = { id: Number(payload.sub), email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

app.get('/auth/me', auth, async (req: any, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, email: true, name: true } });
  res.json({ user });
});

// OAuth placeholders
// app.get('/auth/google/url', ...)
// app.get('/auth/google/callback', ...)
// app.get('/auth/apple/url', ...)
// app.post('/auth/apple/callback', ...)

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

// AGGIORNA (PUT) — per "Modifica"
app.put('/cars/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  const car = await prisma.car.update({ where: { id }, data: req.body });
  res.json(car);
});

// ELIMINA (DELETE) — utile per cleanup
app.delete('/cars/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  await prisma.car.delete({ where: { id } });
  res.json({ ok: true });
});

app.listen(port, () => {
  console.log(`ASCARI auth/search backend on http://localhost:${port}`);
});
