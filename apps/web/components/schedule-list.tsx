"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import cronstrue from "cronstrue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateScheduleDialog } from "./create-schedule-dialog";
import { useSchedules, useToggleSchedule, useDeleteSchedule } from "@/hooks/use-schedules";
import { Plus, Pause, Play, Trash, CaretUpDown } from "@phosphor-icons/react";
import { track } from "@/lib/analytics";
import type { Tables } from "@/lib/database.types";
import { timeAgo, formatLabel } from "@/lib/task-utils";

function describeCron(expr: string): string {
  try {
    return cronstrue.toString(expr, { use24HourTimeFormat: false });
  } catch {
    return expr;
  }
}

type Schedule = Tables<"schedules">;

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
] as const;

function getScheduleStatus(schedule: Schedule): string {
  if (schedule.run_at && schedule.run_count > 0) return "ran";
  return schedule.enabled ? "active" : "paused";
}

function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
          <TableCell><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-36" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-8" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-14" /></TableCell>
          <TableCell className="text-right"><Skeleton className="ml-auto h-3.5 w-16" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

export function ScheduleList() {
  const router = useRouter();
  const { data: schedules = [], isLoading } = useSchedules();
  const toggleSchedule = useToggleSchedule();
  const deleteSchedule = useDeleteSchedule();
  const [createOpen, setCreateOpen] = useState(false);
  const [filter, setFilter] = useState("all");

  const filtered = filter === "all"
    ? schedules
    : schedules.filter((s) => getScheduleStatus(s) === filter);

  const showEmpty = !isLoading && filtered.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Schedules</h1>
        <Button size="sm" onClick={() => {
          setCreateOpen(true);
          track("schedule_dialog_opened", {});
        }}>
          <Plus data-icon="inline-start" />
          New Schedule
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[160px]">Name</TableHead>
            <TableHead className="w-[100px]">Type</TableHead>
            <TableHead className="w-[100px]">
              <DropdownMenu>
                <DropdownMenuTrigger aria-label="Filter by status" className="flex items-center gap-1 cursor-pointer select-none hover:text-foreground transition-colors -mx-1 px-1 rounded">
                  Status
                  {filter !== "all" && (
                    <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                      {STATUS_FILTERS.find((f) => f.value === filter)?.label ?? "All"}
                    </Badge>
                  )}
                  <CaretUpDown className="size-3 text-muted-foreground" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuRadioGroup
                    value={filter}
                    onValueChange={(v) => {
                      setFilter(v);
                      track("schedule_filter_changed", { filter: v });
                    }}
                  >
                    {STATUS_FILTERS.map((f) => (
                      <DropdownMenuRadioItem key={f.value} value={f.value}>
                        {f.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableHead>
            <TableHead>Schedule</TableHead>
            <TableHead className="w-[60px]">Runs</TableHead>
            <TableHead className="w-[100px]">Last Run</TableHead>
            <TableHead className="w-[80px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <SkeletonRows />
          ) : showEmpty ? (
            <TableRow>
              <TableCell colSpan={7} className="h-32 text-center">
                <p className="text-xs text-muted-foreground">
                  {filter === "all"
                    ? "No schedules yet. Create one to run tasks on a cron schedule."
                    : `No ${filter} schedules.`}
                </p>
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((schedule) => {
              const status = getScheduleStatus(schedule);
              const isOneTimeRan = schedule.run_at && schedule.run_count > 0;

              return (
                <TableRow key={schedule.id} className="cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/dashboard/schedules/${schedule.id}`)}>
                  <TableCell className="font-medium">{schedule.name}</TableCell>
                  <TableCell>
                    <span className="text-muted-foreground">{formatLabel(schedule.type)}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={status === "active" ? "default" : status === "ran" ? "secondary" : "outline"}>
                      {status === "ran" ? "Ran" : status === "active" ? "Active" : "Paused"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      {schedule.run_at ? (
                        <span className="text-xs text-muted-foreground">
                          Once at {new Date(schedule.run_at).toLocaleString()}
                        </span>
                      ) : (
                        <>
                          <span className="text-xs text-muted-foreground">{describeCron(schedule.cron_expression)}</span>
                          <span className="font-mono text-[10px] text-muted-foreground/60">{schedule.cron_expression}</span>
                        </>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">{schedule.run_count}</TableCell>
                  <TableCell className="text-muted-foreground" suppressHydrationWarning>
                    {timeAgo(schedule.last_run_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {!isOneTimeRan && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={(e) => { e.stopPropagation(); toggleSchedule.mutate({ id: schedule.id, enabled: !schedule.enabled }); }}
                          disabled={toggleSchedule.isPending}
                          aria-label={schedule.enabled ? "Pause" : "Resume"}
                        >
                          {schedule.enabled ? <Pause /> : <Play />}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); deleteSchedule.mutate(schedule.id); }}
                        disabled={deleteSchedule.isPending}
                        aria-label="Delete"
                      >
                        <Trash />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <CreateScheduleDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </div>
  );
}
