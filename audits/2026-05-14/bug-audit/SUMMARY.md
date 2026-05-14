# Bug Audit Summary — 2026-05-14

Seven bugs from the April 30 audit, ranked by recommended fix order.
"Cost" is rough engineer-days; "Impact" is product-visible severity
on a 1-5 scale.

## Ranked fix order

| # | Bug | Title | Impact | Cost | Why this order |
|---|-----|-------|--------|------|----------------|
| 1 | 6.4 | Errors fail silently in dashboards | 5 | 1.5d | Unblocks every other diagnosis. Without it, you cannot tell whether the other bugs are fixed in production. Founder-debuggability dividend. |
| 2 | 6.1 | Stale "Upcoming Sessions" / no auto-complete | 4 | 0.5d | One-line cron job. Fixes earnings ₹0, admin stats, and 6.6 as a side-effect. Highest leverage per hour. |
| 3 | 6.6 | Past slots on mentor dashboard | 3 | 0.25d | If 6.1's cron interval is 15 min, this becomes a 15-minute UI staleness window. Closing the rest is a 10-line client filter. |
| 4 | 6.5 | Timezone math uses local time | 3 | 1d | Lifts `todayInIst()` into a shared helper and fixes the `CURRENT_DATE` references in `get_mentor_calendar`. Prevents future regressions in the rest of this list. |
| 5 | 6.7 | No retry logic | 3 | 1d | Rides naturally on top of 6.4's error layer. Mobile-network UX win, especially on the conversion-critical calendar load. |
| 6 | 6.3 | Page flashes before redirect | 2 | 0.5d | Pure polish. Doesn't block anything. Lower priority than the correctness bugs above. |
| 7 | 6.8 | No "mark all as read" | 1 | 0.5h | Trivial. Could be done as a five-minute palate cleanser between bigger items, or batched with the next mentor-side touch. |

## Reasoning by cluster

### Cluster 1: "what is the system actually doing?" (6.4 → 6.1 → 6.6)
6.4 makes failures visible. 6.1 makes the data model honest about
which bookings are over. 6.6 cleans up the residual UI window.
Together these three are the single largest credibility bump per
hour of work — and they touch a small, predictable set of files.
**Ship this cluster first.**

### Cluster 2: "make the math right and the network resilient" (6.5 → 6.7)
6.5 codifies IST as the canonical clock and removes a class of
demo-only bugs. 6.7 adds the safety net so the same calendar / booking
flow that 6.1 and 6.4 fix is also tolerant of bad networks. Both
benefit from the error layer 6.4 establishes.

### Cluster 3: polish (6.3, 6.8)
Both visible, neither dangerous. Done together in a quiet afternoon.

## Cross-cutting recommendations

Three pieces of shared infrastructure would absorb most of the
follow-on work for the next round of audit findings:

1. **`src/lib/time.ts`** — `todayInIST`, `nowInIST`,
   `formatBookingDateTime`. Used by 6.1's cron tests, 6.5's
   replacements, 6.6's client filter, 6.8's `read_at` comparisons.
2. **`src/lib/data.ts`** — `withRetry` + a small `useFetch` hook
   wrapping the standard `{ data, error, isLoading, refetch }`
   contract. Used by 6.4 and 6.7 in tandem.
3. **A shared `requireRole` route-guard helper** — used by 6.3 and
   any future protected route.

None of these are mandatory for fixing the bugs individually, but
without them each fix re-introduces a small piece of the boilerplate
that originally produced the bug.

## Out-of-scope notes

- **Bug 6.2 (signup atomicity)** shipped in
  `supabase/migrations/20260514000001_bug6_2_signup_atomicity.sql`
  and is not re-audited here.
- The RLS audit (`../rls-audit.md`) found one tautology pattern
  already corrected by the demo-fix series, but documents a few
  remaining medium-risk patterns that should be tracked alongside
  these bugs.
- The codebase still has many `(supabase as any)` casts that
  bypass TypeScript's discriminated-union checks on Postgrest
  responses. Re-running `generate_typescript_types` and removing
  the casts would catch a long tail of latent silent-error sites
  similar to those documented in Bug 6.4. Not on this audit's
  scope but worth a future pass.
