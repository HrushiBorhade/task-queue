"use client";

import type { Tables } from "@/lib/database.types";
import { TaskGrid } from "@/components/task-grid";
import { CreateTaskDialog } from "@/components/create-task-dialog";

interface Props {
  initialTasks: Tables<"tasks">[];
}

export function TasksPageClient({ initialTasks }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Tasks</h1>
        <CreateTaskDialog />
      </div>
      <TaskGrid initialTasks={initialTasks} />
    </div>
  );
}
