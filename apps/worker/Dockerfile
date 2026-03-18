# Build context must be the monorepo root:
#   docker build -f apps/worker/Dockerfile .

FROM oven/bun:1-alpine AS base
WORKDIR /app

# Copy ALL workspace manifests so bun.lock resolves correctly
# (lockfile references all workspaces, not just worker)
COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY apps/trigger/package.json apps/trigger/

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY packages/shared/ packages/shared/
COPY apps/worker/ apps/worker/
COPY tsconfig.json ./

EXPOSE 9090 9091 9092

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:9090/health || exit 1

USER bun
WORKDIR /app/apps/worker
CMD ["bun", "run", "src/index.ts"]
