# Static ffmpeg: one self-contained binary (~tens of MB) instead of apt's ffmpeg +
# shared libs (~100+MB compressed, which pushed the image past the DOCR quota).
# Version pinned to match what the filtergraph was validated against (8.1.1).
FROM mwader/static-ffmpeg:8.1.1 AS ffmpeg

# Nancy bot — single long-running Bun process (HTTP server + deposit watcher).
# Built for DigitalOcean App Platform (and any container host). Bun runs the
# TypeScript directly, so there is no separate build step.
FROM oven/bun:1.3.13

WORKDIR /app

# Only ffmpeg is needed at runtime (voiceVideoService.render). ffprobe is test-only,
# so it stays out of the production image. Copied early so the layer caches.
COPY --from=ffmpeg /ffmpeg /usr/local/bin/ffmpeg

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
