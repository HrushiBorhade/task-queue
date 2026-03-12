import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { QUEUE_CONFIGS, REDIS_CONNECTION, WORKER_DEFAULTS, tasks } from "@repo/shared";
import type { TaskJobPayload } from "@repo/shared";
import { db } from "../lib/db";
import { supabase } from "../lib/supabase";
import { ProgressTracker } from "../utils/progress";
import { createLogger } from "../lib/logger";

const log = createLogger({ module: "text-gen" });

export function createTextGenWorker() {
  const config = QUEUE_CONFIGS.text_gen;

  const worker = new Worker<TaskJobPayload>(
    config.name,
    async (job) => {
      const { taskId, userId, input } = job.data;
      let batchId: string | null = null;
      const tracker = new ProgressTracker(job, taskId, userId);

      try {
        // 1. Mark active in DB
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

        batchId = task?.batchId ?? null;

        // 2. Simulate text generation
        await tracker.broadcastStep("Starting text generation");
        tracker.updateProgress(10, "Initializing");

        log.info({ taskId, prompt: input.prompt }, "Processing");
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        tracker.updateProgress(50, "Generating text");

        await new Promise((resolve) => setTimeout(resolve, 1_000));
        tracker.updateProgress(90, "Finalizing");

        const result = `Generated text for: ${input.prompt}`;

        // 3. Mark completed in DB
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

        // 4. Increment batch counter if part of a batch
        if (batchId) {
          await supabase.rpc("increment_batch_completed", {
            p_batch_id: batchId,
          });
        }

        return { result };
      } catch (error) {
        const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
        log.error({ taskId, error, attempt: job.attemptsMade + 1, isLastAttempt }, "Text generation failed");

        if (isLastAttempt) {
          await db
            .update(tasks)
            .set({
              status: "failed",
              error: error instanceof Error ? error.message : String(error),
            })
            .where(eq(tasks.id, taskId));

          // Increment batch even on failure (for progress tracking)
          if (batchId) {
            await supabase.rpc("increment_batch_completed", {
              p_batch_id: batchId,
            });
          }
        }

        throw error; // Re-throw so BullMQ retries
      } finally {
        // ALWAYS cleanup — prevents channel leaks
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

  worker.on("error", (err) => {
    log.error({ err }, "Worker error");
  });

  return worker;
}
