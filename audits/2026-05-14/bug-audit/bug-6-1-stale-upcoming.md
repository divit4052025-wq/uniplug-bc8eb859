# Bug 6.1 — Stale "Upcoming Sessions": no auto-complete for past confirmed bookings

## Plain-English description

A confirmed booking stays in the `confirmed` status forever, even after the
session date and time have passed. The session never becomes `completed`
automatically. The student "Upcoming Sessions" list and the mentor "Upcoming
Sessions" list both filter by `status = 'confirmed' AND date >= today`, so:

- A confirmed session for **yesterday** falls off the upcoming list (the date
  filter removes it) but is never marked completed — it lingers as
  `confirmed` in the database forever.
- A confirmed session for **today, 9:00 AM** is still shown as "upcoming" at
  3:00 PM because the date filter only checks the date, not the time. This is
  effectively the same root cause as Bug 6.6 on the mentor side.
- Earnings (`status = 'completed'`) never grow unless a mentor manually marks
  a session completed via `update_booking_status_as_mentor` from somewhere in
  the UI — and no UI surface currently calls that RPC, so earnings will be
  permanently `₹0` for everyone.
- The platform-wide "Total Sessions" admin counter
  (`admin_stats.total_sessions_all_time` and `sessions_this_month`) is also
  driven off `status = 'completed'`, so all those metrics stay at zero.

## Where the bug lives

Frontend (consumers of the stale state):

- `src/components/dashboard/sections/UpcomingSessionsSection.tsx:18-27` — the
  student-side query: `.eq("status", "confirmed").gte("date", today)`. No
  time-of-day check.
- `src/components/mentor-dashboard/sections/MentorUpcomingSessions.tsx:44-52` —
  the mentor-side query: same shape, with `todayInIst()` derived correctly but
  still ignoring the hour. See also Bug 6.6.
- `src/components/mentor-dashboard/sections/EarningsSection.tsx:23-29` — only
  reads `status = 'completed'`. Returns `₹0` for every mentor today.
- `src/components/mentor-dashboard/sections/PostSessionNotesSection.tsx:74-86` —
  the "select a completed session" dropdown does a *client-side* filter by
  comparing `date + time_slot` to `new Date()`, which works in the UI but
  doesn't actually mark anything completed in the DB.
- `src/components/mentor-dashboard/sections/MyStudentsSection.tsx:37-42` —
  pulls bookings in `('confirmed','completed')` for the "X sessions" count, so
  on this surface a past confirmed session is double-counted in spirit (still
  alive as "upcoming" and contributing to "My Students" total).

Backend (no completion mechanism):

- `supabase/migrations/20260425103823_*.sql` — the bookings policies. The
  `Students can cancel own confirmed bookings` policy lets a student set their
  own row to `cancelled`, but there is no auto-completion path.
- `supabase/migrations/20260430000004_demo_fix_bookings_mentor_update_rpc.sql:7-30`
  — `update_booking_status_as_mentor(_booking_id, _new_status)` is the only
  path to set `completed`, and only the mentor can call it. Nothing else in
  the codebase invokes it. (Grep `update_booking_status_as_mentor` over `src/`
  yields zero hits.)
- No scheduled job / pg_cron / Edge Function runs on a timer. The Supabase
  project does not have any Edge Functions deployed (verified via
  `mcp__Supabase__list_edge_functions` semantics — the `supabase/functions/`
  directory is absent from the repo).

## Root cause

The system has no concept of "the session happened." `bookings.status` is a
free-text column updated only by explicit user/mentor action. Without a cron
or trigger that flips `confirmed → completed` when `(date, time_slot)` is in
the past, every confirmed booking accretes forever.

## Proposed fixes

### Option A — pg_cron job (recommended)

Schedule a 15-minute SQL job that runs:


```sql
UPDATE public.bookings
SET    status = 'completed'
WHERE  status = 'confirmed'
  AND  (date::timestamp + time_slot::time + interval '1 hour')
       AT TIME ZONE 'Asia/Kolkata'
       <= now();
```



Pros: simple, deterministic, no client involvement, every consumer (earnings,
admin stats, upcoming queries) becomes correct automatically.

Cons: requires `pg_cron` extension to be enabled (it is available on Supabase
but must be enabled). Must use the `cron` schema. The job runs as
`postgres`, so it bypasses RLS — that is correct here.

Trade-off: 15-minute granularity means a session that ends at 10:00 IST may
still show as "upcoming" until 10:15 IST. Acceptable for this product.

### Option B — Database view layered on the time check

Create a view `bookings_with_effective_status` that computes:


```sql
CASE
  WHEN status = 'confirmed'
   AND (date::timestamp + time_slot::time + interval '1 hour')
       AT TIME ZONE 'Asia/Kolkata' <= now()
  THEN 'completed'
  ELSE status
END
```



Then point all read paths (Upcoming Sessions, Earnings, admin stats) at the
view. Existing writes still go to the underlying table.

Pros: zero scheduled jobs. Always correct on read.
Cons: every consumer must be migrated. The literal `bookings.status` column
still lies. Notifications, exports, and any third-party integration that
hits the raw table sees stale data.

### Option C — Client-side time check everywhere

Replicate the logic in `PostSessionNotesSection.tsx` across every consumer:
filter past `(date, time_slot)` rows out of "upcoming," count them as
"completed" on earnings, etc.

Pros: no DB change.
Cons: every page needs the same `Asia/Kolkata` clock logic. Drift between
pages is guaranteed. Admin stats can't be fixed this way (they're computed
in SQL via `admin_stats`). Not recommended.

## Risk assessment

Medium-high. Today, earnings UI shows ₹0 for every mentor, admin
`sessions_this_month` is always 0, and "Upcoming Sessions" can show sessions
that ended hours ago. None of these directly cause data loss, but several
silently misrepresent platform activity to mentors and to Divit as admin —
which is a credibility problem the moment a real mentor logs in.

The cron approach is low-risk to deploy because the `UPDATE` only touches
rows already past their session end time and the previous status is
`confirmed`; it can't undo a cancellation or modify future bookings.

## Tests that would prove the fix

1. Insert a booking with `(date, time_slot)` 2 hours in the past, status
   `confirmed`. After the cron interval, status must be `completed`.
2. Insert a booking 30 minutes in the future, status `confirmed`. After the
   cron interval, status must still be `confirmed`.
3. Insert a `cancelled` booking in the past. After the cron interval, status
   must remain `cancelled` (never auto-flip cancelled → completed).
4. Sanity-check that the mentor upcoming list excludes both completed and
   cancelled rows (`MentorUpcomingSessions.tsx:49` already filters on
   `status = 'confirmed'`).
5. After fix, the mentor's "This month" earnings card must reflect the price
   of every auto-completed booking.

Add a dev-seed alongside `supabase/dev-seeds/` that inserts one past-confirmed
and one future-confirmed row, then asserts post-cron state.

## Complexity estimate

Small — Option A is roughly a 30-line migration plus a one-time DBA enable of
`pg_cron`. Option B is a 1-day project across ~6 frontend files.

## Dependencies

- Tightly linked with Bug 6.6 (mentor dashboard showing past slots from
  earlier today as upcoming). Both bugs share a root cause: no one marks
  bookings completed when their time has passed. Fixing 6.1 with Option A
  also fixes 6.6 if the cron runs frequently enough.
- Loosely linked with Bug 6.5: any timestamp arithmetic added here needs to
  use IST consistently.
- Not blocked by Bug 6.2 (signup atomicity — already shipped).
