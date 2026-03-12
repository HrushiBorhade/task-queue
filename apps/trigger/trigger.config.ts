import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  // Your Trigger.dev project ID (get from dashboard)
  project: "proj_your_project_id",
  runtime: "node-22",
  logLevel: "log",
  // Max compute seconds before a task is killed (global default)
  maxDuration: 300, // 5 minutes
  // Global retry config — individual tasks can override
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,        // exponential backoff multiplier
      randomize: true,   // jitter to prevent thundering herd
    },
  },
  // Directory where task files live (auto-discovered)
  dirs: ["tasks"],
});
