"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { Tables } from "@/lib/database.types";
import type { AuthUser } from "@/lib/auth";
import { signOut } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateTaskDialog } from "@/components/create-task-dialog";
import { TaskGrid } from "@/components/task-grid";
import { BatchProgress } from "@/components/batch-progress";
import { QueueHealth } from "@/components/queue-health";
import { ScheduleList } from "@/components/schedule-list";
import { Lightning, SignOut } from "@phosphor-icons/react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useCreateBatch } from "@/hooks/use-tasks";
import { useBatches } from "@/hooks/use-batches";
import { TASK_TYPES, type TaskType } from "@repo/shared";
import { spring } from "@/lib/animations";
import { identifyUser, track } from "@/lib/analytics";

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

interface DashboardClientProps {
  initialTasks: Tables<"tasks">[];
  initialBatches: Tables<"batch_runs">[];
  user: Pick<AuthUser, "id" | "email" | "role">;
}

export function DashboardClient({
  initialTasks,
  initialBatches,
  user,
}: DashboardClientProps) {
  // Identify user for PostHog person profiles
  useEffect(() => {
    identifyUser(user.id, user.email);
  }, [user.id, user.email]);

  const createBatch = useCreateBatch();
  const { data: batches = [] } = useBatches(initialBatches);
  const [batchFilter, setBatchFilter] = useState("all");

  const filteredBatches = useMemo(
    () => batchFilter === "all"
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

    createBatch.mutate(tasks);
  }, [createBatch]);

  return (
    <div className="min-h-svh p-6">
      <motion.div
        className="mx-auto max-w-5xl flex flex-col gap-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold">Task Queue</h1>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <form action={signOut} onSubmit={() => track("sign_out_clicked", {})}>
              <Button variant="ghost" size="sm">
                <SignOut data-icon="inline-start" />
                Sign out
              </Button>
            </form>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <CreateTaskDialog />
          <Button
            variant="outline"
            onClick={handleRunBatch}
            disabled={createBatch.isPending}
          >
            <Lightning data-icon="inline-start" />
            {createBatch.isPending ? "Running..." : "Run Batch"}
          </Button>
        </div>

        <AnimatePresence>
          {createBatch.error && (
            <motion.p
              className="text-xs text-destructive"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              {createBatch.error.message}
            </motion.p>
          )}
        </AnimatePresence>

        <Tabs defaultValue="tasks" onValueChange={(tab) => track("main_tab_changed", { tab })}>
          <TabsList>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="batches">Batches</TabsTrigger>
            <TabsTrigger value="schedules">Schedules</TabsTrigger>
            {user.role === "admin" && (
              <TabsTrigger value="health">Queue Health</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="tasks">
            <TaskGrid initialTasks={initialTasks} />
          </TabsContent>

          <TabsContent value="batches">
            <div className="flex flex-col gap-3">
              <Tabs value={batchFilter} onValueChange={(v) => {
                  setBatchFilter(v);
                  track("batch_filter_changed", { filter: v });
                }}>
                <TabsList>
                  {BATCH_FILTERS.map((f) => (
                    <TabsTrigger key={f.value} value={f.value} className="text-xs">
                      {f.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              {filteredBatches.length === 0 && (
                <motion.div
                  className="flex items-center justify-center rounded-lg border border-dashed p-8"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  <p className="text-xs text-muted-foreground">
                    {batchFilter === "all"
                      ? 'No batches yet. Click "Run Batch" to create one.'
                      : `No ${batchFilter} batches.`}
                  </p>
                </motion.div>
              )}

              {filteredBatches.length > 0 && (
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {filteredBatches.map((batch, i) => (
                    <motion.div
                      key={batch.id}
                      layout
                      initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      transition={{
                        ...spring,
                        delay: Math.min(i * 0.04, 0.3),
                      }}
                    >
                      <BatchProgress batch={batch} />
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="schedules">
            <ScheduleList />
          </TabsContent>

          {user.role === "admin" && (
            <TabsContent value="health">
              <QueueHealth />
            </TabsContent>
          )}
        </Tabs>
      </motion.div>
    </div>
  );
}
