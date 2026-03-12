-- Seed test users for local development / Playwright testing
-- Pattern from supabase-community/supabase-by-example (Astral)

-- Test user: test@test.com / 123456
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'authenticated', 'authenticated',
  'test@test.com',
  crypt('123456', gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}',
  now(), now(), '', '', '', ''
);

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
) VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  jsonb_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'email', 'test@test.com'),
  'email', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  now(), now(), now()
);

-- Admin user: admin@test.com / 123456
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'authenticated', 'authenticated',
  'admin@test.com',
  crypt('123456', gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"],"role":"admin"}', '{}',
  now(), now(), '', '', '', ''
);

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
) VALUES (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  jsonb_build_object('sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'email', 'admin@test.com'),
  'email', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  now(), now(), now()
);

-- Seed sample tasks for test user
INSERT INTO public.tasks (id, user_id, type, status, input, progress, created_at) VALUES
  (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'text_gen', 'completed', '{"prompt":"Write a haiku about distributed systems"}'::jsonb, 100, now() - interval '2 hours'),
  (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'image_gen', 'active', '{"prompt":"A futuristic city skyline at sunset"}'::jsonb, 45, now() - interval '30 minutes'),
  (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'research_agent', 'queued', '{"prompt":"Compare Redis vs Kafka for message queuing"}'::jsonb, 0, now() - interval '5 minutes'),
  (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'email_campaign', 'failed', '{"prompt":"Product launch announcement for developers"}'::jsonb, 20, now() - interval '1 hour'),
  (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'pdf_report', 'completed', '{"prompt":"Q1 2026 performance metrics summary"}'::jsonb, 100, now() - interval '3 hours'),
  (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'webhook_processing', 'active', '{"prompt":"Process Stripe payment webhook"}'::jsonb, 72, now() - interval '15 minutes');
