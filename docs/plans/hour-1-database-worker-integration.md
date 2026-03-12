# Hour 1: Database + Worker Integration (Steps 6-10)

## Prerequisites
- Steps 0-5 complete (monorepo, shared types/queue-config, Redis, worker skeleton, enqueue utility)
- Docker running with Redis container
- `bun install` from root successful

---

## Step 6: Local Supabase + SQL Migrations

### Why
Workers need a database to persist task state. Supabase gives us Postgres + Realtime + Auth in one local Docker stack. We write raw SQL migrations (not ORM-generated) because:
1. You control exactly what runs
2. Supabase CLI owns the migration lifecycle
3. Drizzle schema mirrors the SQL (manual, not auto-generated)

### Commands
```bash
# Install Supabase CLI (if not installed)
brew install supabase/tap/supabase

# Initialize Supabase at project root
cd /Users/hrushiborhade/Developer/task-queue
supabase init

# Start local Supabase (Postgres, Auth, Realtime, Storage)
supabase start
```

`supabase start` prints connection details. Save these — you'll need `DATABASE_URL` and the service role key.

### Create first migration
```bash
supabase migration new create_base_tables
```

This creates `supabase/migrations/<timestamp>_create_base_tables.sql`. Write:

```sql
-- Task type enum
CREATE TYPE task_type AS ENUM (
  'text_gen',
  'image_gen',
  'research_agent',
  'email_campaign',
  'pdf_report',
  'webhook_processing',
  'data_aggregation'
);

-- Task status enum
CREATE TYPE task_status AS ENUM ('queued', 'active', 'completed', 'failed');

-- Batch status enum
CREATE TYPE batch_status AS ENUM ('running', 'completed', 'partial_failure');

-- Batch runs table (groups of tasks for stress testing / bulk ops)
CREATE TABLE batch_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  total_tasks INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  status batch_status NOT NULL DEFAULT 'running',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Schedules table (cron-based recurring tasks)
CREATE TABLE schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type task_type NOT NULL,
  input JSONB NOT NULL DEFAULT '{}',
  cron_expression TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  enabled BOOLEAN NOT NULL DEFAULT true,
  run_count INTEGER NOT NULL DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tasks table (every job in the system)
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES batch_runs(id) ON DELETE SET NULL,
  schedule_id UUID REFERENCES schedules(id) ON DELETE SET NULL,
  type task_type NOT NULL,
  status task_status NOT NULL DEFAULT 'queued',
  progress INTEGER NOT NULL DEFAULT 0,
  attempt INTEGER NOT NULL DEFAULT 0,
  input JSONB NOT NULL DEFAULT '{}',
  output JSONB,
  error TEXT,
  bullmq_job_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Task events table (granular progress tracking)
CREATE TABLE task_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT,
  data JSONB,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_type ON tasks(type);
CREATE INDEX idx_tasks_batch_id ON tasks(batch_id);
CREATE INDEX idx_tasks_schedule_id ON tasks(schedule_id);
CREATE INDEX idx_tasks_created_at ON tasks(created_at DESC);
CREATE INDEX idx_task_events_task_id ON task_events(task_id);

-- Helper function: atomic batch counter increment (race-safe)
CREATE OR REPLACE FUNCTION increment_batch_completed(p_batch_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Step 1: Increment count
  UPDATE batch_runs
  SET completed_count = completed_count + 1,
      updated_at = now()
  WHERE id = p_batch_id;

  -- Step 2: Atomically check and mark completed (WHERE prevents race)
  UPDATE batch_runs
  SET status = 'completed', updated_at = now()
  WHERE id = p_batch_id
    AND completed_count >= total_tasks
    AND status != 'completed';
END;
$$;

-- Auto-update updated_at on every UPDATE (no need to set manually)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER batch_runs_updated_at BEFORE UPDATE ON batch_runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER schedules_updated_at BEFORE UPDATE ON schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Enable Realtime on tasks table (for live UI updates)
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
```

### Apply migration
```bash
supabase db push
```

### Verification
```bash
# Connect to local Postgres and check tables
supabase db reset  # If needed: drops and re-applies all migrations
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\dt"
```

### Learning concepts
- **Supabase CLI** owns migration lifecycle — never edit applied migrations
- **TIMESTAMPTZ** always stores UTC, renders in client timezone
- **gen_random_uuid()** is built into Postgres 13+ (no extension needed)
- **ON DELETE CASCADE** on task_events means deleting a task deletes its events
- **ON DELETE SET NULL** on batch_id means deleting a batch doesn't delete tasks
- **Publication** enables Postgres logical replication for Supabase Realtime

### Note on user_id
We skip `user_id` for now. It gets added in the auth phase (Step 23) via a separate migration. This keeps the initial schema simple.

---

## Step 7: Drizzle Schema in Shared Package

### Why
Workers query the database using Drizzle ORM. The schema lives in `@repo/shared` so both worker and web app import the same types. The schema **mirrors** the SQL — it's written manually, not generated by drizzle-kit.

### Install dependencies
```bash
# postgres driver goes in worker (it's the one that connects)
cd /Users/hrushiborhade/Developer/task-queue
bun add postgres --filter worker

# drizzle-orm is already in @repo/shared (installed in Step 1)
```

### Create schema file

**`packages/shared/src/schema.ts`**:

```typescript
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";

// ── Enums ──────────────────────────────────────────────
export const taskTypeEnum = pgEnum("task_type", [
  "text_gen",
  "image_gen",
  "research_agent",
  "email_campaign",
  "pdf_report",
  "webhook_processing",
  "data_aggregation",
]);

export const taskStatusEnum = pgEnum("task_status", [
  "queued",
  "active",
  "completed",
  "failed",
]);

export const batchStatusEnum = pgEnum("batch_status", [
  "running",
  "completed",
  "partial_failure",
]);

// ── Tables ─────────────────────────────────────────────
export const batchRuns = pgTable("batch_runs", {
  id: uuid().primaryKey().defaultRandom(),
  totalTasks: integer("total_tasks").notNull().default(0),
  completedCount: integer("completed_count").notNull().default(0),
  status: batchStatusEnum().notNull().default("running"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const schedules = pgTable("schedules", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  type: taskTypeEnum().notNull(),
  input: jsonb().notNull().default({}),
  cronExpression: text("cron_expression").notNull(),
  timezone: text().notNull().default("UTC"),
  enabled: boolean().notNull().default(true),
  runCount: integer("run_count").notNull().default(0),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tasks = pgTable("tasks", {
  id: uuid().primaryKey().defaultRandom(),
  batchId: uuid("batch_id").references(() => batchRuns.id, { onDelete: "set null" }),
  scheduleId: uuid("schedule_id").references(() => schedules.id, { onDelete: "set null" }),
  type: taskTypeEnum().notNull(),
  status: taskStatusEnum().notNull().default("queued"),
  progress: integer().notNull().default(0),
  attempt: integer().notNull().default(0),
  input: jsonb().notNull().default({}),
  output: jsonb(),
  error: text(),
  bullmqJobId: text("bullmq_job_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const taskEvents = pgTable("task_events", {
  id: uuid().primaryKey().defaultRandom(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  type: text().notNull(),
  message: text(),
  data: jsonb(),
  timestamp: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
```

### Update barrel export

**`packages/shared/src/index.ts`**:

```typescript
export * from "./types";
export * from "./queue-config";
export * from "./schema";
```

### Add BroadcastEvent type to types.ts

Append to **`packages/shared/src/types.ts`**:

```typescript
export interface BroadcastEvent {
  type: "chunk" | "step" | "progress" | "error";
  message: string;
  data?: Record<string, unknown>;
  progress?: number;
  timestamp: string;
}
```

### Verification
```bash
cd /Users/hrushiborhade/Developer/task-queue
bunx tsc --noEmit -p packages/shared/tsconfig.json
```

### Learning concepts
- **pgEnum** maps to Postgres CREATE TYPE ... AS ENUM
- **Column names**: Drizzle uses camelCase in TS, maps to snake_case via the string argument: `totalTasks: integer("total_tasks")`
- **references()** creates foreign key constraints — mirrors the SQL REFERENCES clause
- **defaultRandom()** maps to `DEFAULT gen_random_uuid()`
- **Schema mirrors SQL**: If you change the SQL migration, update the Drizzle schema to match

---

## Step 8: Worker DB Connection

### Why
The worker connects directly to Postgres using the `postgres` driver (not the Supabase HTTP client). This gives:
1. No HTTP overhead — direct TCP connection
2. No RLS — worker is a trusted backend process
3. Connection pooling built into the `postgres` driver

### Create db.ts

**`apps/worker/src/lib/db.ts`**:

```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@repo/shared";

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema });
```

### Create .env file for worker

**`apps/worker/.env`**:

```
# Local Supabase Postgres (from supabase start output)
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres

# Local Supabase service role key (from supabase start output)
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<paste from supabase start output>
```

### Add postgres dependency to worker
Already done in Step 7. Verify in `apps/worker/package.json`:
```json
"dependencies": {
  "@repo/shared": "workspace:*",
  "bullmq": "^5",
  "postgres": "^3"
}
```

### Verification
```bash
# Quick test — add a temp script
cat > /tmp/test-db.ts << 'EOF'
import { db } from "./apps/worker/src/lib/db";
const result = await db.execute("SELECT 1 as test");
console.log("DB connected:", result);
process.exit(0);
EOF
cd /Users/hrushiborhade/Developer/task-queue
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" bun run /tmp/test-db.ts
```

### Learning concepts
- **Latest Drizzle API**: `drizzle(client, { schema })` — pass the postgres client and schema object
- **`import * as schema`**: Drizzle needs the full schema namespace for relational queries
- **postgres driver**: Connection pooling is automatic, no need for `pg-pool`
- **Why not Supabase client?**: HTTP adds latency, RLS adds complexity. Worker is trusted.

### Difference from latest Drizzle docs
The latest Drizzle docs show `drizzle(process.env.DATABASE_URL)` as a shorthand. The production app uses `postgres(url)` then `drizzle(client, { schema })`. Both work — the explicit form is used here because we need the schema for relational queries and the `postgres` client for explicit connection management on shutdown.

---

## Step 9: Wire Text-Gen Worker to DB

> **Note**: This step imports `supabase` from `../lib/supabase` which is created in Step 10. Complete Step 10 first (create `apps/worker/src/lib/supabase.ts`), then come back and rewrite this file. Or do Steps 9 and 10 together.

### Why
Currently the text-gen worker just console.logs. Now we wire it to:
1. Mark task "active" in DB when processing starts
2. Mark "completed" with output when done
3. Mark "failed" with error on failure
4. Increment batch counter if part of a batch

### Rewrite text-gen.worker.ts

**`apps/worker/src/workers/text-gen.worker.ts`**:

```typescript
import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { QUEUE_CONFIGS, REDIS_CONNECTION, tasks } from "@repo/shared";
import type { TaskJobPayload } from "@repo/shared";
import { db } from "../lib/db";
import { supabase } from "../lib/supabase";
import { ProgressTracker } from "../utils/progress";

export function createTextGenWorker() {
  const config = QUEUE_CONFIGS.text_gen;

  const worker = new Worker<TaskJobPayload>(
    config.name,
    async (job) => {
      const { taskId, input } = job.data;
      let batchId: string | null = null;
      const tracker = new ProgressTracker(taskId);

      try {
        // 1. Mark active in DB
        const [task] = await db
          .update(tasks)
          .set({
            status: "active",
            attempt: job.attemptsMade + 1,
            startedAt: new Date(),
            bullmqJobId: job.id,
          })
          .where(eq(tasks.id, taskId))
          .returning();

        batchId = task?.batchId ?? null;

        // 2. Simulate text generation (replace with real AI call later)
        await tracker.broadcastStep("Starting text generation");
        tracker.updateProgress(10, "Initializing");

        console.log(`[text-gen] Processing: ${input.prompt}`);
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        tracker.updateProgress(50, "Generating text");

        await new Promise((resolve) => setTimeout(resolve, 1_000));
        tracker.updateProgress(90, "Finalizing");

        const result = `Generated text for: ${input.prompt}`;

        // 3. Mark completed in DB
        await db
          .update(tasks)
          .set({
            status: "completed",
            progress: 100,
            output: { result },
            completedAt: new Date(),
          })
          .where(eq(tasks.id, taskId));

        // 4. Increment batch counter via Supabase RPC (parameterized, safe)
        if (batchId) {
          await supabase.rpc("increment_batch_completed", {
            p_batch_id: batchId,
          });
        }

        return { result };
      } catch (error) {
        // Mark failed in DB
        await db
          .update(tasks)
          .set({
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
          })
          .where(eq(tasks.id, taskId));

        // Increment batch counter even on failure (for progress tracking)
        if (batchId) {
          await supabase.rpc("increment_batch_completed", {
            p_batch_id: batchId,
          });
        }

        throw error; // Re-throw so BullMQ retries
      } finally {
        // ALWAYS cleanup — prevents channel leaks and flushes pending progress
        await tracker.destroy();
      }
    },
    {
      connection: REDIS_CONNECTION,
      concurrency: config.concurrency,
      limiter: config.rateLimit,
    }
  );

  worker.on("error", (err) => {
    console.error("[text-gen] Worker error:", err);
  });

  return worker;
}
```

### Verification
```bash
# Type check
cd /Users/hrushiborhade/Developer/task-queue
bunx tsc --noEmit -p apps/worker/tsconfig.json

# Integration test:
# 1. Make sure Redis + Supabase are running
# 2. Insert a test task into DB
# 3. Enqueue it
# 4. Run worker and verify DB state changes
```

### Learning concepts
- **`.returning()`**: Returns the updated row — one query instead of update + select
- **`eq()` from drizzle-orm**: Type-safe equality filter
- **Capture batchId early**: We need it in both success and error paths
- **Re-throw after marking failed**: BullMQ needs the error to trigger retry logic
- **Why `supabase.rpc()` over `db.execute()`**: `supabase.rpc("increment_batch_completed", { p_batch_id: batchId })` is parameterized and safe. Using `db.execute()` with string interpolation risks SQL injection. This is why Step 10 creates the Supabase client first — we need it here.

---

## Step 10: ProgressTracker + Supabase Broadcast

### Why
Users need live updates in the browser. Two channels:
1. **Postgres Changes** (via Supabase Realtime): Task status transitions (queued → active → completed)
2. **Broadcast** (via Supabase Realtime): Streaming chunks, progress updates, step messages

The ProgressTracker class encapsulates throttled DB writes + fire-and-forget broadcasts.

### Install Supabase client in worker
```bash
cd /Users/hrushiborhade/Developer/task-queue
bun add @supabase/supabase-js --filter worker
```

### Create Supabase client for worker

**`apps/worker/src/lib/supabase.ts`**:

```typescript
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import type { BroadcastEvent } from "@repo/shared";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Channel cache — one channel per task
const channels = new Map<string, RealtimeChannel>();

function getChannel(taskId: string): RealtimeChannel {
  if (!channels.has(taskId)) {
    const channel = supabase.channel(`task:${taskId}`);
    channel.subscribe();
    channels.set(taskId, channel);
  }
  return channels.get(taskId)!;
}

export function broadcastTaskEvent(taskId: string, event: BroadcastEvent): void {
  const channel = getChannel(taskId);
  // Fire-and-forget — no await
  channel.send({
    type: "broadcast",
    event: "task-event",
    payload: event,
  });
}

export function cleanupTaskChannel(taskId: string): void {
  const channel = channels.get(taskId);
  if (channel) {
    supabase.removeChannel(channel);
    channels.delete(taskId);
  }
}

export { supabase };
```

### Create ProgressTracker

**`apps/worker/src/utils/progress.ts`**:

```typescript
import { eq } from "drizzle-orm";
import { tasks, taskEvents } from "@repo/shared";
import type { BroadcastEvent } from "@repo/shared";
import { db } from "../lib/db";
import { broadcastTaskEvent, cleanupTaskChannel } from "../lib/supabase";

export class ProgressTracker {
  private taskId: string;
  private pendingProgress: number | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(taskId: string) {
    this.taskId = taskId;

    // Throttled DB writes: flush pending progress every 1 second
    this.flushTimer = setInterval(() => this.flush(), 1_000);
  }

  /** Broadcast a streaming chunk (fire-and-forget, no DB write) */
  broadcastChunk(chunk: string): void {
    broadcastTaskEvent(this.taskId, {
      type: "chunk",
      message: chunk,
      timestamp: new Date().toISOString(),
    });
  }

  /** Broadcast a step message + persist to task_events table */
  async broadcastStep(message: string, data?: Record<string, unknown>): Promise<void> {
    const event: BroadcastEvent = {
      type: "step",
      message,
      data,
      timestamp: new Date().toISOString(),
    };

    // Persist to DB
    await db.insert(taskEvents).values({
      taskId: this.taskId,
      type: "step",
      message,
      data,
    });

    // Broadcast (fire-and-forget)
    broadcastTaskEvent(this.taskId, event);
  }

  /** Update progress percentage — throttled DB write + broadcast */
  updateProgress(progress: number, message?: string): void {
    this.pendingProgress = progress;

    broadcastTaskEvent(this.taskId, {
      type: "progress",
      message: message ?? `Progress: ${progress}%`,
      progress,
      timestamp: new Date().toISOString(),
    });
  }

  /** Flush pending progress to DB */
  async flush(): Promise<void> {
    if (this.pendingProgress === null) return;

    const progress = this.pendingProgress;
    this.pendingProgress = null;

    try {
      await db
        .update(tasks)
        .set({ progress })
        .where(eq(tasks.id, this.taskId));
    } catch (err) {
      console.error(`[progress] Failed to flush for task ${this.taskId}:`, err);
    }
  }

  /** Cleanup: flush remaining progress, clear timer, remove channel */
  async destroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    await this.flush();
    cleanupTaskChannel(this.taskId);
  }
}
```

### Update text-gen worker to use ProgressTracker

Add tracker to the worker's processing function (in the try block, after marking active):

```typescript
// After marking active:
const tracker = new ProgressTracker(taskId);

try {
  await tracker.broadcastStep("Starting text generation");
  tracker.updateProgress(10, "Initializing model");

  // Simulate work with progress updates
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  tracker.updateProgress(50, "Generating text");

  await new Promise((resolve) => setTimeout(resolve, 1_000));
  tracker.updateProgress(90, "Finalizing");

  const result = `Generated text for: ${input.prompt}`;

  // Mark completed...
} finally {
  // ALWAYS cleanup — even on error
  await tracker.destroy();
}
```

### Verification
```bash
# Type check
bunx tsc --noEmit -p apps/worker/tsconfig.json

# Manual test:
# 1. Start worker: DATABASE_URL=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... bun run dev:worker
# 2. Insert a test task + enqueue it
# 3. Check task_events table for step entries
# 4. Check tasks table for progress updates
```

### Learning concepts
- **Fire-and-forget broadcasts**: `channel.send()` returns a Promise but we don't await it — UI updates are best-effort
- **Throttled DB writes**: `setInterval(flush, 1000)` prevents writing progress to DB on every chunk (could be 100s per second)
- **Channel caching**: `Map<string, RealtimeChannel>` avoids creating a new WebSocket per broadcast
- **`finally` block**: `tracker.destroy()` runs regardless of success/failure — prevents channel leaks
- **Service role key**: Bypasses RLS — worker is a trusted backend process, not a user
