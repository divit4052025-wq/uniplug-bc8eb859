# RLS Policy Audit — 2026-05-14

Audit of every Row Level Security policy on the live Supabase project
(`ncfhmbugjeuerchleegq`, region `ap-northeast-1`, Postgres 17.6) cross-
referenced against `supabase/migrations/*.sql`. The live policies were
read via `SELECT * FROM pg_policies` on the project; the migration
audit covered all 22 files in `supabase/migrations/`.

## Headline numbers

| Metric | Value |
| --- | --- |
| Total deployed policies | **40** (33 in `public`, 7 in `storage.objects`) |
| Tables with RLS enabled in `public` | 13 / 13 |
| Tables with `relforcerowsecurity = true` | 0 / 13 |
| Migration-vs-live policy drift | none (every live policy is in a migration) |
| Tautologically-true policies | **0** in current deployment |
| Policies with paired rejection tests | **0** |
| `SECURITY DEFINER` functions backing RLS-bypassing reads | 17 |

The April 30 demo discovered one tautological `WITH CHECK` on a
`bookings` UPDATE policy
(`supabase/migrations/20260430000003_demo_fix_bookings_mentor_update.sql`).
It was replaced by the `update_booking_status_as_mentor` RPC
(`20260430000004_demo_fix_bookings_mentor_update_rpc.sql`) and the
broken policy was dropped. No tautological policies remain.

## Policy count by table

| Table | SELECT | INSERT | UPDATE | DELETE | Total | RLS forced |
| --- | --- | --- | --- | --- | --- | --- |
| `action_point_completions` | 2 | 1 | 1 | 0 | 4 | no |
| `bookings` | 2 | 1 | 1 | 0 | 4 | no |
| `mentor_availability` | 1 | 1 | 0 | 1 | 3 | no |
| `mentor_payouts` | 1 | 0 | 0 | 0 | 1 | no |
| `mentors` | 1 | 1 | 1 | 0 | 3 | no |
| `notifications` | 1 | 0 | 1 | 0 | 2 | no |
| `reviews` | 1 | 1 | 1 | 1 | 4 | no |
| `session_action_points` | 1 | 1 | 1 | 1 | 4 | no |
| `session_notes` | 1 | 1 | 1 | 1 | 4 | no |
| `sessions` (legacy) | 1 | 1 | 1 | 0 | 3 | no |
| `student_documents` | 1 | 1 | 0 | 1 | 3 | no |
| `student_schools` | 1 | 1 | 1 | 1 | 4 | no |
| `students` | 1 | 1 | 1 | 0 | 3 | no |
| `storage.objects` | 3 | 2 | 1 | 2 | 8 | — |

`student_documents` and `students` have no UPDATE/DELETE pair — UPDATE is
absent so documents can't be renamed without delete+recreate, and
students can never be deleted directly (only via `auth.users` cascade).
`mentor_payouts` has only SELECT — writes go through admin/service_role.

## Top 5 highest-risk policies

Risk is judged on the combination of "what an attacker could do with a
valid logged-in session by directly calling Supabase" and "how much
the app implicitly relies on the policy."

### Risk 1 (HIGH) — `session_notes.Mentor insert notes`
`WITH CHECK (auth.uid() = mentor_id)`
*Migration: `20260425101339_8c6bc983-82f7-4718-b321-f1aef1725143.sql:49`*

The policy ensures only the authenticated mentor can author a note —
but it does not verify that the `student_id` in the new row corresponds
to a real booking between that mentor and that student. A malicious
mentor could insert a session note containing arbitrary text against
*any* student UUID. The student-side SELECT policy will then surface
that note to the targeted student under the mentor's name, and they
would have no way to tell it's fraudulent.

The frontend (`PostSessionNotesSection.tsx`) always picks the
`student_id` from a booking row, so this path is correct *in app
code* — but RLS is the security boundary, and the boundary is open.

**Recommended action: fix.** Add an `EXISTS(...)` check in
`WITH CHECK` that requires a confirmed/completed booking between the
caller and the asserted `student_id`. Same fix for the UPDATE policy
(`Mentor update notes`).

### Risk 2 (HIGH) — `session_action_points.Mentor insert action points`
`WITH CHECK (auth.uid() = mentor_id)`
*Migration: `20260425101339_*.sql:65`*

Same shape as Risk 1: only verifies the actor is the mentor, not that
the (mentor, student) pair is bound by a booking. Same remediation.

Note: the live frontend stopped using this table — action points now
live in `session_notes.action_points` as a `jsonb` array
(`20260425161613_*.sql:3-7`). The `session_action_points` table is
effectively legacy. **Removing the table entirely** is safer than
adding a paired check.

### Risk 3 (HIGH) — `action_point_completions.Students insert own completions`
`WITH CHECK (auth.uid() = student_id)`
*Migration: `20260425161613_*.sql:34-37`*

Allows a student to insert a completion row for *any* `session_note_id`,
including notes belonging to other students. The unique index
`(session_note_id, action_point_index)` would let one student mark
the completion state for *another* student's session note. The SELECT
policy then restricts viewing to `auth.uid() = student_id`, so the
attacker can't see the effect — but they can write spurious rows.

Today the rows have no business effect outside the original student's
view (the mentor reads via `Mentors view completions for their notes`
which filters on note ownership, so the spurious row would surface to
a mentor's UI under the attacker's `student_id`, which is wrong).

**Recommended action: fix.** Add `EXISTS (SELECT 1 FROM session_notes n
WHERE n.id = session_note_id AND n.student_id = auth.uid())` to the
WITH CHECK. Same for the UPDATE policy.

### Risk 4 (MEDIUM-HIGH) — `bookings.Students can create own bookings`
`WITH CHECK (auth.uid() = student_id)`
*Migration: `20260425103823_*.sql:29-33`*

Three holes:

1. **No mentor approval check.** A student can book a mentor whose
   `status = 'pending'` or `'rejected'`. The frontend gates via
   `list_approved_mentor_profiles`, but a determined caller can bypass
   the frontend.
2. **No availability check.** Insert succeeds even if the mentor has no
   `mentor_availability` row for that day/hour. The unique index
   `bookings_confirmed_slot_unique` only prevents *double*-booking the
   same slot — it doesn't enforce that the slot was advertised.
3. **Client-controlled price.** The `price` column is a free integer.
   A student could insert `price = 1` to underpay (no payment flow
   is wired up today, so this is currently inert — but it's a
   structural problem).

**Recommended action: fix.** Replace the policy with an `INSERT`-only
RPC `book_session(_mentor_id, _date, _time_slot)` that validates
mentor status, availability, and reads the price from `mentors.price_inr`.
Remove the direct INSERT policy. Tracked as a follow-up; not blocking.

### Risk 5 (MEDIUM) — `reviews.Students insert own reviews`
`WITH CHECK (auth.uid() = student_id)`
*Migration: `20260425130746_*.sql:16-18`*

A student can review any mentor without ever having booked a session.
Today the SELECT policy is `USING (true)` for any authenticated user,
so a fake five-star review would show up on the mentor's public profile
to every browsing student. Combined with the next paragraph about
`reviews.SELECT USING (true)`, the mentor's perceived rating is
forgeable.

**Recommended action: fix.** Add an `EXISTS` over `bookings` requiring
a `completed` booking between the (student, mentor) pair. Same fix for
the UPDATE policy.

## Per-table policy reference

### `students`
- `Students can view own row` — SELECT, authenticated, `auth.uid() = id`. Allows self-read. Forbids other students/mentors. **Low risk, keep.**
- `Students can insert own row` — INSERT, authenticated, `WITH CHECK auth.uid() = id`. Legacy: profile creation is now done by the `handle_new_user` trigger as `SECURITY DEFINER`, so this policy is effectively dead code. **Low risk, keep** as a belt-and-suspenders against trigger removal.
- `Students can update own row` — UPDATE, authenticated, `auth.uid() = id`. No `WITH CHECK`, so a student could not change `id` (the row identity), but could still rewrite `email`, `phone`, `school`, `grade`, `countries`. That's intentional today; consider locking `email` if it's ever used for billing.
- No DELETE policy. Self-delete impossible; cleanup happens via `auth.users` CASCADE only. **Acceptable.**

### `mentors`
- `Mentors can view own row` / `Mentors can insert own row` / `Mentors can update own row` — same shape as `students`. Note: a mentor can UPDATE their own `status` column (the policy doesn't restrict columns), but the column type is `mentor_status` ENUM, so the worst they can do is set themselves to `approved`. **Medium risk** — a pending mentor could approve themselves by writing `UPDATE mentors SET status='approved' WHERE id = auth.uid()`. The frontend only writes profile fields, but RLS doesn't block self-approval. **Recommend fix:** narrow the UPDATE policy WITH CHECK to forbid changing `status`.

### `bookings`
- `Students can view own bookings` — SELECT, `auth.uid() = student_id`. **Low, keep.**
- `Mentors can view their bookings` — SELECT, `auth.uid() = mentor_id`. **Low, keep.**
- `Students can create own bookings` — see Risk 4 above.
- `Students can cancel own confirmed bookings` — UPDATE, `auth.uid() = student_id AND status = 'confirmed'`, WITH CHECK `auth.uid() = student_id AND status = 'cancelled'`. This is a well-formed transition policy: only allows status flip from confirmed → cancelled. Still doesn't prevent mutation of `date`, `time_slot`, `price`, etc. **Medium risk** — narrow WITH CHECK to require column-immutability via a trigger (the policy form for that was the one that caused the tautology in the demo; use a `BEFORE UPDATE` trigger instead).
- No mentor UPDATE policy — by design, mentors must use `update_booking_status_as_mentor` RPC.

### `mentor_availability`
- `Authenticated users view mentor availability` — SELECT, `USING (true)`. **Note: this is a deliberate `true` policy** (added in `20260425103901_*.sql`) so the booking widget can see other mentors' availability. The RPC `get_mentor_calendar` doesn't actually need it because it's SECURITY DEFINER, but other code paths might. Today only `ScheduleSection` reads availability directly — and only for the caller's own mentor_id. **Recommend: tighten to `auth.uid() = mentor_id`** and rely on `get_mentor_calendar` for cross-user reads. Saves enumeration of every mentor's schedule.
- `Mentors insert own availability` / `Mentors delete own availability` — `auth.uid() = mentor_id`. **Low, keep.**
- No UPDATE policy. Toggle is delete+insert. Slightly wasteful but harmless.

### `mentor_payouts`
- `Mentor view payouts` — SELECT, `auth.uid() = mentor_id`. **Low, keep.**
- No write policies. Service-role-only writes. **Acceptable for now.**

### `notifications`
- `Recipients can view their own notifications` — SELECT, role `{public}`, `auth.uid() = recipient_id`.
- `Recipients can update their own notifications` — UPDATE, role `{public}`, `auth.uid() = recipient_id` for both USING and WITH CHECK.

Both policies use role `{public}` instead of `{authenticated}`. With `auth.uid() = recipient_id`, anon callers (where `auth.uid()` is NULL) will always fail the predicate, so functionally equivalent. **Cosmetic inconsistency** with the rest of the codebase — recommend changing to `{authenticated}` to match convention.

Also: the UPDATE policy WITH CHECK doesn't lock the `recipient_id` column, so an attacker could theoretically transfer ownership of their notification to a different recipient_id (`UPDATE notifications SET recipient_id = '<other_uid>' WHERE id = '<own_id>'`). Self-DOSing is the only attack — the row leaves their inbox. **Low risk, but recommend** adding `WITH CHECK (auth.uid() = recipient_id AND recipient_id = (SELECT recipient_id FROM notifications WHERE id = notifications.id))` — though note this is the exact alias-rewrite shape that caused the demo tautology bug; safer to use a `BEFORE UPDATE` trigger that raises if `recipient_id` changes.

### `reviews`
- `Authenticated can view reviews` — SELECT, `USING (true)`. **Intentional public-ish read.** Mentor profiles need reviews visible to other students. **Keep.**
- `Students insert own reviews` — see Risk 5 above.
- `Students update own reviews` / `Students delete own reviews` — `auth.uid() = student_id`. **Low, keep** (no `WITH CHECK` means a student can rewrite their `rating` and `review` freely, which is the intended behavior for "edit my review").

### `session_notes`
- `Mentor or student view notes` — SELECT, `auth.uid() = mentor_id OR auth.uid() = student_id`. **Low, keep.**
- `Mentor insert notes` — see Risk 1.
- `Mentor update notes` — UPDATE, `auth.uid() = mentor_id`. Same gap as Risk 1: a mentor could UPDATE a note to point to a different `student_id` (though FK doesn't enforce that the new student exists, so the only realistic harm is moving a note between students).
- `Mentor delete notes` — `auth.uid() = mentor_id`. **Low, keep.**

### `session_action_points`
Legacy. See Risk 2.

### `sessions` (legacy)
Predecessor to `bookings`. Three policies still in place. **Recommend: drop the table** in a future migration once we've confirmed nothing reads it. (Grep `supabase` and `sessions"` over `src/` returns no hits; only `booking-emails` references "session" in the email copy.)

### `action_point_completions`
- `Students view own completions` — SELECT, `auth.uid() = student_id`. **Low, keep.**
- `Students insert own completions` — see Risk 3.
- `Students update own completions` — UPDATE, `auth.uid() = student_id` for both USING and WITH CHECK. Same gap as Risk 3 — student could overwrite another student's completion row if they guessed the (`session_note_id`, `action_point_index`) pair.
- `Mentors view completions for their notes` — SELECT, `EXISTS (... mentor_id = auth.uid())`. **Well-formed; low risk, keep.**

### `student_documents`
- `Students view own documents` / `Students insert own documents` / `Students delete own documents` — `auth.uid() = student_id`. **Low, keep.**
- No UPDATE policy → file renames impossible. Minor product gap, not a security issue.
- Mentors can view documents *via the SECURITY DEFINER RPC* `get_student_overview_for_mentor` (migration `20260430000002_*.sql:25-33`), which gates on a confirmed/completed booking between the mentor and student. **Low risk, keep**.

### `student_schools`
- Four policies, all gating on `auth.uid() = student_id`. **Low, keep.** Mentor access is via the same RPC as `student_documents`.

### `storage.objects` (cross-bucket)
Seven policies covering two buckets:
- `mentor-photos` (bucket public, allows public SELECT): mentors upload/update/delete only inside their own `auth.uid()` prefix. **Low risk.**
- `student-documents` (bucket private): students upload/view/delete only inside their own `auth.uid()` prefix. **Low risk.**

Note that mentors cannot view student documents via storage; they must go through the SECURITY DEFINER RPC, which returns the `storage_path` so the mentor's client could then attempt to read storage — and would be denied by the RLS policy. **Today there's no UI in the mentor dashboard that tries to download these documents**, so the mentor receives the filename only.

### Functions that effectively *are* policies

Seventeen `SECURITY DEFINER` functions are deployed; they're listed here
because they each implement an authorization gate that bypasses RLS and
should be reviewed in tandem with the policies above.

| Function | Gate |
| --- | --- |
| `get_mentor_calendar(mentor_id, ...)` | `mentor.status = 'approved'` |
| `get_mentor_public_profile(mentor_id)` | `mentor.status = 'approved'` |
| `list_approved_mentor_profiles()` | `mentor.status = 'approved'` |
| `get_mentor_booking_names(_ids)` | (not re-read in this audit; verify caller-restricted) |
| `get_student_booking_names(_ids)` | caller has confirmed/completed booking with each id |
| `get_review_student_names(_ids)` | none — relies on SELECT-true on reviews |
| `get_student_overview_for_mentor(student_id)` | caller has confirmed/completed booking with student |
| `update_booking_status_as_mentor(_booking_id, _new_status)` | caller is mentor of booking; status ∈ {cancelled, completed} |
| `create_booking_notification()` (trigger) | n/a — service-side |
| `handle_new_user()` (trigger) | n/a — service-side |
| `admin_list_mentors / admin_list_students / admin_list_bookings / admin_stats / admin_set_mentor_status` | `is_admin()` |
| `is_admin()` | `auth.uid()` email equals hardcoded admin |
| `rls_auto_enable()` | not directly callable; assumed dev utility |
| `touch_updated_at()` | trigger only |

Two observations on this list:

1. **`get_review_student_names` has no gate.** Any authenticated caller
   can resolve any UUID to a `(id, full_name)` if that UUID exists in
   `public.students`. This is effectively a *student-by-UUID enumeration*
   surface for any logged-in user. **Medium risk, recommend fix:**
   restrict to ids that appear in a review the caller is allowed to
   see (i.e., any review, since SELECT is `true`) — or scrap the function
   in favor of a join inside `get_mentor_public_profile` or similar.
2. **`is_admin()` is hardcoded to a single email.** This is intentional
   for the launch period but every admin RPC will need rewiring when
   the team grows. Tracked as known tech debt; not in scope for this
   audit.

## Rejection-test coverage

| Surface | Rejection tests in repo |
| --- | --- |
| `handle_new_user` trigger | yes — `supabase/dev-seeds/bug6_2-signup-atomicity-verification.sql` (T1-T10) |
| `get_mentor_calendar` | partial — `supabase/dev-seeds/bug4-calendar-verification.sql` covers visual happy-path but no rejection cases |
| Every RLS policy listed above | **none** |

**Zero of the 40 deployed RLS policies have a paired rejection test.**
The demo-prep tautology bug
(`20260430000003_demo_fix_bookings_mentor_update.sql`) was caught by
manual testing during demo prep, not by an automated suite. The risk
of recurrence is real because future migrations or framework changes
(Postgres major upgrades, Supabase client updates) can silently alter
policy semantics without breaking the schema.

## Recommended remediation order

1. **Add rejection tests for the five high-risk policies (Risks 1-5).**
   The dev-seed pattern in
   `supabase/dev-seeds/bug6_2-signup-atomicity-verification.sql` is
   the template: a transaction that exercises each forbidden operation,
   asserts it raises with a specific error, and rolls back. Even just
   the five priority tables would catch 80% of regressions.
2. **Tighten `mentors.UPDATE` to forbid self-approval.** Add `WITH CHECK
   (status = (SELECT status FROM mentors WHERE id = mentors.id))` —
   but be wary of the alias-rewrite tautology bug; prefer a `BEFORE
   UPDATE` trigger that raises when `OLD.status` differs from
   `NEW.status` and `NEW.id <> caller`.
3. **Lock `session_notes`, `action_point_completions`, and `reviews`
   inserts** to require an underlying confirmed/completed booking
   (see Risks 1, 3, 5).
4. **Tighten `mentor_availability.SELECT`** to `auth.uid() = mentor_id`.
   Other consumers should route through `get_mentor_calendar`.
5. **Replace `bookings` direct INSERT** with a SECURITY DEFINER RPC
   (`book_session`) that validates approval, availability, and price.
6. **Add a gate to `get_review_student_names`** or replace it with a
   join inside an existing gated RPC.
7. **Drop legacy `sessions` and `session_action_points` tables** in a
   future migration once a final grep confirms no readers.
8. **Standardize the `notifications` policy role to `{authenticated}`**
   in a small cleanup migration.

Steps 1-3 cover the highest-risk findings. Steps 4-8 are polish and
hygiene; do them in subsequent sprints alongside related feature work.

## Methodology note

- Live policies were enumerated via `SELECT * FROM pg_policies WHERE
  schemaname IN ('public', 'storage')`.
- RLS-enabled tables were verified via `SELECT relrowsecurity FROM
  pg_class JOIN pg_namespace ON ... WHERE nspname='public' AND
  relkind='r'`. All 13 public tables have `relrowsecurity = true`;
  none have `relforcerowsecurity = true`. Forcing RLS for the table
  owner is a defense-in-depth control for service-role mistakes —
  worth considering for a future hardening pass.
- All 22 migrations under `supabase/migrations/` were read end-to-end
  to verify migration-vs-live consistency. No drift detected — every
  live policy has a matching `CREATE POLICY` in the migration history,
  and every dropped policy has a corresponding `DROP POLICY` migration.
- The `SECURITY DEFINER` function inventory came from `SELECT proname,
  prosecdef FROM pg_proc WHERE pronamespace = 'public'::regnamespace`.
- No write was performed against the live database during this audit.
