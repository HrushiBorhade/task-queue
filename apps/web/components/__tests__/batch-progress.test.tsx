import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BatchProgress } from "../batch-progress";
import type { Database } from "@/lib/database.types";

type Batch = Database["public"]["Tables"]["batch_runs"]["Row"];

const BASE_BATCH: Batch = {
  id: "batch-abc-123-def-456",
  user_id: "user-123",
  status: "running",
  total_tasks: 20,
  completed_count: 10,
  created_at: "2026-03-12T10:00:00Z",
  updated_at: "2026-03-12T10:00:00Z",
};

const mockBatch = (overrides: Partial<Batch> = {}): Batch => ({
  ...BASE_BATCH,
  ...overrides,
});

describe("BatchProgress", () => {
  it("renders truncated batch id", () => {
    render(<BatchProgress batch={mockBatch()} />);
    expect(screen.getByText("batch-ab...")).toBeInTheDocument();
  });

  it("renders status badge", () => {
    render(<BatchProgress batch={mockBatch({ status: "completed" })} />);
    expect(screen.getByText("completed")).toBeInTheDocument();
  });

  it("renders completion count", () => {
    render(<BatchProgress batch={mockBatch()} />);
    expect(screen.getByText("10/20 completed")).toBeInTheDocument();
  });

  it("calculates correct percentage", () => {
    render(<BatchProgress batch={mockBatch({ completed_count: 15, total_tasks: 20 })} />);
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("handles zero total tasks", () => {
    render(<BatchProgress batch={mockBatch({ total_tasks: 0, completed_count: 0 })} />);
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("formats partial_failure status with spaces", () => {
    render(<BatchProgress batch={mockBatch({ status: "partial_failure" })} />);
    expect(screen.getByText("partial failure")).toBeInTheDocument();
  });
});
