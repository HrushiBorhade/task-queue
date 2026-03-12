"use client";

import posthog from "posthog-js";
import * as Sentry from "@sentry/nextjs";

/**
 * Typed analytics events — add new events here as the product grows.
 * PostHog receives these as custom events with typed properties.
 */
interface AnalyticsEvents {
  // ── Task events ──
  task_created: { type: string };
  task_creation_failed: { type: string; error: string };
  task_dialog_opened: Record<string, never>;
  // ── Batch events ──
  batch_created: { size: number };
  batch_creation_failed: { size: number; error: string };
  batch_run_clicked: Record<string, never>;
  // ── Schedule events ──
  schedule_created: { type: string; is_one_time: boolean };
  schedule_creation_failed: { error: string };
  schedule_toggled: { schedule_id: string; enabled: boolean };
  schedule_deleted: { schedule_id: string };
  schedule_dialog_opened: Record<string, never>;
  // ── Navigation / UI ──
  main_tab_changed: { tab: string };
  filter_changed: { filter: string };
  batch_filter_changed: { filter: string };
  schedule_filter_changed: { filter: string };
  theme_toggled: { theme: string };
  queue_health_viewed: Record<string, never>;
  // ── Image events ──
  image_downloaded: { taskId: string };
  image_shared: { taskId: string; method: "native" | "clipboard" };
  image_dialog_opened: { taskId: string };
  // ── Engagement ──
  page_scrolled_to_load_more: { page: number };
  // ── Auth funnel ──
  login_page_viewed: Record<string, never>;
  login_email_submitted: { email_domain: string };
  login_google_clicked: Record<string, never>;
  login_email_password_submitted: { is_new_user: boolean };
  sign_out_clicked: Record<string, never>;
}

type EventName = keyof AnalyticsEvents;

export function track<T extends EventName>(
  event: T,
  properties: AnalyticsEvents[T]
): void {
  if (typeof window === "undefined") return;
  posthog.capture(event, properties);
}

/**
 * Identify the current user for PostHog person profiles.
 * Call once after authentication.
 */
export function identifyUser(userId: string, email: string): void {
  if (typeof window === "undefined") return;
  posthog.identify(userId, { email });
  Sentry.setUser({ id: userId, email });
}
