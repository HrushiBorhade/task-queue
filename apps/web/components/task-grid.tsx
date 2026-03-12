"use client";

import { useRef, useEffect, useState, memo } from "react";
import type { Tables } from "@/lib/database.types";
import { useTasks } from "@/hooks/use-tasks";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageDialog } from "@/components/image-dialog";
import { SpinnerGap, CaretUpDown } from "@phosphor-icons/react";
import { track } from "@/lib/analytics";
import { timeAgo, formatLabel, getImageOutput, TYPE_ICON, TASK_STATUS_BADGE } from "@/lib/task-utils";
import { cn } from "@/lib/utils";

/* ── Config ────────────────────────────────────────── */

const FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "queued", label: "Queued" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
] as const;

/* ── TaskRow (memoized for realtime perf) ──────────── */

const TaskRow = memo(function TaskRow({ task }: { task: Tables<"tasks"> }) {
  const prompt = (task.input as { prompt?: string })?.prompt ?? "";
  const isOptimistic = task.id.startsWith("optimistic-");
  const imageOutput = getImageOutput(task);
  const [dialogOpen, setDialogOpen] = useState(false);
  const Icon = TYPE_ICON[task.type];
  const isActive = task.status === "active";

  return (
    <>
      <TableRow
        className={cn(isOptimistic && "opacity-50", imageOutput && "cursor-pointer")}
        onClick={imageOutput ? () => setDialogOpen(true) : undefined}
      >
        {/* Type */}
        <TableCell>
          <div className="flex items-center gap-1.5">
            {Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground" weight="duotone" />}
            <span className="text-muted-foreground">{formatLabel(task.type)}</span>
          </div>
        </TableCell>

        {/* Prompt */}
        <TableCell className="max-w-[300px]">
          <div className="flex items-center gap-2">
            {imageOutput && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageOutput.image_url}
                alt=""
                className="size-7 shrink-0 rounded object-cover"
              />
            )}
            <span className="truncate">{imageOutput ? imageOutput.prompt : prompt}</span>
          </div>
        </TableCell>

        {/* Status */}
        <TableCell>
          <Badge variant={TASK_STATUS_BADGE[task.status] ?? "outline"}>
            {isActive && <SpinnerGap className="animate-spin" data-icon="inline-start" />}
            {isOptimistic ? "creating..." : task.status}
          </Badge>
        </TableCell>

        {/* Progress */}
        <TableCell className="font-mono">
          {isActive ? (
            <div className="flex items-center gap-2">
              <div className="h-1 w-16 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-foreground/60 transition-all duration-700"
                  style={{ width: `${task.progress}%` }}
                />
              </div>
              <span className="text-muted-foreground">{task.progress}%</span>
            </div>
          ) : task.status === "queued" ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className="text-muted-foreground">{task.progress}%</span>
          )}
        </TableCell>

        {/* Time */}
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

/* ── Skeleton rows ─────────────────────────────────── */

function SkeletonRows({ count = 8 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-48" /></TableCell>
          <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-10" /></TableCell>
          <TableCell className="text-right"><Skeleton className="ml-auto h-3.5 w-12" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

/* ── TaskGrid (table-based) ────────────────────────── */

export function TaskGrid({
  initialTasks,
}: {
  initialTasks: Tables<"tasks">[];
}) {
  const [filter, setFilter] = useState("all");
  const { tasks, isFetchingNextPage, hasNextPage, fetchNextPage, isLoading, error } =
    useTasks(initialTasks, filter);

  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) fetchNextPage();
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, fetchNextPage]);

  const activeLabel = FILTERS.find((f) => f.value === filter)?.label ?? "All";
  const showEmpty = !isLoading && !error && tasks.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[140px]">Type</TableHead>
            <TableHead>Prompt</TableHead>
            <TableHead className="w-[100px]">
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="Filter by status"
                  className="flex items-center gap-1 cursor-pointer select-none hover:text-foreground transition-colors -mx-1 px-1 rounded"
                >
                  Status
                  {filter !== "all" && (
                    <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                      {activeLabel}
                    </Badge>
                  )}
                  <CaretUpDown className="size-3 text-muted-foreground" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuRadioGroup
                    value={filter}
                    onValueChange={(v) => {
                      setFilter(v);
                      track("filter_changed", { filter: v });
                    }}
                  >
                    {FILTERS.map((f) => (
                      <DropdownMenuRadioItem key={f.value} value={f.value}>
                        {f.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableHead>
            <TableHead className="w-[120px]">Progress</TableHead>
            <TableHead className="w-[80px] text-right">Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <SkeletonRows />
          ) : error ? (
            <TableRow>
              <TableCell colSpan={5} className="h-32 text-center">
                <p className="text-xs text-destructive">
                  {error instanceof Error ? error.message : "Failed to fetch tasks"}
                </p>
              </TableCell>
            </TableRow>
          ) : showEmpty ? (
            <TableRow>
              <TableCell colSpan={5} className="h-32 text-center">
                <p className="text-xs text-muted-foreground">
                  {filter === "all"
                    ? "No tasks yet. Create one to get started."
                    : `No ${filter} tasks.`}
                </p>
              </TableCell>
            </TableRow>
          ) : (
            <>
              {tasks.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
              {isFetchingNextPage && <SkeletonRows count={3} />}
            </>
          )}
        </TableBody>
      </Table>

      <div ref={sentinelRef} className="h-1" />
    </div>
  );
}
