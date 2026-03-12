import { Queue, Worker } from "bullmq";
import { eq, sql } from "drizzle-orm";
import {
  REDIS_CONNECTION,
  SCHEDULER_QUEUE,
  WORKER_DEFAULTS,
  schedules,
  tasks,
} from "@repo/shared";
import type { ScheduleJobPayload, TaskType } from "@repo/shared";
import { db } from "./db";
import { enqueueTask } from "./enqueue";

const schedulerQueue = new Queue<ScheduleJobPayload>(SCHEDULER_QUEUE, {
  connection: REDIS_CONNECTION,
});

/**
 * Close the scheduler queue's Redis connection.
 * Called during graceful shutdown.
 */
export async function closeSchedulerQueue() {
  await schedulerQueue.close();
}

/**
 * Sync all enabled schedules from DB → BullMQ.
 * - Recurring (run_at IS NULL): register as cron job scheduler
 * - One-time (run_at IS NOT NULL): add as delayed job
 * Called on worker startup. Idempotent — safe for multiple workers.
 */
export async function syncSchedules() {
  const activeSchedules = await db
    .select()
    .from(schedules)
    .where(eq(schedules.enabled, true));

  let cronCount = 0;
  let oneTimeCount = 0;

  let failedCount = 0;

  for (const schedule of activeSchedules) {
    try {
      const jobData: ScheduleJobPayload = {
        scheduleId: schedule.id,
        type: schedule.type as TaskType,
        input: schedule.input as { prompt: string },
      };

      if (schedule.runAt) {
        // One-time schedule: add as delayed job
        const delay = new Date(schedule.runAt).getTime() - Date.now();
        await schedulerQueue.add("scheduled-task", jobData, {
          delay: Math.max(delay, 0),
          jobId: `once-${schedule.id}`,
        });
        oneTimeCount++;
      } else {
        // Recurring cron schedule
        await schedulerQueue.upsertJobScheduler(
          schedule.id,
          { pattern: schedule.cronExpression, tz: schedule.timezone },
          { name: "scheduled-task", data: jobData }
        );
        cronCount++;
      }
    } catch (err) {
      failedCount++;
      console.error(`[scheduler] Failed to sync schedule ${schedule.id}:`, err);
    }
  }

  console.log(
    `  scheduler: synced ${cronCount} cron + ${oneTimeCount} one-time schedules` +
      (failedCount > 0 ? ` (${failedCount} failed)` : "")
  );
}

/**
 * Worker that processes scheduled job ticks.
 * When a schedule fires: create task row → enqueue to real queue → update stats.
 * One-time schedules are auto-disabled after execution.
 */
export function createSchedulerWorker() {
  const worker = new Worker<ScheduleJobPayload>(
    SCHEDULER_QUEUE,
    async (job) => {
      const { scheduleId, type, input } = job.data;

      // Look up the schedule for user_id, run_at, enabled, and lastRunAt
      const [schedule] = await db
        .select({
          userId: schedules.userId,
          runAt: schedules.runAt,
          enabled: schedules.enabled,
          lastRunAt: schedules.lastRunAt,
        })
        .from(schedules)
        .where(eq(schedules.id, scheduleId))
        .limit(1);

      // Guard: schedule deleted while job was in flight
      if (!schedule) {
        console.warn(`[scheduler] Schedule ${scheduleId} no longer exists, skipping`);
        return;
      }

      // Guard: one-time schedule already fired (disabled by previous run).
      // Prevents duplicate tasks when BullMQ retries a stalled job.
      if (schedule.runAt && !schedule.enabled) {
        console.warn(`[scheduler] One-time schedule ${scheduleId} already fired, skipping retry`);
        return;
      }

      // Guard: recurring cron dedup — if lastRunAt is within the stall window
      // (lockDuration), a previous attempt already processed this tick.
      // job.timestamp is the time BullMQ created this job instance.
      if (!schedule.runAt && schedule.lastRunAt) {
        const lastRun = new Date(schedule.lastRunAt).getTime();
        const jobCreated = job.timestamp;
        if (lastRun >= jobCreated) {
          console.warn(`[scheduler] Cron schedule ${scheduleId} already ran for this tick, skipping retry`);
          return;
        }
      }

      // Create task row
      const rows = await db
        .insert(tasks)
        .values({
          type,
          input,
          status: "queued",
          progress: 0,
          scheduleId,
          userId: schedule.userId,
        })
        .returning();

      const task = rows[0]!;

      // Enqueue to the real worker queue FIRST.
      // If this fails, the task row exists but won't be processed — however
      // the schedule stays enabled so the next retry/tick will try again.
      // This is safer than disabling first (which permanently loses the task).
      const jobId = await enqueueTask({
        taskId: task.id,
        userId: schedule.userId ?? "",
        type: type as TaskType,
        input,
        attempt: 0,
      });

      // Update task with BullMQ job ID
      await db
        .update(tasks)
        .set({ bullmqJobId: jobId, updatedAt: new Date() })
        .where(eq(tasks.id, task.id));

      // Update schedule stats + auto-disable one-time schedules AFTER successful enqueue.
      // The dedup guards (enabled check + lastRunAt check) prevent duplicates on retry.
      await db
        .update(schedules)
        .set({
          lastRunAt: new Date(),
          runCount: sql`${schedules.runCount} + 1`,
          updatedAt: new Date(),
          ...(schedule.runAt ? { enabled: false } : {}),
        })
        .where(eq(schedules.id, scheduleId));

      const label = schedule.runAt ? "one-time" : "cron";
      console.log(
        `[scheduler] Created task ${task.id} from ${label} schedule ${scheduleId}`
      );
    },
    {
      connection: REDIS_CONNECTION,
      ...WORKER_DEFAULTS,
    }
  );

  worker.on("error", (err) => {
    console.error("[scheduler] Worker error:", err);
  });

  return worker;
}
