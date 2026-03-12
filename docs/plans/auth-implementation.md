# Auth Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Supabase Auth (Google OAuth + email/password) with RBAC, RLS, middleware route protection, and multi-tab refresh lock to task-queue.

**Architecture:** Supabase Auth handles identity (JWT issuance, OAuth flows, email confirm). A custom access token hook injects `user_role` from a `user_roles` table into every JWT. Middleware refreshes sessions and gates routes. RLS policies enforce ownership + admin override at the database level. The browser client uses BroadcastChannel to coordinate token refresh across tabs.

**Tech Stack:** Supabase Auth, @supabase/ssr, Next.js middleware, shadcn login-01 block, jwt-decode

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `supabase/migrations/2026..._add_auth_and_rls.sql` | user_id columns, user_roles table, RLS policies, custom access token hook |
| `apps/web/proxy.ts` | Session refresh, route protection, admin role gate (Next.js 16 renamed middleware → proxy) |
| `apps/web/app/auth/callback/route.ts` | OAuth + email confirm code exchange |
| `apps/web/app/login/page.tsx` | Login page (shadcn login-01 block) |
| `apps/web/app/login/actions.ts` | Server actions: signIn, signUp, signInWithGoogle |
| `apps/web/lib/auth.ts` | Cached getUser(), getRole(), unauthorized() |

### Modified Files
| File | Change |
|------|--------|
| `supabase/config.toml` | Enable Google OAuth, custom access token hook, email confirmations |
| `apps/web/lib/supabase/client.ts` | Add BroadcastChannel refresh lock (astral pattern) |
| `apps/web/app/api/tasks/route.ts` | Add auth check, include user_id in inserts |
| `apps/web/app/api/tasks/batch/route.ts` | Add auth check, include user_id in inserts |
| `apps/web/app/api/admin/stats/route.ts` | Add admin role check |
| `apps/web/app/page.tsx` | Add auth check, redirect to /login |
| `packages/shared/src/schema.ts` | Add userId column to all Drizzle tables, add userRoles table |
| `scripts/gen-env.ts` | Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET |

---

## Task 1: Database Migration — user_id, user_roles, RLS, Access Token Hook

**Files:**
- Create: `supabase/migrations/2026XXXX_add_auth_and_rls.sql`
- Modify: `packages/shared/src/schema.ts`

- [ ] **Step 1: Create the migration file**

```bash
cd /Users/hrushiborhade/Developer/task-queue
supabase migration new add_auth_and_rls
```

Then write this SQL into the generated file:

```sql
-- ============================================================
-- 1. Add user_id to all tables
-- ============================================================
ALTER TABLE tasks ADD COLUMN user_id UUID REFERENCES auth.users(id);
ALTER TABLE batch_runs ADD COLUMN user_id UUID REFERENCES auth.users(id);
ALTER TABLE schedules ADD COLUMN user_id UUID REFERENCES auth.users(id);
ALTER TABLE task_events ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- Indexes for RLS performance (every query filters by user_id)
CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_batch_runs_user_id ON batch_runs(user_id);
CREATE INDEX idx_schedules_user_id ON schedules(user_id);

-- ============================================================
-- 2. User roles table
-- ============================================================
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);

-- Auto-create role on signup via trigger
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- updated_at trigger for user_roles
CREATE TRIGGER user_roles_updated_at BEFORE UPDATE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 3. Custom Access Token Hook — injects user_role into JWT
-- ============================================================
CREATE OR REPLACE FUNCTION custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  user_role_value TEXT;
  claims JSONB;
BEGIN
  SELECT role INTO user_role_value
  FROM public.user_roles
  WHERE user_id = (event->>'user_id')::UUID;

  claims := event->'claims';
  claims := jsonb_set(claims, '{user_role}', to_jsonb(COALESCE(user_role_value, 'user')));
  event := jsonb_set(event, '{claims}', claims);

  RETURN event;
END;
$$;

-- Grant supabase_auth_admin access to call the hook
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT SELECT ON public.user_roles TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION custom_access_token_hook TO supabase_auth_admin;

-- ============================================================
-- 4. Enable RLS on all tables
-- ============================================================
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. RLS Policies — ownership + admin override
-- ============================================================

-- Helper: check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN COALESCE(
    (auth.jwt()->>'user_role') = 'admin',
    false
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- tasks
CREATE POLICY "Users see own tasks" ON tasks
  FOR SELECT USING (auth.uid() = user_id OR is_admin());
CREATE POLICY "Users insert own tasks" ON tasks
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own tasks" ON tasks
  FOR UPDATE USING (auth.uid() = user_id OR is_admin());
CREATE POLICY "Admins delete tasks" ON tasks
  FOR DELETE USING (is_admin());

-- batch_runs
CREATE POLICY "Users see own batches" ON batch_runs
  FOR SELECT USING (auth.uid() = user_id OR is_admin());
CREATE POLICY "Users insert own batches" ON batch_runs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own batches" ON batch_runs
  FOR UPDATE USING (auth.uid() = user_id OR is_admin());

-- schedules
CREATE POLICY "Users see own schedules" ON schedules
  FOR SELECT USING (auth.uid() = user_id OR is_admin());
CREATE POLICY "Users insert own schedules" ON schedules
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own schedules" ON schedules
  FOR UPDATE USING (auth.uid() = user_id OR is_admin());
CREATE POLICY "Users delete own schedules" ON schedules
  FOR DELETE USING (auth.uid() = user_id OR is_admin());

-- task_events
CREATE POLICY "Users see own task events" ON task_events
  FOR SELECT USING (auth.uid() = user_id OR is_admin());
CREATE POLICY "Users insert own task events" ON task_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- user_roles: users can read own, only admin can modify
CREATE POLICY "Users see own role" ON user_roles
  FOR SELECT USING (auth.uid() = user_id OR is_admin());
CREATE POLICY "Admins manage roles" ON user_roles
  FOR ALL USING (is_admin());
```

- [ ] **Step 2: Push migration locally**

```bash
cd /Users/hrushiborhade/Developer/task-queue
supabase db push --local
```

- [ ] **Step 3: Regenerate Supabase types**

```bash
supabase gen types typescript --local 2>/dev/null > apps/web/lib/database.types.ts
```

- [ ] **Step 4: Update Drizzle schema**

Add `userId` to all tables and add `userRoles` table in `packages/shared/src/schema.ts`:

```typescript
// Add to imports if not present:
// import { ... } from "drizzle-orm/pg-core";

// Add userRoles table after batchStatusEnum:
export const userRoles = pgTable("user_roles", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  role: text().notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Add userId to batchRuns:
//   userId: uuid("user_id"),

// Add userId to schedules:
//   userId: uuid("user_id"),

// Add userId to tasks:
//   userId: uuid("user_id"),

// Add userId to taskEvents:
//   userId: uuid("user_id"),
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/ packages/shared/src/schema.ts apps/web/lib/database.types.ts
git commit -m "feat: add user_id, user_roles, RLS policies, and access token hook"
```

---

## Task 2: Enable Google OAuth + Access Token Hook in Config

**Files:**
- Modify: `supabase/config.toml`
- Modify: `scripts/gen-env.ts`

- [ ] **Step 1: Edit config.toml**

Find `[auth.email]` section and set:
```toml
enable_confirmations = true
```

Find `[auth.hook.custom_access_token]` section (commented out) and replace with:
```toml
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/public/custom_access_token_hook"
```

Find `[auth.external.apple]` section and ADD a google section BEFORE it:
```toml
[auth.external.google]
enabled = true
client_id = "env(GOOGLE_CLIENT_ID)"
secret = "env(GOOGLE_CLIENT_SECRET)"
redirect_uri = ""
skip_nonce_check = false
```

Also update `site_url` and `additional_redirect_urls`:
```toml
site_url = "http://127.0.0.1:3000"
additional_redirect_urls = ["http://127.0.0.1:3000/auth/callback"]
```

- [ ] **Step 2: Update gen-env.ts to include Google OAuth vars**

Add to both worker and web env sections in `scripts/gen-env.ts`:

In the web env template, add:
```
# Google OAuth (get from Google Cloud Console)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

- [ ] **Step 3: Restart Supabase to pick up config changes**

```bash
cd /Users/hrushiborhade/Developer/task-queue
supabase stop --no-backup
supabase start
bun run env:local
```

- [ ] **Step 4: Set up Google Cloud OAuth**

1. Go to https://console.cloud.google.com/
2. Create a project (or use existing)
3. APIs & Services → Credentials → Create OAuth client ID
4. Application type: Web application
5. Authorized redirect URIs: `http://127.0.0.1:54321/auth/v1/callback`
6. Copy Client ID and Client Secret
7. Add to `apps/web/.env.local`:
   ```
   GOOGLE_CLIENT_ID=<your-client-id>
   GOOGLE_CLIENT_SECRET=<your-client-secret>
   ```
8. Also add to `supabase/.env` (create if doesn't exist):
   ```
   GOOGLE_CLIENT_ID=<your-client-id>
   GOOGLE_CLIENT_SECRET=<your-client-secret>
   ```
9. Restart Supabase again: `supabase stop --no-backup && supabase start`

- [ ] **Step 5: Commit**

```bash
git add supabase/config.toml scripts/gen-env.ts
git commit -m "feat: enable Google OAuth, email confirmations, and custom access token hook"
```

---

## Task 3: Auth Helper — Cached getUser with Role

**Files:**
- Create: `apps/web/lib/auth.ts`

- [ ] **Step 1: Install jwt-decode**

```bash
cd /Users/hrushiborhade/Developer/task-queue/apps/web
bun add jwt-decode
```

- [ ] **Step 2: Create lib/auth.ts**

```typescript
import { cache } from "react";
import { jwtDecode } from "jwt-decode";
import { createClient } from "@/lib/supabase/server";

interface JWTClaims {
  sub: string;
  email: string;
  user_role?: string;
  [key: string]: unknown;
}

/**
 * Cached per-request auth check.
 * Multiple Server Components/API routes calling this in the same request
 * hit Supabase only once (React cache() deduplication).
 *
 * Returns { user, role } or null if not authenticated.
 */
export const getUser = cache(async () => {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  // Extract role from JWT
  const {
    data: { session },
  } = await supabase.auth.getSession();

  let role = "user";
  if (session?.access_token) {
    try {
      const claims = jwtDecode<JWTClaims>(session.access_token);
      role = claims.user_role ?? "user";
    } catch {
      // If JWT decode fails, default to "user"
    }
  }

  return { user, role };
});

/**
 * Convenience for API routes — returns a 401 Response.
 */
export function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Convenience for API routes — returns a 403 Response.
 */
export function forbidden() {
  return Response.json({ error: "Forbidden" }, { status: 403 });
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/auth.ts apps/web/package.json
git commit -m "feat: add cached auth helper with JWT role extraction"
```

---

## Task 4: Browser Client with BroadcastChannel Refresh Lock

**Files:**
- Modify: `apps/web/lib/supabase/client.ts`

- [ ] **Step 1: Rewrite client.ts with refresh lock**

```typescript
"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

const LOCK_KEY = "supabase-refresh-lock";
const LOCK_TIMEOUT_MS = 10_000;
const CHANNEL_NAME = "supabase-refresh";

/**
 * Singleton browser client with multi-tab refresh lock.
 *
 * Problem: When multiple tabs detect an expired access token, they all
 * call refreshSession() simultaneously. Supabase rotates refresh tokens,
 * so the second tab's request uses an already-invalidated token → logged out.
 *
 * Solution (from astral/monorepo):
 * 1. Use localStorage as a lightweight lock
 * 2. First tab to acquire the lock refreshes the token
 * 3. Other tabs wait for a BroadcastChannel message signaling completion
 * 4. Stale locks (>10s) are automatically broken
 */

let client: SupabaseClient<Database> | null = null;

function acquireLock(): boolean {
  const existing = localStorage.getItem(LOCK_KEY);
  if (existing) {
    const lockTime = parseInt(existing, 10);
    if (Date.now() - lockTime < LOCK_TIMEOUT_MS) {
      return false; // Lock is held and not stale
    }
    // Stale lock — break it
  }
  localStorage.setItem(LOCK_KEY, String(Date.now()));
  return true;
}

function releaseLock(): void {
  localStorage.removeItem(LOCK_KEY);
}

function waitForRefreshComplete(): Promise<void> {
  return new Promise((resolve) => {
    // If BroadcastChannel is not supported, just wait a bit
    if (typeof BroadcastChannel === "undefined") {
      setTimeout(resolve, 5_000);
      return;
    }

    const channel = new BroadcastChannel(CHANNEL_NAME);
    const timeout = setTimeout(() => {
      channel.close();
      resolve();
    }, LOCK_TIMEOUT_MS);

    channel.onmessage = (event) => {
      if (event.data === "refresh-complete") {
        clearTimeout(timeout);
        channel.close();
        resolve();
      }
    };
  });
}

function notifyRefreshComplete(): void {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage("refresh-complete");
  channel.close();
}

export function createClient(): SupabaseClient<Database> {
  if (client) return client;

  const baseClient = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Override refreshSession to add lock coordination
  const originalRefreshSession = baseClient.auth.refreshSession.bind(
    baseClient.auth
  );

  baseClient.auth.refreshSession = async (currentSession) => {
    if (acquireLock()) {
      // We own the lock — do the refresh
      try {
        const result = await originalRefreshSession(currentSession);
        notifyRefreshComplete();
        return result;
      } finally {
        releaseLock();
      }
    } else {
      // Another tab is refreshing — wait for it
      await waitForRefreshComplete();
      // After the other tab refreshes, get the updated session
      return baseClient.auth.getSession() as ReturnType<
        typeof originalRefreshSession
      >;
    }
  };

  client = baseClient;
  return client;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/lib/supabase/client.ts
git commit -m "feat: add BroadcastChannel refresh lock for multi-tab session safety"
```

---

## Task 5: Proxy — Session Refresh + Route Protection (Next.js 16)

Next.js 16 renamed `middleware.ts` → `proxy.ts` and `middleware()` → `proxy()`.
The functionality is identical — just a naming change for clearer semantics.

**Files:**
- Create: `apps/web/proxy.ts`

- [ ] **Step 1: Create proxy.ts at apps/web root**

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { jwtDecode } from "jwt-decode";

const PUBLIC_ROUTES = ["/login", "/auth/callback"];

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Do NOT use getSession() here. getUser() hits the Supabase Auth
  // server to validate the JWT, while getSession() only reads the local cookie
  // (which could be tampered with). Always use getUser() for security.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Allow public routes
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    // If authenticated user visits /login, redirect to home
    if (user && pathname.startsWith("/login")) {
      const redirectTo =
        request.nextUrl.searchParams.get("redirectTo") || "/";
      return NextResponse.redirect(new URL(redirectTo, request.url));
    }
    return supabaseResponse;
  }

  // Protected routes: redirect to login if not authenticated
  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin route protection
  if (pathname.startsWith("/admin")) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.access_token) {
      try {
        const claims = jwtDecode<{ user_role?: string }>(
          session.access_token
        );
        if (claims.user_role !== "admin") {
          return NextResponse.redirect(new URL("/", request.url));
        }
      } catch {
        return NextResponse.redirect(new URL("/", request.url));
      }
    } else {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     * - public assets (svg, png, jpg, etc.)
     * - api routes that don't need middleware (none for now)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/proxy.ts
git commit -m "feat: add proxy for session refresh, route protection, and admin role gate"
```

---

## Task 6: Auth Callback Route

**Files:**
- Create: `apps/web/app/auth/callback/route.ts`

- [ ] **Step 1: Create the callback route**

```typescript
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // "next" param preserves intended destination through OAuth flow
  let next = searchParams.get("next") ?? "/";

  // Security: only allow relative redirects
  if (!next.startsWith("/")) {
    next = "/";
  }

  if (code) {
    const cookieStore = await cookies();

    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Handle load balancer/proxy scenarios
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  // Auth failed — redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/auth/callback/route.ts
git commit -m "feat: add auth callback route for OAuth + email confirm code exchange"
```

---

## Task 7: Login Page with shadcn + Server Actions

**Files:**
- Create: `apps/web/app/login/page.tsx`
- Create: `apps/web/app/login/actions.ts`

- [ ] **Step 1: Install shadcn login-01 block dependencies**

```bash
cd /Users/hrushiborhade/Developer/task-queue/apps/web
bunx --bun shadcn@latest add button card input label field
```

- [ ] **Step 2: Create server actions — apps/web/app/login/actions.ts**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signIn(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signUp(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SUPABASE_URL ? "http://127.0.0.1:3000" : ""}/auth/callback?next=/`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  return { success: "Check your email for a confirmation link." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
```

- [ ] **Step 3: Create login page — apps/web/app/login/page.tsx**

Based on shadcn login-01 block, adapted for our auth:

```tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { signIn, signUp } from "./actions";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/";

  // URL error from callback
  const urlError = searchParams.get("error");

  async function handleSubmit(formData: FormData) {
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      if (mode === "login") {
        const result = await signIn(formData);
        if (result?.error) setError(result.error);
      } else {
        const result = await signUp(formData);
        if (result?.error) setError(result.error);
        if (result?.success) setMessage(result.success);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${redirectTo}`,
        queryParams: {
          prompt: "select_account",
        },
      },
    });
    if (error) setError(error.message);
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>
                {mode === "login"
                  ? "Login to your account"
                  : "Create an account"}
              </CardTitle>
              <CardDescription>
                {mode === "login"
                  ? "Enter your email below to login"
                  : "Enter your email and password to sign up"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(error || urlError) && (
                <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error || urlError}
                </div>
              )}
              {message && (
                <div className="mb-4 rounded-md bg-green-500/10 p-3 text-sm text-green-600">
                  {message}
                </div>
              )}
              <form action={handleSubmit}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="email">Email</FieldLabel>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="you@example.com"
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="password">Password</FieldLabel>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      required
                      minLength={6}
                    />
                  </Field>
                  <Field>
                    <Button type="submit" disabled={loading}>
                      {loading
                        ? "Loading..."
                        : mode === "login"
                          ? "Login"
                          : "Sign Up"}
                    </Button>
                    <Button
                      variant="outline"
                      type="button"
                      onClick={handleGoogleSignIn}
                    >
                      Continue with Google
                    </Button>
                    <FieldDescription className="text-center">
                      {mode === "login" ? (
                        <>
                          Don't have an account?{" "}
                          <button
                            type="button"
                            className="underline underline-offset-4 hover:text-primary"
                            onClick={() => {
                              setMode("signup");
                              setError(null);
                              setMessage(null);
                            }}
                          >
                            Sign up
                          </button>
                        </>
                      ) : (
                        <>
                          Already have an account?{" "}
                          <button
                            type="button"
                            className="underline underline-offset-4 hover:text-primary"
                            onClick={() => {
                              setMode("login");
                              setError(null);
                              setMessage(null);
                            }}
                          >
                            Login
                          </button>
                        </>
                      )}
                    </FieldDescription>
                  </Field>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/login/ apps/web/components/ui/
git commit -m "feat: add login page with email/password + Google OAuth"
```

---

## Task 8: Wire Auth into API Routes

**Files:**
- Modify: `apps/web/app/api/tasks/route.ts`
- Modify: `apps/web/app/api/tasks/batch/route.ts`
- Modify: `apps/web/app/api/admin/stats/route.ts`

- [ ] **Step 1: Update tasks route**

In `apps/web/app/api/tasks/route.ts`:

Replace `const supabase = await createClient();` pattern with:

```typescript
import { getUser, unauthorized } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const auth = await getUser();
  if (!auth) return unauthorized();
  const { user } = auth;

  const supabase = await createClient();

  // ... existing validation ...

  // In the insert, add user_id:
  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      type,
      input: input as unknown as Json,
      status: "queued",
      progress: 0,
      user_id: user.id,  // ← ADD THIS
    })
    .select()
    .single();

  // ... rest unchanged ...
}

export async function GET() {
  const auth = await getUser();
  if (!auth) return unauthorized();

  const supabase = await createClient();
  // RLS automatically filters by user_id — no .eq("user_id") needed
  // ... rest unchanged ...
}
```

- [ ] **Step 2: Update batch route**

Same pattern — add auth check and `user_id` to batch_runs insert and task inserts:

```typescript
// batch_runs insert:
user_id: user.id,

// taskInserts map:
user_id: user.id,
```

- [ ] **Step 3: Update admin stats route**

```typescript
import { getUser, unauthorized, forbidden } from "@/lib/auth";

export async function GET() {
  const auth = await getUser();
  if (!auth) return unauthorized();
  if (auth.role !== "admin") return forbidden();

  // ... existing queue stats logic ...
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/
git commit -m "feat: wire auth + user_id into all API routes"
```

---

## Task 9: Wire Auth into Dashboard Page

**Files:**
- Modify: `apps/web/app/page.tsx`

- [ ] **Step 1: Update page.tsx**

Middleware already redirects unauthenticated users, but for Server Component data fetching we need the user:

```typescript
import { getUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const auth = await getUser();
  if (!auth) redirect("/login");

  const supabase = await createClient();
  // RLS handles filtering — queries return only this user's data
  // ... existing data fetching ...
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/page.tsx
git commit -m "feat: add auth check to dashboard page"
```

---

## Task 10: Update TaskJobPayload to Include userId

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `apps/web/app/api/tasks/route.ts` (enqueue call)

- [ ] **Step 1: Make userId required in TaskJobPayload**

In `packages/shared/src/types.ts`, change:
```typescript
// Before:
userId?: string; // optional until Phase 11 (auth)

// After:
userId: string;
```

- [ ] **Step 2: Update API routes to pass userId when enqueuing**

In tasks route POST:
```typescript
const jobId = await addTaskToQueue({
  taskId: task.id,
  type,
  input,
  userId: user.id,  // ← now required
});
```

In batch route POST:
```typescript
addTaskToQueue({
  taskId: task.id,
  type: task.type as TaskType,
  input: task.input as unknown as TaskInput,
  userId: user.id,  // ← now required
})
```

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types.ts apps/web/app/api/
git commit -m "feat: make userId required in TaskJobPayload"
```

---

## Task 11: Verification

- [ ] **Step 1: Type check all packages**

```bash
cd /Users/hrushiborhade/Developer/task-queue/apps/web
bunx tsc --noEmit
```

- [ ] **Step 2: Build web app**

```bash
cd /Users/hrushiborhade/Developer/task-queue/apps/web
bun run build
```

- [ ] **Step 3: Test full flow**

1. Start everything: `supabase start`, `docker compose up -d`, worker, web dev server
2. Visit `http://localhost:3000` → should redirect to `/login`
3. Sign up with email/password → check Inbucket at `localhost:54324` for confirmation email
4. Click confirm link → should redirect to dashboard
5. Create a task → should work (user_id set automatically)
6. Check Supabase Studio at `localhost:54323` → tasks table should have user_id populated
7. Test Google OAuth (if credentials configured)
8. Open two tabs → both should stay logged in (refresh lock working)

- [ ] **Step 4: Test RLS**

```bash
# Create a second user via Supabase Studio or signUp
# Login as second user
# Verify they can't see first user's tasks
```

- [ ] **Step 5: Test admin role**

```sql
-- In Supabase Studio SQL editor:
UPDATE user_roles SET role = 'admin' WHERE user_id = '<your-user-id>';
```

Then visit `/admin/stats` — should work. Switch back to `'user'` role — should get 403.
