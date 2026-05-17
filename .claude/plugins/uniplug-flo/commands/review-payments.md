---
name: review-payments
description: Review Razorpay integration changes — ledger writes, webhook handlers, refunds, payouts, idempotency, signature verification. Run on any PR touching money flows.
argument-hint: "[scope: diff | files <path>...]"
---

Invoke the **payments-reviewer** subagent
(`agents/payments-reviewer.md`).

Default scope: every file touching the Razorpay client, webhook
handlers, the `payment_ledger` table, refund or payout logic in the
current diff against `origin/main`. $ARGUMENTS can narrow.

The subagent will:

1. Walk the `payments-ledger` skill spec.
2. Verify the three invariants: ledger is append-only, webhooks are
   idempotent, revenue/payout math reads from the ledger (not from
   mutable booking state).
3. Inspect signature handling (raw body before parse, HMAC-SHA256
   against `RAZORPAY_WEBHOOK_SECRET`).
4. Trace the webhook flow in code and produce an ASCII diagram from
   "request received" through "200 OK".
5. Cross-check logging via the `observability` skill (no raw payment
   payloads in logs, event IDs + ledger row IDs only).
6. Produce HIGH/MED/LOW findings with concrete remediations.

Block merge on any HIGH.
