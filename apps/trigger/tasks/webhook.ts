import { task, logger, metadata, queue } from "@trigger.dev/sdk";

const webhookQueue = queue({
  name: "webhook-queue",
  concurrencyLimit: 10,
});

export const webhookTask = task({
  id: "webhook-processing",
  queue: webhookQueue,
  machine: "micro",
  maxDuration: 30,

  run: async (payload: { url: string; body: unknown; taskId: string }) => {
    logger.info("Delivering webhook", { url: payload.url });

    metadata.set("status", "processing");

    await new Promise((r) => setTimeout(r, 200));

    const result = `Webhook delivered to: ${payload.url}`;
    metadata.set("status", "completed");

    return { result };
  },
});

export type WebhookTask = typeof webhookTask;
