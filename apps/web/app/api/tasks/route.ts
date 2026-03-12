import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { addTaskToQueue } from "@/lib/queue";
import { TASK_TYPES, type TaskType, type TaskInput } from "@repo/shared";
import type { Json } from "@/lib/database.types";

const PAGE_SIZE = 20;

function error(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

async function requireUser(): Promise<
  | { user: { id: string; email: string }; error?: never }
  | { user?: never; error: NextResponse }
> {
  try {
    const user = await getUser();
    if (!user) return { error: error("Unauthorized", 401) };
    return { user };
  } catch {
    return { error: error("Auth service unavailable", 503) };
  }
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { user } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error("Invalid JSON body", 400);
  }
  const { type, input } = body as { type: TaskType; input: TaskInput };

  if (!type || !TASK_TYPES.includes(type)) {
    return error("Invalid task type", 400);
  }
  if (!input?.prompt) {
    return error("Input prompt is required", 400);
  }

  const supabase = createAdminClient();

  const { data: task, error: dbError } = await supabase
    .from("tasks")
    .insert({ type, input: input as unknown as Json, user_id: user.id })
    .select()
    .single();

  if (dbError || !task) {
    Sentry.captureException(dbError, { extra: { type, userId: user.id } });
    return error("Failed to create task", 500);
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
  } catch (enqueueErr) {
    Sentry.captureException(enqueueErr, { extra: { taskId: task.id, type } });
    await supabase
      .from("tasks")
      .update({ status: "failed", error: "Failed to enqueue" })
      .eq("id", task.id);
    return error("Failed to enqueue task", 500);
  }

  const { error: updateError } = await supabase
    .from("tasks")
    .update({ bullmq_job_id: jobId })
    .eq("id", task.id);

  if (updateError) {
    console.error(`Failed to persist bullmq_job_id for task ${task.id}:`, updateError.message);
  }

  return NextResponse.json({ task }, { status: 201 });
}

type TaskStatus = "queued" | "active" | "completed" | "failed";
const VALID_STATUSES = new Set<TaskStatus>(["queued", "active", "completed", "failed"]);

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { user } = auth;

  const { searchParams } = request.nextUrl;
  const page = Math.max(Number(searchParams.get("page") ?? 0), 0);
  const status = searchParams.get("status");
  const limit = Math.min(Number(searchParams.get("limit") ?? PAGE_SIZE), 50);

  const supabase = createAdminClient();

  // Supabase-recommended pagination: .range(from, to) with ordered results
  const from = page * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status && VALID_STATUSES.has(status as TaskStatus)) {
    query = query.eq("status", status as TaskStatus);
  }

  const { data: rows, error: dbError } = await query;

  if (dbError) {
    Sentry.captureException(dbError, { extra: { userId: user.id, page, status } });
    return error("Failed to fetch tasks", 500);
  }

  const tasks = rows ?? [];
  // If we got fewer than requested, there are no more pages
  const hasMore = tasks.length === limit;

  return NextResponse.json({ tasks, hasMore, page });
}
