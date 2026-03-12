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
} from "./lib/metrics";
import { startBullBoard, stopBullBoard } from "./bull-board";
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

// ── QueueEvents for stalled/failed detection ───────────
const queueEvents: QueueEvents[] = [];

for (const config of Object.values(QUEUE_CONFIGS) as QueueConfig[]) {
  const events = new QueueEvents(config.name, {
    connection: REDIS_CONNECTION,
  });

  events.on("stalled", ({ jobId }) => {
    logger.warn({ queue: config.name, jobId }, "Job stalled");
  });

  events.on("failed", ({ jobId, failedReason }) => {
    logger.error({ queue: config.name, jobId, failedReason }, "Job failed");
  });

  queueEvents.push(events);
}

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

// ── Start services ─────────────────────────────────────
startHealthServer();
startMetricsServer();
startBullBoard();
startAlerting();

// ── Log startup ────────────────────────────────────────
logger.info("Worker process started");
for (const w of workers) {
  logger.info({ queue: w.name, concurrency: w.opts.concurrency }, "Worker registered");
}

// ── Graceful shutdown ──────────────────────────────────
async function shutdown() {
  logger.info("Shutting down...");

  stopAlerting();

  await Promise.all([
    ...workers.map((w) => w.close()),
    ...queueEvents.map((e) => e.close()),
    stopHealthServer(),
    stopMetricsServer(),
    stopBullBoard(),
  ]);

  logger.info("All workers and event listeners shut down");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
