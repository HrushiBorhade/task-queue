"use client";

import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useQueueStats } from "@/hooks/use-queue-stats";
import { track } from "@/lib/analytics";

function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-8" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-8" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-10" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-8" /></TableCell>
          <TableCell><Skeleton className="h-3.5 w-8" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

export function QueueHealth() {
  const { data: stats, isLoading, error } = useQueueStats();

  useEffect(() => {
    track("queue_health_viewed", {});
  }, []);

  const showEmpty = !isLoading && !error && (!stats || stats.length === 0);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[200px]">Queue</TableHead>
          <TableHead className="w-[80px]">Waiting</TableHead>
          <TableHead className="w-[80px]">Active</TableHead>
          <TableHead className="w-[100px]">Completed</TableHead>
          <TableHead className="w-[80px]">Failed</TableHead>
          <TableHead className="w-[80px]">Delayed</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <SkeletonRows />
        ) : error ? (
          <TableRow>
            <TableCell colSpan={6} className="h-32 text-center">
              <p className="text-xs text-destructive">
                {error instanceof Error ? error.message : "Failed to fetch stats"}
              </p>
            </TableCell>
          </TableRow>
        ) : showEmpty ? (
          <TableRow>
            <TableCell colSpan={6} className="h-32 text-center">
              <p className="text-xs text-muted-foreground">No queues found.</p>
            </TableCell>
          </TableRow>
        ) : (
          stats?.map((queue) => {
            const hasFailures = queue.failed > 0;
            const hasActive = queue.active > 0;

            return (
              <TableRow key={queue.name}>
                <TableCell className="font-mono text-xs">{queue.name}</TableCell>
                <TableCell className="font-mono">
                  {queue.waiting > 0 ? (
                    <Badge variant="secondary">{queue.waiting}</Badge>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </TableCell>
                <TableCell className="font-mono">
                  {hasActive ? (
                    <Badge variant="default">{queue.active}</Badge>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-muted-foreground">{queue.completed}</TableCell>
                <TableCell className="font-mono">
                  {hasFailures ? (
                    <Badge variant="destructive">{queue.failed}</Badge>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-muted-foreground">{queue.delayed}</TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
