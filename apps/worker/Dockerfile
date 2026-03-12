FROM oven/bun:1 AS base
WORKDIR /app

# Copy root workspace files
COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/
COPY apps/worker/package.json apps/worker/

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY packages/shared/ packages/shared/
COPY apps/worker/ apps/worker/

# Run worker
WORKDIR /app/apps/worker
CMD ["bun", "run", "src/index.ts"]
