import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { QUEUE_CONFIGS, REDIS_CONNECTION, tasks } from "@repo/shared";
import type { TaskJobPayload } from "@repo/shared";
import { db } from "../lib/db";
import { supabase } from "../lib/supabase";
import { ProgressTracker } from "../utils/progress";

export function createResearchWorker() {
  const config = QUEUE_CONFIGS.research_agent;

  return new Worker<TaskJobPayload>(
    config.name,
    async (job) => {
      const { taskId, userId, input } = job.data;
      const tracker = new ProgressTracker(taskId, userId);

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

        await tracker.broadcastStep("Starting research");
        tracker.updateProgress(10);

        await new Promise((r) => setTimeout(r, 2_000));
        tracker.updateProgress(40, "Gathering sources");

        await new Promise((r) => setTimeout(r, 2_000));
        tracker.updateProgress(75, "Analyzing findings");

        await new Promise((r) => setTimeout(r, 1_000));
        tracker.updateProgress(95, "Compiling report");

        const result = `Research findings for: ${input.prompt}`;

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
        await db
          .update(tasks)
          .set({
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
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
    },
  );
}
