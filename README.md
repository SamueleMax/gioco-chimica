# Gioco Indicatori pH (MVP)

MVP per un gioco in tempo reale a 2 giocatori sugli indicatori di pH, con classifica e pannello admin. UI in italiano, progettata per uso in classe.

## Stack
- Backend: Node.js + TypeScript, Fastify, Socket.IO, pg (no ORM)
- Frontend: React + Vite + TypeScript, Socket.IO client
- DB: PostgreSQL in Docker
- Migrazioni: dbmate

## Avvio rapido (Docker Compose)
1. Copia le variabili d'ambiente:
   - `cp .env.example .env`
2. Avvia tutto:
   - `docker compose up --build`
3. Apri:
   - Frontend: http://localhost:5173
   - Backend: http://localhost:3000

Per testare il gioco, apri due schede del browser con nickname diversi.

## Sviluppo locale (senza Docker)
> Richiede un PostgreSQL locale e `DATABASE_URL` impostato.

Backend:
- `cd backend`
- `npm install`
- `npm run dev`

Frontend:
- `cd frontend`
- `npm install`
- `npm run dev`

## Variabili d'ambiente
- `DATABASE_URL` (backend + dbmate)
- `ADMIN_PIN` (admin PIN)
- `VITE_API_URL` (frontend)
- `VITE_SOCKET_URL` (frontend)

## Migrazioni (dbmate)
Le migrazioni sono in `backend/db/migrations` e vengono applicate automaticamente all'avvio del backend via Docker.

Comandi utili (da dentro il container backend):
- Crea una nuova migrazione:
  - `dbmate new <nome_migrazione>`
- Applica le migrazioni:
  - `dbmate up`
- Reset DB in sviluppo:
  - `dbmate drop`
  - `dbmate up`

## Seed indicatori
I dati sono in `backend/db/seed/indicators.json`.

Esegui il seed (idempotente):
- `cd backend`
- `npm run seed`

In Docker:
- `docker compose exec backend npm run seed`

## Note di gioco
- P1 sceglie un pH segreto (0-14)
- P2 chiede un indicatore e P1 risponde con ACIDO / INTERMEDIO / BASICO
- Le penalita sono applicate dal server
- La classifica si aggiorna solo a fine partita

## Note sviluppo UI
Aggiornamenti recenti:
- HUD di gioco con punteggi, ruolo, domande e connessione.
- Overlay con priorita (attesa, disconnessione, retry) e toast non invasivi.
- Validazione pH inline (bordo rosso + messaggio).

Come testare:
- Apri due schede e avvia un Quick Match.
- Verifica: attese, turni, overlay di retry, fine partita.
- Verifica validazione pH (input e pulsanti disabilitati).
- Facoltativo: imposta `VITE_DEBUG=true` per il pannello debug in basso a sinistra.
