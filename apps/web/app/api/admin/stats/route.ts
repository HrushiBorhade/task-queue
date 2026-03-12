import { NextResponse } from "next/server";
import { Queue } from "bullmq";
import { getUser } from "@/lib/auth";
import { QUEUE_CONFIGS, REDIS_CONNECTION } from "@repo/shared";
import type { QueueConfig } from "@repo/shared";

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
    (Object.values(QUEUE_CONFIGS) as QueueConfig[]).map(async (config) => {
      const queue = new Queue(config.name, { connection: REDIS_CONNECTION });
      const counts = await queue.getJobCounts();
      await queue.close();
      return { name: config.name, ...counts };
    })
  );

  return NextResponse.json({ stats });
}
