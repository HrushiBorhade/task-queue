import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { addTaskToQueue } from "@/lib/queue";
import { TASK_TYPES, type TaskType, type TaskInput } from "@repo/shared";
import type { Json } from "@/lib/database.types";

interface BatchItem {
  type: TaskType;
  input: TaskInput;
}

export async function POST(request: Request) {
  let user;
  try {
    user = await getUser();
  } catch {
    return NextResponse.json({ error: "Auth service unavailable" }, { status: 503 });
  }
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { tasks: items } = body as { tasks: BatchItem[] };

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Tasks array is required" }, { status: 400 });
  }

  if (items.length > 100) {
    return NextResponse.json({ error: "Maximum 100 tasks per batch" }, { status: 400 });
  }

  for (const item of items) {
    if (!item.type || !TASK_TYPES.includes(item.type)) {
      return NextResponse.json({ error: `Invalid task type: ${item.type}` }, { status: 400 });
    }
    if (!item.input?.prompt) {
      return NextResponse.json({ error: "Each task needs an input prompt" }, { status: 400 });
    }
  }

  const supabase = createAdminClient();

  const { data: batch, error: batchError } = await supabase
    .from("batch_runs")
    .insert({ total_tasks: items.length, user_id: user.id })
    .select()
    .single();

  if (batchError || !batch) {
    Sentry.captureException(batchError, { extra: { userId: user.id, taskCount: items.length } });
    return NextResponse.json({ error: "Failed to create batch" }, { status: 500 });
  }

  const taskRows = items.map((item) => ({
    type: item.type,
    input: item.input as unknown as Json,
    user_id: user.id,
    batch_id: batch.id,
  }));

  const { data: createdTasks, error: tasksError } = await supabase
    .from("tasks")
    .insert(taskRows)
    .select();

  if (tasksError || !createdTasks) {
    Sentry.captureException(tasksError, { extra: { batchId: batch.id, taskCount: items.length } });
    return NextResponse.json({ error: "Failed to create tasks" }, { status: 500 });
  }

  // Enqueue all — use Promise.allSettled to avoid orphans
  const enqueueResults = await Promise.allSettled(
    createdTasks.map((task) =>
      addTaskToQueue({
        taskId: task.id,
        userId: user.id,
        type: task.type as TaskType,
        input: task.input as unknown as TaskInput,
        attempt: 0,
      })
    )
  );

  // Update DB with job IDs or mark failures
  const failedIds: string[] = [];
  await Promise.all(
    enqueueResults.map((result, i) => {
      if (result.status === "fulfilled") {
        return supabase
          .from("tasks")
          .update({ bullmq_job_id: result.value })
          .eq("id", createdTasks[i].id);
      }
      failedIds.push(createdTasks[i].id);
      return supabase
        .from("tasks")
        .update({ status: "failed", error: "Failed to enqueue" })
        .eq("id", createdTasks[i].id);
    })
  );

  return NextResponse.json(
    {
      batch,
      totalCreated: createdTasks.length,
      failedToEnqueue: failedIds.length,
    },
    { status: 201 }
  );
}
