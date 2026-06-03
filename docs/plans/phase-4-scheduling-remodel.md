# Phase 4 — Scheduling Remodel: Design Plan (DESIGN ONLY — build nothing)

**Status:** design for review. **Author pass:** read-only investigation against `main` @ `6249e9e` (post P0–P3 + the contact-leak hotfix), local Supabase reflecting the full migration set. **Perspective:** db-reviewer + payments-reviewer. **Nothing in here is built.**

Three features, in ascending order of blast radius on the live booking/payment core:
- **F3 — Reschedule RPC** (lowest risk; contractually promised; payment carries in place)
- **F2 — Reserve-a-slot-for-a-mentee holds** (medium; new status must move atomically with index/cron/calendar)
- **F1 — Student-selectable 30/60-min sessions** (highest; forces the collision-guard rewrite — the one true double-charge landmine)

> **Headline scope recommendation (detail in §Scope): ship F3 then F2 in the V1 cut; DEFER F1 (30-min) as an isolated payments-reviewer-gated fast-follow.** 60-min already works; 30-min is the most invasive change to the payment-coupled core and the only one that rewrites the race-safe collision guard against live production data.

---

## 0. Verified current state (corrections to assumptions)

Confirmed against the live DB; two assumptions were wrong and *lower* F1's cost, one *raises* it:

1. **`bookings.time_slot` CHECK is already wide:** `^([01][0-9]|2[0-3]):[0-5][0-9]$` (born wide in `20260425103823_*.sql:13`). It already accepts `HH:30`. The `:00`-only restriction lives **only** inside `book_session` step 4 (the regex `^…:00$`). → 30-min needs **no `ALTER TABLE` on the minute** — just an in-function regex relax.
2. **`auto_complete_past_bookings` (cron jobid 1, `*/15`) and `expire_unpaid_bookings` (jobid 4, `*/5`) are inline SQL in `cron.job`, not named functions.** Changing them is a `cron.unschedule`+`cron.schedule` migration, not a `CREATE OR REPLACE`.
3. **Payout eligibility is already duration-aware:** `run_weekly_payout_batch` uses `(b.duration||' min')::interval` for session-end. 30-min flows through with **no batch-math change**.
4. **`btree_gist` is available (v1.7) but NOT installed** — an EXCLUDE-constraint collision guard needs `CREATE EXTENSION btree_gist`.
5. **`bookings` is empty locally (0 rows); production has live bookings.** Any new constraint/backfill is a *real prod cost* and must be validated against existing rows.
6. The slot guard is exactly `bookings_confirmed_slot_unique UNIQUE (mentor_id, date, time_slot) WHERE status IN ('confirmed','pending_payment')` — **pure hour-string equality; `duration` is not in it**; race-safety today = this index + `book_session`'s `EXCEPTION WHEN unique_violation`. `book_session` hard-codes `duration=60` at INSERT. `mark_booking_paid` flips **only** `pending_payment→confirmed`, ledger key `'captured:'||payment_id`. `mentors` has a single flat `price_inr` (no per-duration rate). `payment_ledger` is RLS-on/0-policies (immutable).

---

## F3 — Reschedule RPC (recommended FIRST)

**Why first:** the legal copy already promises a "free reschedule" (`legal-source/05_Refund_Cancellation_Policy.md:24,28`; `01_Terms_of_Service.md:57`) — it's a standing contractual gap — and it is the **lowest payment risk** because the payment carries *in place* with zero ledger churn.

### Shape
`reschedule_booking(_booking_id uuid, _new_date date, _new_time_slot text) RETURNS uuid` — SECURITY DEFINER, `SET search_path = public, pg_temp`, ownership-checked in body (no table RLS UPDATE policy — the existing student UPDATE policy's `WITH CHECK (status='cancelled')` would *reject* a status-preserving date change, so DEFINER is the only route, consistent with `book_session`).

- **Caller (V1):** student-only (`student_id = auth.uid()`). The unconditional legal rights are the student's.
- **Drop `_new_duration` in V1** — every booking is 60-min and availability is 1-hour blocks; accepting a duration the model can't honor is a double-book footgun. Add it only with F1.

### Reschedulable iff (all enforced inside the RPC):
```
status = 'confirmed'           -- paid; pending_payment is NOT reschedulable (§F3-pending)
AND payout_id IS NULL          -- pre-settlement only (defense-in-depth vs double-pay)
AND reschedule_count < 2       -- max-2 policy
AND (current session start, IST) > now() + interval '12 hours'
```
Plus re-run the **full `book_session` gate set** on the new slot: HH:00 format, approved-mentor **re-fetch**, IST past-slot guard, availability `EXISTS(mentor_id, ISODOW(_new_date), hour)`.

### THE CRUX — payment carries with zero re-charge / zero refund

**Decision: Option A — mutate the same row's `date`/`time_slot` in place.** `UPDATE bookings SET date=…, time_slot=…, reschedule_count=reschedule_count+1 WHERE id=… AND status='confirmed' AND …guards…`.

Why this is unambiguously cleanest:
- `paid_at`, `razorpay_order_id`, `razorpay_payment_id`, `price`, `status`, `payout_id` are **all untouched** → money already collected, row still proves it.
- `payment_ledger` rows FK to `booking_id`, which is **unchanged** → no stranded/duplicated ledger rows, audit trail intact, **no ledger write needed**.
- **No status transition → none of the three AFTER-UPDATE triggers fire** (`tg_booking_cancelled_email`, `create_booking_notification_on_confirm`, `create_session_completed_notification` all gate on status change). A status-preserving move is invisible to the entire side-effect layer — the decisive advantage.
- Both crons derive timing from `date+time_slot` → auto-complete and payout-eligibility correctly re-evaluate against the *new* date with **no cron change**.

**Rejected — Option B (cancel + rebook):** routes through `apply_refund` (refund + clawback) + a fresh `book_session` (new Razorpay order, re-charge). Breaks the "free" promise, burns a refund + capture, fires the cancelled-email, strands the old ledger. **Reject.**

### Collision on the new slot
**Option 2A (recommended):** `SELECT … FOR UPDATE` the booking row (serialize concurrent reschedules of the same booking), validate guards, then the in-place `UPDATE` — the partial unique index frees the old slot and takes the new one **in one statement** (evaluated on the post-image); wrap in `EXCEPTION WHEN unique_violation THEN RAISE 'slot already booked'` (mirrors `book_session §8`). Guard the no-op (`_new == current`) explicitly. (Advisory locks — Option 2B — rejected: needless deadlock surface vs `book_session`.)

### Immutable-ledger decision
**Option L0 (recommended): write NOTHING to the ledger.** No money moved; the `payment_captured` row still attributes funds to the unchanged `booking_id`. Record the move on `bookings` (`reschedule_count`, optionally `rescheduled_at`/`reschedule_history jsonb`). **Avoids the payments-reviewer gate entirely.**
**Option L1 (only if finance requires a money-ledger trace):** add a `'rescheduled'` `event_type` (amount 0) → **widens the immutable `payment_ledger_event_type_check` → MANDATORY payments-reviewer gate + paired dev-seed**, and stretches the ledger's semantics from "money events" to "lifecycle events" (risk: naive sum/count over the ledger now includes non-money rows).

### Policy enforcement (all in the RPC, never a trigger)
- `reschedule_count smallint NOT NULL DEFAULT 0` on `bookings` (additive; safe). `≥2 → reject`.
- `≥12h before` computed against the **current** session start (IST); independently re-apply the IST past-slot guard to the **new** slot.

### F3-pending — `pending_payment` is NOT reschedulable (Option 6A)
An unpaid pending booking has a live Razorpay order tied to its slot and a `created_at`-keyed 30-min expiry; moving it invites pay-into-moved-slot and the expire-cron race. No payment to carry → "cancel and re-book" is free anyway. **Guard:** only `confirmed` reschedules.

### F3 flags for the human
1. **Legal-vs-RPC mismatch:** a flat ≥12h self-service cutoff **cannot serve** the *mentor-no-show / technical-failure* "free reschedule" rights (`:24`,`:28`) — those have no time floor and can arise <12h before. They need a **separate admin/ops-initiated path** (or the contract is breached). The `<24h, mentor-agrees` case (`:18`) also can't be pure student self-service.
2. New `booking_rescheduled` notification kind + email type, emitted explicitly from the RPC body (UX-reviewer item, not payments).

### F3 gate: **db-reviewer only** (under L0). Additive column + new DEFINER RPC + paired dev-seed.

---

## F2 — Reserve-a-slot-for-a-mentee holds (recommended SECOND)

A mentor reserves a slot for a specific regular mentee; the student then pays to confirm. No hold exists today beyond the implicit `pending_payment` + 30-min expiry.

### Data model — **Option C (recommended): a new `bookings.status='reserved'` + per-row `hold_expires_at timestamptz`**, with `student_id` itself naming the held mentee (the row already names who it's for; payer == held_for, which closes double-charge surface). Add `held_for` as a distinct column only if you need to record the mentor's *intent* separately — but allowing a different payer reopens double-charge, so keep payer == held_for.
- **Rejected — separate `mentor_slot_holds` table (Option B):** two sources of truth for "is this slot taken"; a hold outside `bookings` is **invisible to the single-table partial unique index** → forces an app-level check that reintroduces the exact TOCTOU race the index was built to kill. **Highest double-book risk; reject.**

### Creation
New SECURITY DEFINER RPC `reserve_slot_for_mentee(_student_id, _date, _time_slot, _hold_minutes DEFAULT …)` (mentors can't INSERT bookings any other way — there is no INSERT RLS policy; all writes go through DEFINER RPCs). Gates mirror `book_session` inverted for the mentor-as-actor: caller is an approved mentor, owns the availability block, HH:00, IST-future. **`held_for` eligibility** — pick one:
- G-i history gate (`EXISTS` a prior confirmed/completed booking) — "regular" but excludes new mentees;
- G-iii "is a student" + a per-mentor hold cap — loosest, but a hold only *offers* a slot (no charge), so blast radius is "mentor wastes own calendar." **Recommend G-i or G-iii+cap.**
- **Minor-consent is free if the hold is a `bookings` INSERT:** the BEFORE-INSERT `prevent_booking_minor_no_consent` trigger fires on `_student_id` → a hold for a no-consent minor is blocked at creation (desirable).

### THE LOAD-BEARING DECISION — collision (must move three surfaces atomically, in ONE migration, following the Stage-1a pattern `20260531120001`):
1. **Slot index:** extend the predicate to `WHERE status IN ('confirmed','pending_payment','reserved')`. *If omitted → double-book* (a hold and a booking, or two holds, both succeed).
2. **`get_mentor_calendar` booked-set:** add `'reserved'` to its status list, else the calendar shows a held slot as `available` and `book_session` then rejects with a confusing "slot already booked."
3. **`bookings_status_valid` CHECK:** add `'reserved'`.
> A `reserved` status in the CHECK but not the index = double-book; in the index but not the calendar = a UX lie. **All three change together or not at all.**

A consequence: the hold occupies the index globally, so it blocks **everyone including the held mentee** from a fresh `book_session` INSERT → the hand-off MUST be an in-place morph, not a new INSERT.

### Auto-release — **Option 4A:** extend the inline expiry cron with a hold branch keyed on the per-row `hold_expires_at` (`UPDATE … status='expired' WHERE status='reserved' AND hold_expires_at < now()`). Store `hold_expires_at` explicitly at creation (`now() + _hold_minutes`); **do not derive from `created_at`** (that's the pending-window clock we're avoiding). Flipping `reserved→expired` drops the row from both the index and the calendar in one write → slot returns to bookable, exactly like today's pending→expired free-up.

### Hand-off `reserved → pending_payment → confirmed` (NO double-book, NO double-charge) — **Option 5A: the hold IS the booking row; transition in place.**
```
reserved --(student pays-init: convert_hold_to_pending)--> pending_payment --(payment.captured)--> confirmed
   |--(hold_expires_at, cron)--> expired        |--(expire_unpaid 30min)--> expired
   |--(mentor cancels, WHERE status='reserved')--> cancelled
```
- `convert_hold_to_pending(_booking_id)`: gate `auth.uid()=student_id AND status='reserved' AND hold_expires_at>now()`; status-gated in-place `UPDATE … SET status='pending_payment', created_at=now() WHERE id=… AND status='reserved'` (the `mark_booking_paid` race pattern; `GET DIAGNOSTICS`).
- **Reset `created_at` at convert** so the existing pending-expiry cron measures 30 min from *payment start* — load-bearing: without it an aged hold expires mid-payment → orphan capture.
- **No double-book:** `reserved` and `pending_payment` are both in the index → the slot is continuously held across the transition; there is never a gap.
- **No double-charge:** one `bookings.id` for the whole lifecycle → one Razorpay order, one capture. `mark_booking_paid` works **unchanged** (`WHERE status='pending_payment'`); the `'captured:'||payment_id` key is per-payment-attempt, independent of hold origin. `createBookingOrder` needs a variant that takes an **already-pending** `_booking_id` and skips the internal `book_session` call (else it'd attempt a 2nd INSERT and unique-violate).
- **Consent on the morph:** the BEFORE-INSERT consent trigger does NOT fire on UPDATE → re-assert `requires_consent_base` logic inside `convert_hold_to_pending`.
- **Trigger audit:** introducing `reserved` and its transitions requires checking the four AFTER-UPDATE triggers' `WHEN`/`OLD.status` (esp. `tg_booking_cancelled_email` on `reserved→cancelled` → suppress the spurious "cancelled" email for a hold the mentee never accepted).

### F2 gate: **payments-reviewer** (touches the slot-hold guard + the order path). **No new ledger event_type** (no money moves on a hold — recommended).

---

## F1 — Student-selectable 30 vs 60-minute sessions (recommended ISOLATED / DEFERRED)

This is the invasive one. Each touchpoint, what changes, the risk:

| # | Touchpoint | Change | Risk |
|---|---|---|---|
| 1 | `mentor_availability` model | **Option 1A:** keep whole-hour blocks; derive 2×30-min sub-slots in the read/booking layer (declared `10:00` ⇒ `10:00` + `10:30` bookable). No schema/UNIQUE/`ScheduleSection` change. | LOW schema; **product semantic** — a mentor who declared "10:00" now also sells a 10:30 start they didn't explicitly pick. (1B/1C add `start_minute`/range cols → break the UNIQUE key + every `start_hour` read; HIGH churn, defer.) |
| 2 | `book_session` | Add `_duration int DEFAULT 60`, validate `∈{30,60}`, replace hard-coded `60`; relax step-4 regex to `:(00\|30)`; **widen availability EXISTS** so a 60-min @ `HH:30` requires *both* `HH` and `HH+1` blocks. | LOW-MED; the trap is forgetting the EXISTS widening (a 60-min @10:30 spilling past 11:00) and the price decision (row 8). |
| 3 | **Collision guard (THE HARD PROBLEM)** | String-equality index cannot express variable-length overlap (60@10:00 vs 30@10:30). **Recommend Option (b): `EXCLUDE USING gist (mentor_id WITH =, slot_range tstzrange WITH &&) WHERE status IN (…)` + `CREATE EXTENSION btree_gist`; drop `bookings_confirmed_slot_unique`; broaden `book_session` handler to also catch `exclusion_violation` (23P01).** Fallback Option (a): a normalized 30-min-cell child table with a status-synced partial unique index. | **HIGHEST.** Option (b) is the only declaratively-correct overlap model and keeps the guard in the DB, but the IST-pinned `tstzrange` can't be a trivial generated column (TZ conversion isn't immutable) → trigger-maintained range; and `book_session`'s handler must catch the new error or a raw 23P01 leaks. Option (c) app-level check is a TOCTOU race — **the anti-pattern the repo rejects; do not use for the money-touching guard.** On prod, the EXCLUDE validates existing rows on creation. |
| 4 | `get_mentor_calendar` | Emit `HH:00` + `HH:30` per block; **the booked LEFT JOIN must become an overlap test** (a 60-min @10:00 must mark *both* 10:00 and 10:30 booked) — the read-side mirror of #3, must use the same range semantics. | MED-HIGH; if the JOIN stays exact-equality it shows a free slot *inside* a booked 60-min session → students book into occupied sessions. |
| 5 | `auto_complete_past_bookings` cron | Swap `interval '1 hour'` → `(duration||' min')::interval` (migration: `cron.unschedule`+`schedule`). | LOW arithmetic. |
| 6 | Payout cutoff | **No change** — already `(duration||' min')::interval`. | NONE (but inherits the price decision, row 8). |
| 7 | `expire_unpaid_bookings` cron | **No change** — keys on `created_at` + fixed 30-min payment window, duration-independent. | NONE. |
| 8 | **Per-duration price (PRODUCT × payments)** | `book_session` stores `price` from the single flat `mentors.price_inr`. Decide: **3-A flat** (30-min costs same ₹1000; zero money-path change) vs **3-B prorated** (`round(price_inr*duration/60)`; flows automatically through order/share/payout/refund since all read stored `price`) vs 3-C separate column (+ column-lock-trigger cost). | If forgotten, 30-min silently **overcharges students and overpays mentors** (payout = `round(price*0.80)`). Dev-seed must assert order-amount == stored-price == ledger-amount for 30-min. |
| 9 | Frontend (not schema, but ships-with) | `order.functions.ts` `CreateOrderInput`+call thread `duration`; `MentorCalendar.tsx` 30/60 selector + `:30` chips; `src/lib/time.ts:62 isBookingEnded` hard-codes `hour+1` (must take duration); `email/templates.ts:84` hard-codes `"60 minutes"`. | LOW each, but `isBookingEnded`/email are visible correctness bugs (a 30-min session lingers in "Upcoming" / emails "60 minutes"). |

### F1 gate: **payments-reviewer, highest.** Collision rewrite + book_session duration/price + cron change + prod constraint migration.

---

## Immutable-ledger / webhook / payout touchpoints (payments-reviewer gate summary)

| Item | Feature | Gate |
|---|---|---|
| Collision guard rewrite to express 30/60 overlap (`EXCLUDE`/range) | F1 | **GATE — highest**; dev-seed `I-overlap` |
| `book_session` duration param + stored `price` decision | F1 | **GATE**; dev-seed I-d3 |
| `auto_complete_past_bookings` 1h → duration | F1 | **GATE** (timing → payout eligibility); dev-seed I-c1 |
| New `reserved` status → must be in slot index **and** expiry cron **and** calendar | F2 | **GATE**; dev-seeds I-b1/I-b2 |
| `createBookingOrder` variant for an already-pending/held booking (no 2nd order) | F2, F1 | **GATE**; dev-seed I-a1 |
| Reschedule preserves `booking.id`, rejects when `payout_id IS NOT NULL`, never touches `price`/`paid_at`/`razorpay_*` | F3 | **GATE (highest for F3)**; dev-seeds I-c2, I-d2 |
| Any new `payment_ledger` event_type (hold/reschedule audit) | F2/F3 | **GATE** — prefer **NONE** (no money moves) |
| `mark_booking_paid`, `apply_refund`, `run_weekly_payout_batch` math | all | **No change** — duration-aware/`price`-derived already; safe given the §8 price decision |

`payment_ledger` immutability (RLS-on, 0 policies) must remain intact in every feature.

---

## Dev-seed payment INVARIANTS that must be proven before merge

Each is a rejection + happy-path pair in a `BEGIN…ROLLBACK` dev-seed ending in a PASS/FAIL table.

**(a) No double-charge**
- **I-a1** — no second Razorpay order for a booking with an existing `payment_captured` row / `paid_at` (hold-pay and reschedule paths short-circuit). 
- **I-a2** — held→paid uses one `booking.id`; a redelivered capture writes one `payment_captured` row, flips exactly once.

**(b) No orphaned / leaked holds**
- **I-b1** — a hold past `hold_expires_at` is released by the cron; the slot drops out of the index and is re-bookable.
- **I-b2** — every hold ends `confirmed` or `expired`, never stuck; index membership matches status (held/pending/confirmed IN; expired/cancelled/failed OUT).

**(c) Payout eligibility stays correct**
- **I-c1** — a 30-min completed+paid booking accrues exactly once at the right cutoff with `round(price*0.80)`; re-running the batch does not double-accrue.
- **I-c2** — a booking with `payout_id IS NOT NULL` **cannot** be rescheduled (rejected); a rescheduled booking accrues once against its current time.
- **I-c3** — a refunded/cancelled/expired-hold booking is excluded from all future batches; clawback on a `scheduled` accrual decrements correctly.

**(d) Ledger / refund consistency**
- **I-d1** — `payment_ledger` stays append-only (no INSERT path for `authenticated`/`anon`; any new event_type is an explicit reviewed CHECK migration).
- **I-d2** — reschedule preserves `booking.id` → no stranded ledger rows; `payment_captured`/`refund_*`/`clawback_owed` still join by `booking_id`.
- **I-d3** — for 30-min: Razorpay order amount == stored `booking.price` == ledger `amount_inr`; `mentor_share_inr = round(price*0.80)`.

**(overlap)** — **I-overlap** (F1): a 60-min booking then a 30-min booking overlapping it (and the reverse) → the second is rejected by the guard. This is the single most important new invariant; it requires the §3 guard rewrite (the current index cannot express it).

Highest-risk interactions (each caught by an invariant above): **(1)** reschedule of an already-accrued booking → double-pay (I-c2); **(2)** a hold racing the expiry cron / a capture racing expiry → permanent lock or orphan-refund of a real payment (I-b1/I-b2 + I-a2); **(3)** a 30-min overlap the string index misses → two students charged for one slot (I-overlap).

---

## Scope recommendation — 30-min in V1 vs fast-follow

**Recommendation: ship F3 (reschedule) + F2 (holds) in the V1 cut; DEFER F1 (30-minute sessions) to an isolated, payments-reviewer-gated fast-follow (call it P4c).**

**Cost of 60-only-now (deferring F1):**
- Zero loss of a working capability — 60-min booking already ships and is paid/payout-correct.
- F3 closes a *contractual* gap (the promised reschedule) at the lowest payment risk.
- F2 adds the reserve-a-regular capability with no overlap-guard rewrite.
- The only "cost" is that 30-min sessions (a value/price-tier enhancement) wait.

**Cost of V1-with-30-min (including F1 now):**
- Forces the **collision-guard rewrite** (string-equality → `tstzrange` + GiST `EXCLUDE` + `btree_gist`), the single highest-risk change in the whole plan — its failure mode is *two students charged for one slot* (silent, money + a mentor dispute + a forced refund).
- It's a **production constraint migration** (prod has live bookings; the EXCLUDE validates existing rows) and an IST-pinned trigger-maintained range (the immutability footgun).
- Touches `get_mentor_calendar` (overlap JOIN), the auto-complete cron, the per-duration **price product decision**, and 4 frontend files — broad surface, all of it payment-adjacent.
- Crucially, **F2 and F3 can be built on today's hour-equality index** and remain race-safe; bolting 30-min on first would make every other feature wait behind the riskiest one.

**Coupling guard (must hold regardless of order):** design F2's hold-collision and F3's new-slot-collision to route through the **same guard `book_session` uses**. When F1 later swaps string-equality → overlap-`EXCLUDE`, all three move together and `book_session`/`reserve_slot_for_mentee`/`reschedule_booking` update their exception handlers (`unique_violation` → also `exclusion_violation`) in the same migration. Building F2/F3 on the old index and F1 on a new guard *without* that shared path is a latent double-book.

---

## Proposed build sequence

1. **P4a — Reschedule (F3).** Additive `reschedule_count` column + `reschedule_booking` DEFINER RPC, in-place payment-carrying UPDATE, L0 (no ledger touch). Paired dev-seed proves I-c2, I-d2, the ≥12h/max-2 guards, and that no status trigger fires. **db-reviewer gate.** Also decide the **admin/ops reschedule path** for the no-show/tech-failure legal rights (separate from the ≥12h student path).
2. **P4b — Reserve-holds (F2).** One migration moving `{CHECK, slot index, calendar booked-set, expiry cron}` to include `reserved`, + `reserve_slot_for_mentee` / `convert_hold_to_pending` / cancel-hold RPCs + the `createBookingOrder` already-pending variant. Paired dev-seed proves I-a1/I-a2, I-b1/I-b2. **payments-reviewer gate.**
3. **P4c — 30/60-min durations (F1), ISOLATED, deferred fast-follow.** The collision-guard rewrite first (with I-overlap proven), then `book_session` duration+price, the calendar overlap JOIN, the auto-complete cron, then the frontend. **payments-reviewer gate, highest;** treat the prod constraint migration with backfill validation. Settle the **flat-vs-prorated price** product decision before any code.

Each phase: one additive migration + a paired dev-seed (rejection + happy-path) proving its slice of the invariants above, `tsc`/`lint`/`build` green, release-checklist gate, no hosted apply until the standing hold is lifted.

---

## Open decisions for the human (blocking the build)
1. **Scope:** approve "F3 + F2 in V1, F1 (30-min) as P4c fast-follow"? (Or insist on 30-min in V1 — then P4c moves up and the collision rewrite leads.)
2. **30-min price (if/when F1):** flat ₹1000 (3-A) or prorated (3-B)? Determines what `book_session` stores.
3. **Reschedule policy vs legal copy:** confirm the ≥12h student self-service cutoff + a *separate admin/ops path* for the no-show/technical-failure "free reschedule" rights (which have no time floor) — or amend the legal copy.
4. **Hold eligibility gate:** "regular mentee" = prior-booking (G-i) or any student + cap (G-iii)?
5. **Ledger:** confirm reschedule/holds need **no** `payment_ledger` row (L0). If finance requires an audit row, that's a payments-reviewer-gated CHECK migration.
