#!/usr/bin/env bash
set -euo pipefail

cd /app/backend
export DBMATE_MIGRATIONS_DIR="${DBMATE_MIGRATIONS_DIR:-/app/backend/db/migrations}"

for i in {1..30}; do
  if dbmate up; then
    break
  fi
  echo "Database non pronta, riprovo..."
  sleep 1
  if [ "$i" -eq 30 ]; then
    echo "Errore: dbmate up fallito" >&2
    exit 1
  fi
done

npm run seed
node dist/backend/src/index.js
