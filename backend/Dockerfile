FROM node:20-bullseye-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm install

COPY backend ./
COPY shared /app/shared

RUN chmod +x scripts/entrypoint.sh

RUN curl -fsSL https://github.com/amacneil/dbmate/releases/download/v2.12.0/dbmate-linux-amd64 \
  -o /usr/local/bin/dbmate \
  && chmod +x /usr/local/bin/dbmate

RUN npm run build

EXPOSE 3000

CMD ["bash", "scripts/entrypoint.sh"]
