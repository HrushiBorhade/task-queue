# Hour 3: Next.js + API + Frontend (Steps 17-20)

## Prerequisites
- Hours 1-2 complete (database, all workers, observability)
- Redis + Supabase running locally

---

## Step 17: Next.js Init + Supabase Clients + Queue Pooling

### Why
The web app needs: Next.js (React framework), Supabase clients (3 types for different contexts), and queue pooling (to enqueue jobs from API routes).

### Init Next.js app
```bash
cd /Users/hrushiborhade/Developer/task-queue/apps
bunx create-next-app@latest web --typescript --tailwind --eslint --app --import-alias="@/*" --turbopack
```

When prompted, choose NOT to use `src/` directory. This creates `apps/web/` with the Next.js app router.

### Add root scripts

Add dev scripts to root `package.json`:

```json
"scripts": {
  "dev:worker": "bun --cwd apps/worker run dev",
  "dev:web": "bun --cwd apps/web run dev"
}
```

### Add workspace dependency + install packages
```bash
cd /Users/hrushiborhade/Developer/task-queue

# Add @repo/shared as workspace dependency
# Edit apps/web/package.json to add:
#   "@repo/shared": "workspace:*" to dependencies

# Install Supabase + BullMQ dependencies
bun add @supabase/ssr @supabase/supabase-js bullmq --filter web

# Re-install from root to link workspaces
bun install
```

### Generate Supabase types
```bash
cd /Users/hrushiborhade/Developer/task-queue
supabase gen types typescript --local > apps/web/lib/database.types.ts
```

### Create 3 Supabase clients

**`apps/web/lib/supabase/server.ts`** (for Server Components + API routes):

```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — can't set cookies
          }
        },
      },
    }
  );
}
```

**`apps/web/lib/supabase/client.ts`** (for Client Components):

```typescript
"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
```

**`apps/web/lib/supabase/admin.ts`** (for server-only operations that bypass RLS):

```typescript
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
```

### Create queue pooling

**`apps/web/lib/queue.ts`**:

```typescript
import { Queue } from "bullmq";
import {
  QUEUE_CONFIGS,
  REDIS_CONNECTION,
  type TaskType,
  type TaskJobPayload,
} from "@repo/shared";

const queues = new Map<string, Queue>();

function getQueue(taskType: TaskType): Queue {
  const config = QUEUE_CONFIGS[taskType];
  if (!queues.has(config.name)) {
    queues.set(
      config.name,
      new Queue(config.name, { connection: REDIS_CONNECTION })
    );
  }
  return queues.get(config.name)!;
}

export async function addTaskToQueue(
  payload: TaskJobPayload
): Promise<string> {
  const queue = getQueue(payload.type);
  const config = QUEUE_CONFIGS[payload.type];
  const job = await queue.add(payload.type, payload, {
    attempts: config.retries,
    backoff: { type: "exponential", delay: 1_000 },
  });
  return job.id!;
}
```

### Create .env.local

**`apps/web/.env.local`**:

```
# From `supabase start` output
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<anon key from supabase start>
SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase start>

# Redis (same as worker)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

### Verification
```bash
cd /Users/hrushiborhade/Developer/task-queue/apps/web
bun run build
```

### Learning concepts
- **3 Supabase clients**: Server (cookie-based auth for SSR), Browser (client-side auth), Admin (bypasses RLS)
- **`@supabase/ssr`** vs **`@supabase/supabase-js`**: SSR package handles cookie-based sessions. Base package is for admin (no cookies).
- **Queue pooling in web**: Same `Map<string, Queue>` pattern as the worker. API routes enqueue jobs on-demand.
- **NEXT_PUBLIC_ prefix**: Next.js exposes env vars prefixed with `NEXT_PUBLIC_` to the browser bundle. Non-prefixed vars are server-only.

---

## Step 18: API Routes (Tasks CRUD, Batch, Stats)

### Why
The frontend needs API endpoints to create tasks, list tasks, create batches, and get queue stats. All routes follow the same pattern: check auth → validate input → DB operation → queue enqueue → return response.

### Auth helper (skip auth check for now — add in Step 23)

**`apps/web/lib/auth.ts`**:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Get authenticated user. Returns NextResponse on error.
 *
 * Usage:
 *   const auth = await getAuthenticatedUser();
 *   if (auth instanceof NextResponse) return auth;
 *   const { user, supabase } = auth;
 *
 * NOTE: During development without auth, this returns a mock user.
 * Replace with real auth in Step 23.
 */
export async function getAuthenticatedUser() {
  const supabase = await createClient();

  // TODO: Replace with real auth check in Step 23
  // For now, return supabase client without user check
  return { user: { id: "dev-user" }, supabase };
}
```

### Rate limiter

**`apps/web/lib/rate-limit.ts`**:

```typescript
const windowMs = 60_000;

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}, 5 * 60_000);

export function rateLimit(
  key: string,
  maxRequests: number
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  let entry = store.get(key);

  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

  if (entry.timestamps.length >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  entry.timestamps.push(now);
  return { allowed: true, remaining: maxRequests - entry.timestamps.length };
}
```

### Tasks API route

**`apps/web/app/api/tasks/route.ts`**:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { TASK_TYPES, type TaskType, type TaskInput } from "@repo/shared";
import type { Json } from "@/lib/database.types";
import { getAuthenticatedUser } from "@/lib/auth";
import { addTaskToQueue } from "@/lib/queue";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser();
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;

  const { allowed, remaining } = rateLimit(`tasks:${user.id}`, 30);
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again in a minute." },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body" },
      { status: 400 }
    );
  }
  const { type, input } = body as { type: TaskType; input: TaskInput };

  if (!type || !TASK_TYPES.includes(type)) {
    return NextResponse.json({ error: "Invalid task type" }, { status: 400 });
  }
  if (!input?.prompt) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  // Insert task into DB
  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      type,
      input: input as unknown as Json,
      status: "queued",
      progress: 0,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Enqueue to BullMQ — if this fails, mark task as failed
  try {
    const jobId = await addTaskToQueue({ taskId: task.id, type, input });
    await supabase
      .from("tasks")
      .update({ bullmq_job_id: jobId })
      .eq("id", task.id);
  } catch (err) {
    await supabase
      .from("tasks")
      .update({
        status: "failed",
        error: `Failed to enqueue: ${err instanceof Error ? err.message : String(err)}`,
      })
      .eq("id", task.id);

    return NextResponse.json({ error: "Failed to enqueue task" }, { status: 500 });
  }

  return NextResponse.json({ task });
}

export async function GET() {
  const auth = await getAuthenticatedUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tasks });
}
```

### Batch API route

**`apps/web/app/api/tasks/batch/route.ts`**:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { TASK_TYPES, type TaskType, type TaskInput } from "@repo/shared";
import type { Json } from "@/lib/database.types";
import { getAuthenticatedUser } from "@/lib/auth";
import { addTaskToQueue } from "@/lib/queue";
import { rateLimit } from "@/lib/rate-limit";

const SAMPLE_PROMPTS: Record<TaskType, string[]> = {
  text_gen: ["Write a haiku about distributed systems", "Explain microservices in simple terms"],
  image_gen: ["A cyberpunk city at sunset", "A serene mountain landscape"],
  research_agent: ["Current state of nuclear fusion research", "History of the internet"],
  email_campaign: ["Welcome to our platform!", "Your weekly newsletter"],
  pdf_report: ["Generate daily task queue analytics report", "Monthly performance summary"],
  webhook_processing: ["stripe: payment_intent.succeeded", "github: push event"],
  data_aggregation: ["Run daily task metrics aggregation", "Weekly user activity report"],
};

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser();
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;

  const { allowed } = rateLimit(`batch:${user.id}`, 3);
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429 }
    );
  }

  const body = await request.json();
  const count = Math.min(body.count ?? 50, 100);

  // Create batch record
  const { data: batch, error: batchError } = await supabase
    .from("batch_runs")
    .insert({
      total_tasks: count,
      completed_count: 0,
      status: "running",
    })
    .select()
    .single();

  if (batchError) {
    return NextResponse.json({ error: batchError.message }, { status: 500 });
  }

  // Bulk insert tasks
  const taskInserts = Array.from({ length: count }, () => {
    const type = TASK_TYPES[Math.floor(Math.random() * TASK_TYPES.length)];
    const prompts = SAMPLE_PROMPTS[type];
    const prompt = prompts[Math.floor(Math.random() * prompts.length)];
    return {
      type,
      input: { prompt } as unknown as Json,
      status: "queued" as const,
      progress: 0,
      batch_id: batch.id,
    };
  });

  const { data: createdTasks, error: tasksError } = await supabase
    .from("tasks")
    .insert(taskInserts)
    .select();

  if (tasksError) {
    return NextResponse.json({ error: tasksError.message }, { status: 500 });
  }

  // Parallel enqueue — use allSettled to handle partial failures
  const results = await Promise.allSettled(
    createdTasks!.map((task) =>
      addTaskToQueue({
        taskId: task.id,
        type: task.type as TaskType,
        input: task.input as unknown as TaskInput,
      })
    )
  );

  // Mark any failed-to-enqueue tasks as "failed" (prevent orphans)
  const failedTaskIds = createdTasks!
    .filter((_, i) => results[i].status === "rejected")
    .map((t) => t.id);

  if (failedTaskIds.length > 0) {
    await supabase
      .from("tasks")
      .update({ status: "failed", error: "Failed to enqueue" })
      .in("id", failedTaskIds);
  }

  return NextResponse.json({
    batch,
    taskCount: createdTasks!.length,
    enqueueFailed: failedTaskIds.length,
  });
}
```

### Queue stats API route

**`apps/web/app/api/admin/stats/route.ts`**:

```typescript
import { NextResponse } from "next/server";
import { Queue } from "bullmq";
import { QUEUE_CONFIGS, REDIS_CONNECTION } from "@repo/shared";
import type { QueueConfig } from "@repo/shared";

export async function GET() {
  const stats = [];

  for (const config of Object.values(QUEUE_CONFIGS) as QueueConfig[]) {
    const queue = new Queue(config.name, { connection: REDIS_CONNECTION });
    try {
      const counts = await queue.getJobCounts(
        "waiting",
        "active",
        "completed",
        "failed",
        "delayed"
      );
      stats.push({ name: config.name, ...counts });
    } finally {
      await queue.close();
    }
  }

  return NextResponse.json({ stats });
}
```

### Verification
```bash
cd /Users/hrushiborhade/Developer/task-queue/apps/web
bunx tsc --noEmit

# Test API routes:
bun run dev
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"type": "text_gen", "input": {"prompt": "Hello world"}}'

curl http://localhost:3000/api/tasks
curl http://localhost:3000/api/admin/stats
```

### Learning concepts
- **Orphan prevention**: If enqueue fails after DB insert, mark the task as "failed" immediately. Never leave a "queued" task with no job in Redis.
- **`input as unknown as Json`**: TypeScript needs this double-cast because `TaskInput` (our custom type) doesn't directly match Supabase's `Json` type.
- **`.select().single()`**: Returns the inserted row directly. Without `.select()`, Supabase returns nothing.
- **Bulk insert**: `supabase.from("tasks").insert(array).select()` inserts all rows in one query.
- **Parallel enqueue**: `Promise.all(tasks.map(...))` enqueues all jobs concurrently.

---

## Step 19: shadcn CLI 4 + Dashboard Layout

### Why
shadcn/ui provides production-quality React components. Version 4 uses a CLI that supports Next.js 15+/16 with Tailwind CSS v4.

### Initialize shadcn
```bash
cd /Users/hrushiborhade/Developer/task-queue/apps/web
bunx shadcn@latest init
```

Follow the prompts:
- Style: New York
- Base color: Neutral
- CSS variables: Yes

### Add components
```bash
bunx shadcn@latest add button card badge dialog progress tabs separator
```

### Create dashboard page

**`apps/web/app/page.tsx`**:

```typescript
import { createClient } from "@/lib/supabase/server";
import { DashboardClient } from "@/components/dashboard-client";

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: tasks } = await supabase
    .from("tasks")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: batchRuns } = await supabase
    .from("batch_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <DashboardClient
      initialTasks={tasks ?? []}
      initialBatches={batchRuns ?? []}
    />
  );
}
```

### Create dashboard client component

**`apps/web/components/dashboard-client.tsx`**:

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TaskGrid } from "@/components/task-grid";
import { BatchProgress } from "@/components/batch-progress";
import { CreateTaskDialog } from "@/components/create-task-dialog";
import type { Tables } from "@/lib/database.types";

interface DashboardClientProps {
  initialTasks: Tables<"tasks">[];
  initialBatches: Tables<"batch_runs">[];
}

export function DashboardClient({
  initialTasks,
  initialBatches,
}: DashboardClientProps) {
  const [createOpen, setCreateOpen] = useState(false);

  async function handleCreateBatch() {
    const res = await fetch("/api/tasks/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count: 20 }),
    });
    if (!res.ok) {
      console.error("Failed to create batch");
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Task Queue Dashboard</h1>
        <div className="flex gap-2">
          <Button onClick={() => setCreateOpen(true)}>Create Task</Button>
          <Button variant="outline" onClick={handleCreateBatch}>
            Batch (20 tasks)
          </Button>
        </div>
      </div>

      <Tabs defaultValue="tasks">
        <TabsList>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="batches">Batches</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks">
          <TaskGrid initialTasks={initialTasks} />
        </TabsContent>

        <TabsContent value="batches">
          <div className="grid gap-4">
            {initialBatches.map((batch) => (
              <BatchProgress key={batch.id} batch={batch} />
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <CreateTaskDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
```

### Create TaskGrid, TaskCard, BatchProgress, CreateTaskDialog

These are basic implementations — we'll polish them in the frontend overhaul phase.

**`apps/web/components/task-grid.tsx`**:

```typescript
"use client";

import { TaskCard } from "@/components/task-card";
import type { Tables } from "@/lib/database.types";

interface TaskGridProps {
  initialTasks: Tables<"tasks">[];
}

export function TaskGrid({ initialTasks }: TaskGridProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {initialTasks.map((task) => (
        <TaskCard key={task.id} task={task} />
      ))}
    </div>
  );
}
```

**`apps/web/components/task-card.tsx`**:

```typescript
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { Tables } from "@/lib/database.types";

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-yellow-500/10 text-yellow-500",
  active: "bg-blue-500/10 text-blue-500",
  completed: "bg-green-500/10 text-green-500",
  failed: "bg-red-500/10 text-red-500",
};

interface TaskCardProps {
  task: Tables<"tasks">;
}

export function TaskCard({ task }: TaskCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{task.type}</CardTitle>
          <Badge className={STATUS_COLORS[task.status] ?? ""}>
            {task.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Progress value={task.progress} className="mb-2" />
        <p className="text-xs text-muted-foreground truncate">
          {(task.input as { prompt?: string })?.prompt ?? "No prompt"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {new Date(task.created_at).toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}
```

**`apps/web/components/batch-progress.tsx`**:

```typescript
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import type { Tables } from "@/lib/database.types";

interface BatchProgressProps {
  batch: Tables<"batch_runs">;
}

export function BatchProgress({ batch }: BatchProgressProps) {
  const percent =
    batch.total_tasks > 0
      ? Math.round((batch.completed_count / batch.total_tasks) * 100)
      : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">
            Batch: {batch.id.slice(0, 8)}...
          </CardTitle>
          <Badge>{batch.status}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Progress value={percent} />
        <p className="text-sm text-muted-foreground mt-2">
          {batch.completed_count}/{batch.total_tasks} tasks ({percent}%)
        </p>
      </CardContent>
    </Card>
  );
}
```

**`apps/web/components/create-task-dialog.tsx`**:

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { TASK_TYPES } from "@repo/shared";

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateTaskDialog({ open, onOpenChange }: CreateTaskDialogProps) {
  const [type, setType] = useState(TASK_TYPES[0]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setLoading(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, input: { prompt } }),
      });
      if (res.ok) {
        setPrompt("");
        onOpenChange(false);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Task Type</label>
            <select
              className="w-full mt-1 p-2 border rounded-md"
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
            >
              {TASK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">Prompt</label>
            <textarea
              className="w-full mt-1 p-2 border rounded-md min-h-[100px]"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter your prompt..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={loading || !prompt}>
            {loading ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### Verification
```bash
cd /Users/hrushiborhade/Developer/task-queue/apps/web
bunx tsc --noEmit
bun run build
bun run dev
# Open http://localhost:3000
```

### Learning concepts
- **Server Component** (page.tsx): Fetches data on the server, passes to client component as props
- **Client Component** (`"use client"`): Handles interactivity — state, events, browser APIs
- **shadcn components**: Not a library — copies component source into your project. You own the code.
- **`Tables<"tasks">`**: Type helper from generated `database.types.ts` — auto-typed to your schema

---

## Step 20: Queue Health Dashboard

### Why
Operators need to see queue health at a glance: how many jobs waiting, active, failed per queue.

### Create QueueHealth component

**`apps/web/components/queue-health.tsx`**:

```typescript
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface QueueStat {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export function QueueHealth() {
  const [stats, setStats] = useState<QueueStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/admin/stats");
        const data = await res.json();
        setStats(data.stats);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
    const interval = setInterval(fetchStats, 5_000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <p>Loading queue stats...</p>;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {stats.map((stat) => (
        <Card key={stat.name}>
          <CardHeader>
            <CardTitle className="text-sm font-medium">{stat.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Waiting:</span>{" "}
                <span className="font-mono">{stat.waiting}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Active:</span>{" "}
                <span className="font-mono text-blue-500">{stat.active}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Completed:</span>{" "}
                <span className="font-mono text-green-500">
                  {stat.completed}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Failed:</span>{" "}
                <span className="font-mono text-red-500">{stat.failed}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

### Add QueueHealth tab to dashboard

Update `apps/web/components/dashboard-client.tsx` to add a third tab:

```typescript
import { QueueHealth } from "@/components/queue-health";

// Inside Tabs:
<TabsTrigger value="queues">Queue Health</TabsTrigger>

<TabsContent value="queues">
  <QueueHealth />
</TabsContent>
```

### Verification
```bash
cd /Users/hrushiborhade/Developer/task-queue/apps/web
bun run dev
# Navigate to Queue Health tab — should show all 7 queues with job counts
```

### Learning concepts
- **Polling vs WebSocket**: Queue stats poll every 5s via `setInterval`. For higher frequency, consider WebSockets or Server-Sent Events.
- **Cleanup in useEffect**: `return () => clearInterval(interval)` prevents memory leaks when the component unmounts.
