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
      new Queue(config.name, { connection: REDIS_CONNECTION }),
    );
  }
  return queues.get(config.name)!;
}

export async function addTaskToQueue(payload: TaskJobPayload): Promise<string> {
  const queue = getQueue(payload.type);
  const config = QUEUE_CONFIGS[payload.type];
  const job = await queue.add(payload.type, payload, {
    attempts: config.retries,
    backoff: { type: "exponential", delay: 1_000 },
  });
  if (!job.id) throw new Error(`BullMQ did not return a job ID for task ${payload.taskId}`);
  return job.id;
}
