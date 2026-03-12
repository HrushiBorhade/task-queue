"use client";

import { useEffect } from "react";
import { motion } from "motion/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueueStats } from "@/hooks/use-queue-stats";
import { track } from "@/lib/analytics";

const spring = { type: "spring" as const, duration: 0.35, bounce: 0 };

export function QueueHealth() {
  const { data: stats, isLoading, error } = useQueueStats();

  useEffect(() => {
    track("queue_health_viewed", {});
  }, []);

  if (error) {
    return (
      <motion.div
        className="flex items-center justify-center rounded-lg border border-dashed p-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <p className="text-xs text-muted-foreground">
          {error instanceof Error ? error.message : "Failed to fetch stats"}
        </p>
      </motion.div>
    );
  }

  if (isLoading || !stats) {
    return (
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <QueueHealthSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {stats.map((queue, i) => (
        <motion.div
          key={queue.name}
          initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ ...spring, delay: Math.min(i * 0.04, 0.3) }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="font-mono text-xs">
                {queue.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                <StatCell label="Waiting" value={queue.waiting} />
                <StatCell label="Active" value={queue.active} />
                <StatCell label="Completed" value={queue.completed} />
                <StatCell label="Failed" value={queue.failed} />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-muted/50 p-2">
      <span className="text-[0.625rem] text-muted-foreground">{label}</span>
      <span className="font-mono text-sm font-medium">{value}</span>
    </div>
  );
}

function QueueHealthSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-4 w-24" />
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-0.5 rounded-md bg-muted/50 p-2">
              <Skeleton className="h-2.5 w-12" />
              <Skeleton className="h-4 w-8" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
