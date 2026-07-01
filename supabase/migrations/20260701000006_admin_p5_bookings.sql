-- ============================================================================
-- ADMIN CONSOLE — PHASE 5: BOOKINGS / SESSIONS LEDGER. Additive, LOCAL-only.
-- ============================================================================
-- A filterable operational ledger of bookings (a "session" IS a bookings row — the
-- live model has no separate session entity) + a per-booking detail. All readers
-- is_admin()-gated. The freeze/cancel ACTION reuses the P1 admin_freeze_or_cancel_
-- booking (is_admin + audited, NO refund) — so this migration adds READERS only.
--
-- HONESTY (attendance): there is NO attendance model. status='completed' is a blind
-- time-based pg_cron flip (confirmed->completed once the slot has passed) — it is NOT
-- evidence anyone attended. The ONLY truthful join signal is video_join_audit: "a
-- Daily token was ISSUED to this party at issued_at" — authorization to join, NOT a
-- confirmed connection or duration. admin_list_booking_joins surfaces exactly that,
-- labelled as token issuance, never as "attended".
--
-- MONEY: full payments live in Phase 6. Here the ledger/detail carry only a light,
-- booking-scoped read-only summary: paid proxy (status IN confirmed/completed — there
-- is no boolean paid flag), payment presence, and any refund_intent status/amount.
-- No refund is issued here (that path is app-layer + adversarial-review — Phase 6).
--
-- PII: parties are MASKED (masked_user_label) in both the bulk ledger and the detail;
-- identity + contact live on the user 360 (a click away, which logs its own view).
-- NULL student_id/mentor_id (deleted account, FK ON DELETE SET NULL) is tolerated.
-- PRE-LAUNCH (scoped roles): the gate is coarse is_admin() (only super_admin is
-- grantable today). When scoped roles ship, re-gate the money summary on finance and
-- the join-audit (who joined a minor's 1:1 call) on safeguarding_reviewer.
--
-- Pairs with supabase/dev-seeds/admin-p5-bookings-verification.sql
-- ============================================================================

-- ── 1. filterable bookings ledger ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_bookings_ledger(
  _status text DEFAULT NULL, _from date DEFAULT NULL, _to date DEFAULT NULL,
  _frozen_only boolean DEFAULT false, _limit integer DEFAULT 100
)
RETURNS TABLE (
  id uuid, student_id uuid, student_label text, mentor_id uuid, mentor_label text,
  date date, time_slot text, duration integer, status text, price integer,
  paid boolean, frozen boolean, refund_pending boolean, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF _status IS NOT NULL AND _status NOT IN
     ('reserved','pending_payment','confirmed','completed','cancelled','payment_failed','expired') THEN
    RAISE EXCEPTION 'invalid_status: %', _status;
  END IF;
  RETURN QUERY
    SELECT b.id,
           b.student_id, CASE WHEN b.student_id IS NULL THEN 'deleted account' ELSE public.masked_user_label(b.student_id) END,
           b.mentor_id,  CASE WHEN b.mentor_id  IS NULL THEN 'deleted account' ELSE public.masked_user_label(b.mentor_id)  END,
           b.date, b.time_slot, b.duration, b.status, b.price,
           (b.status IN ('confirmed','completed')) AS paid,   -- status is the paid proxy (no boolean flag)
           (b.frozen_at IS NOT NULL) AS frozen,
           EXISTS (SELECT 1 FROM public.refund_intents ri WHERE ri.booking_id = b.id AND ri.status = 'pending') AS refund_pending,
           b.created_at
      FROM public.bookings b
     WHERE (_status IS NULL OR b.status = _status)
       AND (_from IS NULL OR b.date >= _from)
       AND (_to   IS NULL OR b.date <= _to)
       AND (NOT _frozen_only OR b.frozen_at IS NOT NULL)
     ORDER BY b.date DESC, b.created_at DESC
     LIMIT GREATEST(0, LEAST(COALESCE(_limit, 100), 500));   -- NULL _limit must not go unbounded
END $$;
REVOKE ALL     ON FUNCTION public.admin_list_bookings_ledger(text, date, date, boolean, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_list_bookings_ledger(text, date, date, boolean, integer) TO authenticated, service_role;
COMMENT ON FUNCTION public.admin_list_bookings_ledger(text, date, date, boolean, integer) IS
  'Admin P5 (2026-07-01): is_admin-gated filterable bookings ledger (status/date-range/frozen). MASKED parties, paid proxy (status IN confirmed/completed), frozen + refund-pending flags. Tolerates deleted (NULL) parties.';

-- ── 2. per-booking detail (logs the view) ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_booking(_booking_id uuid)
RETURNS TABLE (
  id uuid, status text, date date, time_slot text, duration integer, price integer,
  student_id uuid, student_label text, mentor_id uuid, mentor_label text,
  paid_at timestamptz, frozen_at timestamptz, has_payment boolean,
  refund_status text, refund_amount_inr integer,
  subject text, description text, reschedule_count integer, created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  -- qualify: the RETURNS TABLE OUT column `id` shadows an unqualified bookings.id
  IF NOT EXISTS (SELECT 1 FROM public.bookings bk WHERE bk.id = _booking_id) THEN RETURN; END IF;
  -- Opening a booking reads a (often minor's) session parties, money + join activity
  -- => log the view (mirrors view_user_profile). Freeze/cancel are separately audited.
  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id)
  VALUES (v_actor, 'view_booking', 'booking', _booking_id);
  RETURN QUERY
    SELECT b.id, b.status, b.date, b.time_slot, b.duration, b.price,
           b.student_id, CASE WHEN b.student_id IS NULL THEN 'deleted account' ELSE public.masked_user_label(b.student_id) END,
           b.mentor_id,  CASE WHEN b.mentor_id  IS NULL THEN 'deleted account' ELSE public.masked_user_label(b.mentor_id)  END,
           b.paid_at, b.frozen_at,
           (b.razorpay_payment_id IS NOT NULL OR b.paid_at IS NOT NULL) AS has_payment,
           rf.status AS refund_status, rf.amount_inr AS refund_amount_inr,   -- same intent row (LATERAL)
           (SELECT s.name FROM public.ref_subjects s WHERE s.id = b.subject_id) AS subject,
           b.description, b.reschedule_count, b.created_at
      FROM public.bookings b
      LEFT JOIN LATERAL (
        SELECT ri.status, ri.amount_inr FROM public.refund_intents ri
         WHERE ri.booking_id = b.id ORDER BY ri.created_at DESC LIMIT 1
      ) rf ON true
     WHERE b.id = _booking_id;
END $$;
REVOKE ALL     ON FUNCTION public.admin_get_booking(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_get_booking(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.admin_get_booking(uuid) IS
  'Admin P5 (2026-07-01): is_admin-gated single-booking detail (masked parties, schedule, paid/frozen, light refund summary, subject). Logs view_booking. NO refund executor here (Phase 6 / app-layer).';

-- ── 3. honest join signal (token issuance — NOT attendance) ─────────────────
CREATE OR REPLACE FUNCTION public.admin_list_booking_joins(_booking_id uuid)
RETURNS TABLE (role text, user_id uuid, user_label text, issued_at timestamptz, token_exp timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  -- This is the most safeguarding-sensitive read in the phase — WHO was authorized to
  -- join a (often minor's) 1:1 video call — and the reader is independently callable,
  -- so LOG it (mirrors admin_list_user_reports). Fires per detail open; acceptable.
  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id)
  VALUES (v_actor, 'view_booking_joins', 'booking', _booking_id);
  RETURN QUERY
    SELECT v.role, v.user_id,
           CASE WHEN v.user_id IS NULL THEN 'unknown' ELSE public.masked_user_label(v.user_id) END,
           v.issued_at, v.token_exp
      FROM public.video_join_audit v
     WHERE v.booking_id = _booking_id
     ORDER BY v.issued_at;
END $$;
REVOKE ALL     ON FUNCTION public.admin_list_booking_joins(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_list_booking_joins(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.admin_list_booking_joins(uuid) IS
  'Admin P5 (2026-07-01): is_admin-gated video_join_audit for a booking — each row = a Daily join TOKEN was ISSUED to a party at issued_at. This is authorization-to-join, NOT proof of attendance/connection (the platform records no connect events).';
