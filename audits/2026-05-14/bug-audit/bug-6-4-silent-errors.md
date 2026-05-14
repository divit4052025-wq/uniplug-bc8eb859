# Bug 6.4 — Errors fail silently in dashboards (DB failures show "no data" instead of an error state)

## Plain-English description

When a Supabase query fails (network outage, RLS denial, server 5xx,
malformed RPC payload), virtually every section component on every
dashboard ignores the `error` from the response and falls back to `data ??
[]`. The user sees the empty-state copy ("No upcoming sessions yet," "You
haven't found your Plug yet," "No earnings yet," "No documents uploaded
yet") instead of an error message. This is dangerous because:

- A student whose `students` row is missing sees the empty-state for
  every section forever, with no clue that the underlying request 403'd.
- A mentor whose session token has expired sees their entire dashboard go
  blank, looking like all their bookings disappeared.
- Engineers debugging production cannot tell from a user report whether
  the user genuinely has no data or whether their requests are 500ing —
  every report looks identical.

## Where the bug lives

This is a *pattern* repeated across the entire frontend. The diagnostic
that exposes it: nearly every section component destructures `{ data }`
from a Supabase response and discards `error`. Cases:

- `src/components/dashboard/sections/UpcomingSessionsSection.tsx:20-27`,
  `:30-32` — `const { data } = await supabase...`. No `error` binding.
  Falls through with `bookings = data ?? []`.
- `src/components/dashboard/sections/MyPlugsSection.tsx:14-24` —
  same pattern. `setPlugs([])` on miss.
- `src/components/dashboard/sections/MySchoolsSection.tsx:20-29` —
  same. Empty-state shown.
- `src/components/dashboard/sections/MyDocumentsSection.tsx:31-40` —
  the *list* read silently discards errors. Note that the upload paths
  *do* surface errors via `setError(...)` at `:64-65`, `:78-80` — so this
  file is partially correct.
- `src/components/dashboard/sections/SessionNotesSection.tsx:28-32`,
  `:47-55` — three parallel queries, all ignore their errors.
- `src/components/mentor-dashboard/sections/MentorUpcomingSessions.tsx:45-52`,
  `:57-58` — bookings and student-name RPC both ignore errors.
- `src/components/mentor-dashboard/sections/MyStudentsSection.tsx:37-42`,
  `:55-56`, `:69-78` — bookings, name RPC, overview RPC, completions
  query — none surface errors.
- `src/components/mentor-dashboard/sections/EarningsSection.tsx:23-29`,
  `:45-49`, `:60-67` — completed-bookings query, names query, payouts
  query — all silent.
- `src/components/mentor-dashboard/sections/ScheduleSection.tsx:37-41`,
  `:50-56`, `:61-64`, `:97-110` — availability load, bookings load, name
  RPC, and the toggle insert/delete. The toggle is particularly
  dangerous: if an INSERT or DELETE fails, local state is mutated as if
  it succeeded (`setSlots(prev => …)` at `:103` and `:108`), so the
  mentor thinks they have availability they don't.
- `src/components/mentor-dashboard/sections/PostSessionNotesSection.tsx:75-104`,
  `:108-152`, `:161-174` — load, loadPrevious, loadNote, all silent.
  The `save()` function at `:176-211` does surface errors via `toast.error`,
  so the write path is partially correct.
- `src/components/mentor-dashboard/sections/SettingsSection.tsx` — not
  re-read here but the same author/pattern is present.
- `src/routes/dashboard.tsx:58-67` — the student-profile lookup
  (`students` row) silently ignores errors. The first-name greeting will
  be empty if the read fails, no other signal.
- `src/routes/mentor-dashboard.tsx:75-83` — mentor profile lookup
  silently ignores errors. Goes into "Application received…"
  rejection-screen branch when `status` is null because no row was
  found, indistinguishable from a genuinely pending mentor.
- `src/routes/browse.tsx:68-79` — `list_approved_mentor_profiles` RPC
  error swallowed; users see "No mentors match those filters."
- `src/routes/mentor.$id.tsx:59-86` — every RPC silently falls back.
- `src/lib/auth/role.ts:11-22` — the role resolver eats errors from both
  the mentors and students lookups and returns `"unknown"`, which then
  silently falls through to the student dashboard in some callers.

Two places do correctly surface errors and serve as a template:

- `src/routes/notifications.tsx:72-77` — sets `error` state and
  renders a banner at `:114-125`.
- `src/components/calendar/MentorCalendar.tsx:64-79` — sets
  `loadError`, renders `<p>{loadError}</p>` at `:190-192`.
- `src/routes/admin.tsx:162-165`, `:184-187`, `:341-344` — uses `sonner`
  toast.error.

## Root cause

The Lovable-scaffold style of "destructure `{ data }`, push to state,
move on" was adopted across every section. There is no shared
data-fetching layer (no React Query, no SWR, no custom hook), so every
component reinvents the read path and only the most-recently-touched
components have learned to handle errors.

A secondary issue: the RPCs are typed as `any` (`(supabase as any).rpc`)
in many places, so TypeScript can't enforce the discriminated-union
shape that would force the developer to handle `error`.

## Proposed fixes

### Option A — Per-section error state (minimum bar)

For each section component, follow the `notifications.tsx` pattern:


```ts
const [error, setError] = useState<string | null>(null);
const { data, error: err } = await supabase.from(...)...;
if (err) {
  console.error("[section] load failed", err);
  setError("Could not load your sessions.");
  return;
}
setRows((data ?? []) as Row[]);
```



Render a small banner inside the section:
- yellow-bg + retry button on a soft failure (RLS / 404),
- red-bg + retry on a hard failure (500 / network),
- preserve the existing empty-state for a successful `[]` result.

Pros: localized blast radius, can ship section-by-section.
Cons: 12+ files to touch. Boilerplate everywhere. Easy to miss a path.

### Option B — Shared `useSupabaseQuery` hook

A custom hook that wraps the Supabase response in
`{ data, error, isLoading, refetch }` and surfaces `error` as part of the
hook contract. Components are then forced to handle the case because the
hook returns it.


```ts
function useSupabaseQuery<T>(key, fetcher) { ... }
const { data, error, isLoading, refetch } = useSupabaseQuery(
  ["upcoming", studentId],
  () => supabase.from("bookings").select(...).eq("student_id", studentId),
);
```



Pros: forces consistency. Pairs naturally with retry logic (Bug 6.7).
Cons: requires choosing a state-management direction (custom hook vs.
React Query). Migration is staged but slow.

### Option C — TanStack Query

The router already comes from `@tanstack/react-router` so adopting
`@tanstack/react-query` is the path of least friction. Each section
becomes a `useQuery({ queryKey: [...], queryFn: ... })` call. Errors
surface as `query.error`. Retries, caching, and refetching are free.

Pros: best long-term result; eliminates this entire class of bug and
also gives caching for free.
Cons: largest scope. Adds a dependency (acceptable given the task
rules don't prohibit *adding* dependencies — but the overnight task
rules forbid `npm install`, so this can't be done in this audit). Has
to be staged across multiple PRs.

## Risk assessment

High. This bug is silently masking the real failure mode of every section
in the app. Today, the user-visible symptom is "the app looks empty";
tomorrow, if Supabase has an outage or an RLS policy is tightened, every
user will see a perfectly empty product with no signal. From a founder
debugging perspective this is one of the worst classes of bug because
support tickets become impossible to triage.

Risk of *the fix* is low: adding error state to a section can't make
the data path worse, only better. The only concrete risk is showing a
red error banner during transient flicker between authenticated/
unauthenticated state on the first paint — gate the banner display
behind `ready` flags.

## Tests that would prove the fix

1. Smoke test per section: in dev, set `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   to an invalid value (or block the network) and load the dashboard.
   Each section must show an error banner, not the empty-state.
2. RLS denial: with a logged-in user whose `students.id` does not
   exist, the `UpcomingSessionsSection` query should return `[]` (RLS
   filters), which is correct behavior and should still render the
   empty-state.
3. Trigger-and-retry: clicking the "Try again" button in any error
   banner re-runs the fetch.
4. Storage / DB partial failures: in `MyDocumentsSection`, simulate
   upload success + DB insert failure. The storage object should be
   cleaned up (this is already done at line 79) AND an error message
   must remain visible (already correct at `:78-80`).
5. The Schedule toggle (`ScheduleSection.toggleSlot` at line 92) must
   either roll back optimistic state on error or surface an error.

## Complexity estimate

Large in aggregate, small per file. Option A across all 12 files is
about 1.5-2 days of careful work. Option C is 3-5 days but pays
compounding dividends.

## Dependencies

- Pairs naturally with Bug 6.7 (retry logic). Any shared error layer
  is the right home for retry behavior, so doing 6.4 first lets 6.7
  ride on top.
- Bug 6.5 (timezone) fixes are write-side too — those errors should
  also surface, so Option A or B should be in place first.
- Independent of Bugs 6.1, 6.3, 6.6, 6.8.
