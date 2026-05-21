# Gioco Indicatori pH

Gioco in tempo reale per due giocatori sugli indicatori di pH, con classifica e pannello admin. Interfaccia in italiano, pensata per uso in classe.

Questo README spiega in modo semplice:
- cosa fa il progetto e come è fatto
- dove si trova ogni parte del codice
- quali file cambiare per aggiornamenti futuri
- come avviare il progetto in locale
- come fare il deploy in produzione

## Requisiti (con guide semplici)
Per usare il progetto servono questi strumenti. Le guide sono ufficiali e passo passo:

- Node.js (include npm): https://nodejs.org/en/download
- Docker Desktop o Docker Engine: https://docs.docker.com/get-docker/
- Git (opzionale, utile per scaricare il progetto): https://git-scm.com/downloads

## Panoramica dello stack
- Frontend: React + Vite + TypeScript
  - gestisce tutta l'interfaccia del gioco
- Backend: Node.js + TypeScript + Fastify
  - gestisce logica di gioco, punteggi, admin, API e Socket.IO
- Realtime: Socket.IO
  - connessione in tempo reale tra i due giocatori
- Database: PostgreSQL
  - salva partite, eventi, classifica e impostazioni
- Migrazioni DB: dbmate
  - crea/aggiorna tabelle in modo automatico
- Reverse proxy: Caddy
  - serve il sito e gira le richieste /api e /socket.io al backend

## Struttura del progetto (dove sono le cose)

Cartelle principali:
- backend/ = server
- frontend/ = interfaccia web
- shared/ = tipi condivisi tra frontend e backend
- compose.dev.yml e compose.prod.yaml = avvio con Docker

Dettaglio backend:
- backend/src/index.ts
  - tutte le API HTTP e la logica socket del gioco
- backend/src/db.ts
  - accesso al database (query SQL)
- backend/db/migrations/
  - script SQL per creare o aggiornare tabelle
- backend/db/seed/indicators.json
  - dati degli indicatori di pH
- backend/src/seed.ts
  - carica gli indicatori nel DB

Dettaglio frontend:
- frontend/src/App.tsx
  - routing principale
- frontend/src/pages/
  - pagine del sito (Home, Match, Admin, Leaderboard)
- frontend/src/api.ts
  - chiamate HTTP al backend
- frontend/src/socket.ts
  - connessione realtime (Socket.IO)
- frontend/src/styles.css
  - tema grafico e colori

File di configurazione:
- .env.example
  - esempio variabili per lo sviluppo
- .env.production
  - variabili reali per produzione
- frontend/.env.example
  - esempio variabili per frontend
- Caddyfile
  - regole del proxy e hosting del sito

## Cosa modificare per aggiornamenti futuri
Aggiungere, rimuovere o modificare gli indicatori di pH:
- backend/db/seed/indicators.json

Regole del gioco e API:
- backend/src/index.ts
  - cambia regole, punteggi, tempi, eventi socket

Database e classifica:
- backend/src/db.ts
  - query SQL (leaderboard, match, impostazioni)
- backend/db/migrations/
  - aggiungi nuove tabelle o colonne

Interfaccia utente:
- frontend/src/pages/Match.tsx
  - flusso della partita e UI del match
- frontend/src/pages/Admin.tsx
  - pannello admin e impostazioni
- frontend/src/styles.css
  - colori, font, pulsanti

Collegamenti API e socket:
- frontend/src/api.ts
- frontend/src/socket.ts

## Variabili d'ambiente (in parole semplici)
Questi valori dicono al progetto come collegarsi al DB e dove trovare il backend.

- ADMIN_PIN
  - PIN del pannello admin
- POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
  - credenziali del database
- DATABASE_URL
  - stringa completa di accesso al database
- VITE_API_URL, VITE_SOCKET_URL
  - URL pubblico del backend (solo per build del frontend)

Nota importante: se cambi la password del DB, devi aggiornare anche DATABASE_URL.

## Avvio locale (con Docker, consigliato)
Questo metodo funziona quasi ovunque e non richiede installare PostgreSQL a mano.

1) Crea il file .env
```
cp .env.example .env
```

2) Avvia tutto
```
docker compose -f compose.dev.yml up --build
```

3) Apri nel browser
- Frontend: http://localhost:5173
- Backend: http://localhost:3000

Suggerimento: apri due schede del browser con nickname diversi per provare il match.

## Avvio locale (senza Docker)
Serve un PostgreSQL locale gia installato e un DATABASE_URL valido.

Backend:
```
cd backend
npm install
npm run dev
```

Frontend:
```
cd frontend
npm install
npm run dev
```

## Deploy in produzione (step by step, semplice)
Questo flusso usa:
- build frontend in locale
- server che serve i file statici con Caddy
- backend e database in Docker sul server

### 1) Prepara il frontend in locale
*Nota: sostituire https://82.165.238.8.sslip.io con l'indirizzo del server corretto in .env*
```
cd frontend
cp .env.example .env # Copia .env.example a .env (si può anche copiare il file mediante altri metodi)
npm ci
npm run build
```
Il risultato sta in frontend/dist.

### 2) Copia il build sul server
Esempio con scp:
```
scp -r ./frontend/dist user@your-server:/path/to/gioco-chimica/frontend/
```

### 3) Configura il server
Sul server:
```
cd /path/to/gioco-chimica
```

Apri .env.production e inserisci i valori reali:
- ADMIN_PIN
- POSTGRES_PASSWORD
- DATABASE_URL (con la stessa password)

### 4) Avvia in produzione
```
docker compose -f compose.prod.yaml --env-file .env.production up -d
```

### 5) Verifica
Apri:
- https://82.165.238.8.sslip.io

Se vedi 502 o il matchmaking si blocca, il backend non è avviato.
Controlla i log:
```
docker compose -f compose.prod.yaml logs backend --tail=200
```

## Manutenzione e update

Aggiornare il frontend (produzione):
1) rifai npm run build in locale
2) ricopia frontend/dist sul server

Aggiornare il backend:
```
docker compose -f compose.prod.yaml --env-file .env.production up -d --build
```

Migrazioni DB:
Le migrazioni partono automaticamente all'avvio del backend.

## FAQ rapida

Posso cambiare dominio?
- Si. Cambia nel Caddyfile e nelle variabili VITE_API_URL e VITE_SOCKET_URL quando fai la build del frontend.
