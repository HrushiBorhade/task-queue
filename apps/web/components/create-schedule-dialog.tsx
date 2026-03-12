"use client";

import { useState, useMemo } from "react";
import cronstrue from "cronstrue";
import { Cron } from "croner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TaskType } from "@repo/shared";
import { useCreateSchedule } from "@/hooks/use-schedules";

const CRON_PRESETS = [
  { label: "Every minute", value: "* * * * *" },
  { label: "Every 5 minutes", value: "*/5 * * * *" },
  { label: "Every 15 minutes", value: "*/15 * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Daily at 9 AM", value: "0 9 * * *" },
  { label: "Daily at midnight", value: "0 0 * * *" },
  { label: "Weekly (Mon 9 AM)", value: "0 9 * * 1" },
] as const;

function describeCron(expr: string): string | null {
  try {
    return cronstrue.toString(expr, { use24HourTimeFormat: false });
  } catch {
    return null;
  }
}

function getNextRuns(expr: string, count = 3): Date[] {
  try {
    return new Cron(expr).nextRuns(count);
  } catch {
    return [];
  }
}

function formatShortDate(date: Date): string {
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type ScheduleMode = "recurring" | "one-time";

interface CreateScheduleDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Format a Date to datetime-local input value (YYYY-MM-DDTHH:mm)
 * in the user's local timezone.
 */
function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Round up to the next 30-minute mark for a sensible default */
function defaultRunAt(): string {
  const d = new Date();
  const mins = d.getMinutes();
  d.setMinutes(mins < 30 ? 30 : 60, 0, 0);
  return toDatetimeLocal(d);
}

export function CreateScheduleDialog({
  open,
  onClose,
}: CreateScheduleDialogProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<TaskType>("text_gen");
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<ScheduleMode>("recurring");
  const [cronPreset, setCronPreset] = useState<string>(CRON_PRESETS[0].value);
  const [customCron, setCustomCron] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [runAtLocal, setRunAtLocal] = useState(defaultRunAt);
  const createSchedule = useCreateSchedule();

  const cronExpression = useCustom ? customCron : cronPreset;
  const isOneTime = mode === "one-time";

  const cronDescription = useMemo(
    () => (cronExpression ? describeCron(cronExpression) : null),
    [cronExpression],
  );
  const nextRuns = useMemo(
    () => (cronExpression && cronDescription ? getNextRuns(cronExpression) : []),
    [cronExpression, cronDescription],
  );
  const cronValid = !useCustom || !!cronDescription;

  const canSubmit = name.trim() && prompt.trim() && (
    isOneTime ? !!runAtLocal : (!!cronExpression.trim() && cronValid)
  );

  function resetForm() {
    setName("");
    setPrompt("");
    setMode("recurring");
    setCronPreset(CRON_PRESETS[0].value);
    setCustomCron("");
    setUseCustom(false);
    setRunAtLocal(defaultRunAt());
  }

  function handleSubmit() {
    if (!canSubmit) return;

    createSchedule.mutate(
      {
        name: name.trim(),
        type,
        input: { prompt: prompt.trim() },
        cron_expression: isOneTime ? "one-time" : cronExpression.trim(),
        timezone: "UTC",
        ...(isOneTime ? { run_at: new Date(runAtLocal).toISOString() } : {}),
      },
      {
        onSuccess: () => {
          resetForm();
          onClose();
        },
      },
    );
  }

  const loading = createSchedule.isPending;

  // Minimum datetime: now (can't schedule in the past)
  const minDatetime = toDatetimeLocal(new Date());

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Schedule</DialogTitle>
        </DialogHeader>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="schedule-name">Schedule Name</FieldLabel>
            <Input
              id="schedule-name"
              placeholder="e.g. Daily research summary"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>

          <Field>
            <FieldLabel>Task Type</FieldLabel>
            <Select
              value={type}
              onValueChange={(v) => setType(v as TaskType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text_gen">Text Generation</SelectItem>
                <SelectItem value="image_gen">Image Generation</SelectItem>
                <SelectItem value="research_agent">Research Agent</SelectItem>
                <SelectItem value="email_campaign">Email Campaign</SelectItem>
                <SelectItem value="pdf_report">PDF Report</SelectItem>
                <SelectItem value="webhook_processing">Webhook Processing</SelectItem>
                <SelectItem value="data_aggregation">Data Aggregation</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="schedule-prompt">Prompt</FieldLabel>
            <Textarea
              id="schedule-prompt"
              placeholder="Enter your prompt..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
            />
          </Field>

          <Field>
            <FieldLabel>Schedule Type</FieldLabel>
            <Select value={mode} onValueChange={(v) => setMode(v as ScheduleMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recurring">Recurring (Cron)</SelectItem>
                <SelectItem value="one-time">One-time</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {isOneTime ? (
            <Field>
              <FieldLabel htmlFor="run-at">Run At</FieldLabel>
              <Input
                id="run-at"
                type="datetime-local"
                value={runAtLocal}
                min={minDatetime}
                onChange={(e) => setRunAtLocal(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {runAtLocal
                  ? `Fires once at ${new Date(runAtLocal).toLocaleString()}`
                  : "Select a date and time"}
              </p>
            </Field>
          ) : (
            <Field data-invalid={useCustom && customCron && !cronValid ? true : undefined}>
              <div className="flex items-center justify-between">
                <FieldLabel>Cron Schedule</FieldLabel>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-200"
                  onClick={() => setUseCustom(!useCustom)}
                >
                  {useCustom ? "Use preset" : "Custom cron"}
                </button>
              </div>
              {useCustom ? (
                <Input
                  className="font-mono"
                  placeholder="*/5 * * * *"
                  value={customCron}
                  onChange={(e) => setCustomCron(e.target.value)}
                  aria-invalid={!!(customCron && !cronValid)}
                />
              ) : (
                <Select value={cronPreset} onValueChange={setCronPreset}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CRON_PRESETS.map((preset) => (
                      <SelectItem key={preset.value} value={preset.value}>
                        {preset.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Human-readable description */}
              {cronExpression && (
                <p className={`text-xs ${cronDescription ? "text-muted-foreground" : "text-destructive"}`}>
                  {cronDescription ?? "Invalid cron expression"}
                </p>
              )}

              {/* Next run previews */}
              {nextRuns.length > 0 && (
                <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2">
                  <p className="text-[10px] font-medium text-muted-foreground mb-1">
                    Next runs
                  </p>
                  <div className="flex flex-col gap-0.5">
                    {nextRuns.map((date, i) => (
                      <span key={i} className="text-xs text-muted-foreground font-mono">
                        {formatShortDate(date)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </Field>
          )}
        </FieldGroup>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !canSubmit}
          >
            {loading ? "Creating..." : "Create Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
