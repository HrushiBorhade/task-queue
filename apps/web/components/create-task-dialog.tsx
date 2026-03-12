"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { TASK_TYPES, type TaskType } from "@repo/shared";
import { Plus } from "@phosphor-icons/react";
import { useCreateTask } from "@/hooks/use-tasks";
import { track } from "@/lib/analytics";
import { formatLabel } from "@/lib/task-utils";

export function CreateTaskDialog() {
  const [open, setOpen] = useState(false);

  function handleOpenChange(o: boolean) {
    setOpen(o);
    if (o) track("task_dialog_opened", {});
  }
  const [type, setType] = useState<string>("text_gen");
  const [prompt, setPrompt] = useState("");
  const createTask = useCreateTask();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;

    createTask.mutate(
      { type: type as TaskType, input: { prompt } },
      {
        onSuccess: () => {
          setPrompt("");
          setOpen(false);
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus data-icon="inline-start" />
          Create Task
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
          <DialogDescription>
            Configure and submit a new task to the queue.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="task-type">Task Type</FieldLabel>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="task-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {formatLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="task-prompt">Prompt</FieldLabel>
              <Textarea
                id="task-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Enter your task prompt..."
                required
              />
            </Field>
          </FieldGroup>
          {createTask.error && (
            <p className="text-xs text-destructive">{createTask.error.message}</p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={createTask.isPending}>
              {createTask.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
