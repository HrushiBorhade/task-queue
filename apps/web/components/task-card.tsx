"use client";

import { useState } from "react";
import type { Tables } from "@/lib/database.types";
import type { ImageGenOutput } from "@repo/shared";
import {
  SpinnerGap,
  TextT,
  Image as ImageIcon,
  MagnifyingGlass,
  EnvelopeSimple,
  FilePdf,
  WebhooksLogo,
  ChartBar,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  CardAction,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ImageDialog } from "./image-dialog";

/* ── Config ────────────────────────────────────────── */

const TYPE_ICON: Record<string, React.ElementType> = {
  text_gen: TextT,
  image_gen: ImageIcon,
  research_agent: MagnifyingGlass,
  email_campaign: EnvelopeSimple,
  pdf_report: FilePdf,
  webhook_processing: WebhooksLogo,
  data_aggregation: ChartBar,
};

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  queued: "secondary",
  active: "default",
  completed: "outline",
  failed: "destructive",
};

/* ── Helpers ───────────────────────────────────────── */

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function getImageOutput(task: Tables<"tasks">): ImageGenOutput | null {
  if (task.type !== "image_gen" || task.status !== "completed") return null;
  const out = task.output as Record<string, unknown> | null;
  if (!out || typeof out.image_url !== "string") return null;
  return out as unknown as ImageGenOutput;
}

/* ── TaskCard ──────────────────────────────────────── */

export function TaskCard({ task }: { task: Tables<"tasks"> }) {
  const prompt = (task.input as { prompt?: string })?.prompt ?? "";
  const isOptimistic = task.id.startsWith("optimistic-");
  const imageOutput = getImageOutput(task);
  const [dialogOpen, setDialogOpen] = useState(false);
  const Icon = TYPE_ICON[task.type];
  const isActive = task.status === "active";

  return (
    <>
      <Card
        size="sm"
        className={cn(
          "h-full transition-shadow duration-200 hover:ring-foreground/15",
          isOptimistic && "opacity-50",
          imageOutput && "cursor-pointer",
        )}
        onClick={imageOutput ? () => setDialogOpen(true) : undefined}
      >
        {/* Image hero — uses Card's built-in img:first-child rounded-t support */}
        {imageOutput && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageOutput.image_url}
            alt={imageOutput.prompt}
            className="aspect-[16/10] w-full object-cover"
          />
        )}

        <CardHeader>
          <CardTitle className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            {Icon && <Icon className="size-3.5 shrink-0" weight="duotone" />}
            {task.type.replace(/_/g, " ")}
          </CardTitle>
          <CardAction>
            <Badge variant={STATUS_BADGE[task.status] ?? "outline"}>
              {isActive && (
                <SpinnerGap className="animate-spin" data-icon="inline-start" />
              )}
              {isOptimistic ? "creating..." : isActive ? `${task.progress}%` : task.status}
            </Badge>
          </CardAction>
        </CardHeader>

        <CardContent>
          <p className="text-sm leading-relaxed line-clamp-2">
            {imageOutput ? imageOutput.prompt : prompt}
          </p>
        </CardContent>

        <CardFooter className="mt-auto">
          {/* Active: thin inline progress track */}
          {isActive && (
            <div className="mr-3 h-1 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-foreground/60 transition-all duration-700"
                style={{ width: `${task.progress}%` }}
              />
            </div>
          )}

          <span className="ml-auto text-[10px] text-muted-foreground">
            {timeAgo(task.updated_at ?? task.created_at)}
          </span>
        </CardFooter>
      </Card>

      {imageOutput && (
        <ImageDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          imageUrl={imageOutput.image_url}
          prompt={imageOutput.prompt}
          taskId={task.id}
        />
      )}
    </>
  );
}

/* ── Skeleton ──────────────────────────────────────── */

export function TaskCardSkeleton() {
  return (
    <Card size="sm" className="h-full">
      <CardHeader>
        <CardTitle>
          <Skeleton className="h-3.5 w-20" />
        </CardTitle>
        <CardAction>
          <Skeleton className="h-5 w-14 rounded-full" />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-3/5" />
        </div>
      </CardContent>
      <CardFooter>
        <Skeleton className="ml-auto h-2.5 w-8" />
      </CardFooter>
    </Card>
  );
}
