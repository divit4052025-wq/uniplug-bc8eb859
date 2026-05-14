# Bug 6.7 — No retry logic on failed network calls

## Plain-English description

Every Supabase call in the codebase is a single one-shot fetch. A
transient network blip (mobile users on flaky 4G are the dominant
audience), a Supabase rate-limit hiccup, or a momentary 502 from
Cloudflare in front of the Postgrest gateway will cause an immediate
permanent failure with no auto-recovery. In combination with Bug 6.4
(silent error handling), the user experience is "the app looks empty
forever, no banner, no spinner, refresh the page if you remember to."

The most user-visible cases:
- A student opens the dashboard on the metro; the first fetch
  fails; every section is empty.
- A mentor toggles availability while a tunnel kills the radio for a
  second; the optimistic local toggle says the slot was set, but the
  DB write was dropped (`ScheduleSection.tsx:97-110` mutates state
  *before* awaiting the result, then doesn't handle the error).
- A booking confirmation fails partway through `MentorCalendar.onConfirm`
  with a 503; the user sees the generic error message and has to retry
  manually.

## Where the bug lives

Every Supabase call. Specific high-impact points:

- `src/components/calendar/MentorCalendar.tsx:58-79` (`loadCalendar`)
  and `:120-164` (`onConfirm`). Calendar load is the single most
  conversion-critical fetch in the app — failing it means the user
  cannot book. No retry on either path.
- `src/routes/dashboard.tsx:36-71`, `src/routes/mentor-dashboard.tsx:54-90`,
  `src/routes/admin.tsx:58-70` — auth/profile resolution is single-shot.
  A failure leaves the user stuck on the cream placeholder forever
  (loops with Bug 6.3).
- `src/lib/auth/role.ts:11-22` — two sequential SELECTs; either
  failing returns `"unknown"` and the user is silently routed to the
  student dashboard.
- `src/lib/email/booking.functions.ts` (referenced by
  `MentorCalendar.tsx:151`) — `sendBookingEmails` failure is caught
  and logged but never retried. Acceptable since the booking row is
  already saved, but the emails will be permanently missing.
- `src/components/dashboard/sections/MyDocumentsSection.tsx:60-83`
  uploads + inserts in a loop. If the storage upload succeeds and the
  DB insert fails on a transient error, the code correctly removes the
  storage object (line 79) but doesn't retry the whole pair.
- Every section file in `src/components/dashboard/sections/` and
  `src/components/mentor-dashboard/sections/` listed in the Bug 6.4
  report — none retry their reads.
- Toggle / write paths that pre-commit state optimistically:
  - `ScheduleSection.toggleSlot` at `:92-110`
  - `MySchoolsSection.add` / `.remove` at `:35-55`
  - `MyDocumentsSection.remove` at `:91-101`
  - `SessionNotesSection.toggle` at `:91-112`
  - `notifications.tsx markAsRead` at `:80-94` (this one *does* roll
    back on error — good template)

The `notifications.tsx` rollback pattern (revert state to `read_at: null`
on error) is the right baseline. The other optimistic-write paths above
do not have a rollback — they mutate, fire-and-forget the await, and
if it fails the user sees stale UI matching nothing in the DB.

## Root cause

There is no shared HTTP / Postgrest wrapper. Each call sits inline in
the component. Supabase JS client offers no built-in retry; if you want
retries you must implement them. Nobody implemented them.

A secondary cause: the read paths swallow errors (Bug 6.4), so even
when a retry would help, the surrounding code can't detect that there
was anything to retry.

## Proposed fixes

### Option A — Tiny retry helper, opt-in per call

Add `src/lib/retry.ts`:


```ts
export async function withRetry<T>(
  fn: () => Promise<{ data: T | null; error: unknown }>,
  opts?: { attempts?: number; baseMs?: number }
): Promise<{ data: T | null; error: unknown }> {
  const attempts = opts?.attempts ?? 3;
  const baseMs = opts?.baseMs ?? 200;
  let last: { data: T | null; error: unknown } = { data: null, error: null };
  for (let i = 0; i < attempts; i++) {
    last = await fn();
    if (!last.error) return last;
    // Only retry on transient classes (network error, 5xx) — bail on RLS / 4xx.
    if (!isTransient(last.error)) return last;
    await new Promise((r) => setTimeout(r, baseMs * 2 ** i));
  }
  return last;
}
```



Then wrap critical reads:

```ts
const { data, error } = await withRetry(() =>
  supabase.from("bookings").select(...).eq("student_id", studentId)
);
```



Pros: minimal scope, easy to opt-in incrementally. Doesn't change
auth or DB shape. Pairs well with Bug 6.4's error-handling work.
Cons: every call site must remember to use the helper; easy to miss.

### Option B — TanStack Query (or SWR) with `retry: 3`

If Bug 6.4 chooses Option C (TanStack Query), retries come for free
via the `retry` and `retryDelay` options. This is the cleanest long-
term answer.

Pros: declarative, applies to every query, also gives caching.
Cons: dependency add (forbidden by overnight task constraints, but
acceptable in a normal sprint). Larger surface to migrate.

### Option C — Service-worker offline retry queue

For *write* paths (booking creation, schedule toggles, mark-as-read),
the right answer might be a small write-through queue that persists
unsent mutations to IndexedDB and retries when online.

Pros: best UX on mobile / flaky networks.
Cons: significant complexity; probably overkill until paying
mentors complain.

### Option D — Surface a "Retry" button on error banners

If Bug 6.4 is fixed, every error banner can include a retry button
that re-runs the section's fetch. Cheap, manual, but covers the
common case.

Recommended path: ship Option A *and* Option D together. Reads use
`withRetry` quietly; writes show a banner with a retry button when
they fail. Migrate to Option B when TanStack Query lands.

## Risk assessment

Medium. For mobile users in metros, flaky connectivity is the norm.
The current behavior — silent empty state until manual refresh — is
the platonic ideal of a bad mobile UX. The fix doesn't carry any
hard-to-reverse risk; the only concern is amplifying load during an
actual outage by retrying every request three times. Bounded
exponential backoff (200ms × 2^i, max 3 attempts) caps the worst-case
fan-out at 1.4 seconds per request.

## Tests that would prove the fix

1. With `chrome://flags/#--throttling` or a custom mock fetch, fail
   the first response and succeed the second. The user should see no
   error banner; the data should appear after the retry.
2. Fail three responses in a row. The user must see an error banner
   with a "Try again" button.
3. RLS denial (403): must NOT retry — `isTransient` returns false for
   `PostgrestError.code === 'PGRST...'` or HTTP 401/403/404.
4. `MentorCalendar.onConfirm` with one transient 503: booking must
   eventually succeed without the user retrying. After three failures
   the user must see "Could not book session." (already wired) and
   the calendar must not double-insert when the retry happens to
   race the failing request — idempotency key on the insert would be
   nice but is out of scope.
5. Optimistic-write paths with rollback: `ScheduleSection.toggleSlot`
   must revert local state if all retries fail.

## Complexity estimate

Small for Option A: 1 helper, ~15 call sites to wrap (the most
critical ones), 0.5 day. Adding rollback to the optimistic-write
paths is another 0.5 day.

## Dependencies

- Best done after Bug 6.4. Without error surfacing, the retry layer
  is invisible — when retries do fail, the user still sees the empty
  state.
- Touches the same files as Bug 6.4. Coordinate the edits.
- Independent of Bugs 6.1, 6.3, 6.5, 6.6, 6.8.
