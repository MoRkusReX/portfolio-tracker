# Builds a container that serves the app and persists SQLite data under /app/data.
FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV PORT=5500
ENV HOST=0.0.0.0
ENV DB_PATH=/app/data/portfolio-tracker.db

EXPOSE 5500

CMD ["npm", "start"]
