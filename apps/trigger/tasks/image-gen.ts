import { task, logger, metadata, queue } from "@trigger.dev/sdk";

const imageGenQueue = queue({
  name: "image-gen-queue",
  concurrencyLimit: 5,
});

export const imageGenTask = task({
  id: "image-gen",
  queue: imageGenQueue,
  machine: "small-2x", // More memory for image payloads
  maxDuration: 180,

  run: async (payload: { prompt: string; taskId: string; style?: string }) => {
    logger.info("Starting image generation", { prompt: payload.prompt, style: payload.style });

    metadata.set("status", "processing");
    metadata.set("progress", { current: 0, total: 2, percentage: 0, step: "Initializing model" });

    // Simulate image generation (longer than text)
    await new Promise((r) => setTimeout(r, 3_000));
    metadata.set("progress", { current: 1, total: 2, percentage: 50, step: "Generating image" });

    await new Promise((r) => setTimeout(r, 2_000));
    metadata.set("progress", { current: 2, total: 2, percentage: 100, step: "Complete" });

    const result = `https://placeholder.example/generated-${payload.taskId}.png`;

    metadata.set("status", "completed");
    metadata.set("result", result);

    return { result };
  },

  onFailure: async ({ payload, error }) => {
    logger.error("Image generation permanently failed", {
      taskId: payload.taskId,
      error: error instanceof Error ? error.message : String(error),
    });
  },
});

export type ImageGenTask = typeof imageGenTask;
