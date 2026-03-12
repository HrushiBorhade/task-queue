import { Queue } from "bullmq";
import { createLogger } from "./logger";
import {
  Registry,
  collectDefaultMetrics,
  Gauge,
  Histogram,
  Counter,
} from "prom-client";
import { QUEUE_CONFIGS, REDIS_CONNECTION } from "@repo/shared";
import type { QueueConfig } from "@repo/shared";

const log = createLogger({ module: "metrics" });
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
      "delayed",
    );
    for (const [state, count] of Object.entries(counts)) {
      queueDepth.set({ queue: queue.name, state }, count);
    }
  }
}

// ── Bun HTTP server ────────────────────────────────────
let server: ReturnType<typeof Bun.serve> | null = null;

export function startMetricsServer(): void {
  server = Bun.serve({
    port: METRICS_PORT,
    fetch: async () => {
      try {
        await updateQueueDepthMetrics();
        return new Response(await register.metrics(), {
          headers: { "Content-Type": register.contentType },
        });
      } catch {
        return new Response("Error collecting metrics", { status: 500 });
      }
    },
  });

  log.info({ port: METRICS_PORT }, "Metrics server started");
}

export async function stopMetricsServer(): Promise<void> {
  await Promise.all(metricsQueues.map((q) => q.close()));
  server?.stop();
}
