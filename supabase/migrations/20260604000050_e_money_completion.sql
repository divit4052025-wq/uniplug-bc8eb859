-- ============================================================================
-- E — Money completion (NON-disbursement)
-- ============================================================================
-- Builds the DB layer for: tiered student-cancel refund + full mentor-cancel
-- refund (amount read from the IMMUTABLE payment_captured ledger row, C-2;
-- tier cutoffs a single server-side constant block, C-1), orphan-capture
-- detection, and max_active_mentees enforcement (via the C-3 count helper). All
-- cancel/clawback reuses the existing apply_refund. Retires two dangling demo
-- cancel paths.
--
-- DEFERRED / FLAGGED (execution layer — the plan's open fork #2, NOT built here,
-- consistent with "NON-disbursement only" + "reuse apply_refund"): the worker
-- that actually calls the Razorpay REFUND API for a pending refund_intents row
-- (and for an orphan), then writes the refund_created/refund_processed ledger
-- rows. The cancel RPCs record a durable refund_intent + cancel+clawback now;
-- the money leaves Razorpay when that worker runs (refunds are async/"5-7 days"
-- per policy). This mirrors how apply_refund (DB) is already separate from
-- refundBooking (Razorpay call).
--
-- DO NOT build RazorpayX payout disbursement (separate later gated step).
-- ============================================================================

-- ── refund_intents — durable record of money owed (worker executes) ─────────
CREATE TABLE IF NOT EXISTS public.refund_intents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  amount_inr   integer NOT NULL CHECK (amount_inr >= 0),
  tier         text NOT NULL,
  reason       text,
  source       text NOT NULL,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processed','failed')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS refund_intents_booking_idx ON public.refund_intents (booking_id);
-- At most ONE pending refund intent per booking — a structural no-double-refund
-- backstop for any future writer / the deferred executor (folded from review
-- E-REFUND-INTENT-NO-UNIQUE; mirrors the ledger's idempotency_key discipline).
CREATE UNIQUE INDEX IF NOT EXISTS refund_intents_one_pending_per_booking
  ON public.refund_intents (booking_id) WHERE status = 'pending';

-- Service-internal: RLS on, ZERO client policies, writes via the DEFINER cancel
-- RPCs, reads by the (deferred) refund worker via service_role. Like the ledger.
ALTER TABLE public.refund_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.refund_intents FROM anon, authenticated;

COMMENT ON TABLE public.refund_intents IS
  'E (2026-06-04): a pending row = a refund the platform owes (amount already tier-scaled from the captured ledger). The Razorpay-refund executor worker (deferred) processes pending rows. Service-internal (RLS-on/0-policies).';

-- ── Supporting index for the active-mentee cap count ─────────────────────────
CREATE INDEX IF NOT EXISTS bookings_mentor_active_student_idx
  ON public.bookings (mentor_id, student_id)
  WHERE status IN ('reserved', 'pending_payment', 'confirmed');

-- ── book_session — add the active-mentee cap (CREATE OR REPLACE, same sig) ───
CREATE OR REPLACE FUNCTION public.book_session(_mentor_id uuid, _date date, _time_slot text, _subject_id uuid DEFAULT NULL::uuid, _description text DEFAULT NULL::text, _duration integer DEFAULT 60)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller     uuid    := auth.uid();
  v_price_inr  integer;
  v_price      integer;
  v_max        integer;
  v_hour       smallint;
  v_iso_dow    smallint;
  v_slot_start timestamptz;
  v_status     text;
  v_booking_id uuid;
  v_subject_id uuid;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;
  IF _mentor_id = v_caller THEN RAISE EXCEPTION 'mentors cannot book themselves'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.students WHERE id = v_caller) THEN
    RAISE EXCEPTION 'only students may book sessions';
  END IF;
  IF _duration NOT IN (30, 60) THEN RAISE EXCEPTION 'duration must be 30 or 60 minutes, got %', _duration; END IF;
  IF _time_slot !~ '^([01][0-9]|2[0-3]):(00|30)$' THEN
    RAISE EXCEPTION 'time_slot must be HH:00 or HH:30 (e.g. 14:30), got %', _time_slot;
  END IF;
  v_hour    := substring(_time_slot, 1, 2)::smallint;
  v_iso_dow := EXTRACT(ISODOW FROM _date)::smallint;

  -- Mentor approval + flat price + cap, single read.
  SELECT m.price_inr, m.max_active_mentees
    INTO v_price_inr, v_max
    FROM public.mentors m
   WHERE m.id = _mentor_id AND m.status = 'approved'::public.mentor_status;
  IF NOT FOUND THEN RAISE EXCEPTION 'mentor not available for booking'; END IF;

  v_price := round(coalesce(v_price_inr, 0) * _duration / 60.0)::integer;

  -- Active-mentee cap (E). Advisory xact lock serializes concurrent first-
  -- bookings for the same mentor through count→insert (bare count is not race-
  -- safe). NULL cap = unlimited; an ALREADY-active student may always book again
  -- (the cap counts DISTINCT students via count_active_mentees, C-3).
  IF v_max IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('mentee_cap:' || _mentor_id::text, 0));
    IF public.count_active_mentees(_mentor_id) >= v_max
       AND NOT EXISTS (
         SELECT 1 FROM public.bookings b
         WHERE b.mentor_id = _mentor_id AND b.student_id = v_caller
           AND b.status IN ('reserved', 'pending_payment', 'confirmed')
       ) THEN
      RAISE EXCEPTION 'this mentor has reached their active-mentee limit' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  v_slot_start := (_date::timestamp + _time_slot::time) AT TIME ZONE 'Asia/Kolkata';
  IF v_slot_start <= now() THEN RAISE EXCEPTION 'cannot book a past time slot'; END IF;

  IF NOT public.mentor_covers_slot(_mentor_id, v_iso_dow, _time_slot, _duration) THEN
    RAISE EXCEPTION 'mentor is not available at this time';
  END IF;

  v_subject_id := _subject_id;
  IF v_subject_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.ref_subjects WHERE id = v_subject_id) THEN
    v_subject_id := NULL;
  END IF;

  IF v_price * 100 < 100 THEN v_status := 'confirmed'; ELSE v_status := 'pending_payment'; END IF;

  BEGIN
    INSERT INTO public.bookings (
      mentor_id, student_id, date, time_slot, duration, price, status, subject_id, description
    )
    VALUES (
      _mentor_id, v_caller, _date, _time_slot, _duration, v_price, v_status,
      v_subject_id, NULLIF(btrim(coalesce(_description, '')), '')
    )
    RETURNING id INTO v_booking_id;
  EXCEPTION WHEN unique_violation OR exclusion_violation THEN
    RAISE EXCEPTION 'slot already booked';
  END;

  RETURN v_booking_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.book_session(uuid, date, text, uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_session(uuid, date, text, uuid, text, integer) TO authenticated, service_role;

-- ── reserve_slot — add the active-mentee cap (CREATE OR REPLACE, same sig) ───
CREATE OR REPLACE FUNCTION public.reserve_slot(_student_id uuid, _date date, _time_slot text, _duration integer DEFAULT 60)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller     uuid := auth.uid();
  v_price_inr  integer;
  v_price      integer;
  v_max        integer;
  v_hour       smallint;
  v_iso_dow    smallint;
  v_slot_start timestamptz;
  v_booking_id uuid;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;

  SELECT m.price_inr, m.max_active_mentees INTO v_price_inr, v_max
    FROM public.mentors m
   WHERE m.id = v_caller AND m.status = 'approved'::public.mentor_status;
  IF NOT FOUND THEN RAISE EXCEPTION 'only an approved mentor can reserve a slot' USING ERRCODE = '42501'; END IF;

  IF _student_id = v_caller THEN RAISE EXCEPTION 'cannot reserve a slot for yourself' USING ERRCODE = 'P0001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.students WHERE id = _student_id) THEN
    RAISE EXCEPTION 'student not found' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.mentor_id = v_caller AND b.student_id = _student_id AND b.status IN ('confirmed', 'completed')
  ) THEN
    RAISE EXCEPTION 'you can only reserve a slot for a student you have already mentored' USING ERRCODE = 'P0001';
  END IF;

  IF _duration NOT IN (30, 60) THEN RAISE EXCEPTION 'duration must be 30 or 60 minutes, got %', _duration USING ERRCODE = 'P0001'; END IF;
  IF _time_slot !~ '^([01][0-9]|2[0-3]):(00|30)$' THEN
    RAISE EXCEPTION 'time_slot must be HH:00 or HH:30 (e.g. 14:30), got %', _time_slot USING ERRCODE = 'P0001';
  END IF;
  v_hour    := substring(_time_slot, 1, 2)::smallint;
  v_iso_dow := EXTRACT(ISODOW FROM _date)::smallint;

  v_price := round(coalesce(v_price_inr, 0) * _duration / 60.0)::integer;

  -- Active-mentee cap (E). A reserved hold occupies the cap (it's in the count
  -- set). The held student counts as a distinct mentee unless already active.
  IF v_max IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('mentee_cap:' || v_caller::text, 0));
    IF public.count_active_mentees(v_caller) >= v_max
       AND NOT EXISTS (
         SELECT 1 FROM public.bookings b
         WHERE b.mentor_id = v_caller AND b.student_id = _student_id
           AND b.status IN ('reserved', 'pending_payment', 'confirmed')
       ) THEN
      RAISE EXCEPTION 'you have reached your active-mentee limit' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  v_slot_start := (_date::timestamp + _time_slot::time) AT TIME ZONE 'Asia/Kolkata';
  IF v_slot_start <= now() THEN RAISE EXCEPTION 'cannot reserve a past time slot' USING ERRCODE = 'P0001'; END IF;

  IF NOT public.mentor_covers_slot(v_caller, v_iso_dow, _time_slot, _duration) THEN
    RAISE EXCEPTION 'you are not available at this time' USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    INSERT INTO public.bookings (
      mentor_id, student_id, date, time_slot, duration, price, status, reschedule_count
    )
    VALUES (v_caller, _student_id, _date, _time_slot, _duration, v_price, 'reserved', 0)
    RETURNING id INTO v_booking_id;
  EXCEPTION WHEN unique_violation OR exclusion_violation THEN
    RAISE EXCEPTION 'slot already booked';
  END;

  RETURN v_booking_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.reserve_slot(uuid, date, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_slot(uuid, date, text, integer) TO authenticated, service_role;

-- ── Tiered student cancel + refund (amount from the captured ledger, C-2) ────
CREATE OR REPLACE FUNCTION public.cancel_booking_as_student(_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  -- C-1: tier cutoffs as a single server-side constant block (one-line-tunable).
  c_full_hours constant numeric := 24;   -- >= 24h → 100%
  c_half_hours constant numeric := 2;    -- 2–24h → 50% ; < 2h → 0%
  v_caller   uuid := auth.uid();
  v_student  uuid; v_status text; v_payout uuid; v_date date; v_slot text;
  v_start    timestamptz; v_hours numeric;
  v_captured integer; v_tier text; v_pct numeric; v_refundable integer;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;
  SELECT student_id, status, payout_id, date, time_slot
    INTO v_student, v_status, v_payout, v_date, v_slot
    FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found' USING ERRCODE = 'P0001'; END IF;
  IF v_student IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'you can only cancel your own booking' USING ERRCODE = '42501';
  END IF;
  IF v_status <> 'confirmed' THEN
    RAISE EXCEPTION 'only a confirmed booking can be cancelled (status = %)', v_status USING ERRCODE = 'P0001';
  END IF;
  IF v_payout IS NOT NULL THEN
    RAISE EXCEPTION 'this session has already been settled and cannot be self-cancelled' USING ERRCODE = 'P0001';
  END IF;

  -- C-2: the refund is scaled from the IMMUTABLE captured-ledger amount, NOT the
  -- mutable bookings.price (a price edit/reschedule can never desync the refund).
  -- SUM (not max) of captured rows so a booking with >1 capture refunds the full
  -- amount charged, never silently dropping a capture (folded from review).
  SELECT coalesce(sum(pl.amount_inr), 0) INTO v_captured
    FROM public.payment_ledger pl
   WHERE pl.booking_id = _booking_id AND pl.event_type = 'payment_captured';

  v_start := (v_date::timestamp + v_slot::time) AT TIME ZONE 'Asia/Kolkata';
  v_hours := EXTRACT(EPOCH FROM (v_start - now())) / 3600.0;
  IF    v_hours >= c_full_hours THEN v_tier := 'full'; v_pct := 1.0;
  ELSIF v_hours >= c_half_hours THEN v_tier := 'half'; v_pct := 0.5;
  ELSE                               v_tier := 'none'; v_pct := 0.0;
  END IF;
  v_refundable := round(v_captured * v_pct)::integer;

  INSERT INTO public.refund_intents (booking_id, amount_inr, tier, reason, source)
  VALUES (_booking_id, v_refundable, v_tier, 'student cancellation', 'student_cancel');

  -- Cancel + accrual clawback (reuse apply_refund: status='cancelled' + clawback;
  -- payout_id IS NULL here so clawback is a no-op).
  PERFORM public.apply_refund(_booking_id::text, NULL,
    jsonb_build_object('source','student_cancel','tier',v_tier,'refundable_inr',v_refundable,'captured_inr',v_captured));

  RETURN jsonb_build_object('tier', v_tier, 'refundable_inr', v_refundable, 'captured_inr', v_captured);
END;
$function$;

-- ── Mentor cancel → student fully refunded (regardless of time) ─────────────
CREATE OR REPLACE FUNCTION public.cancel_booking_as_mentor(_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_caller   uuid := auth.uid();
  v_mentor   uuid; v_status text; v_captured integer;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;
  SELECT mentor_id, status INTO v_mentor, v_status
    FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found' USING ERRCODE = 'P0001'; END IF;
  IF v_mentor IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'you can only cancel your own booking' USING ERRCODE = '42501';
  END IF;
  IF v_status <> 'confirmed' THEN
    RAISE EXCEPTION 'only a confirmed booking can be cancelled (status = %)', v_status USING ERRCODE = 'P0001';
  END IF;

  -- SUM (not max) of captured rows so a booking with >1 capture refunds the full
  -- amount charged, never silently dropping a capture (folded from review).
  SELECT coalesce(sum(pl.amount_inr), 0) INTO v_captured
    FROM public.payment_ledger pl
   WHERE pl.booking_id = _booking_id AND pl.event_type = 'payment_captured';

  INSERT INTO public.refund_intents (booking_id, amount_inr, tier, reason, source)
  VALUES (_booking_id, v_captured, 'full', 'mentor cancellation', 'mentor_cancel');

  -- Full refund + clawback (apply_refund reverses a scheduled accrual or records
  -- clawback_owed if already paid out).
  PERFORM public.apply_refund(_booking_id::text, NULL,
    jsonb_build_object('source','mentor_cancel','refundable_inr',v_captured,'captured_inr',v_captured));

  RETURN jsonb_build_object('tier', 'full', 'refundable_inr', v_captured, 'captured_inr', v_captured);
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_booking_as_student(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_booking_as_mentor(uuid)  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_booking_as_student(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_booking_as_mentor(uuid)  TO authenticated, service_role;

-- ── Orphan-capture detection (the executor reuses apply_refund; deferred) ────
CREATE OR REPLACE FUNCTION public.find_orphan_captures()
RETURNS TABLE(booking_id uuid, payment_id text, amount_inr integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT pl.booking_id, pl.razorpay_payment_id, pl.amount_inr
  FROM public.payment_ledger pl
  JOIN public.bookings b ON b.id = pl.booking_id
  WHERE pl.event_type = 'payment_captured'
    AND b.status NOT IN ('confirmed', 'completed')         -- captured but the session never became real
    AND NOT EXISTS (                                        -- and not already refunded/clawed (idempotent re-run)
      SELECT 1 FROM public.payment_ledger x
      WHERE x.booking_id = pl.booking_id
        AND x.event_type IN ('refund_created', 'refund_processed', 'clawback_owed')
    )
    -- CRITICAL (folded from review E-ORPHAN-DOUBLE-REFUND): a booking that went
    -- through cancel_booking_as_* records its (tier-scaled, possibly partial or
    -- zero) refund in refund_intents and is set status='cancelled' with NO ledger
    -- row (apply_refund writes none when payout_id IS NULL). Without this guard
    -- the orphan sweep would hand the executor a FULL unconditional refund on top
    -- of (or instead of) the policy refund — double-refunding every cancellation.
    AND NOT EXISTS (
      SELECT 1 FROM public.refund_intents ri WHERE ri.booking_id = pl.booking_id
    );
$function$;

COMMENT ON FUNCTION public.find_orphan_captures() IS
  'E (2026-06-04): captured money on a booking that never became confirmed/completed (late capture / stray capture / claim-expire race) and is not already refunded. Ledger-driven + NOT-EXISTS de-duped → safe to re-run. The executor (reuse apply_refund + Razorpay refund, payload {source:orphan_auto_refund}) is the deferred worker.';

REVOKE ALL ON FUNCTION public.find_orphan_captures() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_orphan_captures() TO service_role;

-- ── Retire the two dangling demo cancel paths ───────────────────────────────
-- The demo student RLS cancel (raw confirmed→cancelled, NO refund, frees the
-- slot — a paid student could self-cancel for nothing) and the refund-blind
-- mentor RPC. The only cancel routes are now the tiered RPCs above.
DROP POLICY IF EXISTS "Students can cancel own confirmed bookings" ON public.bookings;
REVOKE EXECUTE ON FUNCTION public.update_booking_status_as_mentor(uuid, text) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.update_booking_status_as_mentor(uuid, text) IS
  'RETIRED by E (2026-06-04): refund-blind. EXECUTE revoked from clients. Use cancel_booking_as_mentor (refund-aware). Kept only to avoid breaking generated types; no client may call it.';
