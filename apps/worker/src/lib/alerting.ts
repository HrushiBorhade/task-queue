import { Queue } from "bullmq";
import { QUEUE_CONFIGS, REDIS_CONNECTION } from "@repo/shared";
import type { QueueConfig } from "@repo/shared";
import { createLogger } from "./logger";

const log = createLogger({ module: "alerting" });

const CHECK_INTERVAL_MS = 60_000;
const ALERT_COOLDOWN_MS = 5 * 60_000;

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
      "waiting", "active", "completed", "failed", "delayed", "paused",
    );
    return {
      name,
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      delayed: counts.delayed ?? 0,
      paused: counts.paused ?? 0,
    };
  } finally {
    await queue.close();
  }
}

function sendAlert(title: string, details: string, severity: "warning" | "critical"): void {
  const now = Date.now();
  const lastAlert = alertCooldowns.get(title);
  if (lastAlert && now - lastAlert < ALERT_COOLDOWN_MS) return;
  alertCooldowns.set(title, now);

  if (severity === "critical") {
    log.error({ severity, title, details }, "Alert triggered");
  } else {
    log.warn({ severity, title, details }, "Alert triggered");
  }

  if (process.env.SLACK_WEBHOOK_URL) {
    fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `[${severity.toUpperCase()}] ${title}\n${details}`,
      }),
    }).catch(() => {});
  }
}

async function checkQueues(): Promise<void> {
  for (const config of Object.values(QUEUE_CONFIGS) as QueueConfig[]) {
    const snapshot = await getQueueSnapshot(config.name);
    const previous = previousSnapshots.get(config.name);

    if (snapshot.waiting > 50) {
      sendAlert(
        `High queue depth: ${config.name}`,
        `${snapshot.waiting} jobs waiting`,
        "warning",
      );
    }

    if (previous) {
      const newFailed = snapshot.failed - previous.failed;
      const newCompleted = snapshot.completed - previous.completed;
      const total = newFailed + newCompleted;
      if (total > 0 && newFailed / total > 0.1) {
        sendAlert(
          `High failure rate: ${config.name}`,
          `${newFailed}/${total} jobs failed in last check`,
          "critical",
        );
      }
    }

    if (previous && snapshot.waiting > previous.waiting && snapshot.waiting > 10) {
      sendAlert(
        `Growing queue: ${config.name}`,
        `${previous.waiting} → ${snapshot.waiting} waiting`,
        "warning",
      );
    }

    if (previous && snapshot.waiting > 0) {
      const throughput =
        (snapshot.completed - previous.completed) +
        (snapshot.failed - previous.failed);
      if (throughput === 0) {
        sendAlert(
          `Zero throughput: ${config.name}`,
          `${snapshot.waiting} jobs waiting but no progress`,
          "critical",
        );
      }
    }

    previousSnapshots.set(config.name, snapshot);
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startAlerting(): void {
  setTimeout(() => {
    checkQueues();
    timer = setInterval(checkQueues, CHECK_INTERVAL_MS);
  }, 30_000);
  log.info("Alerting started (first check in 30s, then every 60s)");
}

export function stopAlerting(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
