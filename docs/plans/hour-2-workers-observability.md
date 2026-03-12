# Hour 2: All Workers + Observability (Steps 11-16)

## Prerequisites
- Hour 1 complete (local Supabase, Drizzle schema, worker DB, text-gen wired, ProgressTracker)
- Redis + Supabase running locally

---

## Step 11: Remaining 6 Workers + QueueEvents + Graceful Shutdown

### Why
We have 7 task types but only 1 worker. Each worker follows the same pattern: mark active → do work → broadcast progress → mark completed → handle batch. For the curriculum, all workers simulate work (no real AI calls yet). QueueEvents provides global listeners for stalled/failed jobs across all queues.

### Create remaining workers

Each worker file follows the same template. Create these files:

**`apps/worker/src/workers/image-gen.worker.ts`**:
```typescript
import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { QUEUE_CONFIGS, REDIS_CONNECTION, tasks } from "@repo/shared";
import type { TaskJobPayload } from "@repo/shared";
import { db } from "../lib/db";
import { supabase } from "../lib/supabase";
import { ProgressTracker } from "../utils/progress";

export function createImageGenWorker() {
  const config = QUEUE_CONFIGS.image_gen;

  return new Worker<TaskJobPayload>(
    config.name,
    async (job) => {
      const { taskId, input } = job.data;
      const tracker = new ProgressTracker(taskId);

      try {
        // Mark active
        const [task] = await db
          .update(tasks)
          .set({
            status: "active",
            attempt: job.attemptsMade + 1,
            startedAt: new Date(),
            bullmqJobId: job.id,
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, taskId))
          .returning();

        const batchId = task?.batchId ?? null;

        await tracker.broadcastStep("Starting image generation");
        tracker.updateProgress(20);

        // Simulate image generation
        await new Promise((r) => setTimeout(r, 3_000));
        tracker.updateProgress(80);

        const result = `https://placeholder.example/generated-${taskId}.png`;

        // Mark completed
        await db
          .update(tasks)
          .set({
            status: "completed",
            progress: 100,
            output: { result },
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, taskId));

        if (batchId) {
          await supabase.rpc("increment_batch_completed", {
            p_batch_id: batchId,
          });
        }

        return { result };
      } catch (error) {
        await db
          .update(tasks)
          .set({
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, taskId));

        throw error;
      } finally {
        await tracker.destroy();
      }
    },
    {
      connection: REDIS_CONNECTION,
      concurrency: config.concurrency,
      limiter: config.rateLimit,
    }
  );
}
```

**Create the same pattern for:**
- `apps/worker/src/workers/research.worker.ts` — `createResearchWorker()`, uses `QUEUE_CONFIGS.research_agent`
- `apps/worker/src/workers/email.worker.ts` — `createEmailWorker()`, uses `QUEUE_CONFIGS.email_campaign`
- `apps/worker/src/workers/pdf-report.worker.ts` — `createPdfReportWorker()`, uses `QUEUE_CONFIGS.pdf_report`
- `apps/worker/src/workers/webhook.worker.ts` — `createWebhookWorker()`, uses `QUEUE_CONFIGS.webhook_processing`
- `apps/worker/src/workers/data-agg.worker.ts` — `createDataAggWorker()`, uses `QUEUE_CONFIGS.data_aggregation`

Each one differs only in:
1. The config key (`QUEUE_CONFIGS.xxx`)
2. The simulated work duration
3. The simulated output

### Add QueueEvents listeners + rewrite index.ts

**`apps/worker/src/index.ts`**:

```typescript
import { QueueEvents } from "bullmq";
import { QUEUE_CONFIGS, REDIS_CONNECTION } from "@repo/shared";
import type { QueueConfig } from "@repo/shared";
import { createTextGenWorker } from "./workers/text-gen.worker";
import { createImageGenWorker } from "./workers/image-gen.worker";
import { createResearchWorker } from "./workers/research.worker";
import { createEmailWorker } from "./workers/email.worker";
import { createPdfReportWorker } from "./workers/pdf-report.worker";
import { createWebhookWorker } from "./workers/webhook.worker";
import { createDataAggWorker } from "./workers/data-agg.worker";

// ── Create all workers ─────────────────────────────────
const workers = [
  createTextGenWorker(),
  createImageGenWorker(),
  createResearchWorker(),
  createEmailWorker(),
  createPdfReportWorker(),
  createWebhookWorker(),
  createDataAggWorker(),
];

// ── QueueEvents for stalled/failed detection ───────────
const queueEvents: QueueEvents[] = [];

for (const config of Object.values(QUEUE_CONFIGS) as QueueConfig[]) {
  const events = new QueueEvents(config.name, {
    connection: REDIS_CONNECTION,
  });

  events.on("stalled", ({ jobId }) => {
    console.warn(`[${config.name}] Job ${jobId} stalled`);
  });

  events.on("failed", ({ jobId, failedReason }) => {
    console.error(`[${config.name}] Job ${jobId} failed: ${failedReason}`);
  });

  queueEvents.push(events);
}

// ── Log startup ────────────────────────────────────────
console.log("Worker process started");
for (const w of workers) {
  console.log(`  ${w.name}: concurrency=${w.opts.concurrency}`);
}

// ── Graceful shutdown ──────────────────────────────────
async function shutdown() {
  console.log("Shutting down...");

  await Promise.all([
    ...workers.map((w) => w.close()),
    ...queueEvents.map((e) => e.close()),
  ]);

  console.log("All workers and event listeners shut down");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
```

### Verification
```bash
bunx tsc --noEmit -p apps/worker/tsconfig.json
```

### Learning concepts
- **QueueEvents vs Worker events**: QueueEvents listens globally via Redis pub/sub. Worker events are local to that worker instance. Use QueueEvents for monitoring, Worker events for metrics.
- **Stalled jobs**: A job is "stalled" when a worker takes too long and BullMQ thinks it died. The lock expires and another worker can pick it up.
- **Parallel shutdown**: `Promise.all` closes everything concurrently — faster than sequential.

---

## Step 12: Health Check Server (:9090)

### Why
Docker/Kubernetes needs a way to know if the worker process is alive and can reach Redis. A simple HTTP endpoint that pings Redis serves as a liveness probe.

### Create health.ts

**`apps/worker/src/health.ts`**:

```typescript
import { createServer, type Server } from "node:http";
import { Queue } from "bullmq";
import { REDIS_CONNECTION } from "@repo/shared";

const HEALTH_PORT = Number(process.env.HEALTH_PORT ?? 9090);

// Dedicated queue just for health checks
const pingQueue = new Queue("_health", { connection: REDIS_CONNECTION });

let server: Server;

export function startHealthServer(): void {
  server = createServer(async (_req, res) => {
    try {
      const client = await pingQueue.client;
      await client.ping();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
    } catch {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "error", message: "Redis unreachable" }));
    }
  });

  server.listen(HEALTH_PORT, () => {
    console.log(`Health check server on :${HEALTH_PORT}`);
  });
}

export async function stopHealthServer(): Promise<void> {
  await pingQueue.close();
  server?.close();
}
```

### Wire into index.ts

Add to the imports and startup:

```typescript
import { startHealthServer, stopHealthServer } from "./health";

// After creating workers:
startHealthServer();

// In shutdown():
await Promise.all([
  ...workers.map((w) => w.close()),
  ...queueEvents.map((e) => e.close()),
  stopHealthServer(),
]);
```

### Verification
```bash
# Start worker, then:
curl http://localhost:9090
# Should return: {"status":"ok"}
```

### Learning concepts
- **Liveness probe**: K8s hits this endpoint every N seconds. If it fails 3 times, K8s restarts the pod.
- **Why a Queue for ping?**: BullMQ's `Queue.client` gives the underlying ioredis connection. Calling `.ping()` is the simplest Redis health check.
- **Port convention**: 9090 for health, 9091 for admin UI, 9092 for metrics — keeps them separate.

---

## Step 13: Prometheus Metrics (:9092)

### Why
Prometheus scrapes a `/metrics` endpoint to collect time-series data. We expose: queue depths, task durations, completed/failed counts. Grafana dashboards read from Prometheus.

### Install prom-client
```bash
cd /Users/hrushiborhade/Developer/task-queue
bun add prom-client --filter worker
```

### Create metrics.ts

**`apps/worker/src/lib/metrics.ts`**:

```typescript
import { createServer, type Server } from "node:http";
import { Queue } from "bullmq";
import {
  Registry,
  collectDefaultMetrics,
  Gauge,
  Histogram,
  Counter,
} from "prom-client";
import { QUEUE_CONFIGS, REDIS_CONNECTION } from "@repo/shared";
import type { QueueConfig } from "@repo/shared";

const METRICS_PORT = Number(process.env.METRICS_PORT ?? 9092);

const register = new Registry();
collectDefaultMetrics({ register });

// ── Metrics ────────────────────────────────────────────
const queueDepth = new Gauge({
  name: "queue_depth",
  help: "Number of jobs in each state per queue",
  labelNames: ["queue", "state"] as const,
  registers: [register],
});

export const taskDuration = new Histogram({
  name: "task_duration_seconds",
  help: "Time to process a task",
  labelNames: ["queue"] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [register],
});

export const taskCompletedTotal = new Counter({
  name: "task_completed_total",
  help: "Total completed tasks",
  labelNames: ["queue"] as const,
  registers: [register],
});

export const taskFailedTotal = new Counter({
  name: "task_failed_total",
  help: "Total failed tasks",
  labelNames: ["queue"] as const,
  registers: [register],
});

// ── Queue depth sampling ───────────────────────────────
const metricsQueues: Queue[] = [];

async function updateQueueDepthMetrics(): Promise<void> {
  // Lazy-init queues for each config
  if (metricsQueues.length === 0) {
    for (const config of Object.values(QUEUE_CONFIGS) as QueueConfig[]) {
      metricsQueues.push(new Queue(config.name, { connection: REDIS_CONNECTION }));
    }
  }

  for (const queue of metricsQueues) {
    const counts = await queue.getJobCounts(
      "waiting",
      "active",
      "completed",
      "failed",
      "delayed"
    );
    for (const [state, count] of Object.entries(counts)) {
      queueDepth.set({ queue: queue.name, state }, count);
    }
  }
}

// ── HTTP server ────────────────────────────────────────
let server: Server;

export function startMetricsServer(): void {
  server = createServer(async (_req, res) => {
    try {
      await updateQueueDepthMetrics();
      res.writeHead(200, { "Content-Type": register.contentType });
      res.end(await register.metrics());
    } catch {
      res.writeHead(500);
      res.end("Error collecting metrics");
    }
  });

  server.listen(METRICS_PORT, () => {
    console.log(`Metrics server on :${METRICS_PORT}`);
  });
}

export async function stopMetricsServer(): Promise<void> {
  await Promise.all(metricsQueues.map((q) => q.close()));
  server?.close();
}
```

### Attach worker event handlers in index.ts

Add a helper function and call it for each worker:

```typescript
import {
  startMetricsServer,
  stopMetricsServer,
  taskCompletedTotal,
  taskFailedTotal,
  taskDuration,
} from "./lib/metrics";

function attachWorkerHandlers(worker: Worker, queueName: string): void {
  worker.on("completed", (_job, _result) => {
    taskCompletedTotal.inc({ queue: queueName });
  });

  worker.on("failed", (_job, _error) => {
    taskFailedTotal.inc({ queue: queueName });
  });
}

// After creating workers:
for (const w of workers) {
  attachWorkerHandlers(w, w.name);
}

startMetricsServer();
```

### Verification
```bash
curl http://localhost:9092/metrics
# Should show Prometheus text format with queue_depth, task_completed_total, etc.
```

### Learning concepts
- **Registry**: Holds all metrics. `collectDefaultMetrics` adds Node.js runtime metrics (memory, CPU, event loop).
- **Gauge vs Counter vs Histogram**: Gauge goes up/down (queue depth), Counter only increments (total tasks), Histogram tracks distributions (duration).
- **On-scrape refresh**: Queue depths are sampled when Prometheus scrapes, not on every job event. This avoids hammering Redis.
- **`labelNames: ["queue"] as const`**: TypeScript needs `as const` for type-safe label names.

---

## Step 14: Bull Board Admin UI (:9091)

### Why
Bull Board gives a web UI to inspect queues, retry failed jobs, and see job data. Essential for debugging.

### Install dependencies
```bash
cd /Users/hrushiborhade/Developer/task-queue
bun add @bull-board/api @bull-board/express express --filter worker
bun add @types/express --filter worker --dev
```

Note: `@bull-board/express` uses Express as the HTTP server. For Bun, Express works fine via `bun run`.

### Create bull-board.ts

**`apps/worker/src/bull-board.ts`**:

```typescript
import { Queue } from "bullmq";
import express from "express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { QUEUE_CONFIGS, REDIS_CONNECTION } from "@repo/shared";
import type { QueueConfig } from "@repo/shared";

const BULL_BOARD_PORT = Number(process.env.BULL_BOARD_PORT ?? 9091);

// Create inspection-only queues (separate from worker queues)
const boardQueues: Queue[] = [];
for (const config of Object.values(QUEUE_CONFIGS) as QueueConfig[]) {
  boardQueues.push(new Queue(config.name, { connection: REDIS_CONNECTION }));
}

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

createBullBoard({
  queues: boardQueues.map((q) => new BullMQAdapter(q)),
  serverAdapter,
});

const app = express();
app.use("/admin/queues", serverAdapter.getRouter());

let server: ReturnType<typeof app.listen>;

export function startBullBoard(): void {
  server = app.listen(BULL_BOARD_PORT, () => {
    console.log(`Bull Board UI on :${BULL_BOARD_PORT}/admin/queues`);
  });
}

export async function stopBullBoard(): Promise<void> {
  await Promise.all(boardQueues.map((q) => q.close()));
  server?.close();
}
```

### Wire into index.ts

```typescript
import { startBullBoard, stopBullBoard } from "./bull-board";

// After creating workers:
startBullBoard();

// In shutdown:
stopBullBoard();
```

### Verification
```bash
# Start worker, then open:
open http://localhost:9091/admin/queues
```

### Learning concepts
- **Inspection-only queues**: Bull Board creates its own Queue instances to read job data. These are separate from the worker's queues.
- **ExpressAdapter**: Bull Board supports multiple HTTP frameworks. Express is the most common.
- **basePath**: `/admin/queues` is the route prefix for the UI.

---

## Step 15: Anomaly Alerting (60s checks)

### Why
Passive monitoring (metrics) tells you what happened. Active alerting tells you something is wrong NOW. We check every 60 seconds for: high queue depth, high failure rate, growing queues, and zero throughput.

### Create alerting.ts

**`apps/worker/src/lib/alerting.ts`**:

```typescript
import { Queue } from "bullmq";
import { QUEUE_CONFIGS, REDIS_CONNECTION } from "@repo/shared";
import type { QueueConfig } from "@repo/shared";

const CHECK_INTERVAL_MS = 60_000;
const ALERT_COOLDOWN_MS = 5 * 60_000; // Don't repeat same alert within 5 min

interface QueueSnapshot {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

const alertCooldowns = new Map<string, number>();
const previousSnapshots = new Map<string, QueueSnapshot>();

async function getQueueSnapshot(name: string): Promise<QueueSnapshot> {
  const queue = new Queue(name, { connection: REDIS_CONNECTION });
  try {
    const counts = await queue.getJobCounts(
      "waiting",
      "active",
      "completed",
      "failed",
      "delayed",
      "paused"
    );
    return { name, ...counts };
  } finally {
    await queue.close();
  }
}

function sendAlert(
  title: string,
  details: string,
  severity: "warning" | "critical"
): void {
  const key = `${title}`;
  const now = Date.now();
  const lastAlert = alertCooldowns.get(key);

  if (lastAlert && now - lastAlert < ALERT_COOLDOWN_MS) return;
  alertCooldowns.set(key, now);

  if (severity === "critical") {
    console.error(`[ALERT:${severity}] ${title} — ${details}`);
  } else {
    console.warn(`[ALERT:${severity}] ${title} — ${details}`);
  }

  // Optional: send to Slack webhook
  if (process.env.SLACK_WEBHOOK_URL) {
    fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `[${severity.toUpperCase()}] ${title}\n${details}`,
      }),
    }).catch(() => {}); // Fire-and-forget
  }
}

async function checkQueues(): Promise<void> {
  for (const config of Object.values(QUEUE_CONFIGS) as QueueConfig[]) {
    const snapshot = await getQueueSnapshot(config.name);
    const previous = previousSnapshots.get(config.name);

    // Check 1: High queue depth
    if (snapshot.waiting > 50) {
      sendAlert(
        `High queue depth: ${config.name}`,
        `${snapshot.waiting} jobs waiting`,
        "warning"
      );
    }

    // Check 2: High failure rate
    if (previous) {
      const newFailed = snapshot.failed - previous.failed;
      const newCompleted = snapshot.completed - previous.completed;
      const total = newFailed + newCompleted;
      if (total > 0 && newFailed / total > 0.1) {
        sendAlert(
          `High failure rate: ${config.name}`,
          `${newFailed}/${total} jobs failed in last check`,
          "critical"
        );
      }
    }

    // Check 3: Growing queue (workers can't keep up)
    if (previous && snapshot.waiting > previous.waiting && snapshot.waiting > 10) {
      sendAlert(
        `Growing queue: ${config.name}`,
        `${previous.waiting} → ${snapshot.waiting} waiting`,
        "warning"
      );
    }

    // Check 4: Zero throughput with waiting jobs
    if (previous && snapshot.waiting > 0) {
      const throughput =
        (snapshot.completed - previous.completed) +
        (snapshot.failed - previous.failed);
      if (throughput === 0) {
        sendAlert(
          `Zero throughput: ${config.name}`,
          `${snapshot.waiting} jobs waiting but no progress`,
          "critical"
        );
      }
    }

    previousSnapshots.set(config.name, snapshot);
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startAlerting(): void {
  // Wait 30s before first check (let workers start up)
  setTimeout(() => {
    checkQueues();
    timer = setInterval(checkQueues, CHECK_INTERVAL_MS);
  }, 30_000);
  console.log("Alerting started (first check in 30s, then every 60s)");
}

export function stopAlerting(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
```

### Wire into index.ts

```typescript
import { startAlerting, stopAlerting } from "./lib/alerting";

// After creating workers:
startAlerting();

// In shutdown:
stopAlerting();
```

### Learning concepts
- **Alert cooldown**: Prevents the same alert from firing every 60s — 5-minute cooldown per issue.
- **Historical comparison**: Compare current vs previous snapshot to detect trends (failure rate, growing queues).
- **Fire-and-forget Slack**: If the webhook fails, we don't want to crash the alerting loop.
- **30s delay on startup**: Workers need time to start processing before we check for "zero throughput."

---

## Step 16: Deploy Worker (Dockerfile + fly.io/Railway)

### Why
The worker process needs to run on a server with access to Redis and Postgres. A Dockerfile makes it portable.

### Create Dockerfile

**`apps/worker/Dockerfile`**:

```dockerfile
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
```

### Create .dockerignore

**`apps/worker/.dockerignore`**:

```
node_modules
.env
```

### Environment variables for deployment
```
DATABASE_URL=postgresql://...
REDIS_HOST=...
REDIS_PORT=6379
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
HEALTH_PORT=9090
BULL_BOARD_PORT=9091
METRICS_PORT=9092
```

### Deploy to Railway (example)
```bash
# Install Railway CLI
brew install railwayapp/railway/railway

# Login and init
railway login
railway init

# Set environment variables
railway variables set DATABASE_URL=...
railway variables set REDIS_HOST=...
# ... etc

# Deploy
railway up
```

### Learning concepts
- **Multi-stage awareness**: This Dockerfile is single-stage for simplicity. Production Dockerfiles often use multi-stage to reduce image size.
- **Workspace-aware COPY**: We copy `packages/shared` because the worker depends on it.
- **`bun install --frozen-lockfile`**: Ensures reproducible installs (like `npm ci`).
- **Port exposure**: Health/metrics/Bull Board ports need to be exposed in your hosting config.

---

## Step 11-16 Final index.ts

Here's the complete `apps/worker/src/index.ts` after all steps:

```typescript
import { QueueEvents, Worker } from "bullmq";
import { QUEUE_CONFIGS, REDIS_CONNECTION } from "@repo/shared";
import type { QueueConfig } from "@repo/shared";

import { createTextGenWorker } from "./workers/text-gen.worker";
import { createImageGenWorker } from "./workers/image-gen.worker";
import { createResearchWorker } from "./workers/research.worker";
import { createEmailWorker } from "./workers/email.worker";
import { createPdfReportWorker } from "./workers/pdf-report.worker";
import { createWebhookWorker } from "./workers/webhook.worker";
import { createDataAggWorker } from "./workers/data-agg.worker";

import { startHealthServer, stopHealthServer } from "./health";
import { startBullBoard, stopBullBoard } from "./bull-board";
import {
  startMetricsServer,
  stopMetricsServer,
  taskCompletedTotal,
  taskFailedTotal,
} from "./lib/metrics";
import { startAlerting, stopAlerting } from "./lib/alerting";

// ── Create all workers ─────────────────────────────────
const workers = [
  createTextGenWorker(),
  createImageGenWorker(),
  createResearchWorker(),
  createEmailWorker(),
  createPdfReportWorker(),
  createWebhookWorker(),
  createDataAggWorker(),
];

// ── Attach metrics handlers ────────────────────────────
function attachWorkerHandlers(worker: Worker, queueName: string): void {
  worker.on("completed", () => {
    taskCompletedTotal.inc({ queue: queueName });
  });
  worker.on("failed", () => {
    taskFailedTotal.inc({ queue: queueName });
  });
}

for (const w of workers) {
  attachWorkerHandlers(w, w.name);
}

// ── QueueEvents for stalled/failed detection ───────────
const queueEvents: QueueEvents[] = [];

for (const config of Object.values(QUEUE_CONFIGS) as QueueConfig[]) {
  const events = new QueueEvents(config.name, { connection: REDIS_CONNECTION });

  events.on("stalled", ({ jobId }) => {
    console.warn(`[${config.name}] Job ${jobId} stalled`);
  });

  events.on("failed", ({ jobId, failedReason }) => {
    console.error(`[${config.name}] Job ${jobId} failed: ${failedReason}`);
  });

  queueEvents.push(events);
}

// ── Start services ─────────────────────────────────────
startHealthServer();
startBullBoard();
startMetricsServer();
startAlerting();

// ── Log startup ────────────────────────────────────────
console.log("Worker process started");
for (const w of workers) {
  console.log(`  ${w.name}: concurrency=${w.opts.concurrency}`);
}

// ── Graceful shutdown (with timeout) ───────────────────
async function shutdown() {
  console.log("Shutting down...");

  stopAlerting();

  // K8s sends SIGTERM, waits 30s, then kills. Match that timeout.
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Shutdown timeout")), 30_000)
  );

  try {
    await Promise.race([
      Promise.all([
        ...workers.map((w) => w.close()),
        ...queueEvents.map((e) => e.close()),
        stopHealthServer(),
        stopBullBoard(),
        stopMetricsServer(),
      ]),
      timeout,
    ]);
    console.log("All workers and services shut down");
  } catch (err) {
    console.error("Forced shutdown:", err);
  }

  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
```
