"use client";

import { useState } from "react";
import type { Tables } from "@/lib/database.types";
import { SpinnerGap } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardAction,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ImageDialog } from "./image-dialog";
import { timeAgo, formatLabel, getImageOutput, TYPE_ICON, TASK_STATUS_BADGE } from "@/lib/task-utils";

/* ── TaskCard ──────────────────────────────────────── */

export function TaskCard({ task }: { task: Tables<"tasks"> }) {
  const prompt = (task.input as { prompt?: string })?.prompt ?? "";
  const isOptimistic = task.id.startsWith("optimistic-");
  const imageOutput = getImageOutput(task);
  const [dialogOpen, setDialogOpen] = useState(false);
  const Icon = TYPE_ICON[task.type];
  const isActive = task.status === "active";

  return (
    <>
      <Card
        size="sm"
        className={cn(
          "h-full transition-shadow duration-200 hover:ring-foreground/15",
          isOptimistic && "opacity-50",
          imageOutput && "cursor-pointer",
        )}
        onClick={imageOutput ? () => setDialogOpen(true) : undefined}
      >
        {/* Image hero — uses Card's built-in img:first-child rounded-t support */}
        {imageOutput && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageOutput.image_url}
            alt={imageOutput.prompt}
            className="aspect-[16/10] w-full object-cover"
          />
        )}

        <CardHeader>
          <CardTitle className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            {Icon && <Icon className="size-3.5 shrink-0" weight="duotone" />}
            {formatLabel(task.type)}
          </CardTitle>
          <CardAction>
            <Badge variant={TASK_STATUS_BADGE[task.status] ?? "outline"}>
              {isActive && (
                <SpinnerGap className="animate-spin" data-icon="inline-start" />
              )}
              {isOptimistic ? "creating..." : isActive ? `${task.progress}%` : task.status}
            </Badge>
          </CardAction>
        </CardHeader>

        <CardContent>
          <p className="text-sm leading-relaxed line-clamp-2">
            {imageOutput ? imageOutput.prompt : prompt}
          </p>
        </CardContent>

        <CardFooter className="mt-auto">
          {isActive && (
            <div className="mr-3 h-1 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-foreground/60 transition-all duration-700"
                style={{ width: `${task.progress}%` }}
              />
            </div>
          )}

          <span className="ml-auto text-[10px] text-muted-foreground" suppressHydrationWarning>
            {timeAgo(task.updated_at ?? task.created_at)}
          </span>
        </CardFooter>
      </Card>

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
}

/* ── Skeleton ──────────────────────────────────────── */

export function TaskCardSkeleton() {
  return (
    <Card size="sm" className="h-full">
      <CardHeader>
        <CardTitle>
          <Skeleton className="h-3.5 w-20" />
        </CardTitle>
        <CardAction>
          <Skeleton className="h-5 w-14 rounded-full" />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-3/5" />
        </div>
      </CardContent>
      <CardFooter>
        <Skeleton className="ml-auto h-2.5 w-8" />
      </CardFooter>
    </Card>
  );
}
