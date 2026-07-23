# 🚗 Ascari

Ascari è una web application dedicata alla compravendita di auto usate, progettata per rendere il processo di vendita e acquisto più semplice, trasparente e sicuro.

L'applicazione permette ai venditori di pubblicare i propri veicoli e ai compratori di cercare auto, inviare offerte, comunicare tramite una chat dedicata e consultare le informazioni della vettura. L'obiettivo del progetto è costruire una piattaforma moderna, scalabile e completamente cloud-native.

---

# Tecnologie utilizzate

## Frontend

- React
- TypeScript
- Vite
- React Router
- CSS
- Clerk Authentication
- Mapbox

---

## Backend

- Node.js
- Express
- TypeScript
- Prisma ORM
- PostgreSQL
- JWT / Clerk

---

## Cloud & DevOps

- AWS EC2
- AWS RDS PostgreSQL
- AWS S3
- AWS CloudFront
- AWS Route53
- Docker
- GitHub

---

# Architettura

```
                Browser
                    │
                    ▼
          React + Vite Frontend
                    │
                    ▼
            REST API (Express)
                    │
                    ▼
             PostgreSQL Database
```

---

# Ambienti

## Ambiente Locale

L'ambiente di sviluppo è completamente separato dalla produzione.

### Frontend

- React + Vite
- esecuzione locale sulla porta 5173

### Backend

- Express
- esecuzione locale sulla porta 4002

### Database

- PostgreSQL
- eseguito tramite Docker

```
Frontend (localhost:5173)
            │
            ▼
Backend (localhost:4002)
            │
            ▼
Docker PostgreSQL
```

---

## Ambiente Test / Produzione

L'infrastruttura cloud è ospitata interamente su AWS.

### Frontend

Il frontend viene compilato tramite Vite e pubblicato su:

- Amazon S3
- distribuito tramite CloudFront

```
Utente
   │
   ▼
CloudFront
   │
   ▼
Amazon S3
```

---

### Backend

Il backend è ospitato su una macchina virtuale Amazon EC2.

All'interno della macchina sono presenti:

- Node.js
- Express
- Prisma
- PM2 (process manager)
- Nginx (reverse proxy)

```
Internet
     │
     ▼
 Nginx
     │
     ▼
Express API
```

---

### Database

Il database è completamente separato dal backend.

Viene utilizzato:

- Amazon RDS
- PostgreSQL

```
EC2
 │
 ▼
Amazon RDS PostgreSQL
```

---

# Struttura del progetto

```
ascari/

├── frontend/
│   ├── src/
│   ├── public/
│   └── ...
│
├── backend/
│   ├── prisma/
│   ├── routes/
│   ├── lib/
│   └── ...
│
└── README.md
```

---

# Funzionalità principali

Attualmente Ascari permette di:

- pubblicare un'auto
- modificare un annuncio
- eliminare un annuncio
- ricerca per marca e modello
- ricerca geografica ("Vicino a me")
- visualizzazione mappa
- gestione offerte
- chat tra compratore e venditore
- gestione preferiti
- autenticazione utenti
- QR Code associato al veicolo
- perizie dei veicoli
- garage personale

---

# Obiettivo del progetto

Ascari nasce con l'obiettivo di costruire una piattaforma moderna per la compravendita di automobili, facendo leva su:

- trasparenza
- semplicità d'utilizzo
- infrastruttura cloud scalabile
- architettura facilmente estendibile
- sviluppo orientato a nuove funzionalità (AI, pagamenti online, notifiche, mobile)

L'architettura è progettata per consentire una crescita progressiva del progetto mantenendo separati frontend, backend e database.
