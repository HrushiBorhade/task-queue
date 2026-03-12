"use client";

import type { Tables } from "@/lib/database.types";
import { SpinnerGap } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardAction,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const BATCH_STATUS_VARIANT: Record<
  string,
  { variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  running: { variant: "default" },
  completed: { variant: "outline" },
  partial_failure: { variant: "destructive" },
};

export function BatchProgress({ batch }: { batch: Tables<"batch_runs"> }) {
  const pct =
    batch.total_tasks > 0
      ? Math.round((batch.completed_count / batch.total_tasks) * 100)
      : 0;
  const sv =
    BATCH_STATUS_VARIANT[batch.status] ?? ({ variant: "outline" } as const);
  const isOptimistic = batch.id.startsWith("optimistic-");

  return (
    <Card
      className={cn(
        "transition-shadow duration-200 hover:ring-foreground/20",
        isOptimistic && "opacity-60"
      )}
    >
      <CardHeader>
        <CardTitle className="font-mono text-xs text-muted-foreground truncate">
          {isOptimistic ? "creating..." : `${batch.id.slice(0, 8)}...`}
        </CardTitle>
        <CardAction>
          <Badge variant={sv.variant}>
            {(batch.status === "running" || isOptimistic) && (
              <SpinnerGap className="animate-spin" data-icon="inline-start" />
            )}
            {isOptimistic
              ? "creating..."
              : batch.status.replace(/_/g, " ")}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Progress value={pct} />
        <div className="flex items-center justify-between">
          <span className="font-mono text-[0.625rem] text-muted-foreground">
            {batch.completed_count}/{batch.total_tasks} completed
          </span>
          <span className="font-mono text-[0.625rem] text-muted-foreground">
            {pct}%
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export function BatchProgressSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-4 w-20" />
        <CardAction>
          <Skeleton className="h-5 w-16 rounded-full" />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Skeleton className="h-2 w-full rounded-full" />
        <div className="flex items-center justify-between">
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="h-2.5 w-8" />
        </div>
      </CardContent>
    </Card>
  );
}
