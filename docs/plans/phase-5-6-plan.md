# Phase 5 & 6 — Design Plan (DESIGN ONLY — build nothing)

**Status:** design for review. **Author pass:** read-only investigation against `main` @ `36fff9e` (post P0–P4b; payments Stages 1–6, holds, reschedule, chat, consent all merged + live on `ncfhmbugjeuerchleegq`), local Supabase reflecting the full migration set. **Perspective:** db-reviewer + payments-reviewer + rls-review. **Nothing in here is built.**

> **Scope of this doc:** P5 (money completion) and P6 (child-safety / privacy capstone) — the two phases not yet designed. **30-min sessions (F1 / "P4c") are NOT covered here** — their design lives in `docs/plans/phase-4-scheduling-remodel.md` (§F1) and is being built on `claude/phase-4c-30min-2026-06-03`. This plan assumes P4c lands first (see §Sequencing).

---

## 0. Verified current state (the half that already exists)

The investigation confirmed a recurring shape: **the safe/passive half of each P5/P6 feature is already built; the money-moving or identity-exposing half is the gap.** Concretely —

| Area | Built + live | The gap |
|---|---|---|
| Refund | `apply_refund` (clawback), `confirm_refund_processed`, `refundBooking` server fn (admin, manual amount) | No self-serve cancel; no **tiered** refund; amount derived from mutable `bookings.price`, not the immutable ledger |
| Payout | Accrual: `run_weekly_payout_batch` → `mentor_payouts(status='scheduled')`, 80/20 split, dispute/double-pay guards | **Entire disbursement half** — no RazorpayX call, no creds, no bank data, no `payout_*` ledger event, no `processing` state, no payout webhook |
| Mentee cap | `mentors.max_active_mentees` column (NULL = unlimited) | No enforcement anywhere; no count helper; no race guard |
| Orphan capture | Webhook **detects** + logs an alert; `mark_booking_paid` only flips `pending_payment→confirmed` | No **automatic** refund — money sits with the platform until a human runs `refundBooking` |
| Claim-aware order | `claim_reserved_booking` (in-place `reserved→pending_payment`) is DB-complete + proven | No order fn that pays a **claimed** hold → holds are **unpayable** today |
| Profile masking | `list_approved_mentor_profiles` / `get_mentor_public_profile` (full name + photo to anyone) | No first-name/mascot-only projection; no booking-gated unlock of identity |
| Consent | `requires_consent_base()` + fail-closed `prevent_booking_minor_no_consent` BEFORE-INSERT on bookings | `send_message` has **no consent check** — a no-consent minor can message a mentor (largest fail-OPEN gap) |
| Messaging | `send_message` (mentor-can't-cold-initiate, PII heuristic, 15-msg student cap, block/unblock asymmetry), full chat schema | No **request lifecycle** (open/accepted/declined), no `decline=block` verb; the 15-cap is student-only/conversation-scoped |
| Doc sharing | Nothing — chat is text-only by design; only owner-only verification/photo buckets exist | The **entire** documents table + sharing RPCs + bucket are net-new |
| Re-review flag | `mentors.re_review_pending` column + `prevent_mentor_re_review_tamper` lock | No **auto-flag trigger** when an approved mentor edits a verification field; the lock will *fight* a naive auto-flag |

---

## 1. Cross-cutting decisions that block the build (settle first)

These five recur across P5/P6 features. Decide once, apply everywhere.

**C-1 — Legal-copy divergence on refund tiers (BLOCKING, needs human/legal).** The task spec wants **3 tiers: full ≥24h / 50% 2–24h / none <2h**. The live legal copy (`legal-source/05_Refund_Cancellation_Policy.md` §2) is **binary**: full ≥24h / **fully non-refundable** <24h, no 50% tier, no 2h floor (and it carries a "windows/amounts are provisional" note). **You cannot ship the 3-tier RPC against the binary legal copy** — that's a contract mismatch in the user's favour at 2–24h (paying 50% the policy says is non-refundable, which is fine) but the policy must still describe what the system does. **Recommendation:** amend §2 of the policy to the 3-tier model before P5 ships; until then, build the RPC tier table as a single server-side constant so the cutoffs are one-line-changeable. This mirrors the F3 "legal-vs-RPC mismatch" flag.

**C-2 — Refund amount source of truth = the immutable ledger, not `bookings.price`.** Both refund paths today read mutable `bookings.price`. The captured amount lives immutably on the `payment_captured` ledger row (`amount_inr`). **All P5 refund math must read the captured ledger amount** (and tier-scale *that*), so a later price edit / reschedule / proration can never desync the refund from what was actually charged. `apply_refund`'s clawback should likewise prefer `mentor_share_inr` from the captured row.

**C-3 — One canonical "active booking" definition, shared by every gate.** Today five call sites hardcode a `bookings.status IN (...)` set; P5 (cap) and P6 (masking, messaging, unlock) all add more. Land **two** SECURITY DEFINER helpers and make every gate call them, so they cannot drift:
- `booking_relationship_is_active(_student, _mentor)` → `EXISTS status IN ('confirmed','completed')` — the **identity-unlock / messaging-uncap** set (a `pending_payment`/`reserved` row must **never** unlock identity or lift the cap).
- `count_active_mentees(_mentor)` → `count(DISTINCT student_id) WHERE status IN ('reserved','pending_payment','confirmed')` — the **slot-occupying / cap** set (matches the collision-guard predicate).
The two sets are deliberately different (a completed-only relationship is past load, not concurrent; a pending hold occupies a slot but hasn't paid). Document the split in the helper comments.

**C-4 — P5 enforcement lives in the same RPCs P4c rewrites → sequence P4c first.** `book_session` and `reserve_slot` are edited by P4c (duration/price + `exclusion_violation` handler) **and** by P5 (mentee cap). Editing both phases against the same bodies in parallel = a guaranteed conflict and a double-DROP/CREATE hazard. **Land P4c → main first**, then P5 edits the post-30-min bodies (which already catch `exclusion_violation`). Add the C-3 helpers so P5/P6 only add a *one-line call*, not a re-derivation.

**C-5 — Ledger immutability posture.** `payment_ledger` is RLS-on/0-policies/no-UPDATE — its `event_type` CHECK is the only mutable surface and every widen is a constraint rewrite (DROP+re-ADD, validates existing rows). **Add new event types only when money genuinely moves in a new way:** payout disbursement needs `payout_initiated`/`payout_processed`/`payout_failed` (one deliberate, paired-dev-seed CHECK migration). **Do NOT** add an `orphan_refund` type — encode provenance in the `payload jsonb` of a reused `refund_created` row (zero schema change).

---

## 2. Phase 5 — money completion

Five sub-features. Risk order: P5.5 (claim order, unblocks a shipped feature) ≈ P5.4 (orphan auto-refund, hardens live money) < P5.2 (cap) < P5.1 (cancel+tiered refund) < P5.3 (RazorpayX disbursement — real money out, needs creds + KYC + bank data).

### P5.1 — Student/mentor cancellation + tiered refund

**Objects (additive except the two retirements):**
- `cancel_booking_as_student(_booking_id uuid) RETURNS jsonb` — SECURITY DEFINER, owner-gated (`student_id = auth.uid()`), `FOR UPDATE` row-lock, `status='confirmed'` only, `payout_id IS NULL` defence. Computes the **tier server-side** from the session start (IST) vs `now()`: `≥24h → 100% | 2–24h → 50% | <2h → 0%`. Reads the **captured ledger amount** (C-2), computes `refundable = round(captured * tier_pct)`. Records a **refund intent** (see two-layer note) and sets the booking to `cancelled`. Returns `{tier, refundable_inr, captured_inr}`.
- `cancel_booking_as_mentor(_booking_id uuid) RETURNS jsonb` — mentor-owner-gated; **always full refund** to the student (policy §3); same row-lock + intent record; sets `cancelled`.
- **Two-layer execution (the load-bearing design fork):** the Razorpay refund API must be called server-side with the keys (the DB can't). Two viable shapes — pick one in review:
  - **(A) intent + worker (recommended):** the cancel RPC writes a `refund_intent` (a new column-set on `bookings` *or* a small `refund_intents` table: `booking_id, amount_inr, reason, status='pending'`), flips the booking to `cancelled`, returns. A pg_cron-pinged authed Worker route (mirror `send_reminders_cron`) picks up `pending` intents, calls Razorpay refund → `refund_created` ledger row → `apply_refund` (clawback). **Decouples the slow external call from the user's click; idempotent; retryable.**
  - **(B) synchronous server fn:** extend `refundBooking` into `cancelBooking` that the client calls directly — RPC computes tier, server fn does the Razorpay call inline. Simpler, but couples the cancel UX to Razorpay latency/failure and needs careful rollback.
- **Retire the two dangling demo paths** (a child-safety + money correctness fix): the demo-era student RLS UPDATE policy `Students can cancel own confirmed bookings` (raw `confirmed→cancelled`, **no refund**, frees the slot — a student could self-cancel a paid session and get nothing) and the unwired refund-blind `update_booking_status_as_mentor` RPC. **Drop the policy and revoke/replace the RPC** so the *only* cancel routes are the new tiered RPCs.

**Dev-seed invariants (rejection + happy):**
- TIER: a confirmed booking 25h out → 100%; 12h out → 50%; 1h out → 0% — refundable computed from the **captured ledger amount**, not `bookings.price`.
- MENTOR-CANCEL: always 100% regardless of time.
- REJECT: student cancels a booking they don't own; cancels a `pending_payment`/`completed`/already-`cancelled`; cancels a `payout_id IS NOT NULL` booking (post-settlement) → all rejected, no refund intent written.
- LEDGER: a cancel produces exactly one `refund_created` (and eventually one `refund_processed`); `apply_refund` clawback is correct for `payout_id` NULL / scheduled / paid.
- DANGLING-PATH CLOSED: a raw student `UPDATE bookings SET status='cancelled'` is **rejected** (policy dropped); `update_booking_status_as_mentor` no longer callable.
- EMAIL: the `confirmed→cancelled` email trigger fires exactly once per cancel.

**Non-additive flags:** dropping the demo RLS policy + the demo mentor RPC is a behaviour change (acceptable — they're unwired/dangerous). If shape (A) adds `refund_intents`, that's an additive table; if it adds columns to `bookings`, additive. No CHECK rewrite required (status stays `cancelled`).

**Adversarial review:** **payments-reviewer (high)** — refund tier math, ledger-amount derivation, no-double-refund idempotency, clawback correctness across payout states, the dangling-path closure.

**Build sub-steps:** (1) C-2 ledger-amount helper + C-3 helpers; (2) tier-table constant + the two cancel RPCs + intent record; (3) drop demo policy + demo RPC; (4) the worker/refund-executor seam (shape A or B); (5) paired dev-seed; (6) frontend cancel buttons + AwaitingRefund UX (ships-with).

### P5.2 — `max_active_mentees` enforcement

**Objects (additive):** `count_active_mentees(_mentor)` helper (C-3); enforcement block in `book_session` **and** `reserve_slot` (`IF v_max IS NOT NULL AND count >= v_max THEN RAISE 'active-mentee limit'`), placed after the approval check, before the INSERT; supporting partial index `bookings (mentor_id, student_id) WHERE status IN ('reserved','pending_payment','confirmed')`; a **race guard** — `pg_advisory_xact_lock(hashtextextended('mentee_cap', mentor_id))` (preferred) or `SELECT … FROM mentors WHERE id=_mentor_id FOR UPDATE` (book_session already reads the mentor row — add `FOR UPDATE`). The bare count-then-insert is **not** race-safe: two concurrent first-bookings by two students both pass `N < cap`.

**Dev-seed invariants:** (N+1)th **distinct** student rejected via both `book_session` and `reserve_slot`; NULL cap = unlimited; an **already-active** student can book a 2nd session at cap (counts DISTINCT students, not rows); terminal-only relationships (cancelled/expired/completed) don't count; **the race test** — two concurrent new-student bookings with one slot of headroom → exactly one success; `claim_reserved_booking` does **not** re-check (in-place transition of an already-counted student).

**Non-additive flags:** `book_session` body change requires `DROP FUNCTION … (uuid,date,text,uuid,text[,integer])` + re-CREATE + **restate GRANT/REVOKE** (lost on DROP). Enforcement starts rejecting any live mentor already over a non-NULL cap — **pre-check prod** (`SELECT … WHERE max_active_mentees IS NOT NULL`) before merge; today essentially all are NULL.

**Adversarial review:** **payments/db-reviewer (med)** — the race window is the whole risk.

**Build sub-steps:** (1) helper + index; (2) advisory-lock + enforcement in both RPCs (after P4c lands them); (3) race dev-seed; (4) mentor profile UI to set the cap (ships-with).

### P5.3 — RazorpayX payout disbursement

**This is the heaviest P5 item — real money out, new sensitive PII, external creds.** Accrual already produces `mentor_payouts(status='scheduled')`.

**Objects:**
- `mentor_payouts` additive columns: `razorpayx_payout_id text`, `disbursed_at timestamptz`, `failure_reason text`, `disbursement_key text UNIQUE` (idempotency; or deterministic `payout:<id>`), `attempt_count int DEFAULT 0`.
- **Mentor banking (new sensitive surface):** `mentor_bank_accounts` (or columns on mentors): `razorpayx_contact_id`, `razorpayx_fund_account_id`, verification status. RLS: mentor sees own, service_role writes. **DPDP-grade access posture** — this is bank data; treat like verification docs (no broad SELECT, admin via signed server fn).
- `mentor_payouts.status` CHECK widen → add `'processing'` (+ `'skipped'` for ₹0-clawed rows). **Non-additive** (DROP+re-ADD on a live table — currently 0 rows, cheap now; use the self-correcting catalog-name DO-block).
- `payment_ledger.event_type` CHECK widen → `'payout_initiated','payout_processed','payout_failed'` (C-5; one deliberate migration).
- `disburse_payout(_payout_id, _rzpx_payout_id, _payload)` SECURITY DEFINER service_role — atomic `scheduled→processing/paid` + ledger insert, **no-op on `amount_inr<=0`** (`skipped`), no-op if already `processing`/`paid` (no double-pay).
- `confirm_payout_processed` / `confirm_payout_failed` idempotent webhook recorders (mirror `confirm_refund_processed`).
- A **payout webhook route** (`payout.processed/failed/reversed`, HMAC-verified) + a disbursement Worker route the cron (or operator) pings. **Disbursement must NOT auto-fire same-tick as accrual** — an operator/KYC gate sits between accrual and money-out.
- ENV: `RAZORPAYX_KEY_ID`, `RAZORPAYX_KEY_SECRET`, account number, payout-webhook secret (+ Vault entry if cron-driven). Document in `ENV.md` same PR.

**Dev-seed invariants:** never pay `amount_inr<=0`; a 2nd disbursement for the same row / idempotency key is a no-op; a `paid`/`processing` row isn't re-initiated; anon/authenticated can't EXECUTE disburse or SELECT `payout_batches`; `scheduled→processing→paid` flips once + one `payout_processed` ledger row (idempotent on redelivery); `scheduled→failed` leaves money retryable; a refund landing while `processing`/`paid` → `clawback_owed` (re-verify `apply_refund` against the **widened** status set — confirm `processing` falls into clawback_owed).

**Non-additive flags:** two CHECK rewrites (`mentor_payouts.status`, `payment_ledger.event_type`); reconcile `payout_batches.status` (`accrued/disbursed/failed`) vs `mentor_payouts.status` (`scheduled/processing/paid/failed`) vocabularies — when does a batch flip to `disbursed`? (all-rows-paid). New bank-PII surface is a real design+legal item, not a column add.

**Adversarial review:** **payments-reviewer (highest)** — money leaves the platform; idempotency + KYC + clawback-vs-processing are the landmines.

**Build sub-steps:** (1) the two CHECK widens (paired dev-seed proving existing seeds still pass); (2) payout columns + bank table + RLS; (3) `disburse_payout` + confirm RPCs; (4) Worker disburse route + payout webhook; (5) ENV + Vault + RazorpayX dashboard; (6) re-verify `apply_refund` for `processing`; (7) EarningsSection UI (paid vs scheduled, 80% share).

### P5.4 — Orphan-capture auto-refund (+ the money-in-flight race)

Closes the loop the Stage-3/4 comments promise. An orphan = a `payment_captured` ledger row whose booking is **not** `confirmed/completed` (late capture after the 30-min expiry, or a stray capture on a `reserved`/`expired`/`payment_failed` booking — including the claim/book→expire→late-capture race).

**Objects (all additive, no ledger schema change — C-5):**
- `find_orphan_captures() RETURNS SETOF (booking_id, payment_id, amount_inr)` SECURITY DEFINER service_role STABLE — `payment_captured` rows JOIN bookings WHERE `status NOT IN ('confirmed','completed')` AND **NOT EXISTS** a `refund_created`/`refund_processed`/`clawback` row for that booking (ledger-driven + de-duped → safe to re-run).
- A pg_cron `reconcile_orphan_captures` (e.g. `*/10`) → authed Worker route that, per orphan, runs the **same** refund machinery (`refund_created` ledger `refund:<id>` with `payload {source:'orphan_auto_refund'}` → `apply_refund`). **Reuse, don't fork.** A never-confirmed orphan has `payout_id IS NULL` → clawback `none`. Idempotency from the UNIQUE ledger key + the NOT-EXISTS guard.

**Dev-seed invariants:** detection finds a capture on `expired`/`payment_failed`/stray-`reserved`; a capture on `confirmed`/`completed` is **not** returned (no false-positive refund of a real or rescheduled-confirmed session); a booking with an existing refund/clawback row isn't returned again (re-run issues no 2nd refund); after reconcile the orphan is `cancelled` with a `refund_created` row (money never silently kept).

**Non-additive flags:** none if you avoid a new event_type (use `payload` provenance). Keep `apply_refund`'s `status='cancelled'`.

**Adversarial review:** **payments-reviewer (high)** — false-positive refunds of real sessions, and idempotency under webhook redelivery, are the risks.

### P5.5 — Claim-aware order fn (holds become payable)

The named P4b follow-up. A claimed hold is already `pending_payment` on an existing `booking.id`; today's `createBookingOrder` only calls `book_session` (a fresh INSERT) → would re-trip the collision guard → `'slot already booked'`.

**Objects (additive; no new DB object required):**
- `createClaimOrder({ bookingId })` server fn (new export in `order.functions.ts`): call `claim_reserved_booking` (RLS+ownership+FOR UPDATE there; idempotent if already pending) → read price+status via admin → require `pending_payment` → **short-circuit if `paid_at` set or a `payment_captured` ledger row exists** (I-a1, no 2nd order) → create the Razorpay order against the **existing** `booking.id` (same `order:<id>` ledger row) → return `{orderId,keyId,amount}`. No `book_session`, so no 2nd INSERT, no collision.

**Dev-seed invariants:** reserve→claim→createClaimOrder ⇒ one order + one `order_created` row, booking stays `pending_payment` on the **same** id (slot row count = 1); the path never raises `'slot already booked'`; already-captured ⇒ no 2nd order; end-to-end claim→order→capture×2 (redelivery) ⇒ one confirmed booking + one `payment_captured` (extends P4b.04/.05 with an order-count assertion); non-owner rejected.

**Non-additive flags:** none. **Must route collision through the shared P4c guard** — no app-level overlap check (TOCTOU anti-pattern).

**Adversarial review:** **payments-reviewer (high)** — the no-double-order/no-double-charge seam.

---

## 3. Phase 6 — child-safety / privacy capstone

Five sub-features. P6 is **independent of the 30-min/holds scheduling work at the schema level** (different tables: mentors/students/conversations vs bookings/availability) but shares the bookings table the unlock gates *read* — so it must use the C-3 canonical "active booking" set.

### P6.1 — Pre-booking profile masking

Target: pre-booking shows **first-name + mascot + mentoring-info only**; **full name + photo unlock on booking**.

**Objects (additive, but DROP+CREATE for return-type change):**
- `list_approved_mentor_profiles()` → return `first_name` (`split_part(full_name,' ',1)`), `specialty_id` + `mascot_key` (JOIN `ref_specialties`), university, countries, course, year, price, verified_at. **Remove `full_name`.** Re-grant `anon,authenticated,service_role` exactly (the F2 header warns a prior committed migration only granted `authenticated`, which broke the anon landing page).
- `get_mentor_public_profile(_mentor_id)` → pre-booking projection (first_name, mascot, bio/topics, university, price, verified_at; **no full_name, no photo_url**) + an unlock branch: `IF booking_relationship_is_active(auth.uid(), _mentor_id) THEN` also return full_name + photo_url. (Single RPC with internal EXISTS, or a companion `get_mentor_unlocked_profile`.)

**Dev-seed invariants:** no-booking student → row returned but `full_name`/`photo_url` NULL, mascot present; after a `confirmed` booking → both non-NULL; `list_` never exposes a last name to anyone; `pending_payment`/`reserved` does **not** unlock (uses C-3 confirmed/completed set).

**Non-additive flags:** **both RPCs are DROP+CREATE** (return shape changes — "cannot change return type"); **grants must be restated exactly** (DROP drops the ACL). **Client breakage:** `browse.tsx` + `mentor.$id.tsx` read `full_name` at several lines and the chat header RPCs surface mentor `full_name`+photo — the UI must switch to first_name+mascot pre-booking (ships-with, but it's a behaviour change to live surfaces, not purely additive). **Drift watch:** re-verify the LIVE definitions/grants on prod before the DROP+CREATE (F2 documented a prior live-vs-file grant divergence).

**Adversarial review:** **security-reviewer + ux-reviewer** — the unlock gate is a PII-minimisation control; the UI degradation (no name/photo) must be graceful.

### P6.2 — Consent fail-closed (photo / messaging / booking)

The booking gate is fail-closed already; **messaging is the big fail-OPEN gap.**

**Objects (additive):**
- `student_has_consent(_student) RETURNS boolean` helper = `NOT (requires_consent_base(dob,grade) OR dob IS NULL) OR parental_consent_at IS NOT NULL` (fail-closed on NULL DOB, byte-identical truth-table to `prevent_booking_minor_no_consent`).
- Add the consent check **inside `send_message`** for student senders (CREATE OR REPLACE — body only, no signature change) → return `{ok:false, reason:'consent_required'}` (not RAISE, so the UI shows `AwaitingConsentNotice`).
- Gate mentor `photo_url` exposure on **booking** (P6.1 unlock) and any future student-photo-to-mentor on **consent + booking**.

**Dev-seed invariants:** no-consent minor (under-18 OR grade 9/10/11, no `parental_consent_at`) → `send_message` returns `consent_required`, writes no conversation/message; NULL-DOB → also blocked (fail-closed); post-consent → succeeds; adult → succeeds with no consent on file; the send_message consent rule is identical-in-truth-table to the booking gate.

**Non-additive flags:** tightening `send_message` is a **behaviour change** to a live RPC (minors who can message today get blocked) — correct for child-safety, but needs the `AwaitingConsentNotice` wired into compose (ships-with).

**Adversarial review:** **security-reviewer (high)** — this closes a real fail-open minor-safety gap; the truth-table parity with the booking gate is the invariant.

### P6.3 — Messaging Requests inbox (reply-only, 15-cap, decline=block)

**Objects:**
- `conversations` additive: `request_status text NOT NULL DEFAULT 'open' CHECK (open|accepted|declined)`, `initiated_by uuid`, `declined_at timestamptz`. (Consider a separate `declined_by` rather than overloading `blocked_by` — see flags.)
- `decline_request(_conversation_id)` SECURITY DEFINER, mentor-only on the pair → `request_status='declined'` + block semantics (the existing `blocked` reject then fires; student can't resume; only mentor/admin unblocks — child-safety asymmetry).
- Extend `send_message`: mentor's first reply into an `'open'` request flips it `'accepted'`; reconfirm the **15-cap semantics** (today: student-only, conversation-scoped, soft-deleted still count — confirm if the target is "15 combined" or "15 student" — keep student-only unless product says otherwise).
- New notification kind `'message_request'` (widen `notifications_kind_check` — DROP+re-ADD with all prior kinds).
- `get_my_requests()` (or extend `get_my_conversations` projection with `request_status`) so the inbox can split Requests vs Conversations.

**Dev-seed invariants:** mentor sending into a `declined` conversation → `blocked`; declined-by-mentor can't be self-lifted by the student (only mentor/admin); student over the 15-cap → `pre_booking_cap` (soft-deleted still count); non-participant/wrong-role can't `decline_request`; student first-contact → `open`; mentor first reply → `accepted`; confirmed booking → uncapped/accepted; mentor still can't cold-initiate; admin still `invalid_sender`.

**Non-additive flags:** **backfill** — a blind `DEFAULT 'open'` would re-gate **live** conversations as fresh requests; the backfill `UPDATE` must derive `accepted` from existing bookings + reply history (a one-time idempotent data mutation, **not** additive). Changing the 15-cap **semantics** is a behaviour change to a live safeguarding control. `decline=block` reusing `blocked_by` overloads one column ("I blocked you" vs "I declined your request") — prefer `declined_by` + a CHECK. `notifications_kind` CHECK is a DROP+re-ADD (include all prior kinds).

**Adversarial review:** **security-reviewer (high)** — reply-only + decline=block are minor-safety controls; the backfill correctness + the unblock asymmetry are the risks.

### P6.4 — Document-sharing model (net-new)

Chat is text-only by design; this is the entirely new surface (mentor returns an edited essay; student attaches a doc). **Build after P6.3** (it hangs off `conversation_id`).

**Objects (all net-new):**
- `shared_documents` table: `id, conversation_id FK, uploader_id uuid, recipient_id uuid, storage_path, original_filename, mime_type CHECK (allowlist), size_bytes CHECK (<=cap), kind CHECK ('shared'|'edited_return'), parent_document_id uuid (self-FK for the mentor's edited version of a student doc), download_count int DEFAULT 0, max_downloads int (per-doc access limit), expires_at, soft_deleted, created_at`. RLS: participant SELECT only; **all writes via DEFINER RPCs**; REVOKE INSERT/UPDATE/DELETE/etc.
- New **private** bucket `shared-documents` (`public=false`), path `<conversation_id>/<doc_id>/<filename>`. **Trust model differs from every existing bucket** (owner-uuid prefix) — here both participants of a conversation must read, which storage.objects RLS can't express on a conversation-membership basis. **Design fork (settle in review):** route both upload-URL and download-URL issuance through DEFINER RPCs + `supabaseAdmin` signed URLs (mirror the `mentor-documents` admin path) rather than relying on storage RLS membership.
- `share_document(_conversation_id, _path, _filename, _mime, _size, _kind, _parent)` DEFINER — participant + mentor-approved + not-blocked + booking-or-within-limits gate, mime/size validation, per-conversation doc cap; `edited_return` requires a `parent_document_id` the mentor actually received (no cross-conversation leakage).
- `get_signed_document_url(_document_id)` DEFINER — participant check + per-doc limit (`download_count < max_downloads`, not expired, not soft-deleted), increments `download_count`, returns a short-TTL signed URL.
- `'document_shared'` notification kind + AFTER-INSERT trigger (non-fatal handler, mirror `create_new_message_notification`).

**Dev-seed invariants:** non-participant can't share or get a URL; URL past `max_downloads`/`expires_at` → rejected (download_count increments; (N+1)th fails); disallowed mime/oversize → rejected before any write; third-party storage SELECT returns nothing; `edited_return` with a parent the mentor didn't receive → rejected; sharing into a blocked/declined conversation → rejected; happy: upload → row → recipient signed URL within limit → notification; mentor `edited_return` linked to the student's parent → student downloads within its own limit.

**Non-additive flags:** adding media to a **text-only, explicitly "no media" child-safety channel** is a **threat-model posture change** — it must carry its own safeguarding story (mime allowlist, retention/expiry, report path, admin-reviewable, no client delete) or it regresses chat safety. This is a design-review gate, not a schema risk.

**Adversarial review:** **security-reviewer (highest in P6)** — new file surface in a minor-facing channel; storage trust model + access limits + safeguarding story.

### P6.5 — `re_review` auto-flag trigger

Flip `re_review_pending=true` when an **approved** mentor self-edits a verification-relevant field.

**Objects (additive functions, but one surgical edit to a live lock):**
- `flag_mentor_re_review_on_edit()` BEFORE UPDATE on mentors: `IF OLD.status='approved' AND not-admin/service AND (verification field IS DISTINCT FROM) AND NEW.re_review_pending = OLD.re_review_pending THEN NEW.re_review_pending := true`.
- **Verification-relevant set (MUST flip):** full_name, date_of_birth, university, course, year, college_email, specialty_id, ref_university_id, ref_course_id, id_document_path, enrollment_letter_path. **Free-edit (must NOT flip):** bio, topics, photo_url, phone, max_active_mentees, countries (countries debatable — flag). Already admin-locked (excluded): status, price_inr, verified_at/by, verification_notes, re_review_pending.
- **Extend `admin_set_mentor_status`** (CREATE OR REPLACE) to also `re_review_pending=false` on `approve` (it doesn't today) — so admin re-approval clears the flag.

**THE crux (the single biggest P6 decision) — the two-trigger fight:** the existing `prevent_mentor_re_review_tamper` RAISES if a non-admin/non-service caller changes `re_review_pending`. The auto-flag runs **in a mentor's UPDATE** (authenticated, not admin). If it sets `re_review_pending=true`, the tamper-lock sees a mentor-driven change and **rejects the whole legitimate profile edit**. SECURITY DEFINER does **not** change `auth.jwt()->>'role'`, so an AFTER-trigger re-UPDATE doesn't escape it either, and trigger *ordering* can't exempt the write (the lock compares final NEW vs OLD). **The clean fix is surgical:** teach `prevent_mentor_re_review_tamper` to **allow exactly the `false→true` transition when driven by a real verification-field edit**, while still blocking mentor-initiated `true→false` and bare flag sets. This is a **non-additive edit to a live security lock on a minor-serving table** — and P2.05 (mentor self-set → denied) must **still pass** (condition the new allowance on a real field change, not a bare set).

**Dev-seed invariants:** approved mentor edits a verification field → same UPDATE succeeds AND `re_review_pending` becomes true; edits a free field → no flip; pending (never-approved) mentor edits a verification field → no flip; mentor still can't bare-set the flag (P2.05 still passes); admin/service write doesn't auto-flip (so re-approval doesn't re-arm); `admin_set_mentor_status('approved')` after a flag → cleared.

**Non-additive flags:** the lock edit (above); `admin_set_mentor_status` body change. **Downstream gap (flag, likely a sibling task):** `admin.tsx` lists only `status='pending'` — approved+`re_review_pending` mentors won't surface to admin → the flag would be **write-only** without a queue/RPC change.

**Adversarial review:** **security-reviewer + db-reviewer (high)** — editing a live security lock; re-run P2.05 + the new seed together.

---

## 4. Cross-phase dependency matrix

| Depends on ↓ / for → | P4c (30-min) | P5.1 cancel | P5.2 cap | P5.3 payout | P5.4 orphan | P5.5 claim-order | P6.1 mask | P6.2 consent | P6.3 requests | P6.4 docs | P6.5 reflag |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **P4c guard/handlers** | — | — | edits same RPCs → **after P4c** | — | — | route via shared guard | — | — | — | — | — |
| **C-3 active-booking helper** | — | uses | uses (cap set) | — | — | — | uses (unlock set) | uses | uses (uncap) | — | — |
| **apply_refund / ledger** | — | core | — | re-verify for `processing` | reuse | — | — | — | — | — | — |
| **P6.3 conversations lifecycle** | — | — | — | — | — | — | — | — | — | **after P6.3** | — |
| **prevent_mentor_re_review_tamper** | — | — | — | — | — | — | — | — | — | — | **must edit** |

**Key couplings:**
- **P5.2 cap ↔ P4c**: both edit `book_session`/`reserve_slot`. Sequence P4c→P5.2 (C-4). The cap count is duration-independent, so it survives the guard swap unchanged — land the count helper standalone so the RPC bodies only gain a one-line call.
- **P5.5 claim-order ↔ P4c guard**: the claim order path must let the shared DB guard enforce collision (no app-level check), so it moves with the EXCLUDE rewrite.
- **P5.4 orphan ↔ the claim/expire race**: `claim_reserved_booking` resets `created_at` so the 30-min clock starts at payment-start; if that reset were ever dropped an aged hold expires mid-payment and **manufactures** orphans — P5.4 is the safety net for exactly that.
- **P6 unlock/messaging ↔ booking statuses**: every gate uses C-3's `confirmed/completed` set; a `pending_payment`/`reserved`/hold state must **never** unlock identity or lift the message cap. Review P6 and the scheduling phases together so a new status never silently unlocks.
- **P5↔P6 are otherwise independent** and can land in parallel (different tables), except the shared C-3 helpers and the ledger CHECK (land payout_* + any P6 needs in one CHECK migration if concurrent).

## 5. Recommended sequencing

1. **P4c (30-min)** — current branch; lands the range guard + duration/price + the `exclusion_violation` handlers in `book_session`/`reserve_slot`/`reschedule_booking`. (Designed in `phase-4-scheduling-remodel.md` §F1.)
2. **Cross-cutting C-3 helpers** (`booking_relationship_is_active`, `count_active_mentees`) — tiny, unblocks P5.2/P6.1/P6.2/P6.3 with one-line calls.
3. **P5.5 claim-order** + **P5.4 orphan auto-refund** — harden/complete the live money path; small, additive, high value. (P5.5 makes the already-shipped holds usable.)
4. **P5.2 mentee cap** — after P4c, edits the post-30-min RPCs.
5. **P5.1 cancel + tiered refund** — after C-1 legal reconciliation; payments-reviewer high.
6. **P6.1 masking → P6.2 consent → P6.3 requests → P6.4 docs** — the child-safety capstone in that order (docs depends on requests); each security-reviewer gated.
7. **P6.5 re-review flag** — independent; can land any time after its lock-edit is reviewed.
8. **P5.3 RazorpayX disbursement** — **last**; needs creds, KYC, bank-data posture, and real money-out review. Gate hard.

Each phase: one additive migration (+ the deliberate non-additive items flagged above, each with its own paired dev-seed proving the slice), `tsc`/`lint`/`build` green, release-checklist gate, **no hosted apply until the standing hold is lifted**.

## 6. Open decisions for the human (blocking the build)

1. **C-1 legal:** amend the Refund Policy to the 3-tier model (full ≥24h / 50% 2–24h / none <2h), or drop the 50%/2h tiers to match the binary copy? (RPC built either way from a one-constant tier table.)
2. **P5.1 execution shape:** intent + worker (A, recommended) vs synchronous server fn (B)?
3. **P5.2 active-mentee definition:** confirm `('reserved','pending_payment','confirmed')` (slot-occupying) as the cap set; NULL = unlimited.
4. **P5.3:** approve the new mentor-bank-data surface + RazorpayX creds + the accrued→disbursed batch-status reconciliation; confirm disbursement is operator/KYC-gated, not auto-tick.
5. **P6.3:** exact 15-cap semantics (student-only, as today, vs combined) and `declined_by` separate column vs overloading `blocked_by`.
6. **P6.4:** storage trust model — DEFINER-RPC + admin-signed URLs (recommended) vs storage.objects membership RLS; and the doc retention/safeguarding policy.
7. **P6.5:** confirm the verification-relevant field set (esp. `countries`), and that editing the live `prevent_mentor_re_review_tamper` lock to permit the `false→true` auto-flip is acceptable (re-prove P2.05).
