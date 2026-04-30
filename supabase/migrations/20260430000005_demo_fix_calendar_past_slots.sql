-- Fix 3: Exclude past slots from get_mentor_calendar.
-- Before: function projected all slots from _from_date forward, including
-- today's already-elapsed hours.
-- After: slots are only returned if date > today, or date = today and
-- time_slot > the current IST hour (rounded down). IST is the reference clock
-- because India is the primary user base.

CREATE OR REPLACE FUNCTION public.get_mentor_calendar(
  _mentor_id  uuid,
  _from_date  date    DEFAULT CURRENT_DATE,
  _days_ahead integer DEFAULT 30
)
RETURNS TABLE(date date, time_slot text, state text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
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
    s.date > CURRENT_DATE
    OR (
      s.date    = CURRENT_DATE
      AND s.time_slot > to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata', 'HH24:00')
    )
  )
  ORDER BY s.date ASC, s.time_slot ASC;
END;
$function$;
