import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { BatchDetailClient } from "./client";

export const metadata: Metadata = {
  title: "Batch Detail — Task Queue",
};

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getUser();
  if (!user) return null;

  const { id } = await params;
  const supabase = createAdminClient();

  const [{ data: batch }, { data: tasks }] = await Promise.all([
    supabase
      .from("batch_runs")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("tasks")
      .select("*")
      .eq("batch_id", id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  if (!batch) notFound();

  return <BatchDetailClient batch={batch} tasks={tasks ?? []} />;
}
