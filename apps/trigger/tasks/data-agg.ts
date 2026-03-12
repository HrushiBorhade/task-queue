import { task, logger, metadata, queue } from "@trigger.dev/sdk";

const dataAggQueue = queue({
  name: "data-agg-queue",
  concurrencyLimit: 1, // Only 1 at a time — heavy computation
});

export const dataAggTask = task({
  id: "data-aggregation",
  queue: dataAggQueue,
  machine: "medium-2x", // Heavy compute needs
  maxDuration: 600,

  run: async (payload: { sources: string[]; taskId: string }) => {
    logger.info("Starting data aggregation", { sources: payload.sources.length });

    metadata.set("status", "processing");
    metadata.set("progress", { current: 0, total: 3, percentage: 0, step: "Querying sources" });

    await new Promise((r) => setTimeout(r, 3_000));
    metadata.set("progress", { current: 1, total: 3, percentage: 33, step: "Aggregating records" });

    await new Promise((r) => setTimeout(r, 3_000));
    metadata.set("progress", { current: 2, total: 3, percentage: 66, step: "Finalizing results" });

    await new Promise((r) => setTimeout(r, 2_000));
    metadata.set("progress", { current: 3, total: 3, percentage: 100, step: "Complete" });

    const result = "Aggregated 1000 records";
    metadata.set("status", "completed");

    return { result };
  },
});

export type DataAggTask = typeof dataAggTask;
