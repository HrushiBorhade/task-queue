import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { tasks, taskEvents } from "@repo/shared";
import type { BroadcastEvent } from "@repo/shared";
import { db } from "../lib/db";
import { broadcastTaskEvent, cleanupTaskChannel } from "../lib/supabase";
import { createLogger } from "../lib/logger";

const log = createLogger({ module: "progress" });

export class ProgressTracker {
  private job: Job;
  private taskId: string;
  private userId: string;
  private pendingProgress: number | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(job: Job, taskId: string, userId: string) {
    this.job = job;
    this.taskId = taskId;
    this.userId = userId;

    // Throttled DB writes: flush pending progress every 1 second
    this.flushTimer = setInterval(() => this.flush(), 1_000);
  }

  /** Broadcast a streaming chunk (fire-and-forget, no DB write) */
  broadcastChunk(chunk: string): void {
    broadcastTaskEvent(this.taskId, {
      type: "chunk",
      message: chunk,
      timestamp: new Date().toISOString(),
    });
  }

  /** Broadcast a step message + persist to task_events table */
  async broadcastStep(
    message: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    const event: BroadcastEvent = {
      type: "step",
      message,
      data,
      timestamp: new Date().toISOString(),
    };

    // Persist to DB (non-fatal — don't crash worker if logging fails)
    try {
      await db.insert(taskEvents).values({
        taskId: this.taskId,
        userId: this.userId,
        type: "step",
        message,
        data,
      });
    } catch (err) {
      log.error({ taskId: this.taskId, err }, "Failed to persist step event");
    }

    // Broadcast (fire-and-forget)
    broadcastTaskEvent(this.taskId, event);
  }

  /** Update progress percentage — BullMQ job + throttled DB write + broadcast */
  updateProgress(progress: number, message?: string): void {
    this.pendingProgress = progress;

    // Update BullMQ job progress in Redis — keeps lock alive + enables
    // job.progress in Bull Board, QueueEvents 'progress' listener, etc.
    this.job.updateProgress(progress).catch((err) => {
      log.error({ taskId: this.taskId, err }, "Failed to update BullMQ job progress");
    });

    broadcastTaskEvent(this.taskId, {
      type: "progress",
      message: message ?? `Progress: ${progress}%`,
      progress,
      timestamp: new Date().toISOString(),
    });
  }

  /** Flush pending progress to DB */
  async flush(): Promise<void> {
    if (this.pendingProgress === null) return;

    const progress = this.pendingProgress;
    this.pendingProgress = null;

    try {
      await db.update(tasks).set({ progress }).where(eq(tasks.id, this.taskId));
    } catch (err) {
      // Restore so next flush retries
      this.pendingProgress = progress;
      log.error({ taskId: this.taskId, err }, "Failed to flush progress");
    }
  }

  /** Mark complete — clears pending progress so destroy() won't overwrite */
  complete(): void {
    this.pendingProgress = null;

    this.job.updateProgress(100).catch((err) => {
      log.error({ taskId: this.taskId, err }, "Failed to update BullMQ job progress to 100");
    });

    broadcastTaskEvent(this.taskId, {
      type: "progress",
      message: "Complete",
      progress: 100,
      timestamp: new Date().toISOString(),
    });
  }

  /** Cleanup: flush remaining progress, clear timer, remove channel */
  async destroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    await this.flush();
    cleanupTaskChannel(this.taskId);
  }
}
