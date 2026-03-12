"use client";

import { useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, LazyMotion, m, domAnimation } from "motion/react";
import type { Tables } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Lightning, CaretUpDown } from "@phosphor-icons/react";
import { useCreateBatch } from "@/hooks/use-tasks";
import { useBatches } from "@/hooks/use-batches";
import { TASK_TYPES, type TaskType } from "@repo/shared";
import { track } from "@/lib/analytics";
import { timeAgo } from "@/lib/task-utils";

const SAMPLE_PROMPTS: Record<TaskType, string[]> = {
  text_gen: [
    "Write a haiku about distributed systems",
    "Explain quantum computing in simple terms",
    "Draft a welcome email for new users",
  ],
  image_gen: [
    "A futuristic city skyline at sunset",
    "Abstract art representing async workflows",
    "A serene mountain landscape with fog",
  ],
  research_agent: [
    "Compare Redis vs Kafka for message queuing",
    "Latest trends in edge computing 2026",
    "Summarize CAP theorem tradeoffs",
  ],
  email_campaign: [
    "Product launch announcement for developers",
    "Monthly newsletter for SaaS users",
    "Re-engagement email for inactive users",
  ],
  pdf_report: [
    "Q1 2026 performance metrics summary",
    "Infrastructure cost analysis report",
    "Weekly sprint retrospective document",
  ],
  webhook_processing: [
    "Process Stripe payment webhook",
    "Handle GitHub push event payload",
    "Parse Slack interaction callback",
  ],
  data_aggregation: [
    "Aggregate daily active user metrics",
    "Compile error rates across services",
    "Summarize API latency percentiles",
  ],
};

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

const BATCH_FILTERS = [
  { value: "all", label: "All" },
  { value: "running", label: "Running" },
  { value: "completed", label: "Completed" },
] as const;

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  running: "default",
  completed: "outline",
  failed: "destructive",
};

interface Props {
  initialBatches: Tables<"batch_runs">[];
}

export function BatchesPageClient({ initialBatches }: Props) {
  const router = useRouter();
  const createBatch = useCreateBatch();
  const { data: batches = [] } = useBatches(initialBatches);
  const [batchFilter, setBatchFilter] = useState("all");

  const filteredBatches = useMemo(
    () =>
      batchFilter === "all"
        ? batches
        : batches.filter((b) => b.status === batchFilter),
    [batches, batchFilter]
  );

  const handleRunBatch = useCallback(() => {
    track("batch_run_clicked", {});
    const tasks = Array.from({ length: 20 }, () => {
      const type = randomItem([...TASK_TYPES]);
      const prompts = SAMPLE_PROMPTS[type];
      return { type, input: { prompt: randomItem(prompts) } };
    });
    createBatch.mutate(tasks, {
      onSuccess: (data) => {
        router.push(`/dashboard/batches/${data.batch.id}`);
      },
    });
  }, [createBatch, router]);

  const showEmpty = filteredBatches.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Batches</h1>
        <Button
          onClick={handleRunBatch}
          disabled={createBatch.isPending}
        >
          <Lightning data-icon="inline-start" />
          {createBatch.isPending ? "Running..." : "Run Batch"}
        </Button>
      </div>

      <LazyMotion features={domAnimation}>
      <AnimatePresence>
        {createBatch.error && (
          <m.p
            className="text-xs text-destructive"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            {createBatch.error.message}
          </m.p>
        )}
      </AnimatePresence>
      </LazyMotion>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[200px]">Batch ID</TableHead>
            <TableHead className="w-[100px]">
              <DropdownMenu>
                <DropdownMenuTrigger aria-label="Filter by status" className="flex items-center gap-1 cursor-pointer select-none hover:text-foreground transition-colors -mx-1 px-1 rounded">
                  Status
                  {batchFilter !== "all" && (
                    <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                      {BATCH_FILTERS.find((f) => f.value === batchFilter)?.label ?? "All"}
                    </Badge>
                  )}
                  <CaretUpDown className="size-3 text-muted-foreground" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuRadioGroup
                    value={batchFilter}
                    onValueChange={(v) => {
                      setBatchFilter(v);
                      track("batch_filter_changed", { filter: v });
                    }}
                  >
                    {BATCH_FILTERS.map((f) => (
                      <DropdownMenuRadioItem key={f.value} value={f.value}>
                        {f.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableHead>
            <TableHead className="w-[100px]">Tasks</TableHead>
            <TableHead className="w-[120px]">Completed</TableHead>
            <TableHead className="w-[80px] text-right">Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {showEmpty ? (
            <TableRow>
              <TableCell colSpan={5} className="h-32 text-center">
                <p className="text-xs text-muted-foreground">
                  {batchFilter === "all"
                    ? 'No batches yet. Click "Run Batch" to create one.'
                    : `No ${batchFilter} batches.`}
                </p>
              </TableCell>
            </TableRow>
          ) : (
            filteredBatches.map((batch) => (
              <TableRow
                key={batch.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => router.push(`/dashboard/batches/${batch.id}`)}
              >
                <TableCell>
                  <span className="font-mono text-xs">
                    {batch.id.slice(0, 8)}...
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE[batch.status] ?? "outline"}>
                    {batch.status}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono">{batch.total_tasks}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-1 w-16 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-foreground/60 transition-all duration-700"
                        style={{
                          width: `${batch.total_tasks ? (batch.completed_count / batch.total_tasks) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">
                      {batch.completed_count}/{batch.total_tasks}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right text-muted-foreground" suppressHydrationWarning>
                  {timeAgo(batch.created_at)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
