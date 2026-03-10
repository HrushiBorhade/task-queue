import type { TaskType } from "./types";

export interface QueueConfig {
  name: string;
  concurrency: number;
  rateLimit: { max: number; duration: number };
  retries: number;
}

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

export const REDIS_CONNECTION = {
  host: process.env.REDIS_HOST ?? "127.0.0.1",
  port: Number(process.env.REDIS_PORT ?? 6379),
};
