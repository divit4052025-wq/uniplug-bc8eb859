# Bug 6.6 — Past slots from earlier today still show as upcoming on mentor dashboard

## Plain-English description

On the mentor dashboard, "Upcoming Sessions" shows any confirmed booking
whose `date >= todayInIst()`. The query checks the date only — it does
not check the time-of-day. So a confirmed session at **today 09:00 IST**
remains on the list at **today 15:00 IST**, even though the session is
already over.

The student-side equivalent has the same shape (Bug 6.1 and Bug 6.5
covered it), but the mentor surface is what the audit naming calls out
specifically because:
- Mentors keep coming back to the dashboard during the day, while
  students typically check once before their session.
- The mentor's mental model is "this list is what I have left to do
  today" — finding a finished session still on it erodes trust quickly.

Calling out **Demo Fix 4** (`20260429000001`–`20260430000004` series):
the prior fix removed *past dates* (yesterday and earlier) from the
mentor list. The "today + earlier hour" case was not addressed.

## Where the bug lives

- `src/components/mentor-dashboard/sections/MentorUpcomingSessions.tsx:44-52`:
  ```ts
  const { data } = await (supabase as any)
    .from("bookings")
    .select("id, date, time_slot, student_id")
    .eq("mentor_id", mentorId)
    .eq("status", "confirmed")
    .gte("date", todayInIst())
    .order("date", { ascending: true })
    .order("time_slot", { ascending: true });
  ```
  No `time_slot` filter. `todayInIst()` at line 20 is IST-correct (good),
  so the issue is purely the missing within-today check.

- Same pattern on the student side at
  `src/components/dashboard/sections/UpcomingSessionsSection.tsx:20-27`,
  but using a local-time `today` (see Bug 6.5).

- The backend `get_mentor_calendar` *does* filter past slots within
  today correctly (`supabase/migrations/20260430000005_demo_fix_calendar_past_slots.sql:58-63`)
  — but that function is consumed by `MentorCalendar` for *students
  browsing a mentor's availability*, not by the mentor's own
  Upcoming Sessions list.

## Root cause

The query gates on the date column only. The `time_slot` column is a
text field like `"14:00"` and the SQL filter would need to compare it
against the current IST hour, which is awkward but doable. The
frontend never attempted this comparison — likely because the original
mental model of "today's sessions" matched the demo case where every
session was always in the future, and the past-today case wasn't a
visible issue until the demo bake-off.

## Proposed fixes

### Option A — Filter past slots client-side after the query


```ts
const now = new Date();
const today = todayInIst();
const hourCutoff = Number(currentIstHour()); // e.g. 15
const rows = (data ?? []).filter(b => {
  if (b.date > today) return true;
  if (b.date < today) return false;
  // same day — compare hour
  const hour = parseInt(b.time_slot.split(":")[0], 10);
  return hour > hourCutoff;
});
```



Pros: localized fix, no SQL change, easy to roll back.
Cons: only mentor-side; symmetric student-side fix is still required
(Bug 6.1 covers that case). Bandwidth-wasteful — fetches a few rows
the user won't see.

### Option B — RPC that returns "true upcoming" sessions

Introduce `get_upcoming_sessions_for_mentor(_mentor_id uuid)` and the
student equivalent. The RPC runs `SECURITY DEFINER` with `auth.uid()`
gate and joins the date/time comparison in SQL:


```sql
WHERE date > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
   OR (
        date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
    AND time_slot > to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata', 'HH24:00')
   )
```



Pros: matches the calendar RPC pattern that's already in the codebase
and is the canonical solution. Centralizes the IST math in SQL.
Cons: migration + RPC + frontend rewire. ~3 files of churn.

### Option C — Wait for Bug 6.1 cron

If Bug 6.1 (auto-complete cron) ships, every past-today session at
the cron interval will flip to `status = 'completed'` and naturally
drop out of the `status = 'confirmed'` filter. The window between
session end and cron run (worst-case 15 min) would still be wrong.

Pros: zero direct work for Bug 6.6 if Bug 6.1 lands first.
Cons: 15-minute UI staleness window. For a non-paying demo
audience that's fine; for paying mentors it's bad polish.

Recommendation: ship **Option C + Option A** together. Cron handles
the "after the session ended" semantic; the client-side filter
removes the in-flight session from the upcoming list once the start
hour has passed.

## Risk assessment

Low-medium. Visible to every active mentor during their workday.
Doesn't cause data loss or security issues — just looks broken.

## Tests that would prove the fix

1. Seed a booking for today, two hours in the past, status confirmed,
   `mentor_id = current user`. Load the mentor dashboard at the
   current IST hour. The booking must not appear in Upcoming Sessions.
2. Seed a booking for today, three hours in the future. Must appear
   in Upcoming Sessions.
3. Seed a booking for tomorrow. Must appear.
4. Seed a booking for yesterday. Must not appear (already filtered
   by existing demo fix).
5. Boundary: a booking whose `time_slot = "HH:00"` where `HH` is the
   current IST hour — within the session — should still appear,
   because the session is ongoing. (See `DURATION_MINUTES = 60` in
   `MentorCalendar.tsx:21`.) Test that the cutoff is "start_hour > now",
   not "start_hour >= now."

## Complexity estimate

Small. Option A is 10 minutes plus testing. Option B is ~1 hour for
the migration plus rewire. Option C requires waiting on Bug 6.1.

## Dependencies

- Tightly linked with Bug 6.1 (auto-complete cron). Fixing 6.1 with
  a frequent cron interval reduces the impact of 6.6 to a 15-minute
  drift window.
- Linked with Bug 6.5: the time helper used here must be IST-aware.
- Independent of Bugs 6.3, 6.4, 6.7, 6.8.
