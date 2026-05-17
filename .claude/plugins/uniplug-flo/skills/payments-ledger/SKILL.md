---
name: payments-ledger
description: Razorpay integration on an immutable payment ledger — every order/payment/refund event creates an audit row that's never updated. Payment state machine, webhook idempotency, exponential backoff, never derive revenue from mutable booking rows.
model_class: opus
triggers:
  - "Any code touching Razorpay, payment intents, payouts, refunds, or webhooks"
  - "User says: payments, ledger, Razorpay, webhook, refund, payout"
  - "Before designing or modifying any booking → payment → completion flow"
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Skill: payments-ledger

Money flows in Uniplug must be reconstructable from append-only history. Every event — Razorpay order created, payment authorized, payment captured, refund initiated, refund completed, payout requested, payout settled — is a row in a ledger table. Rows are never updated. Disputes, audits, and accounting reconcile against the ledger, not against `bookings.status` (which is mutable application state).

This is the V1 spec. Tax handling (GST on session fees, on mentor payouts, TDS implications) is deferred to the build phase but noted in the schema design.

## Ledger schema (intent)

The plugin doesn't write the migration — that's `supabase-migration` work. But the intent is:

```sql
CREATE TABLE public.payment_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  booking_id uuid REFERENCES public.bookings(id),     -- nullable for payouts
  event_type text NOT NULL,                            -- see state machine below
  amount_paise bigint NOT NULL,                        -- INR in paise, always positive
  direction text NOT NULL CHECK (direction IN ('credit', 'debit')),
  -- Razorpay identifiers — at least one must be set per row
  razorpay_order_id text,
  razorpay_payment_id text,
  razorpay_refund_id text,
  razorpay_payout_id text,
  -- The raw event for forensic replay
  raw_event jsonb NOT NULL,
  -- Idempotency anchor (provider event ID)
  provider_event_id text NOT NULL UNIQUE
);
```

The `UNIQUE` constraint on `provider_event_id` is the idempotency contract — replays insert-or-conflict (`ON CONFLICT (provider_event_id) DO NOTHING`).

**Rows are insert-only.** No UPDATE policy. No DELETE policy. Refunds and corrections insert new rows; you never edit the past.

## State machine

A booking's payment moves through these states:

```
                ┌──────────┐
                │ pending  │  ← order created, no payment yet
                └────┬─────┘
                     │ Razorpay payment.authorized
                     ▼
              ┌─────────────┐
              │ authorized  │  ← funds held but not captured
              └──────┬──────┘
            captured │       │ failed
                     ▼       ▼
            ┌────────────┐ ┌────────────┐
            │  captured  │ │   failed   │
            └─────┬──────┘ └────────────┘
                  │ refund initiated
                  ▼
              ┌──────────┐
              │ refunded │
              └──────────┘
```

Each transition is **one ledger row.** Reconstruct current state by reducing rows ordered by `created_at`. `bookings.status` is a denormalized view of "the latest ledger event for this booking" — convenient for queries, never authoritative.

## Webhook handler (Cloudflare Worker)

The Razorpay webhook hits a Worker endpoint, e.g. `/api/webhooks/razorpay`. The handler:

1. **Verify signature.** `crypto.subtle` HMAC-SHA256 of the raw body against `RAZORPAY_WEBHOOK_SECRET` (Worker secret). Reject if mismatch. The body must be read raw — JSON-parse only after the signature check.
2. **Read event ID.** `event.id` is the idempotency key.
3. **Insert ledger row** with `ON CONFLICT (provider_event_id) DO NOTHING`. If 0 rows affected, this is a replay — return 200 OK and exit.
4. **Apply side effects.** Update `bookings.status` if applicable. Fire notifications if applicable. These side effects must themselves be idempotent (an UPDATE that sets the same value twice is fine; a notification fan-out must check whether the notification already exists).
5. **Return 200.** Only after the ledger row and side effects committed.

Failures (signature reject, validation error, DB write error) return non-2xx so Razorpay retries. Razorpay's retry policy is exponential backoff up to ~24 hours — that's the SLA for eventual consistency.

## Refunds

Refunds are initiated through a server-side flow (mentor cancels approved session, admin issues goodwill refund, etc.):

1. Worker calls Razorpay's refunds API server-side using `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET`.
2. Razorpay returns a refund ID. **Do not** treat this as success — write a `refund_requested` ledger row.
3. The `refund.processed` webhook arrives async. The handler inserts a `refund_completed` row.
4. Reconciliation: a `refund_requested` without a matching `refund_completed` within 7 days is a stuck refund — surface via the `observability` skill alerts.

## Payouts (mentors)

Mentors get paid out periodically. Payouts are a separate event type, with `direction = 'debit'` (from Uniplug's perspective, money leaving). The same ledger table records them; the `razorpay_payout_id` column distinguishes them from payment rows.

Payout amount = sum of captured payments to that mentor for completed sessions — sum of refunds — Uniplug's commission — TDS / GST withholding (deferred).

**Never compute payouts from `bookings.status = 'completed'`.** That field can be flipped back if a session is disputed. Use the ledger.

## Anti-patterns

- **UPDATE on the ledger.** No. Insert a new row.
- **Returning 200 before committing the ledger row.** Inverts the idempotency contract — Razorpay won't retry, but the side effects didn't happen.
- **JSON-parsing before signature check.** Signature is over the *raw bytes*. Once you JSON-parse and re-stringify you've potentially changed the body.
- **Treating `bookings.status` as the source of truth for revenue.** It's a convenient denormalization. The ledger is the source.
- **Same-thread retries for the Razorpay API.** Use the webhook retry path. If you must retry server-side (e.g. ID idempotent operation), use exponential backoff and stop after 3 attempts.
- **Logging the raw payment payload.** It contains PAN-adjacent fields. Log the event ID + the ledger row ID, not the raw body. See `observability` skill.
- **Trusting the client's claim of "payment succeeded."** The frontend may show a success screen optimistically but the *authoritative* signal is the webhook.

## Reference

- Razorpay API: https://razorpay.com/docs/api/ (verify URL and patterns for current revision — the patterns here are stable but field names occasionally evolve).
- Razorpay webhook signature: https://razorpay.com/docs/webhooks/validate-test/#validate-the-webhook-signature
- Razorpay refunds: https://razorpay.com/docs/payments/refunds/

## See also

- `supabase-migration` — for authoring the ledger schema migration.
- `rls-review` — the ledger has tight RLS: SELECT only for the booking participants and admin; no INSERT/UPDATE/DELETE from `authenticated` (writes happen via service_role from the Worker).
- `observability` — alerting on stuck refunds, signature mismatches, unmatched webhooks.
- `security-audit` — surface 5 of the audit reviews ledger integrity.
