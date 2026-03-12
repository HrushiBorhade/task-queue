import type { Metadata } from "next";
import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { BatchesPageClient } from "./client";

export const metadata: Metadata = {
  title: "Batches — Task Queue",
};

export default async function BatchesPage() {
  const user = await getUser();
  if (!user) return null;

  const supabase = createAdminClient();
  const { data: batchList } = await supabase
    .from("batch_runs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return <BatchesPageClient initialBatches={batchList ?? []} />;
}
