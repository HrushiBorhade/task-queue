import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { QueueHealth } from "@/components/queue-health";

export const metadata: Metadata = {
  title: "Queue Health — Task Queue",
};

export default async function QueueHealthPage() {
  const user = await getUser();
  if (!user || user.role !== "admin") redirect("/dashboard/tasks");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Queue Health</h1>
      <QueueHealth />
    </div>
  );
}
