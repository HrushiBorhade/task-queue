import { createTextGenWorker } from "./workers/text-gen.worker";

const textGenWorker = createTextGenWorker();

console.log("Worker process started");
console.log(`  text-gen: concurrency=${textGenWorker.opts.concurrency}`);

// Graceful shutdown
async function shutdown() {
  console.log("Shutting down workers...");
  await textGenWorker.close();
  console.log("All workers shut down");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
