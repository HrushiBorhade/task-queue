"use client";

import Link from "next/link";
import cronstrue from "cronstrue";
import type { Tables } from "@/lib/database.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, SpinnerGap } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { timeAgo, formatLabel, TYPE_ICON, TASK_STATUS_BADGE } from "@/lib/task-utils";

function describeCron(expr: string): string {
  try {
    return cronstrue.toString(expr, { use24HourTimeFormat: false });
  } catch {
    return expr;
  }
}

interface Props {
  schedule: Tables<"schedules">;
  tasks: Tables<"tasks">[];
}

export function ScheduleDetailClient({ schedule, tasks }: Props) {
  const router = useRouter();
  const Icon = TYPE_ICON[schedule.type];
  const isOneTime = !!schedule.run_at;
  const status = schedule.run_at && schedule.run_count > 0
    ? "ran"
    : schedule.enabled
      ? "active"
      : "paused";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href="/dashboard/schedules" aria-label="Back to schedules">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="size-4 text-muted-foreground" weight="duotone" />}
            <h1 className="text-lg font-semibold">{schedule.name}</h1>
            <Badge variant={status === "active" ? "default" : status === "ran" ? "secondary" : "outline"}>
              {status === "ran" ? "Ran" : status === "active" ? "Active" : "Paused"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground font-mono">{schedule.id}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <InfoCard label="Configuration">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Type</dt>
            <dd>{formatLabel(schedule.type)}</dd>
            <dt className="text-muted-foreground">Schedule</dt>
            <dd>
              {isOneTime
                ? `Once at ${new Date(schedule.run_at!).toLocaleString()}`
                : describeCron(schedule.cron_expression)}
            </dd>
            {!isOneTime && (
              <>
                <dt className="text-muted-foreground">Cron</dt>
                <dd className="font-mono">{schedule.cron_expression}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Timezone</dt>
            <dd>{schedule.timezone}</dd>
          </dl>
        </InfoCard>

        <InfoCard label="Stats">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Total Runs</dt>
            <dd className="font-mono">{schedule.run_count}</dd>
            <dt className="text-muted-foreground">Last Run</dt>
            <dd suppressHydrationWarning>{schedule.last_run_at ? new Date(schedule.last_run_at).toLocaleString() : "—"}</dd>
            <dt className="text-muted-foreground">Created</dt>
            <dd suppressHydrationWarning>{new Date(schedule.created_at).toLocaleString()}</dd>
          </dl>
        </InfoCard>

        <InfoCard label="Prompt" className="sm:col-span-2">
          <p className="text-sm leading-relaxed">
            {(schedule.input as { prompt?: string })?.prompt ?? "—"}
          </p>
        </InfoCard>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Tasks ({tasks.length})</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">Type</TableHead>
              <TableHead>Prompt</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              <TableHead className="w-[80px]">Progress</TableHead>
              <TableHead className="w-[80px] text-right">Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No tasks created by this schedule yet.
                </TableCell>
              </TableRow>
            ) : (
              tasks.map((task) => {
                const TaskIcon = TYPE_ICON[task.type];
                const prompt = (task.input as { prompt?: string })?.prompt ?? "";
                const isActive = task.status === "active";

                return (
                  <TableRow
                    key={task.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/dashboard/tasks/${task.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {TaskIcon && <TaskIcon className="size-3.5 shrink-0 text-muted-foreground" weight="duotone" />}
                        <span className="text-muted-foreground">{formatLabel(task.type)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[300px]">
                      <span className="truncate">{prompt}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={TASK_STATUS_BADGE[task.status] ?? "outline"}>
                        {isActive && <SpinnerGap className="animate-spin" data-icon="inline-start" />}
                        {task.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground">{task.progress}%</TableCell>
                    <TableCell className="text-right text-muted-foreground" suppressHydrationWarning>
                      {timeAgo(task.updated_at ?? task.created_at)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function InfoCard({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border p-4 ${className ?? ""}`}>
      <h2 className="mb-2 text-xs font-medium text-muted-foreground">{label}</h2>
      {children}
    </div>
  );
}
