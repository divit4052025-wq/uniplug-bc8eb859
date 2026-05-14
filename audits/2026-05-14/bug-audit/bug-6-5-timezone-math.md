# Bug 6.5 — Timezone math uses local time instead of IST in some queries

## Plain-English description

Uniplug's primary user base is in India. The DB stores `bookings.date` as a
PostgreSQL `date` and `bookings.time_slot` as text like `"14:00"`, with the
*implicit* convention that these refer to **IST (Asia/Kolkata, UTC+5:30)**.
Several frontend files compute "today" from the browser's local clock
instead of IST, so a user in any other timezone — including a mentor
traveling, an admin in the EU on a test pass, or a user whose device clock
is wrong — sees the wrong day's data, and a few SQL paths reference
`CURRENT_DATE` or `now()` in the postgres session's timezone, which on
Supabase is UTC.

The bug pattern produces visible artifacts at the day boundary:
- Between midnight UTC (5:30 AM IST) and 5:30 AM IST, `CURRENT_DATE` in
  Postgres has already rolled forward to "today UTC" while the user's
  view of "today IST" is still yesterday. A booking for 8:00 IST that
  morning may inappropriately be filtered out of the upcoming list, or
  the past slots may be drawn into the upcoming list.
- Between 6:30 PM IST and midnight IST (and the symmetric window on the
  west of IST), a user whose machine is set to a western timezone sees
  "yesterday IST" as today.

## Where the bug lives

### Frontend — local-time "today" used for IST-stored data

- `src/components/dashboard/sections/UpcomingSessionsSection.tsx:18-19`:
  ```ts
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  ```
  Uses the *browser's* local date. A student visiting the dashboard at
  4 AM IST from a phone whose timezone is "Asia/Dubai" sees a different
  "today" than the same student on a phone in Kolkata.

- `src/components/mentor-dashboard/sections/PostSessionNotesSection.tsx:82-86`:
  ```ts
  const now = new Date();
  const past = (data ?? []).filter((b) => {
    const dt = new Date(`${b.date}T${(b.time_slot ?? "00:00").slice(0, 5)}:00`);
    return dt.getTime() <= now.getTime();
  });
  ```
  Constructs `Date` from the booking's `YYYY-MM-DDTHH:MM` *with no
  timezone suffix*. JavaScript interprets this as local time. So
  "10:00 on 2026-05-14" on a US-Eastern device means 10:00 EDT
  = 7:30 PM IST. The "past" filter therefore behaves differently in
  every timezone.

- `src/components/mentor-dashboard/sections/EarningsSection.tsx:31-32`,
  `:37`:
  ```ts
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  ...
  if (new Date(s.date + "T00:00:00") >= monthStart) mo += s.price;
  ```
  Same problem: local-time month boundary; the booking date is
  interpreted as local-time midnight, then compared against local-month
  start. For a mentor in the US viewing earnings around the start of
  the month, a booking on May 1 IST might be attributed to April.

- `src/components/mentor-dashboard/sections/ScheduleSection.tsx:17-23`
  (`startOfWeekMonday`) and `:45-49` (`weekStartStr` /
  `weekEndStr` derived via `toISOString().slice(0, 10)`).
  - `toISOString()` always returns UTC, so a Monday-IST week boundary
    computed via `toISOString` slices the UTC date, which is shifted by
    5:30 hours. On Monday morning IST before 5:30 AM, the slice still
    returns Sunday UTC, and the calendar misses the week's bookings.

- `src/components/dashboard/DashboardTopbar.tsx:13-14`:
  ```ts
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  ```
  Cosmetic only — the greeting is wrong by a few hours for users not in
  IST. Low severity but it betrays the same root pattern.

- Multiple `toLocaleDateString(undefined, ...)` calls scattered across
  components: `UpcomingSessionsSection.tsx:60`, `MentorUpcomingSessions.tsx:110`,
  `MyStudentsSection.tsx:131`, `EarningsSection.tsx:80`, `:105`,
  `PostSessionNotesSection.tsx:257`, `:356`, `SessionNotesSection.tsx:60`,
  `:134`, `:182`, `notifications.tsx:30`, `mentor.$id.tsx:229`,
  `admin.tsx:222`, `:295`, `:319`, `:364`, `:408`,
  `MyDocumentsSection.tsx:167`. None of these pass an explicit `timeZone`,
  so the displayed weekday/day can be off by one near midnight IST for
  any user not on an IST-tz device.

### Backend — Postgres `CURRENT_DATE` is UTC

- `supabase/migrations/20260430000005_demo_fix_calendar_past_slots.sql:59-63`:
  ```sql
  WHERE (
    s.date > CURRENT_DATE
    OR (
      s.date    = CURRENT_DATE
      AND s.time_slot > to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata', 'HH24:00')
    )
  )
  ```
  The time-of-day comparison is correctly converted to IST, but
  `CURRENT_DATE` is **not** — it's evaluated in the session's
  configured timezone. On Supabase that's UTC. So between 18:30 and
  23:59 IST, `CURRENT_DATE` is still "yesterday UTC," meaning the
  calendar incorrectly excludes today's remaining slots from the
  results (the `s.date = CURRENT_DATE` branch is never satisfied for
  today's IST date).
  And between 00:00 and 05:30 IST, `CURRENT_DATE` is already today UTC
  = today IST. So the asymmetry is concrete: roughly 5.5 hours per
  IST evening where today's after-now slots disappear from the
  calendar early.
  - Same problem applies to `_from_date date DEFAULT CURRENT_DATE` at
    line 11, used to anchor the 30-day window.

- `supabase/migrations/20260429000002_bug4_get_mentor_calendar.sql:13`
  (the predecessor of the above) is superseded but worth noting if
  any other path imports it.

### Backend functions that are timezone-correct

- `MentorUpcomingSessions.todayInIst()` at
  `src/components/mentor-dashboard/sections/MentorUpcomingSessions.tsx:20-27`
  correctly uses `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", ... })`.
  This is the canonical implementation that should be lifted to a
  shared helper.

## Root cause

There is no shared "today in IST" helper. Each component invents its own
date math. The Postgres functions assume `CURRENT_DATE` matches the
client's notion of "today" — which it does in IST-tz Postgres sessions
but not in UTC Supabase.

## Proposed fixes

### Option A — Treat IST as the canonical timezone everywhere

1. Add `src/lib/time.ts` exporting:
   - `todayInIST(): string` (YYYY-MM-DD format) — extract the
     `MentorUpcomingSessions.todayInIst` implementation.
   - `nowInISTMillis(): number`
   - `formatBookingDate(dateStr: string, timeSlot?: string): string` —
     wraps `toLocaleDateString` with `{ timeZone: "Asia/Kolkata" }`.
2. Replace every local-time computation with calls to these helpers.
3. In `get_mentor_calendar` migration, change every `CURRENT_DATE` to
   `(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date` and update
   the default for `_from_date` accordingly.

Pros: single source of truth. Easy to enforce in code review.
Cons: ~12 frontend files to update, one migration to write.

### Option B — Set the Postgres session timezone to IST

Run `ALTER DATABASE postgres SET TIMEZONE = 'Asia/Kolkata';` so that
`CURRENT_DATE`, `now()`, and `CURRENT_TIMESTAMP` are all IST. This
fixes the SQL side immediately without touching individual migrations.

Pros: smallest backend diff.
Cons: implicit; future engineers won't notice. Postgres `timestamptz`
values still print in UTC unless you cast — so the implicit promise is
fragile.

Recommended combination: do **both** Option A (frontend) and the
explicit IST cast (the AT TIME ZONE in SQL), don't rely on session
timezone. Future engineers reading the SQL should see "Asia/Kolkata"
in the code, not implicitly inherited from session state.

## Risk assessment

Medium. Most users are in IST today, so the bug rarely manifests for
real users. But:
- Founder demos and tests run from the EU/UK at odd hours — that's
  exactly when the bug bites.
- The 18:30-23:59 IST window on the mentor calendar is a 5.5-hour
  daily slice where slots disappear from the calendar. Real users
  *do* book in evening IST.
- Once the booking auto-complete cron (Bug 6.1) is shipped, it will
  also need IST-correct math; getting the helper in place first
  prevents another reincarnation of this bug.

## Tests that would prove the fix

1. Run the dev server with `TZ=America/Los_Angeles npm run dev` and
   confirm that `Upcoming Sessions` shows the same bookings as
   `TZ=Asia/Kolkata`. (Affects both student and mentor dashboards.)
2. Postgres: `SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date`
   between 18:30 and 23:59 IST should produce a date one day later
   than `SELECT CURRENT_DATE` — call `get_mentor_calendar` and verify
   that today's after-now slots are present in the response during
   that window. Pre-fix this is broken; post-fix it must pass.
3. EarningsSection: a mentor with bookings dated May 1 IST should see
   May 1 attributed to May, regardless of browser tz.
4. ScheduleSection: a mentor on a US-Eastern device opening the
   schedule at 09:00 EDT (which is 18:30 IST) should see the IST week
   of bookings.

## Complexity estimate

Medium. Helper module is small; migration is small; the work is in
finding and replacing every `new Date()`-derived local-time
expression. About 1 day with careful grep + tests.

## Dependencies

- Pairs with Bug 6.6 (mentor "past today" slots) — same root cause
  cluster. Fix 6.5 first so 6.6 has a helper to use.
- Pairs with Bug 6.1 (auto-complete cron) — the cron's
  past-versus-future test must be IST-correct.
- Touches the same migration as `get_mentor_calendar`, which has been
  amended twice already — be cautious about merging concurrent edits.
