# Build context: monorepo root
#   docker build -f apps/worker/Dockerfile .
#
# bun install --production is broken with workspaces (oven-sh/bun#25804).
# Workaround: full install in deps stage, prune devDeps, copy clean
# node_modules to final stage. Revisit when Bun fixes #25804.

# ── Stage 1: Install & prune ──
FROM oven/bun:1.2.5-alpine AS deps
WORKDIR /app

# All workspace package.json files needed for lockfile resolution
COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY apps/trigger/package.json apps/trigger/

RUN bun install --frozen-lockfile && \
    rm -rf node_modules/@types \
           node_modules/drizzle-kit \
           node_modules/pino-pretty \
           node_modules/typescript

# ── Stage 2: Production ──
FROM oven/bun:1.2.5-alpine
WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY packages/shared/ packages/shared/
COPY apps/worker/ apps/worker/
COPY tsconfig.json ./

EXPOSE 9090 9091 9092

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:9090/health || exit 1

USER bun
WORKDIR /app/apps/worker
CMD ["bun", "run", "src/index.ts"]
