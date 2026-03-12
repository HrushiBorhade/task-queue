import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import type { BroadcastEvent } from "@repo/shared";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const TaskChannelMap = new Map<string, RealtimeChannel>();

function getChannel(taskId: string): RealtimeChannel {
  if (!TaskChannelMap.has(taskId)) {
    const channel = supabase.channel(`task:${taskId}`);
    channel.subscribe();
    TaskChannelMap.set(taskId, channel);
  }

  return TaskChannelMap.get(taskId)!;
}

export function broadcastTaskEvent(
  taskId: string,
  event: BroadcastEvent,
): void {
  const channel = getChannel(taskId);
  channel.send({
    type: "broadcast",
    event: "task-event",
    payload: event,
  });
}

export function cleanupTaskChannel(taskId: string): void {
  const channel = TaskChannelMap.get(taskId);
  if (channel) {
    supabase.removeChannel(channel);
    TaskChannelMap.delete(taskId);
  }
}

export { supabase };
