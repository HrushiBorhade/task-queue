import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSchedulerQueue } from "@/lib/queue";
import type { TaskType, TaskInput } from "@repo/shared";

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error("Invalid JSON body", 400);
  }

  const { enabled } = body as { enabled?: boolean };

  const supabase = createAdminClient();

  // Fetch and verify ownership
  const { data: existing, error: fetchError } = await supabase
    .from("schedules")
    .select("*")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .single();

  if (fetchError || !existing) {
    return error("Schedule not found", 404);
  }

  const isOneTime = !!existing.run_at;

  // Validate: can't re-enable a past-due one-time schedule
  if (typeof enabled === "boolean" && enabled && isOneTime) {
    const delay = new Date(existing.run_at!).getTime() - Date.now();
    if (delay <= 0) {
      return error("Cannot re-enable a one-time schedule whose run_at is in the past", 400);
    }
  }

  // DB FIRST — if this fails, BullMQ stays consistent.
  // If BullMQ fails after, syncSchedules() reconciles on worker restart.
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof enabled === "boolean") updates.enabled = enabled;

  const { data: schedule, error: updateError } = await supabase
    .from("schedules")
    .update(updates)
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .select()
    .single();

  if (updateError) {
    return error(updateError.message, 500);
  }

  // THEN BullMQ — best-effort, syncSchedules() is the safety net
  if (typeof enabled === "boolean") {
    const queue = getSchedulerQueue();

    if (enabled) {
      if (isOneTime) {
        const delay = new Date(existing.run_at!).getTime() - Date.now();
        await queue.add("scheduled-task", {
          scheduleId: id,
          type: existing.type as TaskType,
          input: existing.input as unknown as TaskInput,
        }, {
          delay,
          jobId: `once-${id}`,
        });
      } else {
        await queue.upsertJobScheduler(
          id,
          { pattern: existing.cron_expression, tz: existing.timezone },
          {
            name: "scheduled-task",
            data: {
              scheduleId: id,
              type: existing.type as TaskType,
              input: existing.input as unknown as TaskInput,
            },
          }
        );
      }
    } else {
      if (isOneTime) {
        await queue.remove(`once-${id}`).catch((err) => {
          console.error(`[schedules] Failed to remove delayed job once-${id}:`, err);
        });
      } else {
        await queue.removeJobScheduler(id).catch((err) => {
          console.error(`[schedules] Failed to remove job scheduler ${id}:`, err);
        });
      }
    }
  }

  return NextResponse.json({ schedule });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const supabase = createAdminClient();

  // Verify ownership
  const { data: existing, error: fetchError } = await supabase
    .from("schedules")
    .select("run_at")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .single();

  if (fetchError || !existing) {
    return error("Schedule not found", 404);
  }

  // DB FIRST — delete the schedule row so it's gone from the source of truth.
  // If BullMQ cleanup fails, syncSchedules() won't find it and it won't re-register.
  const { error: dbError } = await supabase
    .from("schedules")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id);

  if (dbError) {
    return error(dbError.message, 500);
  }

  // THEN BullMQ cleanup — best-effort
  const queue = getSchedulerQueue();
  if (existing.run_at) {
    await queue.remove(`once-${id}`).catch((err) => {
      console.error(`[schedules] Failed to remove delayed job once-${id}:`, err);
    });
  } else {
    await queue.removeJobScheduler(id).catch((err) => {
      console.error(`[schedules] Failed to remove job scheduler ${id}:`, err);
    });
  }

  return NextResponse.json({ success: true });
}
