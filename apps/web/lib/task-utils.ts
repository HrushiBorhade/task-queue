import type { Tables } from "@/lib/database.types";
import type { ImageGenOutput } from "@repo/shared";
import {
  TextT,
  Image as ImageIcon,
  MagnifyingGlass,
  EnvelopeSimple,
  FilePdf,
  WebhooksLogo,
  ChartBar,
} from "@phosphor-icons/react";

export function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function formatLabel(s: string): string {
  return s.replace(/_/g, " ");
}

export function getImageOutput(task: Tables<"tasks">): ImageGenOutput | null {
  if (task.type !== "image_gen" || task.status !== "completed") return null;
  const out = task.output as Record<string, unknown> | null;
  if (!out || typeof out.image_url !== "string") return null;
  return out as unknown as ImageGenOutput;
}

export const TYPE_ICON: Record<string, React.ElementType> = {
  text_gen: TextT,
  image_gen: ImageIcon,
  research_agent: MagnifyingGlass,
  email_campaign: EnvelopeSimple,
  pdf_report: FilePdf,
  webhook_processing: WebhooksLogo,
  data_aggregation: ChartBar,
};

export const TASK_STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  queued: "secondary",
  active: "default",
  completed: "outline",
  failed: "destructive",
};

export const POINTER_STYLE = { cursor: "pointer" } as const;
