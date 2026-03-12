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
  userId: uuid("user_id"),
  completedCount: integer("completed_count").notNull().default(0),
  status: batchStatusEnum().notNull().default("running"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const schedules = pgTable("schedules", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid("user_id"),
  name: text().notNull(),
  type: taskTypeEnum().notNull(),
  input: jsonb().notNull().default({}),
  cronExpression: text("cron_expression").notNull(),
  timezone: text().notNull().default("UTC"),
  runAt: timestamp("run_at", { withTimezone: true }),
  enabled: boolean().notNull().default(true),
  runCount: integer("run_count").notNull().default(0),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tasks = pgTable("tasks", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid("user_id"),
  batchId: uuid("batch_id").references(() => batchRuns.id, {
    onDelete: "set null",
  }),
  scheduleId: uuid("schedule_id").references(() => schedules.id, {
    onDelete: "set null",
  }),
  type: taskTypeEnum().notNull(),
  status: taskStatusEnum().notNull().default("queued"),
  progress: integer().notNull().default(0),
  attempt: integer().notNull().default(0),
  input: jsonb().notNull().default({}),
  output: jsonb(),
  error: text(),
  bullmqJobId: text("bullmq_job_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const taskEvents = pgTable("task_events", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid("user_id"),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  type: text().notNull(),
  message: text(),
  data: jsonb(),
  timestamp: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

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
