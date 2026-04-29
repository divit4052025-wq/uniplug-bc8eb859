-- ════════════════════════════════════════════════════════════════════════════
-- Bug 4 dev-seed: MentorCalendar three-state visual verification
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS FILE IS
--   Pure development documentation. It is NOT a migration — it lives outside
--   supabase/migrations/ and must NEVER be added to the migration sequence.
--   Adding it as a migration would re-seed every environment that runs
--   `supabase db push`, which is not what we want.
--
-- WHY IT EXISTS
--   It documents the exact INSERTs needed to create one approved mentor +
--   three availability rows + one confirmed booking, so an engineer can
--   visually verify the public MentorCalendar component renders all three
--   states in a single screen:
--     * Available today  (Wed at 14:00)
--     * Booked tomorrow  (Thu at 14:00 — the row in public.bookings)
--     * Available day-after (Fri at 14:00)
--   This was used once during Prompt 2C to verify Bug 4. Future engineers
--   can re-run the SEED block manually via Supabase MCP execute_sql in a
--   development environment if they need to re-verify the calendar visually.
--   They should always run the CLEANUP block at the bottom of this file
--   afterwards to leave the database in its pre-seed state.
--
-- IMPORTANT QUIRKS THIS FILE GETS RIGHT
--   1. auth.identities row is required for password-grant sign-in. Inserting
--      only into auth.users gets you "Database error querying schema" at
--      login time.
--   2. auth.users token columns confirmation_token / recovery_token /
--      email_change / email_change_token_new must be `''` (empty string),
--      not NULL — GoTrue's text comparisons trip on NULL.
--   3. auth.identities.email is GENERATED ALWAYS AS lower(identity_data->>'email')
--      and must NOT appear in the INSERT column list — Postgres will reject
--      it with "cannot insert into column 'email'".
--
-- THROWAWAY SIGN-IN CREDENTIALS
--   mentor:  seed-mentor@uniplug-dev.local  / seed-mentor-dev-2026
--   student: seed-student@uniplug-dev.local / seed-student-dev-2026
--
-- ════════════════════════════════════════════════════════════════════════════
-- SEED BLOCK — run this to seed
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── (a) Seed mentor in auth.users ─────────────────────────────────────────
-- Empty-string defaults on confirmation_token / recovery_token / email_change /
-- email_change_token_new are required so GoTrue's password-grant query
-- doesn't read NULL into a text column.
INSERT INTO auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new,
  created_at,
  updated_at,
  instance_id
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  'authenticated',
  'authenticated',
  'seed-mentor@uniplug-dev.local',
  crypt('seed-mentor-dev-2026', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Seed Mentor (Dev)"}'::jsonb,
  '',
  '',
  '',
  '',
  now(),
  now(),
  '00000000-0000-0000-0000-000000000000'
);

-- ── (a.1) Matching auth.identities row for the mentor ─────────────────────
-- Required for email/password sign-in. NOTE: do NOT include the `email`
-- column — it is GENERATED ALWAYS from identity_data->>'email'.
INSERT INTO auth.identities (
  id, user_id, provider, provider_id, identity_data,
  last_sign_in_at, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  '11111111-1111-1111-1111-111111111111',
  'email',
  'seed-mentor@uniplug-dev.local',
  jsonb_build_object(
    'sub',   '11111111-1111-1111-1111-111111111111',
    'email', 'seed-mentor@uniplug-dev.local'
  ),
  now(), now(), now()
);

-- ── (b) Seed mentor in public.mentors (id = auth.users id; FK enforced) ──
INSERT INTO public.mentors (
  id, full_name, email, university, course, year, status, price_inr
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Seed Mentor (Dev)',
  'seed-mentor@uniplug-dev.local',
  'University of Cambridge',
  'Engineering',
  '2nd year',
  'approved',
  500
);

-- ── (c) Three weekly-recurring availability rows: today, today+1, today+2 at 14:00.
-- mentor_availability has no is_available column - row presence == available.
INSERT INTO public.mentor_availability (mentor_id, day_of_week, start_hour) VALUES
  ('11111111-1111-1111-1111-111111111111', EXTRACT(ISODOW FROM CURRENT_DATE)::smallint,            14),
  ('11111111-1111-1111-1111-111111111111', EXTRACT(ISODOW FROM CURRENT_DATE + 1)::smallint,        14),
  ('11111111-1111-1111-1111-111111111111', EXTRACT(ISODOW FROM CURRENT_DATE + 2)::smallint,        14);

-- ── (d) Seed student in auth.users ────────────────────────────────────────
INSERT INTO auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new,
  created_at,
  updated_at,
  instance_id
) VALUES (
  '33333333-3333-3333-3333-333333333333',
  'authenticated',
  'authenticated',
  'seed-student@uniplug-dev.local',
  crypt('seed-student-dev-2026', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Seed Student (Dev)"}'::jsonb,
  '',
  '',
  '',
  '',
  now(),
  now(),
  '00000000-0000-0000-0000-000000000000'
);

-- ── (d.1) Matching auth.identities row for the student ───────────────────
INSERT INTO auth.identities (
  id, user_id, provider, provider_id, identity_data,
  last_sign_in_at, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  '33333333-3333-3333-3333-333333333333',
  'email',
  'seed-student@uniplug-dev.local',
  jsonb_build_object(
    'sub',   '33333333-3333-3333-3333-333333333333',
    'email', 'seed-student@uniplug-dev.local'
  ),
  now(), now(), now()
);

-- ── (e) Seed student in public.students (id = auth.users id; FK enforced) ──
INSERT INTO public.students (
  id, full_name, email, phone, school, grade
) VALUES (
  '33333333-3333-3333-3333-333333333333',
  'Seed Student (Dev)',
  'seed-student@uniplug-dev.local',
  '+91-0000000000',
  'Seed International School',
  'Grade 12'
);

-- ── (f) One confirmed booking for tomorrow at 14:00 (so the calendar renders
-- one Booked chip and two Available chips in a single screen).
INSERT INTO public.bookings (
  mentor_id, student_id, date, time_slot, duration, price, status
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  '33333333-3333-3333-3333-333333333333',
  CURRENT_DATE + 1,
  '14:00',
  60,
  500,
  'confirmed'
);

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- CLEANUP BLOCK — run this to remove everything seeded above
-- ════════════════════════════════════════════════════════════════════════════
-- Order matters because of foreign-key constraints:
--   1. bookings (FKs to mentors and students)
--   2. mentor_availability (FK to mentors with ON DELETE CASCADE — but we
--      delete explicitly to keep the cleanup symmetric with the seed)
--   3. public.mentors and public.students rows
--   4. auth.identities rows (FK to auth.users)
--   5. auth.users rows last
-- After running, all seven verification counts (auth.users, auth.identities,
-- public.mentors, public.students, public.mentor_availability, bookings by
-- mentor, bookings by student) for the seed UUIDs must be zero.
--
-- BEGIN;
--
-- DELETE FROM public.bookings
-- WHERE mentor_id  = '11111111-1111-1111-1111-111111111111'
--   AND student_id = '33333333-3333-3333-3333-333333333333';
--
-- DELETE FROM public.mentor_availability
-- WHERE mentor_id = '11111111-1111-1111-1111-111111111111';
--
-- DELETE FROM public.mentors
-- WHERE id = '11111111-1111-1111-1111-111111111111';
--
-- DELETE FROM public.students
-- WHERE id = '33333333-3333-3333-3333-333333333333';
--
-- DELETE FROM auth.identities
-- WHERE user_id IN ('11111111-1111-1111-1111-111111111111'::uuid,
--                   '33333333-3333-3333-3333-333333333333'::uuid);
--
-- DELETE FROM auth.users
-- WHERE id IN ('11111111-1111-1111-1111-111111111111'::uuid,
--              '33333333-3333-3333-3333-333333333333'::uuid);
--
-- COMMIT;
