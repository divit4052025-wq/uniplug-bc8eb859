-- Bug 6.5 backend: replace CURRENT_DATE references in get_mentor_calendar
-- with IST-correct dates.
--
-- CURRENT_DATE on Supabase evaluates in the session's configured timezone,
-- which is UTC. For IST users in the evening window (18:30-23:59 IST), the
-- UTC CURRENT_DATE is still "yesterday IST", so the function's
--   s.date > CURRENT_DATE
--   OR (s.date = CURRENT_DATE AND s.time_slot > current_hour_ist)
-- branch incorrectly filtered out today's remaining slots — roughly a
-- 5.5-hour daily slice where the public mentor calendar lost today's
-- after-now availability.
--
-- This migration replaces both CURRENT_DATE references (the default for
-- _from_date and the WHERE comparisons) with the IST equivalent
-- (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date. The time-of-day
-- check was already IST-correct and is preserved.
--
-- All other behavior of the function is unchanged: mentor.status='approved'
-- gate, slot/availability join, booking-status join, ordering.

CREATE OR REPLACE FUNCTION public.get_mentor_calendar(
  _mentor_id uuid,
  _from_date date DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date,
  _days_ahead integer DEFAULT 30
)
RETURNS TABLE(date date, time_slot text, state text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ist_today date := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.mentors m
    WHERE m.id     = _mentor_id
      AND m.status = 'approved'::public.mentor_status
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH date_series AS (
    SELECT
      d::date                              AS date,
      EXTRACT(ISODOW FROM d)::smallint     AS iso_dow
    FROM generate_series(
      _from_date,
      _from_date + (_days_ahead - 1),
      interval '1 day'
    ) AS d
  ),
  slots AS (
    SELECT
      ds.date,
      lpad(ma.start_hour::text, 2, '0') || ':00' AS time_slot
    FROM date_series ds
    JOIN public.mentor_availability ma
      ON ma.mentor_id   = _mentor_id
     AND ma.day_of_week = ds.iso_dow
  )
  SELECT
    s.date,
    s.time_slot,
    CASE WHEN b.id IS NULL THEN 'available' ELSE 'booked' END AS state
  FROM slots s
  LEFT JOIN public.bookings b
    ON b.mentor_id = _mentor_id
   AND b.date      = s.date
   AND b.time_slot = s.time_slot
   AND b.status   IN ('confirmed', 'completed')
  WHERE (
    s.date > v_ist_today
    OR (
      s.date    = v_ist_today
      AND s.time_slot > to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata', 'HH24:00')
    )
  )
  ORDER BY s.date ASC, s.time_slot ASC;
END;
$$;

COMMENT ON FUNCTION public.get_mentor_calendar(uuid, date, integer) IS
  'Returns the next _days_ahead days of slots for an approved mentor, marking each as available or booked. IST-correct as of 2026-05-14: today and current-hour comparisons use (CURRENT_TIMESTAMP AT TIME ZONE Asia/Kolkata)::date and the corresponding HH:00 string, fixing the UTC drift identified in Bug 6.5.';
