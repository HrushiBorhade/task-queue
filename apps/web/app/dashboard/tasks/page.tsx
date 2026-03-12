import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { TasksPageClient } from "./client";

export const metadata: Metadata = {
  title: "Tasks — Task Queue",
};

export default async function TasksPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const supabase = createAdminClient();
  const { data: taskList } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(0, 20);

  return <TasksPageClient initialTasks={taskList ?? []} />;
}
