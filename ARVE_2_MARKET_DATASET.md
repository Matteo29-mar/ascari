# ASCARI — ARVE 2.0 / Market Reference Dataset

## Cosa cambia

ARVE ora combina tre livelli di informazione:

1. **Card ASCARI** — dati tecnici dell'auto e i tre prezzi scelti dal venditore.
2. **ArveMarketReference** — base prezzi importata da `backend/data/prezzi-ascari-arve.xlsx`.
3. **Dataset ASCARI** — annunci, offerte accettate e soprattutto prezzi di vendita reali.

OpenAI riceve i dati già selezionati dal pricing engine e produce i tre prezzi ARVE,
range di mercato, confidenza e spiegazione.

Le precedenti previsioni ARVE sono salvate in `ArvePricingAnalysis`, ma **non vengono
usate come vendite reali** nelle valutazioni successive.

## Nuove tabelle

- `ArveMarketReference`: riferimenti derivati dal foglio Excel.
- `ArveMarketObservation`: eventi reali del marketplace.
- `ArvePricingAnalysis`: estesa con numero/qualità/riferimenti della baseline Excel.

Gli eventi registrati sono:

- `LISTING_CREATED`
- `OFFER_RECEIVED`
- `OFFER_ACCEPTED`
- `REAL_SALE`

La vendita reale ha il peso massimo; l'offerta accettata è un forte segnale; un
annuncio attivo ha peso basso. Le stime Excel `MODEL_ESTIMATE` hanno meno peso dei
riferimenti `VERIFIED`.

---

## Avvio locale

Dalla cartella `backend`:

```bash
npm install
npx prisma generate
npx prisma migrate dev
npm run arve:import
npm run dev
```

Verifica:

```bash
curl http://localhost:4002/api/arve/health
```

oppure usa la porta configurata nel tuo `.env`.

La risposta deve contenere:

```json
{
  "ok": true,
  "marketDatasetReady": true,
  "marketReferences": 5207
}
```

`marketReferences` deve essere maggiore di zero.

Frontend:

```bash
cd frontend
npm install
npm run dev
```

### Aggiornare il foglio prezzi

Sostituisci:

```text
backend/data/prezzi-ascari-arve.xlsx
```

poi esegui:

```bash
cd backend
npm run arve:import
```

L'import è idempotente per la sorgente Excel: sostituisce la precedente fotografia
della base prezzi, senza cancellare osservazioni e storico ASCARI.

È possibile usare un file esterno:

```env
ARVE_MARKET_XLSX_PATH="/percorso/prezzi.xlsx"
ARVE_MARKET_SOURCE_VERSION="2026-08-19"
```

---

## Produzione

Ordine consigliato:

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run arve:import
npm run build
```

Se il backend è eseguito con Docker, assicurati che `backend/data/prezzi-ascari-arve.xlsx`
sia copiato nell'immagine (oppure monta il file e configura `ARVE_MARKET_XLSX_PATH`).
Dopo aver pubblicato la nuova immagine:

```bash
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npm run arve:import
```

Verifica finale:

```bash
curl https://TUO-BACKEND/api/arve/health
```

Controlla:

- `ok: true`
- `openAiConfigured: true`
- `marketDatasetReady: true`
- `marketReferences > 0`

## Variabili ARVE

Vedi `.env.example`:

```env
ARVE_ENABLED="true"
OPENAI_API_KEY=""
OPENAI_MODEL="gpt-5-mini"
OPENAI_VISION_ENABLED="true"
ARVE_PROMPT_VERSION="ascari-arve-v2"
ARVE_ANALYSIS_TIMEOUT_MS="25000"
ARVE_PRIVATE_DATASET_LIMIT="12"
ARVE_MARKET_REFERENCE_LIMIT="8"
ARVE_MARKET_XLSX_PATH=""
ARVE_MARKET_SOURCE_VERSION=""
```

Non committare la chiave OpenAI reale.
