# ASCARI — DEV (Auth + Nearby/Search)

Obiettivo: ambiente funzionante **frontend+backend** con **registrazione/login (email+password)**, e pagina **Auto disponibili** con ricerca per modello e "Vicino a me". Pronto per estendere a **Google** e **Apple ID** (placeholders OAuth già previsti).

## Requisiti
- Node.js 20+
- Docker (per Postgres)

## Database (Postgres)
Avvia rapidamente un Postgres dedicato:
```bash
docker run -d --name ascari_auth_db -e POSTGRES_PASSWORD=ascari -e POSTGRES_USER=ascari -e POSTGRES_DB=ascari_auth -p 5433:5432 postgres:16
```
> Se usi `5433` sull'host, aggiorna `DATABASE_URL` in `backend/.env`.

per DB 
```bash
npx prisma studio

## Backend
```bash
cd backend
cp .env.example .env
# Aggiorna DATABASE_URL se necessario
# primo avvio in nuovo ambiente
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed # non più necessario
npm run dev
```
- server su `http://localhost:4001`

## Frontend
```bash
cd ../frontend
npm install
npm run dev
```
- app su `http://localhost:5173`

## OAuth (Google/Apple) — attivazione successiva
- Inserisci le credenziali in `backend/.env`.
- Implementa le rotte OAuth (commenti nel codice) con Passport o libreria equivalente.
- Abilita i pulsanti nel frontend per puntare alle URL del backend.

## Credenziali demo
- utente: `demo@ascari.local`
- password: `password123`

## Dati demo
- auto con coordinate su Milano per testare "Vicino a me".
