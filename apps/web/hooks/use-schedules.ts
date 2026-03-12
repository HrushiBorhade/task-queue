"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import type { Tables } from "@/lib/database.types";
import type { TaskType } from "@repo/shared";
import { track } from "@/lib/analytics";
import * as Sentry from "@sentry/nextjs";

type Schedule = Tables<"schedules">;

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function useSchedules() {
  return useQuery({
    queryKey: queryKeys.schedules.list(),
    queryFn: async () => {
      const data = await apiFetch<{ schedules: Schedule[] }>("/api/schedules");
      return data.schedules ?? [];
    },
  });
}

export function useToggleSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      await apiFetch(`/api/schedules/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
    },
    onSuccess: (_data, variables) => {
      track("schedule_toggled", { schedule_id: variables.id, enabled: variables.enabled });
      queryClient.invalidateQueries({ queryKey: queryKeys.schedules.all });
    },
    onError: (err, variables) => {
      Sentry.captureException(err, { tags: { action: "toggle_schedule" }, extra: { scheduleId: variables.id } });
    },
  });
}

export function useDeleteSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiFetch(`/api/schedules/${id}`, { method: "DELETE" });
    },
    onSuccess: (_data, id) => {
      track("schedule_deleted", { schedule_id: id });
      queryClient.invalidateQueries({ queryKey: queryKeys.schedules.all });
    },
    onError: (err, id) => {
      Sentry.captureException(err, { tags: { action: "delete_schedule" }, extra: { scheduleId: id } });
    },
  });
}

export function useCreateSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name: string;
      type: TaskType;
      input: { prompt: string };
      cron_expression: string;
      timezone: string;
      run_at?: string;
    }) => {
      await apiFetch("/api/schedules", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: (_data, variables) => {
      track("schedule_created", {
        type: variables.type,
        is_one_time: variables.cron_expression === "one-time",
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.schedules.all });
    },
    onError: (err) => {
      track("schedule_creation_failed", { error: err.message });
      Sentry.captureException(err, { tags: { action: "create_schedule" } });
    },
  });
}
