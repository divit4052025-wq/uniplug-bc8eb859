-- Phase D0: shared AI infrastructure tables.
--
-- Three tables back the V1 AI features (D1 prep questions, D2 note
-- expansion, D3 mentor matching):
--
-- 1. ai_rate_limit_events — per-(user, feature) usage counter. Each
--    successful Anthropic call inserts one row; the rate limiter SELECT
--    counts rows in the last 24h for the (user_id, feature) pair.
--    No client INSERT path — only the server fns (running with the
--    service-role client) write here.
--
-- 2. session_prep_questions — cached AI-generated prep questions per
--    booking. One row per booking_id (UNIQUE). The student dashboard
--    "View prep" CTA calls the prep-questions server-fn lazily; on hit
--    it returns the cached row; on miss it generates + persists +
--    returns.
--
-- 3. mentor_match_suggestions — cached daily mentor-match per student.
--    One row per (student_id, generated_on date). The student dashboard
--    "Suggested for you" card reads the latest row for today; if missing,
--    the server-fn generates + persists.
--
-- The session-prep / match caches both serve two purposes: bandwidth
-- (no Anthropic call on each render) AND structural rate-limit (the
-- session-prep regenerate button + the daily match-refresh are
-- naturally capped by the cache shape).
--
-- RLS: SELECT-own-rows policies for callers; no client INSERT/UPDATE
-- policies. Server fns write via service-role.
--
-- Idempotent (CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS +
-- CREATE POLICY).
--
-- Verification: supabase/dev-seeds/d0-ai-infrastructure-verification.sql

-- ─── ai_rate_limit_events ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_rate_limit_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature    text NOT NULL CHECK (feature IN ('matching','prep_questions','note_expansion')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_rate_limit_events_user_feature_created_idx
  ON public.ai_rate_limit_events (user_id, feature, created_at DESC);

ALTER TABLE public.ai_rate_limit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ai rate limit events" ON public.ai_rate_limit_events;
CREATE POLICY "Users can view own ai rate limit events"
  ON public.ai_rate_limit_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.ai_rate_limit_events IS
  'Phase D0 (2026-05-23): per-(user, feature) AI call ledger. Server fns insert one row per successful Anthropic call; rate-limit.server.ts counts rows in the last 24h to gate further calls. No client INSERT policy by design.';

-- ─── session_prep_questions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.session_prep_questions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   uuid NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  questions    jsonb NOT NULL,
  source       text NOT NULL DEFAULT 'ai' CHECK (source IN ('ai','manual')),
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS session_prep_questions_booking_idx
  ON public.session_prep_questions (booking_id);

ALTER TABLE public.session_prep_questions ENABLE ROW LEVEL SECURITY;

-- Student sees prep questions for bookings they own.
DROP POLICY IF EXISTS "Students view prep questions for own bookings" ON public.session_prep_questions;
CREATE POLICY "Students view prep questions for own bookings"
  ON public.session_prep_questions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = session_prep_questions.booking_id
        AND b.student_id = auth.uid()
    )
  );

COMMENT ON TABLE public.session_prep_questions IS
  'Phase D0 (2026-05-23): cached AI-generated prep questions per booking. One row per booking_id. The student dashboard reads lazily; the prep-questions server-fn writes via service-role. SELECT policy gates on the underlying booking ownership.';

-- ─── mentor_match_suggestions ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mentor_match_suggestions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  generated_on date NOT NULL DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date),
  suggestions  jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, generated_on)
);

CREATE INDEX IF NOT EXISTS mentor_match_suggestions_student_date_idx
  ON public.mentor_match_suggestions (student_id, generated_on DESC);

ALTER TABLE public.mentor_match_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students view own match suggestions" ON public.mentor_match_suggestions;
CREATE POLICY "Students view own match suggestions"
  ON public.mentor_match_suggestions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = student_id);

COMMENT ON TABLE public.mentor_match_suggestions IS
  'Phase D0 (2026-05-23): cached daily mentor-match per student. UNIQUE (student_id, generated_on) so the match server-fn caches one set per IST calendar day. SELECT policy gates on student_id = auth.uid().';
