export const TASK_TYPES = [
  "text_gen",
  "image_gen",
  "research_agent",
  "email_campaign",
  "pdf_report",
  "webhook_processing",
  "data_aggregation",
] as const;

export type TaskType = (typeof TASK_TYPES)[number];

export type TaskStatus = "queued" | "active" | "completed" | "failed";

export interface TaskInput {
  prompt: string;
}

export interface TaskOutput {
  result: string;
}

export interface TaskJobPayload {
  taskId: string;
  userId?: string; // optional until Phase 11 (auth)
  type: TaskType;
  input: TaskInput;
  attempt: number;
}
