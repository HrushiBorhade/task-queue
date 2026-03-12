"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";

type BatchRun = Tables<"batch_runs">;

export function useBatches(initialData: BatchRun[]) {
  const queryClient = useQueryClient();
  const [mountedAt] = useState(() => Date.now());

  const query = useQuery({
    queryKey: queryKeys.batches.list(),
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("batch_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw new Error("Failed to fetch batches");
      return data as BatchRun[];
    },
    initialData,
    initialDataUpdatedAt: mountedAt,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("batches-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "batch_runs" },
        (payload) => {
          const batch = payload.new as BatchRun;
          queryClient.setQueryData<BatchRun[]>(
            queryKeys.batches.list(),
            (old = []) => {
              // Replace optimistic batch if real one arrives
              const withoutOptimistic = old.filter(
                (b) => !b.id.startsWith("optimistic-")
              );
              if (withoutOptimistic.some((b) => b.id === batch.id)) {
                return withoutOptimistic.map((b) =>
                  b.id === batch.id ? batch : b
                );
              }
              return [batch, ...withoutOptimistic];
            }
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "batch_runs" },
        (payload) => {
          const batch = payload.new as BatchRun;
          queryClient.setQueryData<BatchRun[]>(
            queryKeys.batches.list(),
            (old = []) => old.map((b) => (b.id === batch.id ? batch : b))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}
