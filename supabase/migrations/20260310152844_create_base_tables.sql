-- Task type enum
CREATE TYPE task_type AS ENUM (
  'text_gen',
  'image_gen',
  'research_agent',
  'email_campaign',
  'pdf_report',
  'webhook_processing',
  'data_aggregation'
);

-- Task status enum
CREATE TYPE task_status AS ENUM ('queued', 'active', 'completed', 'failed');

-- Batch status enum
CREATE TYPE batch_status AS ENUM ('running', 'completed', 'partial_failure');

-- Batch runs table (groups of tasks for stress testing / bulk ops)
CREATE TABLE batch_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  total_tasks INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  status batch_status NOT NULL DEFAULT 'running',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Schedules table (cron-based recurring tasks)
CREATE TABLE schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type task_type NOT NULL,
  input JSONB NOT NULL DEFAULT '{}',
  cron_expression TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  enabled BOOLEAN NOT NULL DEFAULT true,
  run_count INTEGER NOT NULL DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tasks table (every job in the system)
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES batch_runs(id) ON DELETE SET NULL,
  schedule_id UUID REFERENCES schedules(id) ON DELETE SET NULL,
  type task_type NOT NULL,
  status task_status NOT NULL DEFAULT 'queued',
  progress INTEGER NOT NULL DEFAULT 0,
  attempt INTEGER NOT NULL DEFAULT 0,
  input JSONB NOT NULL DEFAULT '{}',
  output JSONB,
  error TEXT,
  bullmq_job_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Task events table (granular progress tracking)
CREATE TABLE task_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT,
  data JSONB,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_type ON tasks(type);
CREATE INDEX idx_tasks_batch_id ON tasks(batch_id);
CREATE INDEX idx_tasks_schedule_id ON tasks(schedule_id);
CREATE INDEX idx_tasks_created_at ON tasks(created_at DESC);
CREATE INDEX idx_task_events_task_id ON task_events(task_id);

-- Helper function: atomic batch counter increment (race-safe)
CREATE OR REPLACE FUNCTION increment_batch_completed(p_batch_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Step 1: Increment count
  UPDATE batch_runs
  SET completed_count = completed_count + 1,
      updated_at = now()
  WHERE id = p_batch_id;

  -- Step 2: Atomically check and mark completed (WHERE prevents race)
  UPDATE batch_runs
  SET status = 'completed', updated_at = now()
  WHERE id = p_batch_id
    AND completed_count >= total_tasks
    AND status != 'completed';
END;
$$;

-- Auto-update updated_at on every UPDATE (no need to set manually)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER batch_runs_updated_at BEFORE UPDATE ON batch_runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER schedules_updated_at BEFORE UPDATE ON schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Enable Realtime on tasks table (for live UI updates)
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
