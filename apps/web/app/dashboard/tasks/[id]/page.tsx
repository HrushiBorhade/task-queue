import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { TaskDetailClient } from "./client";

export const metadata: Metadata = {
  title: "Task Detail — Task Queue",
};

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: task } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!task) notFound();

  return <TaskDetailClient task={task} />;
}
