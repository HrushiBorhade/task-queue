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

// TODO: widen to discriminated union per task type when building
// email_campaign, webhook_processing, data_aggregation workers
export interface TaskInput {
  prompt: string;
}

// Per-task-type output shapes
export interface ImageGenOutput {
  image_url: string;
  prompt: string;
}

export interface TextGenOutput {
  result: string;
}

// Union of all possible outputs — each task type populates its shape
export type TaskOutput =
  | ImageGenOutput
  | TextGenOutput
  | { result: string }; // fallback for other task types

export interface TaskJobPayload {
  taskId: string;
  userId: string;
  type: TaskType;
  input: TaskInput;
  attempt: number;
}

export interface ScheduleJobPayload {
  scheduleId: string;
  type: TaskType;
  input: TaskInput;
}

export interface BroadcastEvent {
  type: "chunk" | "step" | "progress" | "error";
  message: string;
  data?: Record<string, unknown>;
  progress?: number;
  timestamp: string;
}
