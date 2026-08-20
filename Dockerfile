# syntax=docker/dockerfile:1

# --- deps: install everything once, cached as its own layer -----------------
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# better-sqlite3 ships prebuilt binaries for linux-x64/glibc, so node:22-slim
# (Debian) installs without a compiler toolchain.
RUN npm ci

# --- builder: compile the Next.js app ---------------------------------------
FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- runner: only the standalone server, no sources or dev tooling ----------
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3100
ENV HOSTNAME=0.0.0.0
# The DB buckets transfers by *local* time — keep the server on the operator's
# clock so "today" means the Myanmar day, not a UTC one.
ENV TZ=Asia/Yangon
RUN apt-get update \
    && apt-get install -y --no-install-recommends tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 1001 nodejs \
    && useradd -u 1001 -g nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Backup helper (runs via `fly ssh console`); needs nothing beyond the
# standalone tree's own node_modules.
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

USER nextjs
EXPOSE 3100
CMD ["node", "server.js"]
