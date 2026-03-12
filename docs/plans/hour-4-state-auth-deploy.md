# Hour 4: Auth + State + Deploy (Steps 21-25)

## Prerequisites
- Hours 1-3 complete (database, workers, observability, Next.js app, API routes, dashboard)
- Everything running locally

---

## Step 21: TanStack Query (Hooks, Cache, Mutations)

### Why
Raw `fetch()` + `useState` doesn't handle: loading states, error states, cache invalidation, background refetching, optimistic updates, or deduplication. TanStack Query provides all of this with minimal code.

### Install
```bash
cd /Users/hrushiborhade/Developer/task-queue
bun add @tanstack/react-query --filter web
```

### Create query client + provider

**`apps/web/lib/query-client.ts`**:

```typescript
import { QueryClient } from "@tanstack/react-query";

let queryClient: QueryClient | null = null;

export function getQueryClient(): QueryClient {
  if (!queryClient) {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 5_000,
          refetchOnWindowFocus: false,
        },
      },
    });
  }
  return queryClient;
}
```

**`apps/web/lib/query-keys.ts`**:

```typescript
export const queryKeys = {
  tasks: {
    all: ["tasks"] as const,
    list: () => [...queryKeys.tasks.all, "list"] as const,
  },
  batches: {
    all: ["batches"] as const,
    list: () => [...queryKeys.batches.all, "list"] as const,
  },
  stats: {
    queues: ["stats", "queues"] as const,
  },
} as const;
```

**`apps/web/components/providers/query.tsx`**:

```typescript
"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/query-client";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```

### Wire into layout

**`apps/web/app/layout.tsx`** — wrap children in QueryProvider:

```typescript
import { QueryProvider } from "@/components/providers/query";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
```

### Create hooks

**`apps/web/hooks/use-queue-stats.ts`**:

```typescript
"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";

interface QueueStat {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export function useQueueStats() {
  return useQuery({
    queryKey: queryKeys.stats.queues,
    queryFn: async (): Promise<QueueStat[]> => {
      const res = await fetch("/api/admin/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      const data = await res.json();
      return data.stats;
    },
    refetchInterval: 5_000,
  });
}
```

**`apps/web/hooks/use-tasks.ts`**:

```typescript
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import type { TaskType, TaskInput } from "@repo/shared";

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      type,
      input,
    }: {
      type: TaskType;
      input: TaskInput;
    }) => {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, input }),
      });
      if (!res.ok) throw new Error("Failed to create task");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });
}

export function useCreateBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (count: number) => {
      const res = await fetch("/api/tasks/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count }),
      });
      if (!res.ok) throw new Error("Failed to create batch");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.batches.all });
    },
  });
}
```

### Update components to use hooks

Replace raw `fetch()` calls in `dashboard-client.tsx` with the mutation hooks:

```typescript
const createTask = useCreateTask();
const createBatch = useCreateBatch();

// In handlers:
async function handleCreateBatch() {
  createBatch.mutate(20);
}
```

Replace polling in `queue-health.tsx` with `useQueueStats()`:

```typescript
const { data: stats, isLoading } = useQueueStats();
```

### Verification
```bash
cd /Users/hrushiborhade/Developer/task-queue/apps/web
bunx tsc --noEmit
bun run build
```

### Learning concepts
- **Query keys**: Hierarchical arrays that TanStack uses for cache matching. `invalidateQueries({ queryKey: ["tasks"] })` invalidates all queries starting with "tasks".
- **`staleTime`**: How long data is considered "fresh." After this, the next component mount triggers a background refetch.
- **`refetchInterval`**: Automatic polling. The query refetches every N ms while the component is mounted.
- **`useMutation`**: For create/update/delete operations. `onSuccess` invalidates related queries.
- **`invalidateQueries`**: Marks cached data as stale and triggers a refetch if any component is using it.

---

## Step 22: Realtime Hooks (useTaskRealtime + useTaskStream)

### Why
Two types of live updates:
1. **Postgres Changes** (via Supabase Realtime): When a task's status changes in the DB, the UI updates without polling. Uses `postgres_changes` subscription.
2. **Broadcast**: When the worker streams text chunks, the UI shows them in real-time. Uses `broadcast` subscription on a per-task channel.

### Create useTaskRealtime hook

**`apps/web/hooks/use-task-realtime.ts`**:

```typescript
"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";

type Task = Tables<"tasks">;

export function useTaskRealtime(initialTasks: Task[]) {
  const channelId = useId();
  const [updates, setUpdates] = useState<Map<string, Task>>(new Map());

  // Reset updates when initialTasks change
  const [trackedInitial, setTrackedInitial] = useState(initialTasks);
  if (trackedInitial !== initialTasks) {
    setTrackedInitial(initialTasks);
    setUpdates(new Map());
  }

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`tasks-realtime-${channelId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tasks" },
        (payload) => {
          const task = payload.new as Task;
          setUpdates((prev) => new Map(prev).set(task.id, task));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tasks" },
        (payload) => {
          const task = payload.new as Task;
          setUpdates((prev) => new Map(prev).set(task.id, task));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelId]);

  const tasks = useMemo(() => {
    const taskMap = new Map(initialTasks.map((t) => [t.id, t]));
    for (const [id, task] of updates) {
      taskMap.set(id, task);
    }
    return Array.from(taskMap.values()).sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [initialTasks, updates]);

  return { tasks };
}
```

### Create useTaskStream hook

**`apps/web/hooks/use-task-stream.ts`**:

```typescript
"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { BroadcastEvent } from "@repo/shared";

export function useTaskStream(taskId: string | null) {
  const [state, setState] = useState<{
    taskId: string | null;
    events: BroadcastEvent[];
    streamedText: string;
  }>({ taskId, events: [], streamedText: "" });

  // Reset on taskId change
  if (state.taskId !== taskId) {
    setState({ taskId, events: [], streamedText: "" });
  }

  const clear = useCallback(() => {
    setState((prev) => ({ ...prev, events: [], streamedText: "" }));
  }, []);

  useEffect(() => {
    if (!taskId) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`task:${taskId}`)
      .on("broadcast", { event: "task-event" }, ({ payload }) => {
        const event = payload as BroadcastEvent;

        setState((prev) => {
          if (prev.taskId !== taskId) return prev;
          return {
            ...prev,
            events: [...prev.events, event],
            streamedText:
              event.type === "chunk"
                ? prev.streamedText + event.message
                : prev.streamedText,
          };
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [taskId]);

  return {
    events: state.events,
    streamedText: state.streamedText,
    clear,
  };
}
```

### Wire useTaskRealtime into TaskGrid

Update `apps/web/components/task-grid.tsx`:

```typescript
"use client";

import { useTaskRealtime } from "@/hooks/use-task-realtime";
import { TaskCard } from "@/components/task-card";
import type { Tables } from "@/lib/database.types";

interface TaskGridProps {
  initialTasks: Tables<"tasks">[];
}

export function TaskGrid({ initialTasks }: TaskGridProps) {
  const { tasks } = useTaskRealtime(initialTasks);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} />
      ))}
    </div>
  );
}
```

### Verification
```bash
cd /Users/hrushiborhade/Developer/task-queue/apps/web
bunx tsc --noEmit

# Integration test:
# 1. Start worker (bun run dev:worker)
# 2. Start web (bun run dev:web)
# 3. Create a task via UI
# 4. Watch the task card update in real-time (queued → active → completed)
```

### Learning concepts
- **postgres_changes**: Supabase listens to Postgres WAL (Write-Ahead Log) and pushes changes via WebSocket. Requires the table to be in the `supabase_realtime` publication.
- **Broadcast**: Application-level messaging. The worker sends a message, all connected browsers receive it. No DB involvement.
- **State reset in render**: `if (state.taskId !== taskId)` resets state synchronously during render — React allows this pattern for derived state.
- **`useId()`**: Generates a unique ID per component instance — prevents channel name collisions when multiple components use the same hook.

---

## Step 23: Supabase Auth (Google OAuth + RLS)

### Why
Multi-user support. Each user sees only their own tasks. Supabase Auth provides Google OAuth with minimal code. Row-Level Security (RLS) enforces data isolation at the database level.

### Create auth migration
```bash
cd /Users/hrushiborhade/Developer/task-queue
supabase migration new add_auth_and_rls
```

Write the migration:

```sql
-- Add user_id to all tables
ALTER TABLE batch_runs ADD COLUMN user_id UUID REFERENCES auth.users(id);
ALTER TABLE schedules ADD COLUMN user_id UUID REFERENCES auth.users(id);
ALTER TABLE tasks ADD COLUMN user_id UUID REFERENCES auth.users(id);
ALTER TABLE task_events ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- Create indexes for user_id
CREATE INDEX idx_batch_runs_user_id ON batch_runs(user_id);
CREATE INDEX idx_schedules_user_id ON schedules(user_id);
CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_task_events_user_id ON task_events(user_id);

-- Enable RLS on all tables
ALTER TABLE batch_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_events ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can only access their own data
CREATE POLICY "Users can view own batch_runs"
  ON batch_runs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own batch_runs"
  ON batch_runs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own batch_runs"
  ON batch_runs FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own schedules"
  ON schedules FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own schedules"
  ON schedules FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own schedules"
  ON schedules FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own schedules"
  ON schedules FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own tasks"
  ON tasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tasks"
  ON tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tasks"
  ON tasks FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own task_events"
  ON task_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own task_events"
  ON task_events FOR INSERT WITH CHECK (auth.uid() = user_id);
```

```bash
supabase db push
```

### Update auth helper (real auth)

**`apps/web/lib/auth.ts`** — replace the mock:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return { user, supabase };
}
```

### Update API routes to include user_id

In `apps/web/app/api/tasks/route.ts` POST, add `user_id: user.id` to the insert:

```typescript
const { data: task, error } = await supabase
  .from("tasks")
  .insert({
    type,
    input: input as unknown as Json,
    status: "queued",
    progress: 0,
    user_id: user.id,  // Add this
  })
  .select()
  .single();
```

Same for batch route — add `user_id: user.id` to batch_runs insert and task inserts.

### Create middleware

**`apps/web/middleware.ts`**:

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect unauthenticated users to login
  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth") &&
    !request.nextUrl.pathname.startsWith("/api/webhooks")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

### Create login page

**`apps/web/app/login/page.tsx`**:

```typescript
"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  async function handleGoogleLogin() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold">Task Queue</h1>
        <p className="text-muted-foreground">Sign in to manage your tasks</p>
        <Button onClick={handleGoogleLogin}>Sign in with Google</Button>
      </div>
    </div>
  );
}
```

### Create auth callback route

**`apps/web/app/auth/callback/route.ts`**:

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL("/", request.url));
}
```

### Configure Google OAuth in Supabase

For local development:
1. Go to http://127.0.0.1:54323 (local Supabase Studio)
2. Authentication → Providers → Google
3. Add your Google OAuth client ID and secret
4. Set redirect URL to `http://localhost:3000/auth/callback`

### Update worker to set user_id on tasks

The worker bypasses RLS (direct Postgres), so it doesn't need auth. But when creating task events, include the user_id from the task:

```typescript
// In ProgressTracker, look up user_id from the task:
const [task] = await db.select({ userId: tasks.userId }).from(tasks).where(eq(tasks.id, taskId));
// Store and use task.userId when inserting task_events
```

### Verification
```bash
cd /Users/hrushiborhade/Developer/task-queue
supabase db push
cd apps/web
bunx tsc --noEmit
bun run build
```

### Learning concepts
- **RLS (Row-Level Security)**: Postgres evaluates policies on every query. `auth.uid() = user_id` ensures users can only see their own data.
- **Middleware**: Runs on every request. Refreshes the session (keeps cookies alive) and redirects unauthenticated users.
- **PKCE flow**: `exchangeCodeForSession(code)` — the browser gets a code, the server exchanges it for a session. More secure than implicit flow.
- **Service role bypasses RLS**: The worker uses `SUPABASE_SERVICE_ROLE_KEY` and direct Postgres, so RLS doesn't apply.

---

## Step 24: Frontend Observability (Sentry + Vercel Analytics)

### Why
Production apps need error tracking and performance monitoring. Sentry catches runtime errors. Vercel Analytics tracks Core Web Vitals.

### Install
```bash
cd /Users/hrushiborhade/Developer/task-queue
bun add @sentry/nextjs @vercel/analytics @vercel/speed-insights --filter web
```

### Initialize Sentry
```bash
cd apps/web
bunx @sentry/wizard@latest -i nextjs
```

This creates:
- `sentry.client.config.ts`
- `sentry.server.config.ts`
- `sentry.edge.config.ts`
- `instrumentation.ts`

### Add Vercel Analytics to layout

**`apps/web/app/layout.tsx`**:

```typescript
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { QueryProvider } from "@/components/providers/query";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>{children}</QueryProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
```

### Add security headers

**`apps/web/next.config.ts`**:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
```

### Verification
```bash
cd /Users/hrushiborhade/Developer/task-queue/apps/web
bun run build
# Check for Sentry webpack plugin output
```

### Learning concepts
- **Sentry tunnel**: Routes error reports through your own domain to avoid ad blockers. Configure in `next.config.ts` if needed.
- **Core Web Vitals**: LCP, FID, CLS — Vercel Analytics tracks these automatically.
- **Security headers**: HSTS forces HTTPS, X-Frame-Options prevents clickjacking, nosniff prevents MIME sniffing.

---

## Step 25: Deploy Frontend (Vercel)

### Why
Vercel is the native hosting platform for Next.js. Zero-config deployment with automatic builds, previews, and edge network.

### Deploy
```bash
cd /Users/hrushiborhade/Developer/task-queue

# Install Vercel CLI
bun add -g vercel

# Login
vercel login

# Deploy (from the web app directory)
cd apps/web
vercel

# Follow prompts — select the project
# Set root directory to "apps/web" if asked
```

### Set environment variables in Vercel

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add REDIS_HOST
vercel env add REDIS_PORT
vercel env add SENTRY_DSN
```

### Important: Redis for production

BullMQ in the web app needs Redis access. For production:
- **Upstash Redis** (serverless, recommended for Vercel)
- **Railway Redis** (if worker is on Railway)
- **Redis Cloud** (managed)

Update `REDIS_HOST` and `REDIS_PORT` in Vercel to point to your production Redis.

### Important: Supabase for production

1. Create a Supabase project at https://supabase.com
2. Push local migrations to production:
   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
3. Update env vars in Vercel with production Supabase URL and keys

### Verification
```bash
vercel --prod
# Open the deployed URL
# Test: create a task, check it appears in the dashboard
```

### Learning concepts
- **Monorepo root directory**: Vercel needs to know the web app is at `apps/web`, not the repo root.
- **Serverless limitations**: Each API route runs as a serverless function. Long-running connections (like BullMQ Queue instances) are created per-request. The `Map<string, Queue>` pooling helps reuse connections within the same function invocation.
- **Edge vs Node.js runtime**: API routes using BullMQ must run on Node.js runtime (not Edge) because BullMQ uses ioredis which requires Node.js APIs.

---

## Final Verification Checklist

After completing all 25 steps:

```bash
# 1. Type check all packages
cd /Users/hrushiborhade/Developer/task-queue
bunx tsc --noEmit -p packages/shared/tsconfig.json
bunx tsc --noEmit -p apps/worker/tsconfig.json
bunx tsc --noEmit -p apps/web/tsconfig.json  # or: cd apps/web && bunx tsc --noEmit

# 2. Build web app
cd apps/web && bun run build

# 3. Lint web app
cd apps/web && bun run lint

# 4. Integration test
# Start everything:
docker compose up -d          # Redis
supabase start                # Postgres + Auth + Realtime
bun run dev:worker            # Worker process
bun run dev:web               # Next.js dev server

# Test flow:
# - Open http://localhost:3000
# - Sign in (or skip auth if still in dev mode)
# - Create a task → watch it process in real-time
# - Create a batch → watch progress bars fill up
# - Check Queue Health tab for stats
# - Open http://localhost:9091/admin/queues for Bull Board
# - curl http://localhost:9090 for health check
# - curl http://localhost:9092/metrics for Prometheus metrics
```

## Architecture Summary

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (React)                       │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Dashboard │  │ Realtime     │  │ Stream           │  │
│  │ (TanStack │  │ (postgres_   │  │ (broadcast       │  │
│  │  Query)   │  │  changes)    │  │  chunks)         │  │
│  └──────────┘  └──────────────┘  └──────────────────┘  │
└───────┬────────────────┬──────────────────┬─────────────┘
        │ HTTP            │ WebSocket        │ WebSocket
        ▼                 ▼                  ▼
┌───────────────┐  ┌──────────────────────────────────────┐
│  Next.js API  │  │         Supabase Realtime             │
│  Routes       │  │  (postgres_changes + broadcast)       │
│  ┌──────────┐ │  └──────────────────────────────────────┘
│  │ Supabase │ │
│  │ Client   │─────────┐
│  └──────────┘ │       │
│  ┌──────────┐ │       ▼
│  │ BullMQ   │ │  ┌─────────┐
│  │ Queue    │────│  Redis   │
│  └──────────┘ │  └────┬────┘
└───────────────┘       │
                        ▼
                  ┌──────────────────────────────────────┐
                  │           Worker Process              │
                  │  ┌──────────┐  ┌──────────────────┐  │
                  │  │ 7 BullMQ │  │ Health :9090     │  │
                  │  │ Workers  │  │ Bull Board :9091 │  │
                  │  │          │  │ Metrics :9092    │  │
                  │  └────┬─────┘  │ Alerting (60s)   │  │
                  │       │        └──────────────────┘  │
                  │       ▼                              │
                  │  ┌──────────┐  ┌──────────────────┐  │
                  │  │ Postgres │  │ Supabase Client  │  │
                  │  │ (direct) │  │ (broadcast only) │  │
                  │  └──────────┘  └──────────────────┘  │
                  └──────────────────────────────────────┘
```
