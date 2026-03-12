import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ScheduleDetailClient } from "./client";

export const metadata: Metadata = {
  title: "Schedule Detail — Task Queue",
};

export default async function ScheduleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const supabase = createAdminClient();

  const [{ data: schedule }, { data: tasks }] = await Promise.all([
    supabase
      .from("schedules")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("tasks")
      .select("*")
      .eq("schedule_id", id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (!schedule) notFound();

  return <ScheduleDetailClient schedule={schedule} tasks={tasks ?? []} />;
}
