# Patch ASCARI — ARVE Pricing AI ibrido

Questa cartella contiene i file già modificati e i nuovi file da copiare nel progetto Ascari.

## Flusso implementato

1. `CarNew.tsx` salva normalmente l'auto con `POST /api/cars`.
2. Subito dopo chiama `POST /api/arve/cars/:id/analyze`.
3. Il backend cerca auto simili nel database privato Ascari.
4. Se `OPENAI_API_KEY` è disponibile usa la Responses API con output strutturato.
5. Se OpenAI non è disponibile usa automaticamente il fallback locale.
6. L'analisi viene salvata in `ArvePricingAnalysis`.
7. Il popup ARVE permette di applicare i tre prezzi o conservare quelli originali.
8. Alla vendita reale, `carSaleLifecycle.ts` salva prezzo effettivo e giorni di vendita nel dataset ARVE.

## File sostitutivi

- `backend/prisma/schema.prisma`
- `backend/src/index.ts`
- `backend/src/routes/cars.ts`
- `backend/src/lib/carSaleLifecycle.ts`
- `backend/package.json`
- `frontend/src/pages/CarNew.tsx`
- `frontend/src/api.ts`

## Nuovi file

- `backend/src/routes/arvePricing.ts`
- `backend/src/services/arve/*`
- `backend/src/types/arvePricing.ts`
- `backend/prisma/migrations/20260729220300_add_arve_pricing/migration.sql`
- `frontend/src/components/Arve/*`
- `frontend/src/types/arve.ts`
- `frontend/src/assets/arve-icon.jpeg`

## Installazione locale

Dal backend:

```bash
npm install
npx prisma generate
npx prisma migrate dev --name add_arve_pricing
npm run dev
```

Se copi anche la migrazione SQL inclusa e il progetto la riconosce come nuova migrazione, usa:

```bash
npx prisma migrate deploy
npx prisma generate
```

Dal frontend:

```bash
npm install
npm run dev
```

## Produzione EC2 + RDS

1. Aggiungi le variabili ARVE/OpenAI al `.env` del backend su EC2.
2. Non inserire mai `OPENAI_API_KEY` nel frontend o in una variabile `VITE_`.
3. Esegui la migrazione contro RDS.
4. Rigenera Prisma.
5. Ricostruisci e riavvia il container backend.
6. Ricostruisci il frontend e pubblicalo su S3/CloudFront.

Esempio backend Docker:

```bash
docker compose build backend
docker compose run --rm backend npx prisma migrate deploy
docker compose up -d backend
docker compose logs -f backend
```

## Endpoint aggiunti

- `GET /api/arve/health`
- `POST /api/arve/cars/:id/analyze`
- `GET /api/arve/cars/:id`
- `POST /api/arve/cars/:id/decision`

## Test rapido senza OpenAI

Lascia `OPENAI_API_KEY` vuota e crea una nuova auto. La card deve essere salvata, il popup deve comparire e `sourceType` deve essere `LOCAL_FALLBACK` oppure `PRIVATE_DATASET_FALLBACK`.

## Test con OpenAI

Configura la chiave nel backend e crea un'altra auto. Nei log deve comparire una riga simile:

```text
[ARVE] carId=42 source=OPENAI_PRIVATE_DATASET matches=4 model=gpt-5-mini tokens=1532 confidence=0.78
```
