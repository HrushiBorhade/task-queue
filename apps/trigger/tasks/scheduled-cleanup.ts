import { schedules, logger } from "@trigger.dev/sdk";

/**
 * Scheduled task — runs on a cron schedule.
 *
 * Unlike BullMQ where you need a separate scheduler worker + cron library,
 * Trigger.dev handles cron natively. You define the task here,
 * then attach a schedule via the dashboard or API.
 */
export const scheduledCleanupTask = schedules.task({
  id: "scheduled-cleanup",

  run: async (payload) => {
    // payload has schedule metadata — not your custom data
    logger.info("Running scheduled cleanup", {
      timestamp: payload.timestamp,          // When this run was scheduled
      lastTimestamp: payload.lastTimestamp,   // When it last ran (undefined if first)
      timezone: payload.timezone,            // IANA timezone string
      scheduleId: payload.scheduleId,        // ID of the schedule
      externalId: payload.externalId,        // Your custom ID (e.g., userId)
      upcoming: payload.upcoming,            // Next 5 scheduled times
    });

    // Simulate cleanup work
    const deletedCount = Math.floor(Math.random() * 100);

    logger.info("Cleanup complete", { deletedCount });

    return { deletedCount, ranAt: new Date().toISOString() };
  },
});

/**
 * To attach a schedule, use the dashboard or API:
 *
 * Dashboard: Project → Schedules → Create Schedule
 *   - Task: "scheduled-cleanup"
 *   - Cron: "0 2 * * *" (every day at 2am)
 *   - Timezone: "America/New_York"
 *
 * API:
 *   import { schedules } from "@trigger.dev/sdk";
 *   await schedules.create({
 *     task: "scheduled-cleanup",
 *     cron: "0 2 * * *",
 *     timezone: "America/New_York",
 *     externalId: "daily-cleanup",
 *   });
 */
