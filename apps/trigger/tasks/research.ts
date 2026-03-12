import { task, logger, metadata, queue } from "@trigger.dev/sdk";

const researchQueue = queue({
  name: "research-queue",
  concurrencyLimit: 3,
});

export const researchTask = task({
  id: "research-agent",
  queue: researchQueue,
  machine: "medium-1x", // Research agents need more compute
  maxDuration: 600, // 10 min — research is long-running

  run: async (payload: { prompt: string; taskId: string; depth?: "shallow" | "deep" }) => {
    const depth = payload.depth ?? "shallow";
    logger.info("Starting research", { prompt: payload.prompt, depth });

    metadata.set("status", "processing");
    metadata.set("progress", { current: 0, total: 4, percentage: 0, step: "Planning research" });

    await new Promise((r) => setTimeout(r, 2_000));
    metadata.set("progress", { current: 1, total: 4, percentage: 25, step: "Gathering sources" });

    await new Promise((r) => setTimeout(r, 2_000));
    metadata.set("progress", { current: 2, total: 4, percentage: 50, step: "Analyzing findings" });

    await new Promise((r) => setTimeout(r, 2_000));
    metadata.set("progress", { current: 3, total: 4, percentage: 75, step: "Synthesizing report" });

    await new Promise((r) => setTimeout(r, 1_000));
    metadata.set("progress", { current: 4, total: 4, percentage: 100, step: "Complete" });

    const result = `Research findings for: ${payload.prompt}`;

    metadata.set("status", "completed");
    return { result };
  },
});

export type ResearchTask = typeof researchTask;
