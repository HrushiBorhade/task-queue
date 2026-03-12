import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { QUEUE_CONFIGS, REDIS_CONNECTION, WORKER_DEFAULTS, tasks } from "@repo/shared";
import type { TaskJobPayload } from "@repo/shared";
import { db } from "../lib/db";
import { supabase } from "../lib/supabase";
import { ProgressTracker } from "../utils/progress";

export function createDataAggWorker() {
  const config = QUEUE_CONFIGS.data_aggregation;

  return new Worker<TaskJobPayload>(
    config.name,
    async (job) => {
      const { taskId, userId } = job.data;
      const tracker = new ProgressTracker(job, taskId, userId);

      try {
        const [task] = await db
          .update(tasks)
          .set({
            status: "active",
            attempt: job.attemptsMade + 1,
            startedAt: new Date(),
            bullmqJobId: job.id,
          })
          .where(eq(tasks.id, taskId))
          .returning();

        const batchId = task?.batchId ?? null;

        await tracker.broadcastStep("Starting data aggregation");
        tracker.updateProgress(10);

        await new Promise((r) => setTimeout(r, 3_000));
        tracker.updateProgress(35, "Querying data sources");

        await new Promise((r) => setTimeout(r, 3_000));
        tracker.updateProgress(70, "Aggregating records");

        await new Promise((r) => setTimeout(r, 2_000));
        tracker.updateProgress(95, "Finalizing results");

        const result = "Aggregated 1000 records";

        tracker.complete();
        await db
          .update(tasks)
          .set({
            status: "completed",
            progress: 100,
            output: { result },
            completedAt: new Date(),
          })
          .where(eq(tasks.id, taskId));

        if (batchId) {
          await supabase.rpc("increment_batch_completed", {
            p_batch_id: batchId,
          });
        }

        return { result };
      } catch (error) {
        const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

        if (isLastAttempt) {
          await db
            .update(tasks)
            .set({
              status: "failed",
              error: error instanceof Error ? error.message : String(error),
            })
            .where(eq(tasks.id, taskId));
        }

        throw error;
      } finally {
        await tracker.destroy();
      }
    },
    {
      connection: REDIS_CONNECTION,
      concurrency: config.concurrency,
      limiter: config.rateLimit,
      ...WORKER_DEFAULTS,
    },
  );
}
