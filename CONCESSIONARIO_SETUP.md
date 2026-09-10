# ASCARI - Profilo Concessionario

## Cosa è stato aggiunto

- nuovo `DealerProfile` collegato 1:1 a `User`;
- registrazione/modifica concessionario;
- ruolo Clerk `CONCESSIONARIO` lato UI;
- account concessionario con la stessa navigazione dell'utente normale;
- pagina pubblica concessionaria con logo, indirizzo copiabile, Maps, contatti, numero di auto e garage pubblico;
- link alla concessionaria nel dettaglio delle auto;
- badge concessionaria nelle card del catalogo;
- classificazione automatica delle auto in `PRIVATE` / `DEALER` in base al proprietario;
- marker mappa verde per privati e rosso per concessionarie, con legenda;
- blocco della doppia registrazione concessionario/periziatore sullo stesso account.

## Nuovi file

- `backend/src/routes/dealers.ts`
- `frontend/src/pages/DealerRegister.tsx`
- `frontend/src/pages/DealerProfile.tsx`

## File modificati

- `backend/schema.prisma`
- `backend/src/index.ts`
- `backend/src/routes/cars.ts`
- `backend/src/routes/inspector.ts`
- `frontend/src/main.tsx`
- `frontend/src/pages/CarDetail.tsx`
- `frontend/src/pages/Cars.tsx`
- `frontend/src/pages/ExploreMap.tsx`
- `frontend/src/styles.css`

## Prisma - locale

Dalla cartella `backend`:

```bash
npx prisma format --schema=./schema.prisma
npx prisma migrate dev --name add_dealer_profile --schema=./schema.prisma
npx prisma generate --schema=./schema.prisma
```

Poi riavvia il backend.

## Prisma - test/prod

La migration generata in locale deve essere versionata/deployata insieme al codice. Sulla macchina/container del backend:

```bash
npx prisma migrate deploy --schema=./schema.prisma
npx prisma generate --schema=./schema.prisma
```

Poi ricrea/riavvia il container backend secondo il normale flusso ASCARI.

## Variabili ambiente

Non sono state introdotte nuove variabili. Il logo usa lo stesso bucket già usato per le immagini auto:

- `ASCARI_CAR_IMAGES_BUCKET`
- `ASCARI_CAR_IMAGES_PUBLIC_BASE_URL` (se già usata)
- `AWS_REGION` / `AWS_DEFAULT_REGION`

La geocodifica della sede usa la configurazione Mapbox già presente nel backend:

- `MAPBOX_ACCESS_TOKEN`

## Route aggiunte

Backend:

- `GET /api/dealers/me`
- `POST /api/dealers/register`
- `PUT /api/dealers/me`
- `GET /api/dealers/:id`

Frontend:

- `/dealer/register`
- `/dealer/me`
- `/dealers/:id`

## Nota sul comportamento delle auto

Non esiste un secondo modello `DealerCar`: le auto rimangono normali record `Car`. Una vettura viene considerata di concessionaria quando il suo `owner` possiede un `DealerProfile`. Questo significa che anche auto già pubblicate dallo stesso account diventano automaticamente auto di concessionaria dopo la creazione del profilo.
