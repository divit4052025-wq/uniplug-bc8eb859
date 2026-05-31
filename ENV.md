# Uniplug environment variables

Single source of truth for every env var the app reads, where it lives, who sets it, and what breaks when it's missing. Keep in sync as new env reads land.

## Runtime + build-time vars

| Var | Required | Where set | Where read | Purpose / failure mode if missing |
|---|---|---|---|---|
| `VITE_SUPABASE_URL` | yes (build) | `.env.local` (dev) / Cloudflare build env (prod) | `src/integrations/supabase/client.ts:8` | Public Supabase URL embedded in browser bundle. Missing → browser-side Supabase client falls back to `process.env.SUPABASE_URL`; if both missing, calls throw on construction. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | yes (build) | `.env.local` (dev) / Cloudflare build env (prod) | `src/integrations/supabase/client.ts:9` | Public anon key embedded in browser bundle. Same fallback chain as above. |
| `SUPABASE_URL` | yes (runtime) | Cloudflare Worker secret (`wrangler secret put SUPABASE_URL`) | `src/integrations/supabase/client.server.ts:9`, `src/integrations/supabase/auth-middleware.ts:12`, `src/integrations/supabase/client.ts:8` (SSR fallback) | Worker-side Supabase URL. Missing → 500 on any server fn that touches Supabase. |
| `SUPABASE_PUBLISHABLE_KEY` | yes (runtime) | Cloudflare Worker secret | `src/integrations/supabase/auth-middleware.ts:13`, `src/integrations/supabase/client.ts:9` (SSR fallback) | Worker-side anon key. Missing → user JWT validation fails (401 on every authenticated server fn). |
| `SUPABASE_SERVICE_ROLE_KEY` | yes (runtime) | Cloudflare Worker secret | `src/integrations/supabase/client.server.ts:10` | RLS-bypass key for server-fn admin paths (email dispatch, cron target). Missing → 500 on `sendBookingEmails`, `send-reminders` route. **Never expose to client.** |
| `RESEND_API_KEY` | yes (runtime, email features) | Cloudflare Worker secret | `src/lib/email/booking.functions.ts:28`, `src/routes/api/public/hooks/send-reminders.ts:29` | Resend API auth for outbound transactional email. Missing → endpoints return `{ok:false, reason:"missing_api_key"}` with 500. |
| `CRON_SECRET` | yes (runtime, A3+) | Cloudflare Worker secret (`wrangler secret put CRON_SECRET`) | `src/routes/api/public/hooks/send-reminders.ts` via `src/lib/auth/bearer.ts` | Bearer token expected from the `send_reminders_24h` pg_cron caller. **MUST exactly match `vault.cron_secret`** (Supabase Vault entry). Missing → 500 `missing_cron_secret`. Mismatched → 401 `unauthorized` on every cron tick. Minimum length enforced in `bearer.ts` is 16 chars; current value is 64-char hex. |
| `ANTHROPIC_API_KEY` | future (Phase D) | Cloudflare Worker secret | not yet wired | Server-side Claude API key for AI features (session prep, note expansion, matching). **Never expose to client.** Will land alongside Phase D AI features. |
| `RAZORPAY_KEY_ID` | yes (runtime, payments) | Cloudflare Worker secret (`wrangler secret put RAZORPAY_KEY_ID`) | `src/lib/payments/order.functions.ts`, `src/lib/payments/refund.functions.ts` | Razorpay API key id (public-ish: returned to the browser per-order so Checkout can open — **never** a `VITE_` build var, so test→live is a server rotation, no rebuild). Basic-auth username for Orders/Refund API. Missing → order creation frees the slot + returns `{ok:false, reason:"missing_keys"}`. Use `rzp_test_…` in staging, `rzp_live_…` in prod. |
| `RAZORPAY_KEY_SECRET` | yes (runtime, payments) | Cloudflare Worker secret | `src/lib/payments/order.functions.ts`, `src/lib/payments/refund.functions.ts` | Razorpay API secret (server-only). Basic-auth password for Orders/Refund API. **Never expose to client.** Missing → same fail-closed as above. |
| `RAZORPAY_WEBHOOK_SECRET` | yes (runtime, payments) | Cloudflare Worker secret | `src/routes/api/public/hooks/razorpay-webhook.ts` via `src/lib/auth/hmac.ts` | HMAC-SHA256 secret Razorpay signs the webhook raw body with (`x-razorpay-signature`). **Server-only.** Missing → webhook returns 500 `missing_webhook_secret`; mismatched → 401 `bad_signature` (so payments never confirm). Min length 16 enforced in `hmac.ts`. Must equal the secret configured on the Razorpay dashboard webhook. |

## Supabase Vault secrets

Not env vars but related — stored in `vault.secrets` via `SELECT vault.create_secret(<value>, <name>, <description>)`. Read at SQL-execution time via `vault.decrypted_secrets`.

| Name | Used by | Must match | Purpose |
|---|---|---|---|
| `cron_secret` | pg_cron job `send_reminders_24h` (migration `20260523000003_send_reminders_cron.sql`) | `CRON_SECRET` Worker secret (above) | Bearer token sent in `Authorization` header from `net.http_post` to `/api/public/hooks/send-reminders`. Current value set 2026-05-23 with secret id `20176555-98e5-4c8b-bd40-be71917b1714`. Length 64 hex chars. |

## How to set

### Cloudflare Worker secrets (runtime)

```bash
wrangler secret put CRON_SECRET
# paste value when prompted

wrangler secret put RESEND_API_KEY
# paste value when prompted
```

List existing: `wrangler secret list`. Rotate: re-run `wrangler secret put` with the new value (and rotate any matching Vault entry in the same window).

### Vite build-time vars

Add to `.env.local` (gitignored) for local dev. For prod, set on the Cloudflare Pages/Workers dashboard under "Variables and Secrets → Environment variables (build)".

### Supabase Vault secrets

Via SQL editor or `mcp__claude_ai_Supabase__execute_sql`:

```sql
SELECT vault.create_secret(
  '<value>',
  '<name>',
  '<description>'
);
```

To rotate without ID churn:

```sql
SELECT vault.update_secret(
  (SELECT id FROM vault.secrets WHERE name = '<name>'),
  '<new-value>',
  '<name>',
  '<description>'
);
```

## Cloudflare runtime: `process.env` vs `context.env`

Every server-side env read in this codebase uses `process.env.X`. This works because `wrangler.jsonc` sets `compatibility_flags: ["nodejs_compat"]` and `compatibility_date: "2025-09-24"` (past the node-compat cutoff). Do **not** switch to `context.env` Worker bindings without coordinating — every server-side env read assumes `process.env`.

## Build-time vs runtime

- `VITE_*` vars are inlined into the browser bundle at build time. Changing them requires a rebuild + redeploy.
- `process.env.X` reads on the Worker happen per-request. Rotating a Cloudflare Worker secret takes effect on the next request (no rebuild).
- Mixed reads (`client.ts:8-9`) use `import.meta.env.VITE_X || process.env.X` so the same module works in both browser and SSR contexts.

## Phase coverage (which env vars come in which phase)

- **A3 (shipped 2026-05-23)** — `CRON_SECRET` introduced for `/api/public/hooks/send-reminders`; paired with `cron_secret` Vault entry. Documented in this file from inception.
- **C1 (Phase C, pending)** — Supabase Auth → SMTP Settings will be swapped to Resend SMTP. SMTP credentials are configured **via the Supabase Dashboard** (Auth → SMTP Settings), not via app env vars. The plan mentions an optional `RESEND_SMTP_PASSWORD` Worker secret if a least-privilege SMTP key separate from `RESEND_API_KEY` is wanted; TBD with the C1 author.
- **D0 (Phase D, pending)** — `ANTHROPIC_API_KEY` Worker secret for server-side Claude calls. Never client.
- **H3 (Phase H, pending)** — `SENTRY_DSN` once Sentry / observability is wired.

## What's NOT here

- Daily.co (`DAILY_API_KEY`) — entire video stage deferred from V1.

When it lands, extend this file in the same PR.

## Payments (Razorpay V1, 2026-05-31)

- The three `RAZORPAY_*` Worker secrets are documented in the runtime table above.
  All three are **runtime** secrets (`wrangler secret put …`), never build-scope —
  `RAZORPAY_KEY_ID` is returned to the client per-order at request time, not inlined.
- **Test mode first:** everything ships against `rzp_test_…` keys (no KYC, no
  disbursement). Going live is a secret rotation to `rzp_live_…` plus pointing the
  Razorpay dashboard webhook at the prod URL — no code change.
- **Webhook config (operator):** in the Razorpay dashboard, add a webhook to
  `https://uniplug.app/api/public/hooks/razorpay-webhook` subscribed to
  `payment.captured`, `payment.failed`, and `refund.processed`, with the secret set
  equal to `RAZORPAY_WEBHOOK_SECRET`.
- **Data residency:** Razorpay processes/stores in India (RBI localization), which
  aligns with our DPDP posture for minor users.
- **Disbursement deferred:** Stage 5 accrues mentor payouts (`status='scheduled'`)
  but does not pay out. Real RazorpayX disbursement is a later phase and will add a
  RazorpayX key/secret here when wired.
