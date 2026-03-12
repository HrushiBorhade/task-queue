import { task, logger, metadata, tasks } from "@trigger.dev/sdk";
import type { TextGenTask } from "./text-gen";
import type { ImageGenTask } from "./image-gen";

/**
 * Orchestrator task — spawns child tasks and tracks overall progress.
 *
 * This shows Trigger.dev's killer feature: tasks can trigger other tasks.
 * The parent waits for children, tracks aggregate progress, and handles
 * partial failures without dying itself.
 */
export const batchGenerateTask = task({
  id: "batch-generate",
  machine: "small-1x",
  maxDuration: 600,

  run: async (payload: {
    items: Array<{ prompt: string; type: "text" | "image" }>;
    batchId: string;
  }) => {
    const { items, batchId } = payload;
    logger.info("Starting batch generation", { batchId, count: items.length });

    metadata.set("status", "processing");
    metadata.set("batchProgress", { completed: 0, failed: 0, total: items.length });

    const results: Array<{ prompt: string; runId: string; status: string }> = [];
    let completed = 0;
    let failed = 0;

    for (const item of items) {
      try {
        // Trigger child task — this is a real Trigger.dev run, not a function call
        const handle = item.type === "text"
          ? await tasks.trigger<TextGenTask>("text-gen", {
              prompt: item.prompt,
              taskId: `${batchId}-${results.length}`,
            }, {
              tags: [`batch-${batchId}`, `type-${item.type}`],
            })
          : await tasks.trigger<ImageGenTask>("image-gen", {
              prompt: item.prompt,
              taskId: `${batchId}-${results.length}`,
            }, {
              tags: [`batch-${batchId}`, `type-${item.type}`],
            });

        results.push({ prompt: item.prompt, runId: handle.id, status: "triggered" });
        completed++;
      } catch (error) {
        logger.error("Failed to trigger child task", {
          prompt: item.prompt,
          error: error instanceof Error ? error.message : String(error),
        });
        results.push({ prompt: item.prompt, runId: "", status: "failed" });
        failed++;
      }

      // Update aggregate progress
      metadata.set("batchProgress", {
        completed: completed + failed,
        failed,
        total: items.length,
      });
    }

    metadata.set("status", "completed");

    return {
      batchId,
      triggered: completed,
      failed,
      total: items.length,
      results,
    };
  },
});

export type BatchGenerateTask = typeof batchGenerateTask;
