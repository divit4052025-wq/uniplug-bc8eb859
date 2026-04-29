-- Bug 4 / Step 2 (Prompt 2B): public calendar RPC.
--
-- Returns a flattened, projected list of (date, time_slot, state) cells for the
-- next N days for one mentor. Joins recurring weekly mentor_availability rows
-- to a generated date series, then left-joins bookings to mark each slot as
-- 'available' or 'booked'. Lets the public widget paint the calendar without
-- needing direct SELECT access to the bookings table — which is correct since
-- bookings RLS only exposes a user's own rows. SECURITY DEFINER is what makes
-- the cross-user booked-slot visibility work.

CREATE OR REPLACE FUNCTION public.get_mentor_calendar(
  _mentor_id   uuid,
  _from_date   date DEFAULT CURRENT_DATE,
  _days_ahead  integer DEFAULT 30
)
RETURNS TABLE (
  date       date,
  time_slot  text,
  state      text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Approved-mentor gate: any non-approved mentor (or non-existent UUID)
  -- yields zero rows. Cheaper than computing the join then filtering.
  IF NOT EXISTS (
    SELECT 1 FROM public.mentors m
    WHERE m.id = _mentor_id
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
   AND b.status IN ('confirmed', 'completed')
  ORDER BY s.date ASC, s.time_slot ASC;
END;
$$;

COMMENT ON FUNCTION public.get_mentor_calendar(uuid, date, integer) IS
  'Returns (date, time_slot, state) cells for an approved mentor over the next N days, joining recurring availability to bookings. Runs SECURITY DEFINER so anonymous and student callers can read booked-slot visibility without direct access to the bookings table.';

REVOKE ALL ON FUNCTION public.get_mentor_calendar(uuid, date, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_mentor_calendar(uuid, date, integer) TO anon, authenticated;
