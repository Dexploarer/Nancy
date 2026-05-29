# Nancy bot — single long-running Bun process (HTTP server + deposit watcher).
# Built for DigitalOcean App Platform (and any container host). Bun runs the
# TypeScript directly, so there is no separate build step.
FROM oven/bun:1.3.13

WORKDIR /app

# Install deps first for layer caching. --frozen-lockfile fails if bun.lock drifts.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# App source (includes src/, db/, and certs/supabase-root-2021-ca.crt which the
# Postgres TLS pin reads at runtime). .dockerignore keeps .env and cruft out.
COPY . .

# App Platform routes to this port; the config reads HTTP_PORT. Override via env.
ENV HTTP_PORT=8080
EXPOSE 8080

# Run a single instance — the in-process pool mutex serializes money mutations
# in ONE process; do not scale this service horizontally without DB-level locks.
CMD ["bun", "src/index.ts"]
