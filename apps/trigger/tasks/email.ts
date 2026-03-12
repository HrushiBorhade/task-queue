import { task, logger, metadata, queue } from "@trigger.dev/sdk";

const emailQueue = queue({
  name: "email-queue",
  concurrencyLimit: 5,
});

export const emailTask = task({
  id: "email-campaign",
  queue: emailQueue,
  machine: "micro", // Emails are lightweight
  maxDuration: 30,

  run: async (payload: { to: string; subject: string; taskId: string }) => {
    logger.info("Sending email", { to: payload.to, subject: payload.subject });

    metadata.set("status", "processing");

    await new Promise((r) => setTimeout(r, 500));

    const result = `Email sent to: ${payload.to}`;
    metadata.set("status", "completed");

    return { result };
  },
});

export type EmailTask = typeof emailTask;
