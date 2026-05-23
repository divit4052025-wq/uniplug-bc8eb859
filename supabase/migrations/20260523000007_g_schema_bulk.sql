-- Phase G non-G4 schema: G1 + G2 + G3 + G5 + G6.
--
-- G1: free first session gate. students.first_session_used boolean.
--     book_session RPC extended to flip it true on first successful
--     booking. Until payments land (Stage 5), subsequent bookings are
--     gated on this flag via a server-side check (or UI message).
--
-- G2 (amended): referral schema ONLY — referral_codes + referral_credits
--     tables with RLS SELECT-own; no client INSERT policies (redemption
--     hooks land with Stage 5 payments via service-role writes). No
--     /r/{code} route, no signup-time code application.
--
-- G3 (amended): mentor training — mentor_training_completions table.
--     2 sections only (safeguarding, code-of-conduct) per amendment;
--     the 8 others are post-launch content work. Admin approval flow
--     in F2 (deferred to H) will gate on a SECURITY DEFINER helper
--     mentor_training_complete(mentor_id, section).
--
-- G5: code-of-conduct acceptance column on both students and mentors
--     (the GDPR export + account deletion endpoints are TypeScript
--     server-fns under src/lib/me/ — separate from this migration).
--
-- G6 (amended): disputes table + admin queue. Schema-only, no student-
--     facing form; admin-side UI is a stub in admin.tsx (deferred to H).
--
-- Idempotent (CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
-- CREATE OR REPLACE FUNCTION).
--
-- Verification: supabase/dev-seeds/g-schema-bulk-verification.sql

-- ════════════════════════════════════════════════════════════════════════════
-- G1: students.first_session_used + book_session RPC extension
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS first_session_used boolean NOT NULL DEFAULT false;

-- Extend the A1 book_session RPC to flip first_session_used in the same
-- transaction as the booking insert. Bookings beyond the first are
-- still allowed (the V1 paywall lands with Razorpay in Stage 5); for
-- now the flag is a free-vs-paid marker that downstream UI can read.
CREATE OR REPLACE FUNCTION public.book_session(
  _mentor_id uuid,
  _date      date,
  _time_slot text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller     uuid    := auth.uid();
  v_price_inr  integer;
  v_hour       smallint;
  v_iso_dow    smallint;
  v_ist_today  date    := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date;
  v_ist_hh     text    := to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata', 'HH24:00');
  v_booking_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF _mentor_id = v_caller THEN
    RAISE EXCEPTION 'mentors cannot book themselves';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.students WHERE id = v_caller) THEN
    RAISE EXCEPTION 'only students may book sessions';
  END IF;
  IF _time_slot !~ '^([01][0-9]|2[0-3]):00$' THEN
    RAISE EXCEPTION 'time_slot must be HH:00 (e.g. 14:00), got %', _time_slot;
  END IF;

  v_hour    := substring(_time_slot, 1, 2)::smallint;
  v_iso_dow := EXTRACT(ISODOW FROM _date)::smallint;

  SELECT m.price_inr
    INTO v_price_inr
    FROM public.mentors m
   WHERE m.id     = _mentor_id
     AND m.status = 'approved'::public.mentor_status;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'mentor not available for booking';
  END IF;

  IF _date < v_ist_today
     OR (_date = v_ist_today AND _time_slot <= v_ist_hh) THEN
    RAISE EXCEPTION 'cannot book a past time slot';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.mentor_availability ma
    WHERE ma.mentor_id   = _mentor_id
      AND ma.day_of_week = v_iso_dow
      AND ma.start_hour  = v_hour
  ) THEN
    RAISE EXCEPTION 'mentor is not available at this time';
  END IF;

  BEGIN
    INSERT INTO public.bookings (
      mentor_id, student_id, date, time_slot, duration, price, status
    )
    VALUES (
      _mentor_id, v_caller, _date, _time_slot, 60, v_price_inr, 'confirmed'
    )
    RETURNING id INTO v_booking_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'slot already booked';
  END;

  -- G1: flip first_session_used true once, atomically with the insert.
  UPDATE public.students
     SET first_session_used = true
   WHERE id = v_caller
     AND first_session_used = false;

  RETURN v_booking_id;
END;
$$;

REVOKE ALL ON FUNCTION public.book_session(uuid, date, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.book_session(uuid, date, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.book_session(uuid, date, text) TO authenticated;

COMMENT ON FUNCTION public.book_session(uuid, date, text) IS
  'Phase A1 + G1: the only INSERT path into public.bookings. SECURITY DEFINER. G1 (2026-05-23) added the trailing UPDATE that flips students.first_session_used true on the first successful booking, atomically with the insert.';

-- ════════════════════════════════════════════════════════════════════════════
-- G2 (amended): referral schema only
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.referral_codes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL UNIQUE REFERENCES public.students(id) ON DELETE CASCADE,
  code       text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students view own referral code" ON public.referral_codes;
CREATE POLICY "Students view own referral code"
  ON public.referral_codes FOR SELECT TO authenticated
  USING (auth.uid() = owner_id);

COMMENT ON TABLE public.referral_codes IS
  'Phase G2 (amended, 2026-05-23): per-student referral code. Schema only — no /r/{code} route or signup application until Stage 5 payments lands; redemption hooks ship then via service-role writes.';

CREATE TABLE IF NOT EXISTS public.referral_credits (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id  uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  referee_id   uuid NOT NULL UNIQUE REFERENCES public.students(id) ON DELETE CASCADE,
  amount_inr   integer NOT NULL CHECK (amount_inr > 0),
  status       text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','applied','revoked')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referral_credits_referrer_idx
  ON public.referral_credits (referrer_id, status);

ALTER TABLE public.referral_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students view own referral credits" ON public.referral_credits;
CREATE POLICY "Students view own referral credits"
  ON public.referral_credits FOR SELECT TO authenticated
  USING (auth.uid() = referrer_id OR auth.uid() = referee_id);

COMMENT ON TABLE public.referral_credits IS
  'Phase G2 (amended, 2026-05-23): referral credit ledger. Schema only. TODO(stage-5-payments): wire the redemption flow that decrements this ledger when applied at checkout.';

-- ════════════════════════════════════════════════════════════════════════════
-- G3 (amended): mentor training 2 sections
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.mentor_training_completions (
  mentor_id    uuid NOT NULL REFERENCES public.mentors(id) ON DELETE CASCADE,
  section_key  text NOT NULL CHECK (section_key IN ('safeguarding','code_of_conduct')),
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mentor_id, section_key)
);

ALTER TABLE public.mentor_training_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Mentors view own training completions" ON public.mentor_training_completions;
CREATE POLICY "Mentors view own training completions"
  ON public.mentor_training_completions FOR SELECT TO authenticated
  USING (auth.uid() = mentor_id);

DROP POLICY IF EXISTS "Mentors mark own training complete" ON public.mentor_training_completions;
CREATE POLICY "Mentors mark own training complete"
  ON public.mentor_training_completions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = mentor_id);

CREATE OR REPLACE FUNCTION public.mentor_training_complete(_mentor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (
    SELECT count(DISTINCT section_key)
      FROM public.mentor_training_completions
     WHERE mentor_id = _mentor_id
       AND section_key IN ('safeguarding','code_of_conduct')
  ) = 2;
$$;

REVOKE ALL ON FUNCTION public.mentor_training_complete(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mentor_training_complete(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.mentor_training_complete(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.mentor_training_complete(uuid) IS
  'Phase G3 (amended, 2026-05-23): true iff the mentor has marked both required sections complete (safeguarding + code_of_conduct). Admin approval flow gates on this before flipping mentor.status to approved.';

COMMENT ON TABLE public.mentor_training_completions IS
  'Phase G3 (amended, 2026-05-23): mentor training completion log. INSERT-only from the mentor (no UPDATE/DELETE — completion is monotonic). Two required sections per the amendment.';

-- ════════════════════════════════════════════════════════════════════════════
-- G5: code-of-conduct acceptance columns
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS code_of_conduct_accepted_at timestamptz;

ALTER TABLE public.mentors
  ADD COLUMN IF NOT EXISTS code_of_conduct_accepted_at timestamptz;

-- ════════════════════════════════════════════════════════════════════════════
-- G6 (amended): disputes schema + admin stub
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.disputes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  opened_by    uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reason       text NOT NULL,
  status       text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','reviewing','resolved','dismissed')),
  admin_notes  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz
);

CREATE INDEX IF NOT EXISTS disputes_status_idx ON public.disputes (status, created_at DESC);

ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Openers view own disputes" ON public.disputes;
CREATE POLICY "Openers view own disputes"
  ON public.disputes FOR SELECT TO authenticated
  USING (auth.uid() = opened_by);

DROP POLICY IF EXISTS "Admins view all disputes" ON public.disputes;
CREATE POLICY "Admins view all disputes"
  ON public.disputes FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins update disputes" ON public.disputes;
CREATE POLICY "Admins update disputes"
  ON public.disputes FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- No client INSERT policy by design — student-facing form lands post-launch
-- (Phase G6 amendment). Manual admin-side INSERT via SQL editor for V1.

COMMENT ON TABLE public.disputes IS
  'Phase G6 (amended, 2026-05-23): dispute ledger. Schema + admin-side SELECT/UPDATE only. No client INSERT policy — student-facing form is deferred post-launch. Manual INSERT via admin SQL editor for V1.';
