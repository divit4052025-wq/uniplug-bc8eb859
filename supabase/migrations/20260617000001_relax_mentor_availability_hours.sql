-- ============================================================================
-- Relax mentor_availability.start_hour to the full 24h day (0..23).
-- ============================================================================
-- WHY: a mentor's recurring weekly availability is stored one row per open whole
-- hour (day_of_week 1..7 + start_hour). The original table
-- (20260425101339_…sql) constrained start_hour to BETWEEN 8 AND 22 — an
-- 8am..10pm business-hours cap. India-first mentors (and students in other
-- timezones) need to open hours anywhere across the day, so we widen the bound
-- to 0..23.
--
-- ADDITIVE / NON-DESTRUCTIVE: this only WIDENS the allowed range. Every existing
-- row (start_hour 8..22) still satisfies 0..23 — no row is dropped, narrowed, or
-- rewritten. The booking pipeline is unchanged: get_mentor_calendar already
-- projects each open hour into :00/:30 sub-slots, book_session validates
-- _duration IN (30,60) and mentor_covers_slot keys off start_hour generically —
-- so hours 0 and 23 work the moment the CHECK permits them. No cross-midnight
-- bookings: a 60-min slot needs two consecutive open hours, so a 60-min start at
-- 23:30 (which would need a non-existent hour 24) is simply not coverable — the
-- existing mentor_covers_slot logic already rejects it.
--
-- SELF-CORRECTING (Stage-1a pattern): discover ANY existing CHECK on
-- mentor_availability that references start_hour by its real catalog name and
-- drop it, then add the canonical one — so a legacy/renamed CHECK can't survive
-- to shadow the new bound. (Live currently has mentor_availability_start_hour_check.)
--
-- Verification: supabase/dev-seeds/relax-mentor-availability-hours-verification.sql
-- ============================================================================

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.mentor_availability'::regclass
       AND contype  = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%start_hour%'
  LOOP
    EXECUTE format('ALTER TABLE public.mentor_availability DROP CONSTRAINT %I', r.conname);
  END LOOP;

  ALTER TABLE public.mentor_availability
    ADD CONSTRAINT mentor_availability_start_hour_check
    CHECK (start_hour BETWEEN 0 AND 23);
END $$;

COMMENT ON COLUMN public.mentor_availability.start_hour IS
  'Recurring weekly availability: the opening whole hour (0..23, full-day) for day_of_week. Widened from the original 8..22 business-hours cap (2026-06-17). get_mentor_calendar projects each open hour into :00/:30 sub-slots; book_session(_duration 30|60) + mentor_covers_slot validate against these rows. No cross-midnight coverage (a 60-min start needing hour 24 is uncoverable).';
