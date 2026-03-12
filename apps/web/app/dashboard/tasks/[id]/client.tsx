"use client";

import Link from "next/link";
import type { Tables } from "@/lib/database.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft } from "@phosphor-icons/react";
import { ImageDialog } from "@/components/image-dialog";
import { useState } from "react";
import { formatLabel, getImageOutput, TYPE_ICON, TASK_STATUS_BADGE } from "@/lib/task-utils";

interface Props {
  task: Tables<"tasks">;
}

export function TaskDetailClient({ task }: Props) {
  const prompt = (task.input as { prompt?: string })?.prompt ?? "";
  const imageOutput = getImageOutput(task);
  const [dialogOpen, setDialogOpen] = useState(false);
  const Icon = TYPE_ICON[task.type];
  const isActive = task.status === "active";
  const output = task.output as Record<string, unknown> | null;
  const errorMsg = task.error;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href="/dashboard/tasks" aria-label="Back to tasks">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="size-4 text-muted-foreground" weight="duotone" />}
            <h1 className="text-lg font-semibold">{formatLabel(task.type)}</h1>
            <Badge variant={TASK_STATUS_BADGE[task.status] ?? "outline"}>
              {task.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground font-mono">{task.id}</p>
        </div>
      </div>

      {isActive && (
        <div className="flex items-center gap-3">
          <Progress value={task.progress} className="flex-1" />
          <span className="font-mono text-xs text-muted-foreground">{task.progress}%</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <InfoCard label="Prompt">
          <p className="text-sm leading-relaxed">{prompt}</p>
        </InfoCard>

        <InfoCard label="Timestamps">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Created</dt>
            <dd suppressHydrationWarning>{task.created_at ? new Date(task.created_at).toLocaleString() : "—"}</dd>
            <dt className="text-muted-foreground">Started</dt>
            <dd suppressHydrationWarning>{task.started_at ? new Date(task.started_at).toLocaleString() : "—"}</dd>
            <dt className="text-muted-foreground">Completed</dt>
            <dd suppressHydrationWarning>{task.completed_at ? new Date(task.completed_at).toLocaleString() : "—"}</dd>
          </dl>
        </InfoCard>

        <InfoCard label="Details">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Progress</dt>
            <dd className="font-mono">{task.progress}%</dd>
            <dt className="text-muted-foreground">Attempt</dt>
            <dd className="font-mono">{task.attempt}</dd>
            {task.batch_id && (
              <>
                <dt className="text-muted-foreground">Batch</dt>
                <dd>
                  <Link href={`/dashboard/batches/${task.batch_id}`} className="text-xs font-mono hover:underline">
                    {task.batch_id.slice(0, 8)}...
                  </Link>
                </dd>
              </>
            )}
            {task.schedule_id && (
              <>
                <dt className="text-muted-foreground">Schedule</dt>
                <dd>
                  <Link href={`/dashboard/schedules/${task.schedule_id}`} className="text-xs font-mono hover:underline">
                    {task.schedule_id.slice(0, 8)}...
                  </Link>
                </dd>
              </>
            )}
            {task.bullmq_job_id && (
              <>
                <dt className="text-muted-foreground">Job ID</dt>
                <dd className="font-mono">{task.bullmq_job_id}</dd>
              </>
            )}
          </dl>
        </InfoCard>

        {imageOutput && (
          <InfoCard label="Generated Image">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageOutput.image_url}
              alt={imageOutput.prompt}
              className="w-full rounded-md cursor-pointer"
              onClick={() => setDialogOpen(true)}
            />
          </InfoCard>
        )}

        {output && !imageOutput && (
          <InfoCard label="Output">
            <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">
              {JSON.stringify(output, null, 2)}
            </pre>
          </InfoCard>
        )}

        {errorMsg && (
          <InfoCard label="Error">
            <p className="text-sm text-destructive">{errorMsg}</p>
          </InfoCard>
        )}
      </div>

      {imageOutput && (
        <ImageDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          imageUrl={imageOutput.image_url}
          prompt={imageOutput.prompt}
          taskId={task.id}
        />
      )}
    </div>
  );
}

function InfoCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-4">
      <h2 className="mb-2 text-xs font-medium text-muted-foreground">{label}</h2>
      {children}
    </div>
  );
}
