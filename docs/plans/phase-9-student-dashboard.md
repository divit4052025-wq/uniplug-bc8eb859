# Phase 9 — Student Dashboard (extend-in-place)

Status: steps 1–3 built on `claude/p9-student-dashboard-2026-06-06` (unmerged, awaiting review + merge). Steps 4–6 not started.

## Headline: P9 is not greenfield

STATE.md originally listed P9 as "NOT STARTED (UI)", but a working student dashboard already ships on `main`:

- Route: `src/routes/dashboard.tsx` at **`/dashboard`** (there is no `/student-dashboard`).
- Shell: `DashboardSidebar` + `DashboardTopbar role="student"` + `MobileBottomNav`, single route, `useState<SectionKey>` + anchor-scroll (no per-section routes).
- Sections already shipped (`src/components/dashboard/sections/`): `MyPlugs`, `TopPicks` (AI match cards), `UpcomingSessions`, `PastSessions`, `SessionNotes`, `MySchools`, `MyDocuments`, plus `AccountDataSection` under Settings.
- AI session-prep is already wired into `UpcomingSessions` (`generatePrepQuestions` + `session_prep_questions` cache); only the `ANTHROPIC_API_KEY` worker secret is operator-pending.

So P9 = **extend the existing `/dashboard` + `src/components/dashboard/` in place**, keeping it structurally identical to the mentor dashboard.

## Approved decisions (architect, 2026-06-06)

- **Anchor-scroll**, no per-section routes. **Keep `/dashboard`** (no `/student-dashboard`).
- **No payments/refund work** in this build. Read-only payment history is a *later* step (4); **no refund-status RPC** (the only thing that would make P9 not-UI-only) — deferred.
- **Omit reserved/pending_payment holds** from Sessions (the claim-aware order fn is deferred; no Pay/Claim CTA).
- **Brand tokens for net-new** components; `useOptimisticMutation` for net-new mutations only.

## The dominating risk: `consent_column_lock` (runtime-only 42501)

`students` has **no** table-wide SELECT/UPDATE for `authenticated` — only an explicit column allowlist (migration `20260604000060`). `select(*)` on `students` errors at request time (invisible to tsc/build). The editor names only allowlisted columns and respects the child-safety locks (see step 2).

- **UPDATE-allowlisted:** `full_name, phone, school, countries, board, bio, photo_url` (+ `id, email, grade, …` not edited here).
- **SELECT-allowlisted:** the above + `date_of_birth, parental_consent_at, …` (never `parental_consent_token`).
- `date_of_birth` is allowlisted but frozen by `students_dob_immutable` once set → **read-only** in the editor.
- `grade` (feeds the consent gate) and `parental_consent_email` (Tracker #1 self-consent gap) are **not** exposed in the editor.
- `bookings` has **no** column-lock → its RLS exposes `razorpay_*`/`payout_id`; Sessions/Payments queries must `select` only needed columns.

## Build order + checkpoints

| # | Step | Schema? | State |
|---|---|---|---|
| 1 | `isBookingEnded` duration-aware (reads `bookings.duration`) | none | **built** |
| 2 | `ProfileSection` in the Settings branch (allowlisted cols + join-table DELETE/INSERT) | none | **built** |
| 3 | Cancel + Reschedule on `UpcomingSessions` via existing RPCs | none | **built** |
| 4 | *(opt)* read-only Payments/history over `bookings` status labels | none (refund-status RPC deferred) | not started |
| 5 | *(opt)* AI-prep regenerate (`force=true`) | none | not started |
| 6 | *(opt)* lift sections into URL routes | none | not started (deferred; anchor-scroll chosen) |

## As-built (steps 1–3)

**Step 1 — `src/lib/time.ts`.** `isBookingEnded(dateStr, timeSlot, durationMinutes = 60)` now computes `start_ms + duration` on the epoch timeline (correct for `:30` slots and across midnight; old code did `(hour+1) % 24`). Default 60 preserves the two mentor-dashboard callers (a P10 follow-up can thread duration there). Added companion `hoursUntilStartIST` for the cancel refund-tier hint. Server (`authorize_video_join`) stays the authority for join eligibility.

**Step 2 — `ProfileSection` (`src/components/dashboard/sections/ProfileSection.tsx`) + data layer (`src/components/dashboard/profileEdit.ts`).** Rendered in the dashboard **Settings branch** (above `AccountDataSection`) — mirrors the mentor `SettingsSection`, needs no nav changes, mobile-reachable. Editable: `full_name, phone, school, countries, board, bio, photo` + the 5 interest axes (subjects/courses/sports/cocurriculars/projects) + the target-university shortlist. DOB read-only. `grade / parental_consent_email / email / parent_phone` never read into or rendered by the editor. Interest axes use row-level optimistic INSERT/DELETE (mirrors `MySchoolsSection`); `writeRichProfile` is deliberately **not** reused (it's INSERT-only/add-only and would duplicate rows). Photo re-upload is DELETE+INSERT (new owner-prefixed object → repoint `photo_url` → delete old); display via `createSignedUrl` on the private `student-photos` bucket. Target-uni edits also invalidate the `MySchools` Home board to stay in sync.

**Step 3 — `UpcomingSessionsSection`.** Selects only `id, mentor_id, date, time_slot, duration, reschedule_count` (never `select(*)` → no Razorpay/payout ids in the browser). **Cancel** = `AlertDialog` showing the refund tier (full ≥24h / 50% 2–24h / none <2h) then `cancel_booking_as_student` (authoritative refund from the jsonb return). **Reschedule** = `Dialog` reusing `get_mentor_calendar` for available slots → `reschedule_booking` (server re-validates ≥12h lead, ≤2 reschedules, duration coverage). Both via `useOptimisticMutation`; freed slots invalidate the mentor calendar. Reserved/pending rows are not shown (confirmed-only query).

## Verification

`tsc --noEmit` clean · eslint clean · `npm run build` green. No migration (schema-free), so no new dev-seed; the runtime RLS/column-lock risk was audited by reading the data layer against the policies + adversarial security review. UI confirmed via code-read + reviewers; final visual sign-off via Divit's screenshots (`npm run dev` → localhost:8080). `main` is ahead of hosted — do not deploy P9 UI until the held migration reconciliation runs.
