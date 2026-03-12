"use client";

import { memo, useState } from "react";
import type { Tables } from "@/lib/database.types";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ImageDialog } from "@/components/image-dialog";
import { SpinnerGap } from "@phosphor-icons/react";
import { timeAgo, formatLabel, getImageOutput, TYPE_ICON, TASK_STATUS_BADGE } from "@/lib/task-utils";
import { cn } from "@/lib/utils";

const BatchTaskRow = memo(function BatchTaskRow({ task }: { task: Tables<"tasks"> }) {
  const prompt = (task.input as { prompt?: string })?.prompt ?? "";
  const imageOutput = getImageOutput(task);
  const [dialogOpen, setDialogOpen] = useState(false);
  const Icon = TYPE_ICON[task.type];
  const isActive = task.status === "active";

  return (
    <>
      <TableRow
        onClick={imageOutput ? () => setDialogOpen(true) : undefined}
        className={cn(imageOutput && "cursor-pointer")}
      >
        <TableCell>
          <div className="flex items-center gap-1.5">
            {Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground" weight="duotone" />}
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
        <TableCell className="font-mono text-muted-foreground">
          {task.progress}%
        </TableCell>
        <TableCell className="text-right text-muted-foreground" suppressHydrationWarning>
          {timeAgo(task.updated_at ?? task.created_at)}
        </TableCell>
      </TableRow>
      {imageOutput && (
        <ImageDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          imageUrl={imageOutput.image_url}
          prompt={imageOutput.prompt}
          taskId={task.id}
        />
      )}
    </>
  );
});

interface Props {
  batch: Tables<"batch_runs">;
  tasks: Tables<"tasks">[];
}

export function BatchDetailClient({ batch, tasks }: Props) {
  const pct = batch.total_tasks
    ? Math.round((batch.completed_count / batch.total_tasks) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">
            Batch <span className="font-mono text-muted-foreground">{batch.id.slice(0, 8)}</span>
          </h1>
          <p className="text-xs text-muted-foreground" suppressHydrationWarning>
            Created {timeAgo(batch.created_at)} · {batch.total_tasks} tasks
          </p>
        </div>
        <Badge variant={TASK_STATUS_BADGE[batch.status] ?? "outline"}>
          {batch.status}
        </Badge>
      </div>

      <div className="flex items-center gap-3">
        <Progress value={pct} className="flex-1" />
        <span className="font-mono text-xs text-muted-foreground">
          {batch.completed_count}/{batch.total_tasks}
        </span>
      </div>

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
                No tasks in this batch.
              </TableCell>
            </TableRow>
          ) : (
            tasks.map((task) => <BatchTaskRow key={task.id} task={task} />)
          )}
        </TableBody>
      </Table>
    </div>
  );
}
