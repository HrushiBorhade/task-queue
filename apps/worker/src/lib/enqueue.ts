import { Queue } from "bullmq";
import {
  QUEUE_CONFIGS,
  REDIS_CONNECTION,
  type TaskJobPayload,
  type TaskType,
} from "@repo/shared";

const QueueMap = new Map<string, Queue>();

function getQueue(taskType: TaskType): Queue {
  const config = QUEUE_CONFIGS[taskType];
  if (!QueueMap.has(config.name)) {
    QueueMap.set(
      config.name,
      new Queue(config.name, {
        connection: REDIS_CONNECTION,
      }),
    );
  }

  return QueueMap.get(config.name)!;
}

export async function enqueueTask(payload: TaskJobPayload): Promise<string> {
  const q = await getQueue(payload.type);
  const config = QUEUE_CONFIGS[payload.type];
  const job = await q.add(payload.type, payload, {
    attempts: config.retries,
    backoff: {
      type: "exponential",
      delay: 1_000,
    },
  });

  return job.id!;
}
