"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { BroadcastEvent } from "@repo/shared";

export function useTaskStream(taskId: string | null) {
  const [state, setState] = useState<{
    taskId: string | null;
    events: BroadcastEvent[];
    streamedText: string;
  }>({ taskId, events: [], streamedText: "" });

  if (state.taskId !== taskId) {
    setState({ taskId, events: [], streamedText: "" });
  }

  const clear = useCallback(() => {
    setState((prev) => ({ ...prev, events: [], streamedText: "" }));
  }, []);

  useEffect(() => {
    if (!taskId) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`task:${taskId}`)
      .on("broadcast", { event: "task-event" }, ({ payload }) => {
        const event = payload as BroadcastEvent;

        setState((prev) => {
          if (prev.taskId !== taskId) return prev;
          return {
            ...prev,
            events: [...prev.events, event],
            streamedText:
              event.type === "chunk"
                ? prev.streamedText + event.message
                : prev.streamedText,
          };
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [taskId]);

  return {
    events: state.events,
    streamedText: state.streamedText,
    clear,
  };
}
