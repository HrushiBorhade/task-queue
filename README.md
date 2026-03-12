<p align="center">
  <strong>Task Queue</strong>
  <br />
  Distributed async task orchestration with real-time monitoring
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react" alt="React" />
  <img src="https://img.shields.io/badge/BullMQ-5-E0234E?logo=redis" alt="BullMQ" />
  <img src="https://img.shields.io/badge/Supabase-Auth%20%2B%20Realtime-3FCF8E?logo=supabase" alt="Supabase" />
  <img src="https://img.shields.io/badge/Bun-monorepo-F9F1E1?logo=bun" alt="Bun" />
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript" alt="TypeScript" />
</p>

---

## Overview

A production-grade distributed task queue system built as a Bun monorepo. Supports 7 task types with per-queue concurrency limits, rate limiting, retries, scheduled/one-time execution, batch processing, and real-time progress streaming.

```mermaid
graph LR
    subgraph Client
        A[Next.js Frontend]
    end

    subgraph API["API Layer"]
        B[Next.js API Routes]
    end

    subgraph Queue["Queue Layer"]
        C[(Redis)]
        D[BullMQ]
    end

    subgraph Workers["Worker Process"]
        E[Text Gen]
        F[Image Gen]
        G[Research Agent]
        H[Email Campaign]
        I[PDF Report]
        J[Webhook Processing]
        K[Data Aggregation]
        L[Scheduler]
    end

    subgraph Data["Data Layer"]
        M[(Supabase Postgres)]
        N[Supabase Realtime]
    end

    subgraph Observability
        O[Prometheus Metrics]
        P[Sentry]
        Q[Pino Logs]
        R[Bull Board UI]
    end

    A -->|REST| B
    B -->|Enqueue| D
    D -->|Jobs| C
    C -->|Dispatch| E & F & G & H & I & J & K
    L -->|Cron/One-time| D
    E & F & G & H & I & J & K -->|Status| M
    E & F & G & H & I & J & K -->|Progress| N
    N -->|Realtime| A
    E & F & G & H & I & J & K -->|Metrics| O
    E & F & G & H & I & J & K -->|Errors| P
    E & F & G & H & I & J & K -->|Logs| Q
    D -->|Dashboard| R
```

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Runtime** | Bun | Package manager, monorepo workspaces, test runner |
| **Frontend** | Next.js 16, React 19, Tailwind v4 | App Router, RSC, streaming |
| **UI** | shadcn/ui, Phosphor Icons, Motion | Component library, icons, animations |
| **State** | TanStack Query v5 | Server state, optimistic updates, infinite scroll |
| **Auth** | Supabase Auth (PKCE) | Google OAuth, email/password, RLS |
| **Database** | Supabase Postgres, Drizzle ORM | Row-level security, generated types |
| **Queue** | BullMQ, Redis 7 | Job scheduling, rate limiting, retries |
| **Realtime** | Supabase Realtime | Postgres changes, broadcast channels |
| **Observability** | Sentry, Prometheus, Pino, PostHog | Errors, metrics, logs, analytics |
| **Testing** | Vitest, Playwright, Testing Library | Unit, E2E, component tests |
| **Deployment** | Vercel (web), Docker (Redis) | Edge functions, container orchestration |

## Project Structure

```
task-queue/
├── apps/
│   ├── web/                    # Next.js 16 frontend + API routes
│   │   ├── app/
│   │   │   ├── (auth)/        # Login flow (multi-step, OAuth, password reset)
│   │   │   ├── dashboard/     # Protected pages (tasks, batches, schedules, queue health)
│   │   │   └── api/           # REST endpoints (tasks, batches, schedules, admin stats)
│   │   ├── components/        # UI components (task grid, batch progress, schedule list)
│   │   ├── hooks/             # React hooks (use-tasks, use-schedules, use-batches)
│   │   ├── lib/               # Auth, Supabase clients, queue helpers, utilities
│   │   └── e2e/               # Playwright test suites
│   │
│   ├── worker/                # BullMQ worker process
│   │   └── src/
│   │       ├── workers/       # 7 task workers + scheduler
│   │       └── lib/           # DB, logger, metrics, health, alerting
│   │
│   └── trigger/               # Trigger.dev integration (alternative orchestration)
│       └── tasks/             # 9 Trigger.dev task definitions
│
├── packages/
│   └── shared/                # Shared types, queue config, Drizzle schema
│       └── src/
│           ├── types.ts       # TaskType, TaskStatus, job payloads, broadcast events
│           ├── queue-config.ts # Per-queue concurrency, rate limits, Redis connection
│           └── schema.ts      # Drizzle schema (tasks, schedules, batch_runs, task_events)
│
├── supabase/
│   └── migrations/            # 4 SQL migrations (tables, RLS, realtime, one-time schedules)
│
├── docker-compose.yml         # Redis 7 Alpine with AOF persistence
└── package.json               # Bun workspace root
```

## Task Types & Queue Configuration

| Task Type | Concurrency | Rate Limit | Retries | Use Case |
|-----------|------------|------------|---------|----------|
| `text_gen` | 10 | 20/min | 3 | Text generation via LLM |
| `image_gen` | 5 | 10/min | 3 | AI image generation |
| `research_agent` | 3 | 5/min | 2 | Research & summarization |
| `email_campaign` | 5 | 50/min | 5 | Email delivery |
| `pdf_report` | 3 | 10/min | 3 | PDF document generation |
| `webhook_processing` | 10 | 100/min | 5 | Webhook payload processing |
| `data_aggregation` | 1 | 5/min | 3 | Data pipeline aggregation |

## Architecture

### Task Lifecycle

```mermaid
stateDiagram-v2
    [*] --> queued: API enqueue
    queued --> active: Worker picks up
    active --> active: Progress updates (0-100%)
    active --> completed: Success
    active --> failed: Error
    failed --> queued: Auto-retry (if attempts remain)
    completed --> [*]
    failed --> [*]: Max retries exceeded
```

### Authentication & Authorization

```mermaid
graph TB
    subgraph "Supabase Auth (PKCE)"
        A[Google OAuth] --> D[Session]
        B[Email/Password] --> D
        C[Magic Link] --> D
    end

    D --> E{RLS Policy}
    E -->|"auth.uid() = user_id"| F[Read/Write Own Data]
    E -->|Admin Role| G[Read All Data]

    subgraph "Worker (Bypasses RLS)"
        H[Service Role Key] --> I[Direct Postgres via Drizzle]
    end
```

### Three Supabase Clients

| Client | Key | Use Case |
|--------|-----|----------|
| **Browser** | Publishable (anon) | Client-side auth, realtime subscriptions |
| **Server** | Publishable + cookies | SSR auth checks, API route guards |
| **Admin** | Service role (secret) | Worker DB access, bypasses RLS |

### Worker Architecture

The worker process runs as a single Bun process managing:

- **7 BullMQ Workers** — one per task type with independent concurrency/rate limits
- **Scheduler Worker** — syncs cron and one-time schedules from DB
- **Health Server** (`:9090`) — Redis ping health check
- **Metrics Server** (`:9092`) — Prometheus scrape endpoint
- **Bull Board** (`:9091`) — Visual queue management UI

### Observability Stack

| Tool | Purpose | Integration |
|------|---------|-------------|
| **Sentry** | Error tracking + performance | Server/client/edge, `/monitoring` tunnel |
| **Prometheus** | Queue metrics (depth, duration, throughput) | Worker prom-client, custom histograms |
| **Pino** | Structured logging | Worker process, JSON in prod |
| **PostHog** | Product analytics | Client-side events |
| **Vercel Analytics** | Web vitals + speed insights | Automatic |
| **Microsoft Clarity** | Session replay + heatmaps | Client-side |

## Database Schema

```mermaid
erDiagram
    tasks {
        uuid id PK
        uuid user_id FK
        uuid batch_id FK
        uuid schedule_id FK
        task_type type
        task_status status
        int progress
        jsonb input
        jsonb output
        text error
        int attempt
        string bullmq_job_id
        timestamp created_at
        timestamp started_at
        timestamp completed_at
    }

    schedules {
        uuid id PK
        uuid user_id FK
        string name
        task_type type
        jsonb input
        string cron_expression
        string timezone
        timestamp run_at
        boolean enabled
        int run_count
    }

    batch_runs {
        uuid id PK
        uuid user_id FK
        int total_tasks
        int completed_count
        batch_status status
    }

    task_events {
        uuid id PK
        uuid task_id FK
        string type
        string message
        jsonb data
        timestamp timestamp
    }

    user_roles {
        uuid id PK
        uuid user_id FK
        string role
    }

    tasks ||--o{ task_events : "has"
    batch_runs ||--o{ tasks : "contains"
    schedules ||--o{ tasks : "creates"
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.2+
- [Docker](https://docker.com) (for Redis)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (for local Postgres)

### Setup

```bash
# Clone and install
git clone <repo-url> task-queue
cd task-queue
bun install

# Start infrastructure (Redis + Supabase)
docker compose up -d
supabase start

# Generate environment variables
bun run setup

# Run database migrations
bun run db:push

# Start development (all apps)
bun run dev
```

### Development Commands

| Command | Description |
|---------|-------------|
| `bun run dev` | Start all apps (web + worker) |
| `bun run dev:web` | Start Next.js frontend only |
| `bun run dev:worker` | Start BullMQ worker only |
| `bun run db:new <name>` | Create new Supabase migration |
| `bun run db:push` | Apply migrations to local DB |
| `bun run db:reset` | Reset local database |

### Ports

| Service | Port | Description |
|---------|------|-------------|
| Next.js | 3000 | Web frontend + API |
| Worker Health | 9090 | Health check endpoint |
| Bull Board | 9091 | Queue management UI |
| Metrics | 9092 | Prometheus scrape target |
| Redis | 6379 | Job queue backend |
| Supabase | 54321+ | Local Supabase stack |

## Security

- **Row-Level Security (RLS)** on all tables — users can only access their own data
- **Security headers**: HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff, CSP, Permissions-Policy
- **PKCE auth flow** — no client secrets exposed
- **Service role isolation** — only the worker process has elevated DB access
- **Input validation** — Zod schemas on all API route inputs
- **Sentry tunnel** — `/monitoring` route proxies Sentry to avoid ad blockers

## License

Private
