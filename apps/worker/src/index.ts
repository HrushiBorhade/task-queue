import { QueueEvents, type Worker } from "bullmq";
import { QUEUE_CONFIGS, REDIS_CONNECTION } from "@repo/shared";
import type { QueueConfig } from "@repo/shared";
import { logger } from "./lib/logger";
import { createTextGenWorker } from "./workers/text-gen.worker";
import { createImageGenWorker } from "./workers/image-gen.worker";
import { createResearchWorker } from "./workers/research.worker";
import { createEmailWorker } from "./workers/email.worker";
import { createPdfReportWorker } from "./workers/pdf-report.worker";
import { createWebhookWorker } from "./workers/webhook.worker";
import { createDataAggWorker } from "./workers/data-agg.worker";
import { startHealthServer, stopHealthServer } from "./health";
import {
  startMetricsServer,
  stopMetricsServer,
  taskCompletedTotal,
  taskFailedTotal,
  taskDuration,
} from "./lib/metrics";
import { startBullBoard, stopBullBoard } from "./bull-board";
import { startAlerting, stopAlerting } from "./lib/alerting";
import { syncSchedules, createSchedulerWorker, closeSchedulerQueue } from "./lib/scheduler";
import { closeEnqueueQueues } from "./lib/enqueue";
import { SCHEDULER_QUEUE } from "@repo/shared";

// ── Validate required env vars ───────────────────────
const REQUIRED_ENV = ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "REDIS_HOST"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    logger.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

// ── Create all workers ─────────────────────────────────
const schedulerWorker = createSchedulerWorker();

const workers = [
  createTextGenWorker(),
  createImageGenWorker(),
  createResearchWorker(),
  createEmailWorker(),
  createPdfReportWorker(),
  createWebhookWorker(),
  createDataAggWorker(),
  schedulerWorker,
];

// ── QueueEvents for stalled/failed detection ───────────
const queueEvents: QueueEvents[] = [];

const allQueueNames = [
  ...Object.values(QUEUE_CONFIGS).map((c) => (c as QueueConfig).name),
  SCHEDULER_QUEUE,
];

for (const queueName of allQueueNames) {
  const events = new QueueEvents(queueName, {
    connection: REDIS_CONNECTION,
  });

  events.on("completed", ({ jobId, returnvalue }) => {
    logger.info({ queue: queueName, jobId }, "Job completed");
  });

  events.on("stalled", ({ jobId }) => {
    logger.warn({ queue: queueName, jobId }, "Job stalled");
  });

  events.on("failed", ({ jobId, failedReason }) => {
    logger.error({ queue: queueName, jobId, failedReason }, "Job failed");
  });

  queueEvents.push(events);
}

// ── Attach metrics handlers ────────────────────────────
function attachWorkerHandlers(worker: Worker, queueName: string): void {
  worker.on("completed", (job) => {
    taskCompletedTotal.inc({ queue: queueName });
    if (job.processedOn && job.finishedOn) {
      const durationSec = (job.finishedOn - job.processedOn) / 1000;
      taskDuration.observe({ queue: queueName }, durationSec);
    }
  });
  worker.on("failed", (job) => {
    taskFailedTotal.inc({ queue: queueName });
    if (job?.processedOn && job.finishedOn) {
      const durationSec = (job.finishedOn - job.processedOn) / 1000;
      taskDuration.observe({ queue: queueName }, durationSec);
    }
  });
}

for (const w of workers) {
  attachWorkerHandlers(w, w.name);
}

// ── Start services ─────────────────────────────────────
startHealthServer();
startMetricsServer();
startBullBoard();
startAlerting();

// Sync enabled schedules from DB → BullMQ on startup
syncSchedules().catch((err) => {
  logger.error({ err }, "Failed to sync schedules on startup");
});

// ── Log startup ────────────────────────────────────────
logger.info("Worker process started");
for (const w of workers) {
  logger.info({ queue: w.name, concurrency: w.opts.concurrency }, "Worker registered");
}

// ── Graceful shutdown ──────────────────────────────────
async function shutdown() {
  logger.info("Shutting down...");

  stopAlerting();

  const results = await Promise.allSettled([
    ...workers.map((w) => w.close()),
    ...queueEvents.map((e) => e.close()),
    closeSchedulerQueue(),
    closeEnqueueQueues(),
    stopHealthServer(),
    stopMetricsServer(),
    stopBullBoard(),
  ]);

  for (const r of results) {
    if (r.status === "rejected") {
      logger.error({ reason: String(r.reason) }, "Shutdown item failed");
    }
  }

  logger.info("All workers and event listeners shut down");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
