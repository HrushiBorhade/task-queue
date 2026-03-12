"use client";

import { memo, useState } from "react";
import type { Tables } from "@/lib/database.types";
import type { ImageGenOutput } from "@repo/shared";
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
import {
  SpinnerGap,
  TextT,
  Image as ImageIcon,
  MagnifyingGlass,
  EnvelopeSimple,
  FilePdf,
  WebhooksLogo,
  ChartBar,
} from "@phosphor-icons/react";

const TYPE_ICON: Record<string, React.ElementType> = {
  text_gen: TextT,
  image_gen: ImageIcon,
  research_agent: MagnifyingGlass,
  email_campaign: EnvelopeSimple,
  pdf_report: FilePdf,
  webhook_processing: WebhooksLogo,
  data_aggregation: ChartBar,
};

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  queued: "secondary",
  active: "default",
  completed: "outline",
  failed: "destructive",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function getImageOutput(task: Tables<"tasks">): ImageGenOutput | null {
  if (task.type !== "image_gen" || task.status !== "completed") return null;
  const out = task.output as Record<string, unknown> | null;
  if (!out || typeof out.image_url !== "string") return null;
  return out as unknown as ImageGenOutput;
}

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
        style={imageOutput ? { cursor: "pointer" } : undefined}
      >
        <TableCell>
          <div className="flex items-center gap-1.5">
            {Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground" weight="duotone" />}
            <span className="text-muted-foreground">{task.type.replace(/_/g, " ")}</span>
          </div>
        </TableCell>
        <TableCell className="max-w-[300px]">
          <span className="truncate">{prompt}</span>
        </TableCell>
        <TableCell>
          <Badge variant={STATUS_BADGE[task.status] ?? "outline"}>
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
        <Badge variant={STATUS_BADGE[batch.status] ?? "outline"}>
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
