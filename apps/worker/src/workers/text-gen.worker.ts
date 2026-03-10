import { Worker } from "bullmq";
import { QUEUE_CONFIGS, REDIS_CONNECTION } from "@repo/shared";
import type { TaskJobPayload } from "@repo/shared";

export function createTextGenWorker() {
  const config = QUEUE_CONFIGS.text_gen;

  const worker = new Worker<TaskJobPayload>(
    config.name,
    async (job) => {
      console.log(`[text-gen] Processing job ${job.id}`, job.data);

      // Simulate work — replace with real LLM calls in Phase 8
      await new Promise((resolve) => setTimeout(resolve, 2_000));

      return { result: `Generated text for: ${job.data.input.prompt}` };
    },
    {
      connection: REDIS_CONNECTION,
      concurrency: config.concurrency,
      limiter: config.rateLimit,
    },
  );

  worker.on("error", (err) => {
    console.error("[text-gen] Worker error:", err);
  });

  worker.on("completed", () => {
    console.log("completed task");
  });

  return worker;
}
