import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSchedulerQueue } from "@/lib/queue";
import { TASK_TYPES, type TaskType } from "@repo/shared";
import type { Json } from "@/lib/database.types";

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function requireUser() {
  try {
    const user = await getUser();
    if (!user) return { error: error("Unauthorized", 401) } as const;
    return { user } as const;
  } catch {
    return { error: error("Auth service unavailable", 503) } as const;
  }
}

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const supabase = createAdminClient();
  const { data: schedules, error: dbError } = await supabase
    .from("schedules")
    .select("*")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false });

  if (dbError) {
    return error(dbError.message, 500);
  }

  return NextResponse.json({ schedules });
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error("Invalid JSON body", 400);
  }

  const { name, type, input, cron_expression, timezone, run_at } = body as {
    name: string;
    type: TaskType;
    input: { prompt: string };
    cron_expression: string;
    timezone?: string;
    run_at?: string;
  };

  if (!name?.trim()) return error("Name is required", 400);
  if (!type || !TASK_TYPES.includes(type)) return error("Invalid task type", 400);
  if (!input?.prompt) return error("Prompt is required", 400);

  const isOneTime = !!run_at;

  // Validate: one-time needs run_at, recurring needs cron_expression
  if (isOneTime) {
    const runDate = new Date(run_at);
    if (isNaN(runDate.getTime())) return error("Invalid run_at date", 400);
    if (runDate.getTime() <= Date.now()) return error("run_at must be in the future", 400);
  } else {
    if (!cron_expression?.trim()) return error("Cron expression is required", 400);
  }

  const tz = timezone || "UTC";
  const supabase = createAdminClient();

  const { data: schedule, error: dbError } = await supabase
    .from("schedules")
    .insert({
      name: name.trim(),
      type,
      input: input as unknown as Json,
      cron_expression: isOneTime ? "one-time" : cron_expression.trim(),
      timezone: tz,
      enabled: true,
      run_count: 0,
      run_at: isOneTime ? run_at : null,
      user_id: auth.user.id,
    })
    .select()
    .single();

  if (dbError || !schedule) {
    return error(dbError?.message ?? "Failed to create schedule", 500);
  }

  // Register in BullMQ — if this fails, delete the orphan schedule row
  const queue = getSchedulerQueue();
  const jobData = { scheduleId: schedule.id, type, input };

  try {
    if (isOneTime) {
      const delay = new Date(run_at).getTime() - Date.now();
      await queue.add("scheduled-task", jobData, {
        delay,
        jobId: `once-${schedule.id}`,
      });
    } else {
      await queue.upsertJobScheduler(
        schedule.id,
        { pattern: schedule.cron_expression, tz },
        { name: "scheduled-task", data: jobData }
      );
    }
  } catch (bullmqError) {
    // Compensating delete — remove the orphan DB row
    await supabase.from("schedules").delete().eq("id", schedule.id);
    console.error("[schedules] BullMQ registration failed, rolled back DB:", bullmqError);
    return error("Failed to register schedule in queue", 500);
  }

  return NextResponse.json({ schedule }, { status: 201 });
}
