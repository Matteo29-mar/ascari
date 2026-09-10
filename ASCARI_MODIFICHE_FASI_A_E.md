# ASCARI — Modifiche fasi A, B, C, D, E

Data: 20/08/2026

## A — Database e backend

- Rimossi i piani runtime FREE / TOP / PREMIUM.
- Nuovi piani dealer:
  - STARTER: 50 EUR/mese, auto illimitate, massimo 10 dispositivi, statistiche auto disabilitate.
  - ADVANCED: 125 EUR/mese, auto illimitate, massimo 20 dispositivi, statistiche per auto abilitate.
- Nuovo stato dealer senza abbonamento: INACTIVE.
- Nuove tabelle Prisma `DealerDevice`, `DealerReview`, `InspectionRating`.
- Aggiunto `valuationOpinion` a `InspectionReport`.
- Limite dispositivi applicato anche lato backend.
- Dealer senza piano attivo: pubblicazione/uso delle normali API dealer bloccato e auto sospese dalla vetrina.
- Statistiche QR/auto protette lato API: i dealer STARTER ricevono 403.

Migration aggiunta:

`backend/prisma/migrations/20260820175000_dealer_plans_reviews_visual_inspection/migration.sql`

## B — Dealer / Stripe / Garage

- Registrazione concessionaria -> profilo -> scelta obbligatoria STARTER o ADVANCED.
- Nuova pagina piani con i due prezzi e gestione dispositivi.
- Il browser crea un ID dispositivo persistente in localStorage.
- In "Il mio garage" il tasto Statistiche resta disponibile ai privati e ai dealer ADVANCED, ma non ai dealer STARTER.

Variabili ambiente nuove:

```env
STRIPE_DEALER_STARTER_PRICE_ID=price_xxx
STRIPE_DEALER_ADVANCED_PRICE_ID=price_xxx
STRIPE_DEALER_SUBSCRIPTION_WEBHOOK_SECRET=whsec_xxx
```

I Price Stripe devono essere ricorrenti mensili in EUR:

- STARTER: 50,00 EUR / mese
- ADVANCED: 125,00 EUR / mese

Le vecchie variabili `STRIPE_DEALER_TOP_PRICE_ID` e `STRIPE_DEALER_PREMIUM_PRICE_ID` non sono più usate dal codice runtime.

## C — Nuova perizia visuale

- Nuovo schema auto cliccabile usando l'immagine fornita nello ZIP.
- Hotspot con voto 1-5 e nota facoltativa.
- Categorie: carrozzeria, interni, motore, meccanica, pneumatici, elettronica, test drive.
- Scala:
  - 1 Da buttare
  - 2 Danneggiato
  - 3 Normale
  - 4 Buone condizioni
  - 5 Come nuovo
- Tutti i punti devono essere compilati.
- Parere finale obbligatorio.
- Parere economico e valore stimato facoltativi.
- PDF aggiornato con punteggi, medie per categoria, note e valutazione finale.
- I vecchi resoconti testuali continuano a essere leggibili nel dettaglio/PDF.

## D — Mappa e footer

- Legenda Privati / Concessionarie spostata nella toolbar superiore della mappa.
- Rimossa la legenda inferiore.
- Footer globale presente nelle pagine gestite dal Layout, sia per utenti autenticati sia anonimi.
- Sezioni footer: Società, Servizi, Area clienti.
- I link di registrazione periziatore/concessionaria puntano alle route protette da Clerk; dopo il login si rimane sul relativo onboarding.
- Create pagine base Chi siamo, Informazioni e Contatti.

## E — Recensioni concessionarie

- Rating medio e numero recensioni nella pagina pubblica dealer.
- Lettura pubblica.
- Scrittura solo per utenti privati autenticati.
- Dealer e periziatori non possono recensire.
- Una recensione per utente/dealer, aggiornabile tramite upsert.
- Validazione rating 1-5 anche lato backend.

## Applicazione in locale

Dalla versione completa del progetto, con le dipendenze installate:

```bash
cd backend
npx prisma migrate dev
npx prisma generate
npm run dev
```

In un secondo terminale:

```bash
cd frontend
npm run dev
```

Configurare nel backend i due Price Stripe nuovi prima di testare checkout e cambio piano.

## Applicazione in produzione

1. Fare backup PostgreSQL/RDS.
2. Creare i due Price ricorrenti Stripe da 50 EUR e 125 EUR/mese.
3. Aggiornare le variabili ambiente del backend.
4. Applicare migration e rigenerare Prisma:

```bash
npx prisma migrate deploy
npx prisma generate
```

5. Ricostruire/redeployare backend.
6. Ricostruire frontend e pubblicarlo su S3/CloudFront.
7. Invalidare la cache CloudFront se usata.
8. Verificare il webhook Stripe `dealer-subscriptions`.

### Nota sui vecchi abbonamenti Stripe

La migration disattiva lato ASCARI tutti i record dealer già esistenti perché appartengono ai vecchi piani FREE/TOP/PREMIUM e sospende le relative auto pubbliche. Il runtime non riconosce un vecchio Price TOP/PREMIUM come nuovo STARTER/ADVANCED: in questo modo non vengono concessi i nuovi vantaggi mantenendo il vecchio importo.

Se esistono subscription Stripe reali ancora attive sui vecchi Price, il dealer vede il comando per aprire il portale Stripe e deve gestire/annullare la vecchia subscription prima di creare il nuovo piano; il backend blocca un nuovo checkout finché la vecchia subscription Stripe risulta ancora attiva, evitando una doppia sottoscrizione.

## Validazione eseguita sul pacchetto consegnato

Lo ZIP ricevuto non contiene `package.json`, lockfile o `tsconfig.json`, quindi in questo ambiente non è possibile eseguire `npm install`, build Vite/Express o `prisma generate` sulla versione reale delle dipendenze. È stata comunque eseguita con successo una validazione sintattica di tutti i file TypeScript/TSX presenti tramite TypeScript 5.8 (`--noCheck`), oltre a un controllo dei riferimenti runtime ai vecchi piani.
