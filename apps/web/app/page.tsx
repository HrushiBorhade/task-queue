import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardClient } from "@/components/dashboard-client";

export const metadata: Metadata = {
  title: "Dashboard — Task Queue",
  description: "Monitor and manage your distributed async tasks",
};

export default async function Home() {
  const user = await getUser();
  if (!user) redirect("/login");

  const supabase = createAdminClient();

  const [{ data: taskList }, { data: batchList }] = await Promise.all([
    // Fetch 21 items (range is inclusive) so the client can detect hasMore
    // via initialTasks.length > 20, then slice to 20 for display
    supabase
      .from("tasks")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(0, 20),
    supabase
      .from("batch_runs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <DashboardClient
      initialTasks={taskList ?? []}
      initialBatches={batchList ?? []}
      user={{ id: user.id, email: user.email, role: user.role }}
    />
  );
}
