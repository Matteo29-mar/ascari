// @ts-nocheck  // (facoltativo, utile se l'editor è ancora confuso sui tipi)
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma = new PrismaClient();

async function main() {
  // utente demo
  const passwordHash = await bcrypt.hash('password123', 10);
  await prisma.user.upsert({
    where: { email: 'demo@ascari.local' },
    update: {},
    create: { email: 'demo@ascari.local', name: 'Demo User', password: passwordHash }
  });

  // reset per evitare duplicati
  await prisma.car.deleteMany();

  const cars = [
    {
      make: 'Ascari', model: 'GT', year: 2024, trimLevel: 'Performance',
      priceEur: 210000, color: 'Arancione', transmission: 'Automatico',
      fuelType: 'Benzina', engine: 'V8 5.0', horsepower: 560, torqueNm: 650,
      drivetrain: 'RWD', seats: 2, doors: 2,
      description: 'Supercar leggera ad alte prestazioni, bilanciamento ottimale per pista e strada.',
      latitude: 45.4642, longitude: 9.19,
      photos: [
        '/cars/ascari-gt-1.jpg',
        '/cars/ascari-gt-2.jpg'
      ]
    },
    {
      make: 'Ascari', model: 'GT', year: 2025, trimLevel: 'Track Pack',
      priceEur: 245000, color: 'Nero', transmission: 'Automatico',
      fuelType: 'Benzina', engine: 'V8 5.2', horsepower: 620, torqueNm: 700,
      drivetrain: 'RWD', seats: 2, doors: 2,
      description: 'Versione potenziata con pacchetto pista, freni carboceramici e aerodinamica evoluta.',
      latitude: 45.4700, longitude: 9.2000,
      photos: [
        '/cars/ascari-gt-3.jpeg'
      ]
    },
    {
      make: 'Ascari', model: 'GT', year: 2023, trimLevel: 'Grand Tour',
      priceEur: 180000, color: 'Bianco', transmission: 'Automatico',
      fuelType: 'Ibrido', engine: 'V6 3.0 + Hybrid', horsepower: 420, torqueNm: 520,
      drivetrain: 'RWD', seats: 2, doors: 2,
      description: 'Open-top per godersi i viaggi lunghi con comfort e prestazioni.',
      latitude: 45.4600, longitude: 9.1800,
      photos: [
        '/cars/ascari-gt-4.jpeg'
      ]
    }
  ];

  for (const c of cars) {
    await prisma.car.create({ data: c });
  }

  console.log('Seed done');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
