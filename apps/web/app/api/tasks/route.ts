import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { addTaskToQueue } from "@/lib/queue";
import { TASK_TYPES, type TaskType, type TaskInput } from "@repo/shared";
import type { Json } from "@/lib/database.types";

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
  const { type, input } = body as { type: TaskType; input: TaskInput };

  if (!type || !TASK_TYPES.includes(type)) {
    return NextResponse.json({ error: "Invalid task type" }, { status: 400 });
  }
  if (!input?.prompt) {
    return NextResponse.json({ error: "Input prompt is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: task, error: dbError } = await supabase
    .from("tasks")
    .insert({ type, input: input as unknown as Json, user_id: user.id })
    .select()
    .single();

  if (dbError || !task) {
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }

  let jobId: string;
  try {
    jobId = await addTaskToQueue({
      taskId: task.id,
      userId: user.id,
      type,
      input,
      attempt: 0,
    });
  } catch {
    await supabase
      .from("tasks")
      .update({ status: "failed", error: "Failed to enqueue" })
      .eq("id", task.id);
    return NextResponse.json({ error: "Failed to enqueue task" }, { status: 500 });
  }

  await supabase
    .from("tasks")
    .update({ bullmq_job_id: jobId })
    .eq("id", task.id);

  return NextResponse.json({ task }, { status: 201 });
}

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

  const supabase = createAdminClient();

  const { data: taskList, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }

  return NextResponse.json({ tasks: taskList });
}
