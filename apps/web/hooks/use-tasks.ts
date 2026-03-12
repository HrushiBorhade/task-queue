"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { createClient } from "@/lib/supabase/client";
import type { Tables, Json } from "@/lib/database.types";
import type { TaskType, TaskInput } from "@repo/shared";
import { track } from "@/lib/analytics";
import * as Sentry from "@sentry/nextjs";

type Task = Tables<"tasks">;
type BatchRun = Tables<"batch_runs">;

const ALL_FILTERS = ["all", "queued", "active", "completed", "failed"] as const;

interface TaskPage {
  tasks: Task[];
  hasMore: boolean;
  page: number;
}

function makeOptimisticTask(
  type: TaskType,
  input: TaskInput,
  batchId: string | null = null
): Task {
  const now = new Date().toISOString();
  return {
    id: `optimistic-${crypto.randomUUID()}`,
    type,
    input: input as unknown as Json,
    status: "queued",
    progress: 0,
    output: null,
    error: null,
    batch_id: batchId,
    bullmq_job_id: null,
    schedule_id: null,
    attempt: 0,
    created_at: now,
    started_at: null,
    completed_at: null,
    updated_at: now,
    user_id: null,
  };
}

function prependToFirstPage(
  queryClient: QueryClient,
  key: ReturnType<typeof queryKeys.tasks.list>,
  newTasks: Task[]
): void {
  queryClient.setQueryData<InfiniteData<TaskPage>>(key, (old) => {
    if (!old) return old;
    const firstPage = old.pages[0];
    if (!firstPage) return old;
    return {
      ...old,
      pages: [
        { ...firstPage, tasks: [...newTasks, ...firstPage.tasks] },
        ...old.pages.slice(1),
      ],
    };
  });
}

// Cache update helpers — preserve object identity for unaffected tasks (enables React.memo)
function updateTaskInPages(pages: TaskPage[], task: Task): TaskPage[] {
  return pages.map((page) => {
    const idx = page.tasks.findIndex((t) => t.id === task.id);
    if (idx === -1) return page; // unchanged — same reference
    const tasks = [...page.tasks];
    tasks[idx] = task;
    return { ...page, tasks };
  });
}

function removeTaskFromPages(pages: TaskPage[], taskId: string): TaskPage[] {
  return pages.map((page) => {
    if (!page.tasks.some((t) => t.id === taskId)) return page; // unchanged
    return { ...page, tasks: page.tasks.filter((t) => t.id !== taskId) };
  });
}

export function useTasks(
  initialTasks: Task[],
  filter: string = "all"
) {
  const queryClient = useQueryClient();
  const channelId = useId();
  const [mountedAt] = useState(() => Date.now());

  const query = useInfiniteQuery<TaskPage>({
    queryKey: queryKeys.tasks.list(filter),
    queryFn: async ({ pageParam, queryKey }) => {
      // Derive statusParam from queryKey — not closure — to avoid stale captures
      const filterFromKey = queryKey[2] as string;
      const statusParam = filterFromKey === "all" ? "" : `&status=${filterFromKey}`;
      const res = await fetch(
        `/api/tasks?limit=20&page=${pageParam}${statusParam}`
      );
      if (!res.ok) throw new Error("Failed to fetch tasks");
      return res.json() as Promise<TaskPage>;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
    initialData:
      filter === "all"
        ? {
            pages: [{
              tasks: initialTasks.slice(0, 20),
              hasMore: initialTasks.length > 20,
              page: 0,
            }],
            pageParams: [0],
          }
        : undefined,
    initialDataUpdatedAt: filter === "all" ? mountedAt : undefined,
    placeholderData: filter !== "all"
      ? () => {
          const allCache = queryClient.getQueryData<InfiniteData<TaskPage>>(
            queryKeys.tasks.list("all")
          );
          if (!allCache) return undefined;
          const filtered = allCache.pages
            .flatMap((p) => p.tasks)
            .filter((t) => t.status === filter);
          return {
            pages: [{ tasks: filtered, hasMore: false, page: 0 }],
            pageParams: [0],
          };
        }
      : undefined,
  });

  // Realtime: patch all filter caches when tasks INSERT/UPDATE
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`tasks-realtime-${channelId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tasks" },
        (payload) => {
          const task = payload.new as Task;
          const keys = [queryKeys.tasks.list("all"), queryKeys.tasks.list(task.status)];
          for (const key of keys) {
            queryClient.setQueryData<InfiniteData<TaskPage>>(key, (old) => {
              if (!old) return old;
              const firstPage = old.pages[0];
              if (!firstPage) return old;

              // Check for duplicates before cleaning optimistic entries
              const alreadyReal = firstPage.tasks.some((t) => t.id === task.id);

              // Remove one optimistic placeholder of the same type
              let removedOne = false;
              const cleanedTasks = firstPage.tasks.filter((t) => {
                if (!removedOne && t.id.startsWith("optimistic-") && t.type === task.type) {
                  removedOne = true;
                  return false;
                }
                return true;
              });

              // If real task already exists, still apply optimistic cleanup
              if (alreadyReal) {
                if (!removedOne) return old; // nothing changed
                return {
                  ...old,
                  pages: [{ ...firstPage, tasks: cleanedTasks }, ...old.pages.slice(1)],
                };
              }

              return {
                ...old,
                pages: [
                  { ...firstPage, tasks: [task, ...cleanedTasks] },
                  ...old.pages.slice(1),
                ],
              };
            });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tasks" },
        (payload) => {
          const task = payload.new as Task;

          // "all" cache: update in-place, preserving identity for unaffected tasks
          queryClient.setQueryData<InfiniteData<TaskPage>>(
            queryKeys.tasks.list("all"),
            (old) => {
              if (!old) return old;
              return { ...old, pages: updateTaskInPages(old.pages, task) };
            }
          );

          // Status-specific caches: remove from wrong, upsert into correct
          for (const f of ALL_FILTERS) {
            if (f === "all") continue;

            queryClient.setQueryData<InfiniteData<TaskPage>>(
              queryKeys.tasks.list(f),
              (old) => {
                if (!old) return old;

                if (f === task.status) {
                  // Correct cache — update if exists, prepend if new
                  const exists = old.pages.some((page) =>
                    page.tasks.some((t) => t.id === task.id)
                  );
                  if (exists) {
                    return { ...old, pages: updateTaskInPages(old.pages, task) };
                  }
                  const firstPage = old.pages[0];
                  if (!firstPage) return old;
                  return {
                    ...old,
                    pages: [
                      { ...firstPage, tasks: [task, ...firstPage.tasks] },
                      ...old.pages.slice(1),
                    ],
                  };
                }

                // Wrong cache — remove
                return { ...old, pages: removeTaskFromPages(old.pages, task.id) };
              }
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, channelId]);

  // Deduplicate across pages
  const uniqueTasks = useMemo(() => {
    const all = query.data?.pages.flatMap((p) => p.tasks) ?? [];
    const seen = new Set<string>();
    return all.filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
  }, [query.data]);

  return {
    tasks: uniqueTasks,
    isLoading: query.isLoading,
    isPlaceholderData: query.isPlaceholderData,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    error: query.error,
  };
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ type, input }: { type: TaskType; input: TaskInput }) => {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, input }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to create task");
      }
      return res.json() as Promise<{ task: Task }>;
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.all });
      const previous = queryClient.getQueryData(queryKeys.tasks.list("all"));

      const optimistic = makeOptimisticTask(variables.type, variables.input);
      prependToFirstPage(queryClient, queryKeys.tasks.list("all"), [optimistic]);

      return { previous };
    },
    onSuccess: (_data, variables) => {
      track("task_created", { type: variables.type });
    },
    onError: (err, vars, context) => {
      track("task_creation_failed", { type: vars.type, error: err.message });
      Sentry.captureException(err, { tags: { action: "create_task", type: vars.type } });
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.tasks.list("all"), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });
}

export function useCreateBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tasks: { type: TaskType; input: TaskInput }[]) => {
      const res = await fetch("/api/tasks/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to create batch");
      }
      return res.json() as Promise<{
        batch: BatchRun;
        totalCreated: number;
        failedToEnqueue: number;
      }>;
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.all });
      await queryClient.cancelQueries({ queryKey: queryKeys.batches.all });

      const previousTasks = queryClient.getQueryData(queryKeys.tasks.list("all"));
      const previousBatches = queryClient.getQueryData<BatchRun[]>(
        queryKeys.batches.list()
      );

      const now = new Date().toISOString();
      const batchId = `optimistic-${crypto.randomUUID()}`;

      const optimisticBatch: BatchRun = {
        id: batchId,
        status: "running",
        total_tasks: variables.length,
        completed_count: 0,
        created_at: now,
        updated_at: now,
        user_id: null,
      };

      const optimisticTasks = variables.map((v) =>
        makeOptimisticTask(v.type, v.input, batchId)
      );

      prependToFirstPage(queryClient, queryKeys.tasks.list("all"), optimisticTasks);

      queryClient.setQueryData<BatchRun[]>(
        queryKeys.batches.list(),
        (old = []) => [optimisticBatch, ...old]
      );

      return { previousTasks, previousBatches };
    },
    onSuccess: (_data, variables) => {
      track("batch_created", { size: variables.length });
    },
    onError: (err, vars, context) => {
      track("batch_creation_failed", { size: vars.length, error: err.message });
      Sentry.captureException(err, { tags: { action: "create_batch", size: String(vars.length) } });
      if (context?.previousTasks) {
        queryClient.setQueryData(queryKeys.tasks.list("all"), context.previousTasks);
      }
      if (context?.previousBatches) {
        queryClient.setQueryData(queryKeys.batches.list(), context.previousBatches);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.batches.all });
    },
  });
}
