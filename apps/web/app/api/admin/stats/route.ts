import { NextResponse } from "next/server";
import { Queue } from "bullmq";
import { getUser } from "@/lib/auth";
import { QUEUE_CONFIGS, REDIS_CONNECTION, SCHEDULER_QUEUE } from "@repo/shared";
import type { QueueConfig } from "@repo/shared";

const allQueueNames = [
  ...(Object.values(QUEUE_CONFIGS) as QueueConfig[]).map((c) => c.name),
  SCHEDULER_QUEUE,
];

// Singleton Queue instances — reuse connections across requests
const queues = allQueueNames.map(
  (name) => new Queue(name, { connection: REDIS_CONNECTION })
);

export async function GET() {
  let user;
  try {
    user = await getUser();
  } catch {
    return NextResponse.json({ error: "Auth service unavailable" }, { status: 503 });
  }
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const stats = await Promise.all(
    queues.map(async (queue) => {
      const counts = await queue.getJobCounts();
      return { name: queue.name, ...counts };
    })
  );

  return NextResponse.json({ stats });
}
