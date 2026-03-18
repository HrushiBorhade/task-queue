# Build context: monorepo root
#   docker build -f apps/worker/Dockerfile .
#
# NOTE: bun install --production is broken with workspaces (oven-sh/bun#25804).
# Workaround: full install + manual removal of known devDeps.
# Revisit when Bun fixes workspace-scoped --production.

FROM oven/bun:1.2.5-alpine
WORKDIR /app

# ── Layer 1: Workspace manifests (cached unless deps change) ──
# All workspace package.json files are needed for lockfile resolution,
# even though we only run the worker.
COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY apps/trigger/package.json apps/trigger/

# ── Layer 2: Install all dependencies ──
# --production is broken with workspaces (oven-sh/bun#25804), so we
# install everything and then prune devDeps manually below.
RUN bun install --frozen-lockfile

# ── Layer 3: Source code (only worker + shared) ──
COPY packages/shared/ packages/shared/
COPY apps/worker/ apps/worker/
COPY tsconfig.json ./

# ── Layer 4: Prune devDependencies that aren't needed at runtime ──
# This saves ~30-40 MB. Remove this block when Bun fixes #25804.
RUN rm -rf \
    node_modules/@types \
    node_modules/drizzle-kit \
    node_modules/pino-pretty \
    node_modules/typescript \
    node_modules/@esbuild \
    node_modules/@libsql

EXPOSE 9090 9091 9092

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:9090/health || exit 1

USER bun
WORKDIR /app/apps/worker
CMD ["bun", "run", "src/index.ts"]
