import type { TaskType } from "./types";

export interface QueueConfig {
  name: string;
  concurrency: number;
  rateLimit: { max: number; duration: number };
  retries: number;
}

/**
 * Shared worker defaults — prevents stalled jobs from aggressive BullMQ defaults.
 *
 * lockDuration:    How long a job lock lives in Redis before expiring.
 *                  Default 30s is too tight for I/O-heavy workers doing DB + Supabase + Redis.
 *                  120s gives plenty of headroom.
 *
 * stalledInterval: How often workers check for stalled jobs.
 *                  Default 30s creates false positives under batch load.
 *                  60s reduces noise while still catching real stalls.
 *
 * maxStalledCount: How many times a job can stall before permanent failure.
 *                  Default 1 means ONE stall = dead. With transient Redis/DB hiccups,
 *                  3 gives jobs a fair chance to recover.
 */
export const WORKER_DEFAULTS = {
  lockDuration: 120_000,
  stalledInterval: 60_000,
  maxStalledCount: 3,
} as const;

export const QUEUE_CONFIGS = {
  text_gen: {
    name: "text-gen",
    concurrency: 10,
    rateLimit: { max: 20, duration: 60_000 },
    retries: 3,
  },
  image_gen: {
    name: "image-gen",
    concurrency: 5,
    rateLimit: { max: 10, duration: 60_000 },
    retries: 3,
  },
  research_agent: {
    name: "research",
    concurrency: 3,
    rateLimit: { max: 5, duration: 60_000 },
    retries: 2,
  },
  email_campaign: {
    name: "email-campaign",
    concurrency: 5,
    rateLimit: { max: 50, duration: 60_000 },
    retries: 5,
  },
  pdf_report: {
    name: "pdf-report",
    concurrency: 3,
    rateLimit: { max: 10, duration: 60_000 },
    retries: 3,
  },
  webhook_processing: {
    name: "webhook",
    concurrency: 10,
    rateLimit: { max: 100, duration: 60_000 },
    retries: 5,
  },
  data_aggregation: {
    name: "data-agg",
    concurrency: 1,
    rateLimit: { max: 5, duration: 60_000 },
    retries: 3,
  },
} as const satisfies Record<TaskType, QueueConfig>;

export const SCHEDULER_QUEUE = "scheduler";

export const REDIS_CONNECTION = {
  host: process.env.REDIS_HOST ?? "127.0.0.1",
  port: Number(process.env.REDIS_PORT ?? 6379),
};
