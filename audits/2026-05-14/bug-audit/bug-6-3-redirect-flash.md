# Bug 6.3 — Page flashes briefly before redirect on unauthorized routes

## Plain-English description

When an unauthenticated visitor (or a user with the wrong role) opens a
protected page — `/dashboard`, `/mentor-dashboard`, `/admin`, `/browse`,
`/mentor/$id`, `/notifications`, `/session-notes`, `/session-notes/$noteId`,
`/progress` — the page renders briefly before the auth check resolves and
the redirect fires. On a slow network the page can be visible for hundreds
of milliseconds before vanishing.

The effect is most jarring on:

- `/mentor-dashboard`: a student gets a flash of the topbar / sidebar
  scaffolding before bouncing to `/dashboard`.
- `/admin`: any logged-in non-admin user briefly sees the admin shell before
  going to `/login`.
- `/notifications`: students briefly see the notification page (mentor-only)
  before bouncing.

## Where the bug lives

The pattern is consistent across the codebase: a route component renders, an
empty placeholder is shown while a `useEffect` awaits `supabase.auth.getSession()`,
the placeholder is replaced by either the real page or a `navigate(...)` call.

- `src/routes/dashboard.tsx:36-71` and `:88-90`. The placeholder is
  `<div className="min-h-screen bg-[#FFFCFB]" />` while `ready` is false. The
  redirect to `/student-signup`, `/admin`, or `/mentor-dashboard` is dispatched
  *inside* the same effect, so the placeholder is what flashes — that part is
  fine. But the effect *also* makes two awaited DB calls (`resolveUserRole`
  hits `mentors` then `students` — `src/lib/auth/role.ts:11-23`) before
  navigating, so the flash window is long.
- `src/routes/mentor-dashboard.tsx:54-90` and `:103-105`. Same pattern,
  same two-roundtrip role check.
- `src/routes/admin.tsx:58-70` and `:77`. Single getSession check, then a
  `navigate({ to: "/login" })` if the email mismatches. Placeholder is the
  empty shell.
- `src/routes/notifications.tsx:43-64` and `:96`. Two roundtrips
  (`getSession` + `resolveUserRole`) before potential redirect.
- `src/routes/browse.tsx:61-83` and `:114`. Single roundtrip then
  `navigate({ to: "/student-signup" })`.
- `src/routes/mentor.$id.tsx:52-89` and `:97`. Single roundtrip then
  `navigate({ to: "/login" })`.
- `src/routes/session-notes.tsx`, `src/routes/session-notes.$noteId.tsx`,
  `src/routes/progress.tsx` — same pattern; not re-quoted here but verified
  by grep on `auth.getSession`.

## Root cause

Two compounding issues:

1. **Client-side gating instead of SSR / loader gating.** TanStack Start
   supports `beforeLoad` / `loader` route guards that can resolve the
   session and redirect *before* the route component is mounted on the
   client. None of these routes use `beforeLoad`. Instead each route
   defines `component:` only — the gate runs inside `useEffect` after
   mount, by which time the route has already taken over the viewport.

2. **`resolveUserRole` does two sequential SELECTs** (`src/lib/auth/role.ts:11-22`)
   — mentors first, then students. On a typical connection this adds
   ~150-400 ms before the redirect decision is made. Even if the gate
   *were* in a loader, the round-trip would still produce a visible spinner.

The placeholder element (`<div className="min-h-screen bg-[#FFFCFB]" />`)
is empty, so what actually "flashes" is the previous page (if the user
navigated client-side) plus the topbar/sidebar of the new route as the
real component mounts after `setReady(true)` — except that `setReady` is
only ever set in the *allowed* path, so unauthorized users never reach
the real markup. **The flash they see is the empty cream-colored
placeholder for a few hundred ms,** which feels like an unstyled flash
because the URL bar shows the new path but the page is blank.

This is less severe than a real "page renders then disappears" flash, but
it still produces a visible blink and on a hard refresh it's a blank cream
screen for ~300 ms.

## Proposed fixes

### Option A — TanStack `beforeLoad` route guard (recommended)

For each protected route, add a `beforeLoad` that resolves the session and
throws a `redirect()` before the component mounts. Example for
`/mentor-dashboard`:


```ts
export const Route = createFileRoute("/mentor-dashboard")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) throw redirect({ to: "/mentor-signup" });
    const role = await resolveUserRole(session.user.id, session.user.email);
    if (role === "admin") throw redirect({ to: "/admin" });
    if (role === "student") throw redirect({ to: "/dashboard" });
  },
  component: MentorDashboard,
});
```



This eliminates the flash entirely on client-side navigations; on a hard
refresh the previous URL stays in the address bar until the redirect
resolves, which is the standard UX for SSR auth gates.

Pros: zero placeholder flash, correct UX, no new dependencies.
Cons: requires careful refactor of every protected route — about 8 files.
Also requires the `supabase` client to be usable in `beforeLoad` (it is —
it's the same browser client that already runs in `useEffect`).

### Option B — Cache the role in `auth.user_metadata` or `students.id` / `mentors.id`

Drop the second sequential SELECT in `resolveUserRole`. After signup,
`auth.users.user_metadata.role` already records `"student"` or `"mentor"`
(`src/routes/student-signup.tsx:75-83` and a similar mentor-signup write).
Use that as the first source of truth and only fall through to the DB on
miss.

This shortens the gate window but doesn't eliminate the flash. Pair with
Option A for full effect.

### Option C — Render a real skeleton instead of an empty `<div>`

A loading skeleton (logo + sidebar shell + cream background) makes the
delay feel like loading state rather than a broken page. Pure UX
mitigation, doesn't fix the underlying race.

## Risk assessment

Low. The bug is purely cosmetic — RLS prevents unauthorized users from
seeing data, and the redirect always fires once the session resolves. The
flash is annoying, not unsafe.

The Option A refactor carries some risk because `beforeLoad` errors must
be handled differently than `useEffect` redirects, and any mistake could
infinite-loop a redirect (e.g. `/dashboard` redirects to `/mentor-dashboard`
which redirects back). The fix needs an integration test covering each
of the four user states (signed-out, student, mentor, admin) × each of
the protected routes.

## Tests that would prove the fix

1. With network throttling set to "Slow 3G," hard-refresh
   `/mentor-dashboard` while signed in as a student. After fix, the
   address bar must navigate to `/dashboard` before any
   `<MentorSidebar>` or `<DashboardTopbar>` paints. Record video / use
   Playwright `page.waitForRequest` to assert the redirect URL change
   precedes any DOM mutation under `<main>`.
2. Same for `/admin` while signed in as a student.
3. Signed-out, hard-refresh `/dashboard`. Address bar must reach
   `/student-signup` with no flash of the cream placeholder.
4. Authenticated correctly — no regression: a student hard-refreshing
   `/dashboard` must see the real dashboard within one paint of the route
   mounting.
5. No redirect loops between any pair of protected routes.

## Complexity estimate

Medium. About 8 routes to refactor, 1 helper to lift (`requireRole`), and
a smoke-test suite to add. Half a day for one engineer, including
verification.

## Dependencies

- Independent. Can be done at any time.
- Touches `src/lib/auth/role.ts` — if Bug 6.4 (silent errors) is fixed
  concurrently, those edits will overlap there.
- Not blocked by anything.
