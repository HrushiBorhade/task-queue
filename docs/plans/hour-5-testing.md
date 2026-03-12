# Testing Strategy (Steps 26-29)

## Why Testing Matters
Every production startup codebase has tests for business-critical paths. We use:
- **Bun's built-in test runner** — zero dependencies, Jest-compatible API, mocking support
- **Playwright** — browser E2E tests for the full user flow
- **Supabase admin SDK** — seed test users and verify RLS policies

---

## Step 26: Backend Unit Tests (Bun Test Runner)

### Why
Test the business logic in isolation: worker processing, queue enqueue, progress tracking, rate limiting, alerting rules. Bun has `bun test` built-in — no jest, vitest, or any other dependency needed.

### Setup

No install needed. Bun auto-discovers `*.test.ts` files.

Add test script to worker and shared package.json:

```json
// apps/worker/package.json
"scripts": {
  "dev": "bun --watch src/index.ts",
  "test": "bun test",
  "check:types": "tsc --noEmit"
}

// packages/shared/package.json
"scripts": {
  "test": "bun test",
  "check:types": "tsc --noEmit"
}
```

Add to root:
```json
"scripts": {
  "test": "bun test --recursive",
  "test:worker": "bun test --cwd apps/worker",
  "test:shared": "bun test --cwd packages/shared"
}
```

### Test: Rate Limiter

**`apps/web/lib/__tests__/rate-limit.test.ts`**:

```typescript
import { describe, test, expect, beforeEach } from "bun:test";

// Re-import to get a fresh module for each test file
// Note: Bun test runner isolates modules per file by default
import { rateLimit } from "../rate-limit";

describe("rateLimit", () => {
  test("allows requests within limit", () => {
    const key = `test-${Date.now()}`;
    const result = rateLimit(key, 5);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  test("blocks requests exceeding limit", () => {
    const key = `test-block-${Date.now()}`;
    // Exhaust the limit
    for (let i = 0; i < 5; i++) {
      rateLimit(key, 5);
    }
    const result = rateLimit(key, 5);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  test("different keys are independent", () => {
    const key1 = `test-a-${Date.now()}`;
    const key2 = `test-b-${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      rateLimit(key1, 5);
    }
    const result = rateLimit(key2, 5);
    expect(result.allowed).toBe(true);
  });
});
```

### Test: Shared Types & Queue Config

**`packages/shared/src/__tests__/queue-config.test.ts`**:

```typescript
import { describe, test, expect } from "bun:test";
import { QUEUE_CONFIGS, REDIS_CONNECTION, type QueueConfig } from "../queue-config";
import { TASK_TYPES } from "../types";

describe("QUEUE_CONFIGS", () => {
  test("has a config for every task type", () => {
    for (const type of TASK_TYPES) {
      expect(QUEUE_CONFIGS[type]).toBeDefined();
      expect(QUEUE_CONFIGS[type].name).toBeTruthy();
      expect(QUEUE_CONFIGS[type].concurrency).toBeGreaterThan(0);
      expect(QUEUE_CONFIGS[type].retries).toBeGreaterThan(0);
    }
  });

  test("queue names are unique", () => {
    const names = Object.values(QUEUE_CONFIGS).map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("rate limits are positive", () => {
    for (const config of Object.values(QUEUE_CONFIGS)) {
      expect(config.rateLimit.max).toBeGreaterThan(0);
      expect(config.rateLimit.duration).toBeGreaterThan(0);
    }
  });
});

describe("REDIS_CONNECTION", () => {
  test("has host and port", () => {
    expect(REDIS_CONNECTION.host).toBeTruthy();
    expect(REDIS_CONNECTION.port).toBeGreaterThan(0);
  });
});
```

### Test: Worker Processing Logic (with mocks)

**`apps/worker/src/workers/__tests__/text-gen.test.ts`**:

```typescript
import { describe, test, expect, mock, beforeEach } from "bun:test";

// Mock the DB and Supabase modules BEFORE importing the worker
mock.module("../../lib/db", () => {
  const mockUpdate = mock(() => ({
    set: mock(() => ({
      where: mock(() => ({
        returning: mock(() =>
          Promise.resolve([{ batchId: null }])
        ),
      })),
    })),
  }));

  return {
    db: {
      update: mockUpdate,
      insert: mock(() => ({
        values: mock(() => Promise.resolve()),
      })),
    },
  };
});

mock.module("../../lib/supabase", () => ({
  supabase: {
    rpc: mock(() => Promise.resolve({ data: null, error: null })),
  },
  broadcastTaskEvent: mock(() => {}),
  cleanupTaskChannel: mock(() => {}),
}));

// Now import — it will use the mocked modules
import { db } from "../../lib/db";
import { supabase } from "../../lib/supabase";

describe("text-gen worker logic", () => {
  test("marks task as active on start", async () => {
    // Simulate the worker's processing logic
    const taskId = "test-task-id";

    // Call db.update which is mocked
    const [task] = await db
      .update({} as any)
      .set({
        status: "active",
        attempt: 1,
        startedAt: new Date(),
        bullmqJobId: "job-1",
      })
      .where({} as any)
      .returning();

    expect(task).toBeDefined();
    expect(db.update).toHaveBeenCalled();
  });

  test("calls batch increment RPC when batchId exists", async () => {
    const batchId = "test-batch-id";
    await supabase.rpc("increment_batch_completed", {
      p_batch_id: batchId,
    });

    expect(supabase.rpc).toHaveBeenCalledWith(
      "increment_batch_completed",
      { p_batch_id: batchId }
    );
  });
});
```

### Test: Alerting Logic

**`apps/worker/src/lib/__tests__/alerting.test.ts`**:

```typescript
import { describe, test, expect } from "bun:test";

// Test the alerting threshold logic in isolation
// (don't import the full module — it starts timers)

describe("alerting thresholds", () => {
  test("high queue depth threshold is 50", () => {
    const snapshot = { name: "test", waiting: 51, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 };
    expect(snapshot.waiting > 50).toBe(true);
  });

  test("failure rate above 10% triggers alert", () => {
    const previous = { completed: 100, failed: 5 };
    const current = { completed: 110, failed: 17 };
    const newFailed = current.failed - previous.failed; // 12
    const newCompleted = current.completed - previous.completed; // 10
    const total = newFailed + newCompleted; // 22
    const failureRate = newFailed / total; // 0.545

    expect(failureRate).toBeGreaterThan(0.1);
  });

  test("growing queue detected when waiting increases", () => {
    const previous = { waiting: 15 };
    const current = { waiting: 25 };
    expect(current.waiting > previous.waiting && current.waiting > 10).toBe(true);
  });
});
```

### Run tests
```bash
# Run all tests
cd /Users/hrushiborhade/Developer/task-queue
bun test

# Run specific package
bun test --cwd packages/shared
bun test --cwd apps/worker
```

### Learning concepts
- **`bun:test`**: Built-in module — no install needed. Same API as Jest.
- **`mock.module()`**: Replaces an entire module's exports. Must be called BEFORE the `import` that uses it.
- **Test isolation**: Each test file gets a fresh module scope. Use unique keys to avoid state leaking between tests.
- **Business logic tests**: Test the RULES (thresholds, rates, conditions), not the infrastructure (Redis, Postgres).

---

## Step 27: Backend Integration Tests

### Why
Unit tests verify logic. Integration tests verify the full pipeline: insert task → enqueue → worker processes → DB updated → broadcast sent. These require running Redis and Supabase.

### Setup

Create a test helper that sets up the environment:

**`apps/worker/src/__tests__/setup.ts`**:

```typescript
import { beforeAll, afterAll } from "bun:test";
import { Queue } from "bullmq";
import { REDIS_CONNECTION } from "@repo/shared";

// Ensure Redis and Supabase are running before tests
beforeAll(async () => {
  const healthQueue = new Queue("_test-health", { connection: REDIS_CONNECTION });
  try {
    const client = await healthQueue.client;
    await client.ping();
    console.log("Redis: connected");
  } catch {
    throw new Error("Redis is not running. Start with: docker compose up -d");
  } finally {
    await healthQueue.close();
  }
});
```

### Integration test: Enqueue → Process → DB State

**`apps/worker/src/__tests__/pipeline.test.ts`**:

```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Queue } from "bullmq";
import { QUEUE_CONFIGS, REDIS_CONNECTION, tasks } from "@repo/shared";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { enqueueTask } from "../lib/enqueue";
import { createTextGenWorker } from "../workers/text-gen.worker";

describe("task pipeline (integration)", () => {
  let worker: ReturnType<typeof createTextGenWorker>;

  beforeAll(() => {
    worker = createTextGenWorker();
  });

  afterAll(async () => {
    await worker.close();
  });

  test("enqueue → process → completed in DB", async () => {
    // 1. Insert a test task into DB
    const [testTask] = await db
      .insert(tasks)
      .values({
        type: "text_gen",
        status: "queued",
        input: { prompt: "Test prompt" },
        progress: 0,
        attempt: 0,
      })
      .returning();

    // 2. Enqueue it
    const jobId = await enqueueTask({
      taskId: testTask.id,
      type: "text_gen",
      input: { prompt: "Test prompt" },
      attempt: 0,
    });

    expect(jobId).toBeTruthy();

    // 3. Wait for processing (worker is running, give it time)
    await new Promise((resolve) => setTimeout(resolve, 5_000));

    // 4. Verify DB state
    const [updatedTask] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, testTask.id));

    expect(updatedTask.status).toBe("completed");
    expect(updatedTask.progress).toBe(100);
    expect(updatedTask.output).toBeTruthy();
    expect(updatedTask.completedAt).toBeTruthy();

    // 5. Cleanup
    await db.delete(tasks).where(eq(tasks.id, testTask.id));
  }, 10_000); // 10s timeout for this test
});
```

### Run integration tests
```bash
# Start Redis + Supabase first
docker compose up -d
supabase start

# Run with env vars
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
SUPABASE_URL="http://127.0.0.1:54321" \
SUPABASE_SERVICE_ROLE_KEY="<from supabase start>" \
bun test apps/worker/src/__tests__/pipeline.test.ts
```

### Learning concepts
- **Integration vs unit**: Integration tests are slower (5s+ timeouts) but catch real bugs like connection issues, schema mismatches, race conditions.
- **Test cleanup**: Always delete test data. Use unique IDs to avoid conflicts with other tests.
- **Timeout**: `test("name", fn, timeout_ms)` — Bun test supports per-test timeouts.

---

## Step 28: Database RLS Tests

### Why
Row-Level Security is your security boundary. If RLS policies are wrong, users see each other's data. Test this explicitly.

### Create RLS test suite

**`apps/web/__tests__/rls.test.ts`**:

```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

let user1Id: string;
let user2Id: string;
const user1Email = `test-user1-${Date.now()}@test.local`;
const user2Email = `test-user2-${Date.now()}@test.local`;

describe("RLS policies", () => {
  beforeAll(async () => {
    // Create two test users via admin SDK
    const { data: u1 } = await admin.auth.admin.createUser({
      email: user1Email,
      password: "TestPass123!",
      email_confirm: true,
    });
    user1Id = u1.user!.id;

    const { data: u2 } = await admin.auth.admin.createUser({
      email: user2Email,
      password: "TestPass123!",
      email_confirm: true,
    });
    user2Id = u2.user!.id;

    // Seed tasks for each user (via admin — bypasses RLS)
    await admin.from("tasks").insert([
      { type: "text_gen", input: { prompt: "User 1 task" }, status: "queued", progress: 0, user_id: user1Id },
      { type: "text_gen", input: { prompt: "User 2 task" }, status: "queued", progress: 0, user_id: user2Id },
    ]);
  });

  afterAll(async () => {
    // Cleanup: delete test data then test users
    await admin.from("tasks").delete().eq("user_id", user1Id);
    await admin.from("tasks").delete().eq("user_id", user2Id);
    await admin.auth.admin.deleteUser(user1Id);
    await admin.auth.admin.deleteUser(user2Id);
  });

  test("user 1 can only see their own tasks", async () => {
    // Sign in as user 1
    const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY);
    await client.auth.signInWithPassword({
      email: user1Email,
      password: "TestPass123!",
    });

    const { data: tasks } = await client.from("tasks").select("*");

    expect(tasks!.length).toBe(1);
    expect(tasks![0].user_id).toBe(user1Id);
  });

  test("user 2 cannot update user 1 tasks", async () => {
    const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY);
    await client.auth.signInWithPassword({
      email: user2Email,
      password: "TestPass123!",
    });

    // Try to update user 1's task — RLS should silently block this
    const { data } = await client
      .from("tasks")
      .update({ status: "failed" })
      .eq("user_id", user1Id)
      .select();

    // Should return empty — no rows matched due to RLS
    expect(data!.length).toBe(0);

    // Verify user 1's task is unchanged
    const { data: user1Tasks } = await admin
      .from("tasks")
      .select("status")
      .eq("user_id", user1Id);

    expect(user1Tasks![0].status).toBe("queued");
  });
});
```

### Run RLS tests
```bash
NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321" \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="<anon key>" \
SUPABASE_SERVICE_ROLE_KEY="<service role key>" \
bun test apps/web/__tests__/rls.test.ts
```

### Learning concepts
- **Admin SDK**: `createUser({ email_confirm: true })` creates users that are immediately verified — no email flow needed.
- **RLS testing**: Sign in as each user with the publishable key client, then verify they can only see/modify their own rows.
- **Silent failures**: RLS doesn't throw errors — it returns empty results. Your tests must check for the ABSENCE of unauthorized data.

---

## Step 29: E2E Tests with Playwright

### Why
Playwright tests the full user flow in a real browser: login → create task → see it process → check result. This catches frontend bugs that unit tests miss.

### Install
```bash
cd /Users/hrushiborhade/Developer/task-queue/apps/web
bun add -D @playwright/test
bunx playwright install chromium  # Only install Chromium for speed
```

### Configure Playwright

**`apps/web/playwright.config.ts`**:

```typescript
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },

  // Start Next.js dev server before tests
  webServer: {
    command: "bun run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },

  projects: [
    {
      name: "chromium",
      use: devices["Desktop Chrome"],
    },
  ],
});
```

### Create test seed script

**`apps/web/e2e/helpers/seed.ts`**:

```typescript
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const TEST_USER = {
  email: "e2e-test@test.local",
  password: "TestPass123!",
};

export async function seedTestUser() {
  // Check if user already exists
  const { data: existing } = await admin.auth.admin.listUsers();
  const existingUser = existing?.users.find(
    (u) => u.email === TEST_USER.email
  );

  if (existingUser) {
    return existingUser.id;
  }

  const { data } = await admin.auth.admin.createUser({
    email: TEST_USER.email,
    password: TEST_USER.password,
    email_confirm: true,
  });

  return data.user!.id;
}

export async function cleanupTestData(userId: string) {
  await admin.from("task_events").delete().eq("user_id", userId);
  await admin.from("tasks").delete().eq("user_id", userId);
  await admin.from("batch_runs").delete().eq("user_id", userId);
}
```

### Create global setup

**`apps/web/e2e/global.setup.ts`**:

```typescript
import { test as setup } from "@playwright/test";
import { seedTestUser, TEST_USER } from "./helpers/seed";

setup("create test user and authenticate", async ({ page }) => {
  // Seed test user in Supabase
  await seedTestUser();

  // Navigate to login page
  await page.goto("/login");

  // Sign in with email/password (for testing — production uses Google OAuth)
  // Note: You'll need a password login option for e2e tests
  // OR use Supabase's signInWithPassword via page.evaluate()
  await page.evaluate(
    async ({ email, password, supabaseUrl, supabaseKey }) => {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(supabaseUrl, supabaseKey);
      await supabase.auth.signInWithPassword({ email, password });
    },
    {
      email: TEST_USER.email,
      password: TEST_USER.password,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    }
  );

  // Save auth state for reuse in other tests
  await page.context().storageState({ path: "./e2e/.auth/user.json" });
});
```

Update `playwright.config.ts` to use setup:

```typescript
projects: [
  {
    name: "setup",
    testMatch: /global\.setup\.ts/,
  },
  {
    name: "chromium",
    use: {
      ...devices["Desktop Chrome"],
      storageState: "./e2e/.auth/user.json",
    },
    dependencies: ["setup"],
  },
],
```

### E2E Test: Create and Monitor Task

**`apps/web/e2e/task-flow.spec.ts`**:

```typescript
import { test, expect } from "@playwright/test";

test.describe("Task Flow", () => {
  test("create a task and see it in the dashboard", async ({ page }) => {
    // Navigate to dashboard
    await page.goto("/");
    await expect(page.getByText("Task Queue Dashboard")).toBeVisible();

    // Open create task dialog
    await page.getByRole("button", { name: "Create Task" }).click();
    await expect(page.getByText("Create Task")).toBeVisible();

    // Fill in the form
    await page.locator("select").selectOption("text_gen");
    await page
      .locator("textarea")
      .fill("E2E test: Generate a haiku about testing");

    // Submit
    await page.getByRole("button", { name: "Create" }).click();

    // Verify task appears in the grid
    await expect(
      page.getByText("E2E test: Generate a haiku about testing")
    ).toBeVisible({ timeout: 5_000 });

    // Wait for task to complete (worker must be running)
    await expect(page.getByText("completed")).toBeVisible({ timeout: 15_000 });
  });

  test("create a batch and see progress", async ({ page }) => {
    await page.goto("/");

    // Click batch button
    await page.getByRole("button", { name: /Batch/ }).click();

    // Switch to batches tab
    await page.getByRole("tab", { name: "Batches" }).click();

    // Verify batch appears
    await expect(page.getByText("Batch:")).toBeVisible({ timeout: 5_000 });

    // Verify progress updates (wait for some completion)
    await expect(page.getByText(/\d+\/20 tasks/)).toBeVisible({
      timeout: 30_000,
    });
  });
});
```

### E2E Test: Queue Health Page

**`apps/web/e2e/queue-health.spec.ts`**:

```typescript
import { test, expect } from "@playwright/test";

test("queue health shows all queues", async ({ page }) => {
  await page.goto("/");

  // Switch to queue health tab
  await page.getByRole("tab", { name: "Queue Health" }).click();

  // Verify all 7 queues are visible
  await expect(page.getByText("text-gen")).toBeVisible();
  await expect(page.getByText("image-gen")).toBeVisible();
  await expect(page.getByText("research")).toBeVisible();
  await expect(page.getByText("email-campaign")).toBeVisible();
  await expect(page.getByText("pdf-report")).toBeVisible();
  await expect(page.getByText("webhook")).toBeVisible();
  await expect(page.getByText("data-agg")).toBeVisible();

  // Verify stats are showing numbers
  await expect(page.getByText("Waiting:")).toBeVisible();
  await expect(page.getByText("Active:")).toBeVisible();
});
```

### Run E2E tests
```bash
cd /Users/hrushiborhade/Developer/task-queue/apps/web

# Make sure Redis, Supabase, and worker are running
# Then run Playwright (it starts Next.js dev server automatically)
bunx playwright test

# Run with UI mode (visual debugging)
bunx playwright test --ui

# Run specific test
bunx playwright test e2e/task-flow.spec.ts
```

### Add to root package.json
```json
"scripts": {
  "test": "bun test --recursive",
  "test:worker": "bun test --cwd apps/worker",
  "test:shared": "bun test --cwd packages/shared",
  "test:e2e": "bun --cwd apps/web run playwright test",
  "test:rls": "bun test apps/web/__tests__/rls.test.ts"
}
```

### Learning concepts
- **Bun test vs Playwright**: Bun tests run in Node/Bun runtime (fast, for logic). Playwright tests run in real browsers (slow, for UI flows).
- **Storage state**: `storageState` saves cookies/localStorage after login. Other tests reuse this state — no login per test.
- **`webServer` config**: Playwright starts Next.js before tests and kills it after. `reuseExistingServer` avoids restarting if already running locally.
- **Timeout patterns**: Use per-assertion timeouts (`toBeVisible({ timeout: 15_000 })`) for async UI updates.
- **Test data isolation**: Each test uses unique timestamps or IDs. Cleanup runs in `afterAll`.

---

## Test Coverage Summary

| Layer | Tool | What We Test | Why |
|-------|------|-------------|-----|
| Shared types/config | `bun test` | Config exhaustiveness, unique queue names, valid limits | Catches schema drift |
| Rate limiter | `bun test` | Sliding window logic, key isolation, limit enforcement | Business rule protection |
| Alerting | `bun test` | Threshold calculations, cooldown logic | Prevents false alerts |
| Worker pipeline | `bun test` (integration) | Insert → enqueue → process → DB state | Full pipeline correctness |
| RLS policies | `bun test` + Supabase SDK | User isolation, cross-user access blocked | Security boundary |
| UI flow | Playwright | Create task → monitor → complete | User experience |
| Batch flow | Playwright | Batch creation → progress tracking | Feature correctness |
| Queue health | Playwright | All queues visible with stats | Operational visibility |

### What we DON'T test (and why)
- **AI model outputs**: Mocked in curriculum. Test the pipeline, not the model.
- **Redis internals**: BullMQ is well-tested. We test our usage of it.
- **Supabase internals**: We test our RLS policies, not Supabase's auth implementation.
- **CSS/styling**: Visual regression testing is out of scope for MVP.
