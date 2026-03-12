import type { Metadata } from "next";
import { ScheduleList } from "@/components/schedule-list";

export const metadata: Metadata = {
  title: "Schedules — Task Queue",
};

export default function SchedulesPage() {
  return (
    <div className="flex flex-col gap-4">
      <ScheduleList />
    </div>
  );
}
