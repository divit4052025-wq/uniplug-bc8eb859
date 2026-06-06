# UniPlug V1 — build state (canonical phase numbering; source of truth)
Canonical plan: "Final Build-Ready Plan (Revised)". Detailed specs: docs/plans/phase-4-scheduling-remodel.md, docs/plans/phase-5-6-plan.md.

## Phase map
- P0 ref-data + pg_trgm + seed + ref_add_requests + ref_academic_domains + typeahead + add-request/promote — DONE (main)
- P1 student cols + 6 join tables + legal_acceptances + handle_new_user ext + student-photos private bucket + owner-write RLS — DONE
- P2 mentor cols + mentor_admits + mentor_payout_methods + mentor_private_notes + column-lock ext — DONE (CORRECTION: validate_college_email was listed here but was NEVER built in P2 — delivered 2026-06-06 in the mentor email gate below)
- Mentor email gate (two-track, 2026-06-06) — validate_college_email classifier (fail-closed) + mentors.tier (standard|enhanced, server-derived at signup, self-tamper-locked with college_email) + submit/resubmit enhanced enrollment-proof enforcement + finalize upload + M1 nudge + admin tier badge — BUILT on claude/p2-mentor-email-gate-2026-06-06 (migration 20260606000003), unmerged
- P3 booking subject/desc + 30-min + holds + reschedule + mentee-limit — DONE (built across the scheduling sub-phases; mentee-limit landed in the backend-completion bundle)
- P4 doc visibility/shares/notes/versions + contact-stripped get_student_overview_for_mentor — DONE (backend-completion bundle)
- P5 profile masking + filters + aggregate rating + cross-party contact audit — DONE (bundle)
- P6 admin approve_mentor/reject_mentor(reason)/admin_clear_re_review + admin.tsx wiring — DONE (bundle)
- Consent hardening (not a numbered phase) — send_message consent gate + self-set-consent column-lock (column-privilege boundary + token unreadable + data-export redaction) — DONE
- P7 student signup wizard + finalize upload + NULL-profile backfill nudge — NOT STARTED (UI)
- P8 mentor signup wizard + finalize + submit/resubmit + blocked-incomplete — NOT STARTED (UI)
- P9 student dashboard layout + per-section routes + Home + AI prep + profile editing — NOT STARTED (UI)
- P10 mentor dashboard layout + per-section routes + earnings/payout + email-switch + preview + private notes — NOT STARTED (UI)
- P11 matching — extend match.functions.ts (target-unis↔admits ID join + interests↔specialty, surface General, NULL-safe) — NOT STARTED
- P12 Playwright e2e (signup→finalize→browse→book→complete→review) + axe + release-checks — NOT STARTED

## Deferred executors (records built; money/files don't move yet; all required before launch)
- Razorpay refund executor worker — cancellations record a refund_intent + clawback; the async API refund is not sent
- RazorpayX payout disbursement — payouts accrued via run_weekly_payout_batch; actual disbursement (KYC + bank PII) not built; its own gated step
- Claim-aware order server fn — P4b holds not payable yet (createBookingOrder calls book_session, would collide with a claimed pending row)
- Doc byte-access signed-URL fn — docs are metadata-gated; mentor download not wired
- In-app notification rows — events deliver via email; the in-app row + renderer is partial

## As-built deltas vs the plan text (the plan text is stale on these; reality is here)
- Platform fee is 20% (plan text says 25%)
- Holds are bookings.status='reserved' (morph-in-place), not a separate booking_holds table
- Pricing is duration-based (₹500/30 min, ₹1000/60 min), not flat ₹1000
- The plan's P3 was built across the scheduling sub-phases; this file's numbering is canonical

## Prod / hosted (the held reconciliation, before any UI ships)
- main is ahead of hosted. The held reconciliation must apply every migration through current main (+ the consent-lock) before the UI ships. The video migration on prod is recorded at ledger version 20260530194526 — reconcile that schema_migrations row, do NOT re-apply.
- admin.tsx now calls the new admin RPCs by name → the P6 migrations must be on hosted before/with that deploy.

## Launch blockers (separate from phases)
- Student-signup HTTP 500 on uniplug.app (Supabase Auth SMTP) — verify/fix
- Supabase PITR (Pro)
- Legal copy incl. the C-1 refund-tier policy amendment + counsel sign-off
- Parental-consent token hardening + email-failure alerting + 3 legacy NULL-DOB rows

## Trackers (added on claude/p8-mentor-signup-2026-06-05)
1. **Pre-launch child-safety (self-consent gap):** `parental_consent_email` is student-UPDATE-able (the migration-060 column allowlist grants it) and, combined with any consent-link resend path, lets a minor redirect the consent link to their own inbox and self-approve. This is a broader self-consent gap. Fix before launch via the full adversarial review: kill the redirect (e.g. lock `parental_consent_email` once a token is minted / freeze it across a resend) while preserving the legitimate typo-correction path before consent is requested.
2. **Hosted reconciliation — video:** migration file `20260530000003_video_calls.sql` is on main; hosted already has the schema under ledger row `20260530194526`. At sync, **MARK-AS-APPLIED (reconcile the ledger row), do NOT re-apply** — the `video_calls` tables already exist on hosted.
3. **On-main video dev-seed:** `supabase/dev-seeds/video-call-join-auth-verification.sql` ERRORs on the post-P4c schema (the `bookings_no_overlap` overlap-constraint fixture) — dev-seed fix needed (not a feature regression).
4. **Daily.co ops:** add a payment method to the Daily account + verify the live Worker `DAILY_API_KEY` before video works in prod.
