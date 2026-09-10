# ASCARI - Abbonamenti concessionaria

## Piani implementati

- FREE: 0 EUR/mese, massimo 5 auto attive, assegnato automaticamente.
- TOP: 25 EUR/mese, massimo 15 auto attive, statistiche concessionaria.
- PREMIUM: 50 EUR/mese, auto attive illimitate, statistiche concessionaria.

Il limite viene verificato lato backend quando viene creata una nuova auto. Se un downgrade o una disdetta porta la concessionaria sopra il limite, le auto eccedenti vengono marcate come sospese dal piano e non compaiono nelle ricerche pubbliche o nel garage pubblico. Restano comunque visibili al proprietario nel suo garage. Quando il piano viene nuovamente aumentato, le auto vengono riattivate automaticamente nei limiti disponibili.

## Stripe

L'integrazione Connect esistente resta dedicata agli incassi/payout delle vendite delle auto. Per il canone mensile del concessionario viene creato anche un Customer Stripe della piattaforma collegato logicamente allo stesso utente/concessionaria.

Nel Dashboard Stripe crea:

1. Un Product/Price ricorrente mensile TOP da 25 EUR.
2. Un Product/Price ricorrente mensile PREMIUM da 50 EUR.
3. Inserisci gli ID `price_...` nelle variabili:
   - `STRIPE_DEALER_TOP_PRICE_ID`
   - `STRIPE_DEALER_PREMIUM_PRICE_ID`
4. Configura il Customer Portal Stripe se vuoi consentire al cliente di aggiornare carta, fatture e disdetta.
5. Crea un webhook verso:
   - `POST https://<backend>/api/stripe/dealer-subscriptions/webhook`
6. Eventi consigliati per il webhook:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
7. Salva il signing secret in `STRIPE_DEALER_SUBSCRIPTION_WEBHOOK_SECRET`.

## Prisma

Lo schema aggiornato è `backend/schema.prisma`.

In locale, usando il layout presente nello ZIP:

```bash
cd backend
npx prisma format --schema=schema.prisma
npx prisma generate --schema=schema.prisma
npx prisma migrate dev --schema=schema.prisma --name dealer_subscriptions
```

In test/prod usa la normale procedura di migrazione del progetto. Prima della build del backend rigenera sempre Prisma Client dopo l'aggiornamento schema.

## Nuove API

- `GET /api/dealer-subscriptions/me`
- `POST /api/dealer-subscriptions/checkout`
- `POST /api/dealer-subscriptions/confirm-checkout`
- `POST /api/dealer-subscriptions/change-plan`
- `POST /api/dealer-subscriptions/portal`
- `GET /api/dealer-subscriptions/stats`
- `POST /api/stripe/dealer-subscriptions/webhook`

## Frontend

Nuova pagina:

- `/dealer/plans`

La voce `I miei piani` compare nel menu profilo Clerk solo per il ruolo `CONCESSIONARIO`.
