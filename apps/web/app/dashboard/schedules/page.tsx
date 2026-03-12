import type { Metadata } from "next";
import { ScheduleList } from "@/components/schedule-list";

export const metadata: Metadata = {
  title: "Schedules — Task Queue",
};

export default function SchedulesPage() {
  return <ScheduleList />;
}
