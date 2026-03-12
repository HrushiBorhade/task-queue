import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TaskCard } from "../task-card";
import type { Database } from "@/lib/database.types";

type Task = Database["public"]["Tables"]["tasks"]["Row"];

const BASE_TASK: Task = {
  id: "test-id-123",
  user_id: "user-123",
  type: "text_gen",
  status: "queued",
  input: { prompt: "Write a haiku about distributed systems" },
  output: null,
  progress: 0,
  error: null,
  batch_id: null,
  bullmq_job_id: null,
  schedule_id: null,
  attempt: 0,
  created_at: "2026-03-12T10:00:00Z",
  started_at: null,
  completed_at: null,
  updated_at: "2026-03-12T10:00:00Z",
};

const mockTask = (overrides: Partial<Task> = {}): Task => ({
  ...BASE_TASK,
  ...overrides,
});

describe("TaskCard", () => {
  it("renders task type", () => {
    render(<TaskCard task={mockTask()} />);
    expect(screen.getByText("text gen")).toBeInTheDocument();
  });

  it("renders task status badge for queued", () => {
    render(<TaskCard task={mockTask({ status: "queued" })} />);
    expect(screen.getByText("queued")).toBeInTheDocument();
  });

  it("renders progress percentage for active status", () => {
    render(<TaskCard task={mockTask({ status: "active", progress: 45 })} />);
    expect(screen.getByText("45%")).toBeInTheDocument();
  });

  it("renders prompt text", () => {
    render(<TaskCard task={mockTask()} />);
    expect(screen.getByText("Write a haiku about distributed systems")).toBeInTheDocument();
  });

  it("renders progress bar for active tasks", () => {
    const { container } = render(<TaskCard task={mockTask({ status: "active", progress: 60 })} />);
    const progressBar = container.querySelector("[style*='width: 60%']");
    expect(progressBar).toBeInTheDocument();
  });

  it("handles missing prompt gracefully", () => {
    render(<TaskCard task={mockTask({ input: {} })} />);
    expect(screen.getByText("text gen")).toBeInTheDocument();
  });

  it("renders non-active status variants as text", () => {
    const statuses = ["queued", "completed", "failed"] as const;
    for (const status of statuses) {
      const { unmount } = render(<TaskCard task={mockTask({ status })} />);
      expect(screen.getByText(status)).toBeInTheDocument();
      unmount();
    }
  });

  it("formats task type with underscores as spaces", () => {
    render(<TaskCard task={mockTask({ type: "webhook_processing" })} />);
    expect(screen.getByText("webhook processing")).toBeInTheDocument();
  });
});
