-- ════════════════════════════════════════════════════════════════════════════
-- Payments Stage 2: book_session → pending_payment (+ zero-price branch) and the
--                   order-creation failure RPC fail_booking_order.
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHY: this is the behaviour switch. Until now book_session inserted 'confirmed'
-- directly (free booking). With Razorpay collect-then-confirm, a booking is born
-- 'pending_payment' (holding its slot via the Stage-1a widened index) and only
-- becomes 'confirmed' when the payment.captured webhook lands (Stage 3). Two
-- changes to book_session, everything else (auth, student-only, mentor-approved +
-- server-side price, HH:00, IST past-slot, availability, double-book translation,
-- and the BEFORE-INSERT minor-consent gate) is byte-for-byte unchanged:
--
--   (a) FREE-FIRST-SESSION IS RETIRED. The G1 'first_session_used' marker was
--       never enforced (it was a free-vs-paid flag); V1 charges every session at
--       mentors.price_inr. We do NOT read or flip first_session_used anywhere, so
--       there is no ₹0 'free session' to evade and no marker to consume on an
--       abandoned payment. The column is left in place (dropping it is out of
--       scope) — harmless and unread.
--
--   (b) DEFENSIVE ZERO / SUB-₹1 PRICE BRANCH. A mentor could have price_inr = 0
--       (or below Razorpay's ₹1 / 100-paise floor), which cannot form a payable
--       order. Such a booking is inserted 'confirmed' immediately (no order, no
--       webhook): the existing AFTER-INSERT create_booking_notification fires the
--       mentor notification, and createBookingOrder (the server fn) detects the
--       already-confirmed return, sends booking emails, and skips Checkout. Every
--       payable booking (price*100 >= 100) is inserted 'pending_payment'.
--       Because paid_at stays NULL on the zero-price path, those bookings are
--       correctly excluded from payouts (Stage 5 paid_at gate); their 80% is ₹0
--       anyway.
--
-- book_session is CREATE OR REPLACE (same signature) — no DROP/name risk.
-- fail_booking_order is new, service_role-only, and frees a held slot when the
-- Razorpay order call fails after the slot was already taken (Stage 2 server fn).
--
-- Verification: supabase/dev-seeds/payments-2-book-session-pending-verification.sql
-- ════════════════════════════════════════════════════════════════════════════

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
  v_status     text;
  v_booking_id uuid;
BEGIN
  -- 1. Authentication required.
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Mentor cannot book themselves.
  IF _mentor_id = v_caller THEN
    RAISE EXCEPTION 'mentors cannot book themselves';
  END IF;

  -- 3. Caller must be a student (handle_new_user cascades on signup).
  IF NOT EXISTS (SELECT 1 FROM public.students WHERE id = v_caller) THEN
    RAISE EXCEPTION 'only students may book sessions';
  END IF;

  -- 4. time_slot must be HH:00, hour 00..23.
  IF _time_slot !~ '^([01][0-9]|2[0-3]):00$' THEN
    RAISE EXCEPTION 'time_slot must be HH:00 (e.g. 14:00), got %', _time_slot;
  END IF;

  v_hour    := substring(_time_slot, 1, 2)::smallint;
  v_iso_dow := EXTRACT(ISODOW FROM _date)::smallint;

  -- 5. Mentor approval AND price fetch in a single read (server-side price).
  SELECT m.price_inr
    INTO v_price_inr
    FROM public.mentors m
   WHERE m.id     = _mentor_id
     AND m.status = 'approved'::public.mentor_status;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'mentor not available for booking';
  END IF;

  -- 6. IST past-slot guard.
  IF _date < v_ist_today
     OR (_date = v_ist_today AND _time_slot <= v_ist_hh) THEN
    RAISE EXCEPTION 'cannot book a past time slot';
  END IF;

  -- 7. Availability (mentor_availability is recurring weekly).
  IF NOT EXISTS (
    SELECT 1 FROM public.mentor_availability ma
    WHERE ma.mentor_id   = _mentor_id
      AND ma.day_of_week = v_iso_dow
      AND ma.start_hour  = v_hour
  ) THEN
    RAISE EXCEPTION 'mentor is not available at this time';
  END IF;

  -- 7b. Status selection (Stage 2): sub-Razorpay-minimum price → confirm now
  --     (no payable order possible); otherwise hold as pending_payment until the
  --     payment.captured webhook confirms it.
  IF coalesce(v_price_inr, 0) * 100 < 100 THEN
    v_status := 'confirmed';
  ELSE
    v_status := 'pending_payment';
  END IF;

  -- 8. Insert, catching the partial unique index for race-safe double-book.
  --    The widened bookings_confirmed_slot_unique (Stage 1a) holds the slot for
  --    BOTH 'confirmed' and 'pending_payment', so a second student cannot take a
  --    slot already held by an unpaid pending booking.
  BEGIN
    INSERT INTO public.bookings (
      mentor_id, student_id, date, time_slot, duration, price, status
    )
    VALUES (
      _mentor_id, v_caller, _date, _time_slot, 60, v_price_inr, v_status
    )
    RETURNING id INTO v_booking_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'slot already booked';
  END;

  RETURN v_booking_id;
END;
$$;

REVOKE ALL ON FUNCTION public.book_session(uuid, date, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.book_session(uuid, date, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.book_session(uuid, date, text) TO authenticated;

COMMENT ON FUNCTION public.book_session(uuid, date, text) IS
  'Payments Stage 2 (2026-05-31): the only INSERT path into public.bookings. SECURITY DEFINER. All Phase-A1 gates unchanged. A booking is inserted pending_payment (slot held via the widened bookings_confirmed_slot_unique) and confirmed later by the payment.captured webhook (mark_booking_paid); a sub-₹1 mentor price is inserted confirmed immediately (no payable order). Returns the new booking id (consumed by createBookingOrder).';

-- ─── fail_booking_order: free a held slot when order creation fails ──────────
-- book_session takes the slot before the Razorpay Orders API call. If that call
-- throws, the slot would otherwise sit pending_payment for the full 30-min expiry
-- window with no payable order. The server fn calls this to release it NOW: flip
-- pending_payment → payment_failed ONLY IF still pending (never stomp a row a
-- racing webhook just confirmed), and record the reason in the immutable ledger.
-- payment_failed drops out of the slot-hold index, so the slot is re-bookable.
CREATE OR REPLACE FUNCTION public.fail_booking_order(_booking_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.bookings
     SET status = 'payment_failed'
   WHERE id = _booking_id
     AND status = 'pending_payment';
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- Append-only audit. idempotency_key keyed on the booking so a retried call
  -- for the same booking does not stack duplicate rows.
  INSERT INTO public.payment_ledger (booking_id, event_type, idempotency_key, payload)
  VALUES (_booking_id, 'order_create_failed', 'order_create_failed:' || _booking_id::text,
          jsonb_build_object('flipped', v_rows = 1))
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN v_rows = 1;  -- true if THIS call freed the slot
END;
$$;

REVOKE ALL ON FUNCTION public.fail_booking_order(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fail_booking_order(uuid) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fail_booking_order(uuid) TO service_role;

COMMENT ON FUNCTION public.fail_booking_order(uuid) IS
  'Payments Stage 2 (2026-05-31): service_role-only. Frees a slot held by a pending_payment booking whose Razorpay order creation failed — flips pending_payment → payment_failed only if still pending (cannot stomp a concurrently-confirmed row) and writes an order_create_failed ledger row. Returns true if this call performed the flip.';
