import { task, logger, metadata, queue } from "@trigger.dev/sdk";

const pdfQueue = queue({
  name: "pdf-report-queue",
  concurrencyLimit: 3,
});

export const pdfReportTask = task({
  id: "pdf-report",
  queue: pdfQueue,
  machine: "small-2x", // PDF generation needs memory
  maxDuration: 300,

  run: async (payload: { title: string; data: unknown; taskId: string }) => {
    logger.info("Generating PDF report", { title: payload.title });

    metadata.set("status", "processing");
    metadata.set("progress", { current: 0, total: 3, percentage: 0, step: "Preparing data" });

    await new Promise((r) => setTimeout(r, 2_000));
    metadata.set("progress", { current: 1, total: 3, percentage: 33, step: "Building pages" });

    await new Promise((r) => setTimeout(r, 2_000));
    metadata.set("progress", { current: 2, total: 3, percentage: 66, step: "Rendering PDF" });

    await new Promise((r) => setTimeout(r, 1_000));
    metadata.set("progress", { current: 3, total: 3, percentage: 100, step: "Complete" });

    const result = `https://placeholder.example/report-${payload.taskId}.pdf`;
    metadata.set("status", "completed");

    return { result };
  },
});

export type PdfReportTask = typeof pdfReportTask;
