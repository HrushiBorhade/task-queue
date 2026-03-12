-- One-time schedules: when run_at is set, schedule fires once at that time.
-- cron_expression is ignored for one-time schedules.
ALTER TABLE public.schedules
  ADD COLUMN run_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.schedules.run_at IS
  'For one-time schedules: the exact datetime to fire. NULL = recurring cron.';
