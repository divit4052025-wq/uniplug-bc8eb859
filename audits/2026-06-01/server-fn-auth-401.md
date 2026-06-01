# Investigation — authenticated server fns 401 before running (booking + AI)

**Date:** 2026-06-01
**Branch:** `claude/fix-server-fn-auth-2026-06-01`
**Severity:** high (booking flow + all AI features unusable from the browser)
**Status:** fix implemented (client-side token send); not merged / not deployed

## Symptom

A logged-in student tapped a slot in `MentorCalendar` and the UI showed **"Could not start
payment."** No booking row was created (`bookings` stayed at 6, all legacy `completed`). The
same class of failure was the suspected cause of AI features 401'ing.

## What was ruled out

- **book_session / payments logic.** Direct SQL `book_session(...)` impersonating a
  consent-passing student against the seeded ₹0 slot returns `SUCCESS … status=confirmed`
  (verified, rolled back). `createBookingOrder`'s ₹0 short-circuit (`order.functions.ts:90-97`)
  is correct: it calls `book_session` first and, when the booking comes back `confirmed`,
  returns `{ok:true, confirmed:true}` **without** calling Razorpay — so a ₹0 booking does not
  need keys.
- **Date/slot format / timezone.** `get_mentor_calendar` returns `date:"2026-06-03"`,
  `time_slot:"14:00"` as plain strings; `MentorCalendar.tsx:104` forwards them unmodified
  (`date: slot.date, timeSlot: slot.time_slot`). No `Date`/tz transform on the path. The
  availability gate lives inside `book_session`, which never ran.

## Root cause

`requireSupabaseAuth` (`src/integrations/supabase/auth-middleware.ts`) was a **server-only**
function middleware. Its server phase requires `Authorization: Bearer <token>`:

- `auth-middleware.ts` server phase: `const authHeader = request.headers.get("authorization")`
  → `if (!authHeader) throw new Response("Unauthorized: No authorization header provided", {status:401})`.

But the browser invoked the gated server fns as bare calls — e.g.
`createBookingOrder({ data: {...} })` (`MentorCalendar.tsx:103`),
`generateMatchSuggestions({ data: {} })` (`TopPicksSection.tsx:30`) — and there was **no
client-side middleware, no global server-fn fetch wrapper, and no `createStart` function
middleware** anywhere in `src/` that attached the session token. So TanStack Start's server-fn
RPC fetch carried no `Authorization` header → the server phase **401'd before the fn body ran**.

On the client, that thrown 401 `Response` rejected the `createBookingOrder` promise;
`MentorCalendar.tsx:106-108` rethrew it, and because a `Response` has no `.reason`, the literal
fallback string **"Could not start payment."** was shown. Hence: payment-flavoured error, no
booking row, `book_session` never reached. The same gap affected every `requireSupabaseAuth`-
gated fn (payments + AI alike).

This is an **auth-wiring gap in the server-fn layer**, not a payments bug, and is independent of
env-var configuration (it 401s even with every Supabase env var correctly set). `ENV.md` had
misattributed the 401s to a missing `SUPABASE_PUBLISHABLE_KEY`; corrected in the same change.

## Fix

Add a **client phase** to the existing `requireSupabaseAuth` middleware (TanStack Start
`createMiddleware({type:"function"}).client(...).server(...)`), so a single edit covers every
gated server fn with no call-site churn and no change to the server gate:

```ts
.client(async ({ next }) => {
  let headers: HeadersInit | undefined;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers = { Authorization: `Bearer ${token}` };
  } catch {
    // no session (SSR / logged-out) → omit header; server gate 401s as designed
  }
  return next(headers ? { headers } : undefined);
})
```

Design choices:

- **Attach to `requireSupabaseAuth` itself**, not `createStart` global registration: all gated
  fns already `.middleware([requireSupabaseAuth])`, so the client phase auto-applies; it is
  statically obvious and needs no entry-point auto-discovery.
- **Fail open to no-header, never crash.** Logged-out / SSR has no session → send nothing and
  let the server gate 401 as designed. The server-side requirement is **not** weakened — this
  fixes the client to *send* the token, nothing else.
- **No change** to `book_session`, payments logic, the minor-consent gate, or any booking gate.

## Verification

- `tsc --noEmit` → 0 errors.
- `eslint .` → 0 errors (9 pre-existing warnings, none in `auth-middleware.ts`).
- Runtime booking re-test (signed-in browser) is deferred — not merged/deployed per scope; this
  branch is the code fix only.

## Files changed

- `src/integrations/supabase/auth-middleware.ts` — add client phase (token send); server gate
  unchanged.
- `ENV.md` — correct the `SUPABASE_PUBLISHABLE_KEY` 401 misattribution + add a
  "how the user token reaches the server" note.
- `audits/2026-06-01/server-fn-auth-401.md` — this note.
