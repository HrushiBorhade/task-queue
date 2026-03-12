
  -- ============================================================
  -- 1. Add user_id to all tables
  -- ============================================================
  ALTER TABLE tasks ADD COLUMN user_id UUID REFERENCES auth.users(id);
  ALTER TABLE batch_runs ADD COLUMN user_id UUID REFERENCES auth.users(id);
  ALTER TABLE schedules ADD COLUMN user_id UUID REFERENCES auth.users(id);
  ALTER TABLE task_events ADD COLUMN user_id UUID REFERENCES auth.users(id);

  CREATE INDEX idx_tasks_user_id ON tasks(user_id);
  CREATE INDEX idx_batch_runs_user_id ON batch_runs(user_id);
  CREATE INDEX idx_schedules_user_id ON schedules(user_id);

  -- ============================================================
  -- 2. User roles table
  -- ============================================================
  CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);

  -- Auto-create role on signup
  CREATE OR REPLACE FUNCTION handle_new_user()
  RETURNS TRIGGER AS $$
  BEGIN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;

  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

  -- updated_at trigger (reuses existing function)
  CREATE TRIGGER user_roles_updated_at BEFORE UPDATE ON user_roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

  -- ============================================================
  -- 3. Custom Access Token Hook — injects user_role into JWT
  -- ============================================================
  CREATE OR REPLACE FUNCTION custom_access_token_hook(event JSONB)
  RETURNS JSONB
  LANGUAGE plpgsql
  STABLE
  AS $$
  DECLARE
    user_role_value TEXT;
    claims JSONB;
  BEGIN
    SELECT role INTO user_role_value
    FROM public.user_roles
    WHERE user_id = (event->>'user_id')::UUID;

    claims := event->'claims';
    claims := jsonb_set(claims, '{user_role}', to_jsonb(COALESCE(user_role_value, 'user')));
    event := jsonb_set(event, '{claims}', claims);

    RETURN event;
  END;
  $$;

  GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
  GRANT SELECT ON public.user_roles TO supabase_auth_admin;
  GRANT EXECUTE ON FUNCTION custom_access_token_hook TO supabase_auth_admin;

  -- ============================================================
  -- 4. Enable RLS on all tables
  -- ============================================================
  ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
  ALTER TABLE batch_runs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
  ALTER TABLE task_events ENABLE ROW LEVEL SECURITY;
  ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

  -- ============================================================
  -- 5. Helper: is current user admin?
  -- ============================================================
  CREATE OR REPLACE FUNCTION is_admin()
  RETURNS BOOLEAN AS $$
  BEGIN
    RETURN COALESCE(
      (auth.jwt()->>'user_role') = 'admin',
      false
    );
  END;
  $$ LANGUAGE plpgsql STABLE;

  -- ============================================================
  -- 6. RLS Policies
  -- ============================================================

  -- tasks
  CREATE POLICY "Users see own tasks" ON tasks
    FOR SELECT USING (auth.uid() = user_id OR is_admin());
  CREATE POLICY "Users insert own tasks" ON tasks
    FOR INSERT WITH CHECK (auth.uid() = user_id);
  CREATE POLICY "Users update own tasks" ON tasks
    FOR UPDATE USING (auth.uid() = user_id OR is_admin());
  CREATE POLICY "Admins delete tasks" ON tasks
    FOR DELETE USING (is_admin());

  -- batch_runs
  CREATE POLICY "Users see own batches" ON batch_runs
    FOR SELECT USING (auth.uid() = user_id OR is_admin());
  CREATE POLICY "Users insert own batches" ON batch_runs
    FOR INSERT WITH CHECK (auth.uid() = user_id);
  CREATE POLICY "Users update own batches" ON batch_runs
    FOR UPDATE USING (auth.uid() = user_id OR is_admin());

  -- schedules
  CREATE POLICY "Users see own schedules" ON schedules
    FOR SELECT USING (auth.uid() = user_id OR is_admin());
  CREATE POLICY "Users insert own schedules" ON schedules
    FOR INSERT WITH CHECK (auth.uid() = user_id);
  CREATE POLICY "Users update own schedules" ON schedules
    FOR UPDATE USING (auth.uid() = user_id OR is_admin());
  CREATE POLICY "Users delete own schedules" ON schedules
    FOR DELETE USING (auth.uid() = user_id OR is_admin());

  -- task_events
  CREATE POLICY "Users see own task events" ON task_events
    FOR SELECT USING (auth.uid() = user_id OR is_admin());
  CREATE POLICY "Users insert own task events" ON task_events
    FOR INSERT WITH CHECK (auth.uid() = user_id);

  -- user_roles
  CREATE POLICY "Users see own role" ON user_roles
    FOR SELECT USING (auth.uid() = user_id OR is_admin());
  CREATE POLICY "Admins manage roles" ON user_roles
    FOR ALL USING (is_admin());