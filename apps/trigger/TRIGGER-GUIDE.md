# Trigger.dev vs BullMQ — Complete Practical Guide

## What is Trigger.dev?

Trigger.dev is a **hosted background jobs platform**. Instead of managing Redis, BullMQ workers, Dockerfiles, health checks, metrics servers, and scaling yourself — you write task functions and Trigger.dev handles everything else.

Think of it as: **"What if Vercel, but for background jobs?"**

---

## The Fundamental Difference

### BullMQ (what we built in apps/worker)

```
You manage EVERYTHING:
┌─────────┐     ┌───────┐     ┌──────────────┐
│ Your API │────►│ Redis │◄────│ Your Worker  │
│ (enqueue)│     │ (you) │     │ (you run it) │
└─────────┘     └───────┘     └──────┬───────┘
                                      │
                              You manage:
                              ✗ Redis hosting
                              ✗ Worker process
                              ✗ Dockerfile
                              ✗ Health checks
                              ✗ Metrics/monitoring
                              ✗ Scaling/autoscaling
                              ✗ Retries/backoff
                              ✗ Queue concurrency
                              ✗ Progress tracking
                              ✗ Graceful shutdown
                              ✗ Stalled job detection
```

### Trigger.dev (this directory)

```
You write task functions. They handle the rest:
┌─────────┐     ┌─────────────────┐
│ Your API │────►│ Trigger.dev     │
│ (trigger)│     │ Cloud Platform  │
└─────────┘     │                 │
                │ They manage:    │
                │ ✓ Execution env │
                │ ✓ Retries       │
                │ ✓ Concurrency   │
                │ ✓ Monitoring    │
                │ ✓ Scaling       │
                │ ✓ Logs          │
                │ ✓ Realtime      │
                └─────────────────┘
```

---

## Project Structure

```
apps/trigger/
├── package.json           # @trigger.dev/sdk + CLI
├── trigger.config.ts      # Project config (retries, runtime, dirs)
├── tsconfig.json
└── tasks/
    ├── text-gen.ts         # Each file exports a task
    ├── image-gen.ts
    ├── research.ts
    ├── email.ts
    ├── pdf-report.ts
    ├── webhook.ts
    ├── data-agg.ts
    ├── batch-generate.ts   # Orchestrator: spawns child tasks
    └── scheduled-cleanup.ts # Cron-scheduled task
```

**Key difference from BullMQ**: No `index.ts` entrypoint, no worker process, no health server, no metrics server, no Docker. Trigger.dev auto-discovers task files from the `dirs` config.

---

## How Tasks Work

### Defining a task

```typescript
import { task, logger, metadata, queue } from "@trigger.dev/sdk";

// 1. Define a queue (controls concurrency)
const myQueue = queue({
  name: "my-queue",
  concurrencyLimit: 10, // Max 10 concurrent runs
});

// 2. Define the task
export const myTask = task({
  id: "my-task",            // Unique ID (used to trigger it)
  queue: myQueue,            // Optional: attach to a queue
  machine: "small-1x",      // CPU/RAM allocation
  maxDuration: 300,          // Kill after 5 minutes

  // 3. The actual work
  run: async (payload: { prompt: string }) => {
    logger.info("Processing", { prompt: payload.prompt });

    // Update realtime metadata (frontend sees this instantly)
    metadata.set("progress", { percentage: 50, step: "Generating" });

    // Do work...
    const result = `Done: ${payload.prompt}`;

    metadata.set("status", "completed");
    return { result };
  },

  // 4. Called when ALL retries are exhausted
  onFailure: async ({ payload, error }) => {
    logger.error("Task permanently failed", { error });
    // Update DB, send alert, etc.
  },
});

// 5. Export the type (for type-safe triggering from other code)
export type MyTask = typeof myTask;
```

### Machine presets

| Preset | vCPUs | Memory | Use case |
|--------|-------|--------|----------|
| `micro` | 0.25 | 0.25GB | Webhooks, emails, lightweight I/O |
| `small-1x` | 0.5 | 0.5GB | Text generation, API calls |
| `small-2x` | 1 | 1GB | Image processing, PDF generation |
| `medium-1x` | 1 | 2GB | Research agents, data processing |
| `medium-2x` | 2 | 4GB | Heavy compute, ML inference |
| `large-1x` | 4 | 8GB | Video processing, large datasets |
| `large-2x` | 8 | 16GB | Training, massive data aggregation |

BullMQ equivalent: You'd configure this via K8s resource requests/limits per deployment. Trigger.dev makes it per-task.

---

## Triggering Tasks

### From a Next.js Server Action (what astral/monorepo does)

```typescript
"use server";

import { tasks } from "@trigger.dev/sdk";
import type { TextGenTask } from "trigger/tasks/text-gen";

export async function generateText(prompt: string) {
  // Type-safe triggering — payload type is inferred from the task
  const handle = await tasks.trigger<TextGenTask>(
    "text-gen",                           // task ID
    { prompt, taskId: crypto.randomUUID() }, // payload
    {
      tags: ["user-123", "text-gen"],     // searchable tags
      idempotencyKey: `text-${prompt}`,   // prevent duplicate runs
      queue: {
        name: "text-gen-queue",
        concurrencyLimit: 10,             // can override per-trigger
      },
    },
  );

  // handle.id = the run ID (use for realtime subscription)
  // handle.publicAccessToken = token for frontend realtime access
  return handle;
}
```

### From an API route

```typescript
// app/api/tasks/route.ts
import { tasks } from "@trigger.dev/sdk";
import type { TextGenTask } from "trigger/tasks/text-gen";

export async function POST(req: Request) {
  const { prompt } = await req.json();

  const handle = await tasks.trigger<TextGenTask>("text-gen", {
    prompt,
    taskId: crypto.randomUUID(),
  });

  return Response.json({
    runId: handle.id,
    publicAccessToken: handle.publicAccessToken,
  });
}
```

### Batch triggering

```typescript
import { tasks } from "@trigger.dev/sdk";
import type { TextGenTask } from "trigger/tasks/text-gen";

// Trigger many tasks at once
const handle = await tasks.batchTrigger<TextGenTask>("text-gen", [
  { payload: { prompt: "Write a poem", taskId: "1" } },
  { payload: { prompt: "Write a story", taskId: "2" } },
  { payload: { prompt: "Write a song", taskId: "3" } },
]);

// handle.runs = array of run IDs
```

### With delay

```typescript
await tasks.trigger<TextGenTask>("text-gen", payload, {
  delay: "1h",           // Run 1 hour from now
  // or: delay: "30m"
  // or: delay: new Date("2025-01-01T00:00:00Z")
});
```

### With TTL (time-to-live)

```typescript
await tasks.trigger<TextGenTask>("text-gen", payload, {
  ttl: "2h",  // If not started within 2 hours, discard
});
```

---

## Realtime Updates (The Killer Feature)

This is where Trigger.dev shines compared to BullMQ. With BullMQ, we built a whole ProgressTracker + Supabase Realtime channel system. With Trigger.dev, it's built-in.

### In the task: update metadata

```typescript
import { metadata } from "@trigger.dev/sdk";

// Inside your task's run function:
metadata.set("progress", { percentage: 50, step: "Generating" });
metadata.set("status", "processing");
metadata.set("customData", { whatever: "you want" });
```

### Backend: subscribe to a run

```typescript
import { runs } from "@trigger.dev/sdk";

// Async iterator — yields on every metadata change
for await (const run of runs.subscribeToRun(runId)) {
  console.log(`Status: ${run.status}`);
  console.log(`Progress: ${run.metadata?.progress}`);

  if (run.status === "COMPLETED") break;
}
```

### Frontend: React hook (the real magic)

```tsx
"use client";

import { useRealtimeRun } from "@trigger.dev/react-hooks";

export function TaskProgress({ runId, token }: { runId: string; token: string }) {
  const { run, error, isLoading } = useRealtimeRun(runId, {
    accessToken: token,
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  const progress = run?.metadata?.progress as {
    percentage: number;
    step: string;
  } | undefined;

  return (
    <div>
      <p>Status: {run?.status}</p>
      {progress && (
        <div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
          <p>{progress.step} — {progress.percentage}%</p>
        </div>
      )}
    </div>
  );
}
```

### Trigger + Subscribe in one component

```tsx
"use client";

import { useTaskTrigger, useRealtimeRun } from "@trigger.dev/react-hooks";
import type { TextGenTask } from "trigger/tasks/text-gen";

export function GenerateButton({ token }: { token: string }) {
  const { submit, handle, isLoading } = useTaskTrigger<TextGenTask>("text-gen", {
    accessToken: token,
  });

  const { run } = useRealtimeRun(handle, {
    accessToken: handle?.publicAccessToken,
    enabled: !!handle,
  });

  return (
    <div>
      <button
        onClick={() => submit({ prompt: "Hello world", taskId: "123" })}
        disabled={isLoading}
      >
        {isLoading ? "Triggering..." : "Generate"}
      </button>

      {run && <p>Status: {run.status} | Progress: {JSON.stringify(run.metadata)}</p>}
    </div>
  );
}
```

### Comparison: BullMQ vs Trigger.dev realtime

| Concern | BullMQ (what we built) | Trigger.dev |
|---------|----------------------|-------------|
| Progress storage | Manual DB writes (throttled) | `metadata.set()` (built-in) |
| Realtime transport | Supabase Realtime channels (manual) | Built-in SSE/WebSocket |
| Channel management | Map<string, Channel> + cleanup | Automatic |
| Frontend hook | Custom useTaskRealtime hook | `useRealtimeRun` (provided) |
| Type safety | Manual types | Inferred from task definition |

---

## Task-to-Task Orchestration

Tasks can trigger other tasks. This is how you build workflows:

```typescript
// Parent task triggers children
import { tasks } from "@trigger.dev/sdk";
import type { TextGenTask } from "./text-gen";
import type { ImageGenTask } from "./image-gen";

export const workflowTask = task({
  id: "content-workflow",
  run: async (payload: { topic: string }) => {
    // Step 1: Generate text
    const textHandle = await tasks.triggerAndWait<TextGenTask>("text-gen", {
      prompt: `Write about ${payload.topic}`,
      taskId: "step-1",
    });
    // triggerAndWait BLOCKS until the child completes
    // textHandle.output = { result: "Generated text for: ..." }

    // Step 2: Generate image based on text
    const imageHandle = await tasks.triggerAndWait<ImageGenTask>("image-gen", {
      prompt: `Illustrate: ${textHandle.output.result}`,
      taskId: "step-2",
    });

    return {
      text: textHandle.output.result,
      image: imageHandle.output.result,
    };
  },
});
```

### `trigger` vs `triggerAndWait` vs `batchTrigger`

| Method | Behavior | Use case |
|--------|----------|----------|
| `tasks.trigger()` | Fire-and-forget, returns immediately | Independent tasks, batch spawning |
| `tasks.triggerAndWait()` | Blocks until child completes | Sequential workflows, pipelines |
| `tasks.batchTrigger()` | Trigger many at once | Bulk operations |
| `tasks.batchTriggerAndWait()` | Trigger many, wait for all | Fan-out/fan-in patterns |

---

## Scheduled Tasks (Cron)

BullMQ requires a separate scheduler worker with node-cron or similar. Trigger.dev has it built-in:

```typescript
import { schedules } from "@trigger.dev/sdk";

export const dailyReport = schedules.task({
  id: "daily-report",
  run: async (payload) => {
    // payload.timestamp — when scheduled
    // payload.lastTimestamp — when last ran
    // payload.timezone — IANA timezone
    // payload.upcoming — next 5 run times

    // Do report generation...
    return { generated: true };
  },
});
```

Attach schedules via dashboard or API:
```typescript
await schedules.create({
  task: "daily-report",
  cron: "0 9 * * 1-5", // 9am Mon-Fri
  timezone: "America/New_York",
  externalId: "company-123-daily-report",
});
```

---

## Queues and Concurrency

### Per-task queue

```typescript
const imageQueue = queue({
  name: "image-gen-queue",
  concurrencyLimit: 5, // Max 5 image-gen tasks running simultaneously
});

export const imageGenTask = task({
  id: "image-gen",
  queue: imageQueue,
  // ...
});
```

### Shared queue (multiple tasks share concurrency)

```typescript
const aiQueue = queue({
  name: "ai-queue",
  concurrencyLimit: 10, // text-gen + image-gen share this limit
});

export const textGenTask = task({ id: "text-gen", queue: aiQueue, /* ... */ });
export const imageGenTask = task({ id: "image-gen", queue: aiQueue, /* ... */ });
```

### Concurrency keys (per-user limits)

```typescript
await tasks.trigger<TextGenTask>("text-gen", payload, {
  concurrencyKey: `user-${userId}`, // Max 1 concurrent run per user
  queue: { concurrencyLimit: 1 },
});
```

This prevents a single user from consuming all queue capacity. BullMQ equivalent: you'd implement this manually with Redis keys.

---

## Error Handling and Retries

### Global retries (trigger.config.ts)

```typescript
export default defineConfig({
  retries: {
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,   // First retry after ~1s
      maxTimeoutInMs: 10000,  // Cap at ~10s
      factor: 2,               // Exponential: 1s → 2s → 4s
      randomize: true,         // Add jitter
    },
  },
});
```

### Per-task retry override

```typescript
export const criticalTask = task({
  id: "critical-task",
  retry: {
    maxAttempts: 5,          // More retries for critical work
    minTimeoutInMs: 5000,    // Longer initial backoff
  },
  // ...
});
```

### onFailure callback

```typescript
export const myTask = task({
  id: "my-task",
  run: async (payload) => { /* ... */ },

  // Called ONLY when all retries are exhausted
  onFailure: async ({ payload, error, ctx }) => {
    // Update DB
    await db.update(tasks).set({ status: "failed" }).where(eq(tasks.id, payload.taskId));

    // Send alert
    await sendSlackAlert(`Task ${payload.taskId} permanently failed: ${error.message}`);
  },
});
```

---

## Development Workflow

### Setup

```bash
# 1. Install
cd apps/trigger && bun install

# 2. Login to Trigger.dev
bunx trigger login

# 3. Start dev mode (connects to Trigger.dev cloud, runs tasks locally)
bun run dev
# This starts a local dev server that executes tasks on YOUR machine
# but uses Trigger.dev cloud for orchestration, queuing, and realtime
```

### Deploy

```bash
# Deploy tasks to Trigger.dev cloud (runs on THEIR infra)
bun run deploy
```

After deploy, tasks run on Trigger.dev's managed infrastructure. No Dockerfile, no K8s, no scaling config.

### Environment variables

Set via dashboard (Project → Environment Variables) or sync from Vercel:

```typescript
// trigger.config.ts
import { syncVercelEnvVars } from "@trigger.dev/build/extensions/core";

export default defineConfig({
  build: {
    extensions: [syncVercelEnvVars()],
  },
});
```

---

## BullMQ vs Trigger.dev — Full Comparison

| Feature | BullMQ (self-hosted) | Trigger.dev (hosted) |
|---------|---------------------|---------------------|
| **Setup** | Redis + Worker + Dockerfile | `npm install @trigger.dev/sdk` |
| **Infrastructure** | You manage Redis, workers, scaling | They manage everything |
| **Task definition** | Worker processor function | `task()` with options |
| **Triggering** | `queue.add()` | `tasks.trigger()` |
| **Retries** | Config at enqueue time | Config at task or global level |
| **Concurrency** | Worker-level concurrency option | Queue-level, per-task, per-user |
| **Progress** | Manual (job.updateProgress or custom) | `metadata.set()` built-in |
| **Realtime** | Custom (Supabase/WebSocket) | `useRealtimeRun` hook built-in |
| **Scheduling** | External cron library needed | `schedules.task()` built-in |
| **Monitoring** | Bull Board + custom Prometheus | Dashboard built-in |
| **Task→Task** | Manual enqueue from within worker | `tasks.trigger()` / `triggerAndWait()` |
| **Machine sizing** | K8s resource limits | `machine: "small-2x"` per task |
| **Cost** | Redis hosting + compute ($20-500/mo) | Free tier + usage-based |
| **Vendor lock-in** | None (Redis is universal) | Trigger.dev specific SDK |
| **Offline/local** | Works fully offline | Needs internet (dev mode talks to cloud) |
| **Debug** | Console logs + Bull Board | Cloud dashboard + local dev |

### When to use BullMQ
- You want **zero vendor lock-in**
- You need **full control** over infrastructure
- You're running in an **air-gapped/offline** environment
- Your team has **DevOps expertise** to manage Redis + K8s
- You want to **understand how queues work** at a fundamental level (curriculum!)

### When to use Trigger.dev
- You want to **ship fast** without managing infra
- You need **realtime progress** without building a WebSocket layer
- You want **task orchestration** (task→task, workflows)
- Your team is **small** and can't afford a dedicated DevOps engineer
- You're building an **AI application** with long-running tasks
- You want **per-task machine sizing** (GPU for images, micro for webhooks)

---

## Pricing (as of 2025)

| Plan | Price | Included | Notes |
|------|-------|----------|-------|
| **Free (Hobby)** | $0/month | 50,000 runs/month, 500 concurrent | Perfect for dev/prototyping |
| **Pro** | $30/month | 100,000 runs/month, 1000 concurrent | Per-task machine selection |
| **Team** | $120/month | 500,000 runs/month, unlimited concurrent | Priority support |
| **Enterprise** | Custom | Unlimited | SLA, dedicated infra |

Compute is billed per-second based on machine preset. A `micro` task running 1 second costs ~$0.000015. A `large-2x` task running 1 minute costs ~$0.02.

**For our 7-task system with 1000 jobs/day:**
- Most runs are micro/small: ~$5-15/month on Free/Pro
- BullMQ self-hosted: ~$20-50/month (Redis + compute)

At low scale, costs are similar. At high scale (millions of runs), BullMQ self-hosted becomes cheaper. At medium scale, Trigger.dev saves engineering time which is worth more than the compute cost.

---

## How astral/monorepo Uses Trigger.dev (Real Production Patterns)

From the astral codebase at `/Users/hrushiborhade/Developer/astral/monorepo`:

### 1. Queue per task type with concurrency limits
```typescript
// Each task type has its own queue
const generateDiagnosticQueue = queue({
  name: "generate-diagnostic-queue",
  concurrencyLimit: 20,
});
```

### 2. Type-safe triggering from Next.js server actions
```typescript
"use server";
import { tasks } from "@trigger.dev/sdk";
import type { GenerateAllDiagnosticsForGradeTask } from "trigger/tasks/generateAllDiagnosticsForGrade";

export async function generateDiagnosticLessons(studentId: string, gradeId: string) {
  const handle = await tasks.trigger<GenerateAllDiagnosticsForGradeTask>(
    "generate-all-diagnostics-for-grade-task",
    { student_id: studentId, gradeId, user: lessonOwner },
    { tags: ["generate-all-diagnostics", `student-${studentId}`] },
  );
  return handle;
}
```

### 3. Parent tasks spawn children with error isolation
```typescript
// Parent generates diagnostics for all groups
// Each group triggers its own child task
for (const diagnosticGroup of diagnosticGroups) {
  try {
    await tasks.trigger<typeof generateDiagnosticTask>(
      "generate-diagnostic-task",
      { id: lesson.id, interest_id, user, studentId, gradeId },
      { tags: [`student-${student_id}`, `lesson-${lesson.id}`] },
    );
  } catch (error) {
    // One child failing doesn't kill the parent
    logger.log("Failed to trigger child", { error });
    await supabase.from("generated_lesson").update({ status: "error" }).eq("id", lesson.id);
  }
}
```

### 4. onFailure for DB cleanup
```typescript
onFailure: async ({ payload, error }) => {
  const supabase = createSupabaseAdminClient();
  await supabase.from("generated_lesson").update({ status: "error" }).eq("id", payload.id);
},
```

### 5. Tags for filtering and organization
```typescript
tags: [
  "generate-diagnostic-fallback",
  `student-${student_id}`,
  `lesson-${lesson.id}`,
  `grade-${gradeId}`,
  `diagnostic-group-${diagnosticGroup.id}`,
],
```
Tags are searchable in the dashboard — filter all runs for a specific student, grade, etc.

### 6. Context access for logging
```typescript
run: async (payload, { ctx }) => {
  const { organization, project, run } = ctx;
  const triggerUrl = `https://cloud.trigger.dev/orgs/${organization.slug}/projects/${project.slug}/runs/${run.id}`;
  // Store triggerUrl in DB for debugging links
},
```

---

## Migration Path: BullMQ → Trigger.dev

If you wanted to migrate our worker to Trigger.dev:

1. **Tasks**: Each `createXxxWorker()` function → `task()` definition (already done in this directory)
2. **Queues**: `QUEUE_CONFIGS` → `queue()` definitions per task
3. **Enqueue**: `queue.add()` → `tasks.trigger()`
4. **Progress**: `ProgressTracker` → `metadata.set()`
5. **Realtime**: Supabase Broadcast → `useRealtimeRun`
6. **Scheduling**: Cron worker → `schedules.task()`
7. **Health/Metrics/BullBoard**: Delete (Trigger.dev dashboard replaces all of these)
8. **Dockerfile**: Delete (Trigger.dev runs tasks on their infra)

You'd keep: Supabase DB (tasks table), Drizzle schema, shared types. You'd remove: Redis, worker process, Docker, health/metrics/alerting.
