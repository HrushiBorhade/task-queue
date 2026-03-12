import { task, logger, metadata, queue } from "@trigger.dev/sdk";

// ── Queue: controls concurrency for this task type ─────
const textGenQueue = queue({
  name: "text-gen-queue",
  concurrencyLimit: 10,
});

// ── Task definition ────────────────────────────────────
export const textGenTask = task({
  id: "text-gen",
  queue: textGenQueue,
  machine: "small-1x", // CPU/RAM allocation
  maxDuration: 120, // 2 min max

  run: async (payload: { prompt: string; taskId: string }) => {
    logger.info("Starting text generation", { prompt: payload.prompt });

    // Update metadata — this is what useRealtimeRun sees
    metadata.set("status", "processing");
    metadata.set("progress", { current: 0, total: 3, percentage: 0, step: "Initializing" });

    // Step 1: Initialize
    await new Promise((r) => setTimeout(r, 1_000));
    metadata.set("progress", { current: 1, total: 3, percentage: 33, step: "Generating text" });

    // Step 2: Generate
    await new Promise((r) => setTimeout(r, 1_000));
    metadata.set("progress", { current: 2, total: 3, percentage: 66, step: "Finalizing" });

    // Step 3: Finalize
    await new Promise((r) => setTimeout(r, 500));
    metadata.set("progress", { current: 3, total: 3, percentage: 100, step: "Complete" });

    const result = `Generated text for: ${payload.prompt}`;

    metadata.set("status", "completed");
    metadata.set("result", result);

    return { result };
  },

  // Called automatically when all retries are exhausted
  onFailure: async ({ payload, error }) => {
    logger.error("Text generation permanently failed", {
      taskId: payload.taskId,
      error: error instanceof Error ? error.message : String(error),
    });
    // Could update DB status to "failed" here
  },
});

export type TextGenTask = typeof textGenTask;
