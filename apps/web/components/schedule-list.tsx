"use client";

import { useState } from "react";
import { motion } from "motion/react";
import cronstrue from "cronstrue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateScheduleDialog } from "./create-schedule-dialog";
import { useSchedules, useToggleSchedule, useDeleteSchedule } from "@/hooks/use-schedules";
import { Plus, Pause, Play, Trash } from "@phosphor-icons/react";
import { spring } from "@/lib/animations";
import { track } from "@/lib/analytics";
import type { Tables } from "@/lib/database.types";

function describeCron(expr: string): string {
  try {
    return cronstrue.toString(expr, { use24HourTimeFormat: false });
  } catch {
    return expr;
  }
}

type Schedule = Tables<"schedules">;

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function ScheduleCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-5 w-16" />
          </div>
          <div className="flex items-center gap-1">
            <Skeleton className="size-8" />
            <Skeleton className="size-8" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-3 w-48" />
        <Skeleton className="mt-1 h-3 w-64" />
      </CardContent>
    </Card>
  );
}

export function ScheduleList() {
  const { data: schedules = [], isLoading } = useSchedules();
  const toggleSchedule = useToggleSchedule();
  const deleteSchedule = useDeleteSchedule();
  const [createOpen, setCreateOpen] = useState(false);

  function handleToggle(schedule: Schedule) {
    toggleSchedule.mutate({ id: schedule.id, enabled: !schedule.enabled });
  }

  function handleDelete(id: string) {
    deleteSchedule.mutate(id);
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Schedules</h2>
        </div>
        <div className="grid gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <ScheduleCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Schedules</h2>
        <Button size="sm" onClick={() => {
          setCreateOpen(true);
          track("schedule_dialog_opened", {});
        }}>
          <Plus data-icon="inline-start" />
          New Schedule
        </Button>
      </div>

      {schedules.length === 0 && (
        <motion.div
          className="flex items-center justify-center rounded-lg border border-dashed p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <p className="text-xs text-muted-foreground">
            No schedules yet. Create one to run tasks on a cron schedule.
          </p>
        </motion.div>
      )}

      {schedules.length > 0 && (
        <div className="grid gap-3">
          {schedules.map((schedule, i) => (
            <motion.div
              key={schedule.id}
              initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{
                ...spring,
                delay: Math.min(i * 0.04, 0.3),
              }}
            >
              <Card className={!schedule.enabled ? "opacity-50" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      {schedule.name}
                      <Badge variant="secondary">
                        {schedule.type.replace(/_/g, " ")}
                      </Badge>
                      <Badge variant={schedule.enabled ? "default" : "outline"}>
                        {schedule.run_at && schedule.run_count > 0
                          ? "Ran"
                          : schedule.enabled
                            ? "Active"
                            : "Paused"}
                      </Badge>
                    </CardTitle>
                    <div className="flex items-center gap-1">
                      {/* Hide toggle for one-time schedules that already ran */}
                      {!(schedule.run_at && schedule.run_count > 0) && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleToggle(schedule)}
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
                        onClick={() => handleDelete(schedule.id)}
                        disabled={deleteSchedule.isPending}
                        aria-label="Delete"
                      >
                        <Trash />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {schedule.run_at ? (
                      <span>Once at {new Date(schedule.run_at).toLocaleString()}</span>
                    ) : (
                      <>
                        <span>{describeCron(schedule.cron_expression)}</span>
                        <span className="font-mono text-[10px] opacity-60">{schedule.cron_expression}</span>
                      </>
                    )}
                    <span>{schedule.run_count} runs</span>
                    <span>Last: {formatRelative(schedule.last_run_at)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    {(schedule.input as { prompt?: string })?.prompt}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <CreateScheduleDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </div>
  );
}
