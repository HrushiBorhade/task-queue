"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";

interface QueueStat {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export function useQueueStats() {
  return useQuery({
    queryKey: queryKeys.stats.queues,
    queryFn: async (): Promise<QueueStat[]> => {
      const res = await fetch("/api/admin/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      const data = await res.json();
      return data.stats;
    },
    refetchInterval: 5_000,
  });
}
