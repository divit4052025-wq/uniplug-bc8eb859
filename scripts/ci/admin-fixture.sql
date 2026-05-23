-- CI fixture: insert the canonical admin user into auth.users so dev-seeds
-- whose admin-bypass tests rely on is_admin() resolving the production-
-- pinned email can run end-to-end against a freshly-started local Supabase.
--
-- The email value is the same one already committed in
-- supabase/migrations/20260425132312_…sql:13 (is_admin() body) and in
-- src/lib/auth/{role,route-guard}.ts. No additional PII exposure.
--
-- Idempotent via ON CONFLICT DO NOTHING (auth.users has a partial unique
-- index on email). Safe to re-run.

INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  created_at, updated_at, instance_id
) VALUES (
  'db74f8e5-5511-4aec-a9a4-79ae2b535b9f'::uuid,
  'authenticated', 'authenticated',
  'divitfatehpuria7@gmail.com',
  crypt('ci-fixture-password', gen_salt('bf')),
  now(),
  '{"provider":"email"}'::jsonb,
  jsonb_build_object('role','student','full_name','Admin User','phone','+91-0','school','T','grade','Grade 11'),
  '', '', '', '',
  now(), now(),
  '00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (id) DO NOTHING;
