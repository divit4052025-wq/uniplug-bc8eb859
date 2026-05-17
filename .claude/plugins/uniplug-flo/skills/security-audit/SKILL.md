---
name: security-audit
description: End-to-end security audit of Uniplug surfaces — RLS, route exposure, secrets, PII, payments, mentor verification, under-18 protections, webhook idempotency. Output matches audits/2026-05-14/rls-audit.md format.
model_class: opus
triggers:
  - "User says: run a security audit, audit Uniplug, audit the app, security review"
  - "Pre-launch checkpoint or quarterly review"
  - "After a significant feature ships that touches auth, payments, or PII"
  - "After an incident — even a near-miss — that exposed a class of risk"
allowed-tools: Read, Grep, Glob, Bash
---

# Skill: security-audit

A Uniplug security audit covers eight surfaces. Each surface gets a section in the output. Severity is graded **HIGH / MED / LOW**, and every HIGH gets a paired remediation migration or PR.

## The eight surfaces

### 1. RLS policy posture

Use the `rls-review` skill. The audit-level question is: are there any HIGH or MED findings unresolved from the previous audit, and have any new tables shipped without RLS or without rejection tests?

For every public table:

- RLS enabled (`pg_class.relrowsecurity`).
- All four CRUD verbs accounted for (explicit allow or explicit deny by omission).
- WITH CHECK expresses business relationship, not just identity.
- No tautological self-references.
- Paired dev-seed with at least one rejection test.

Output: a table of policies with status OK/WEAK/HIGH, mirroring `audits/2026-05-14/rls-audit.md`.

### 2. Route exposure

`src/routes/` defines public surface area. For each route:

- Is it intended to be public, authenticated, or role-gated?
- Does it use the `beforeLoad` client-side auth guard (Bug 6.3 pattern)?
- Are there RPC calls reachable without an active session that shouldn't be?
- Do error states leak schema names, internal IDs, or stack traces in user-facing messages?

The TanStack Start convention: routes that need auth declare it in `beforeLoad`. Routes that don't, must be explicitly public (sign in, marketing, mentor browse for unauthenticated users). The audit lists every route with its category.

### 3. Secrets and keys

Three categories live in Uniplug:

- **Supabase keys.** Anon key is on every device — that's fine, that's the public key. Service role key must never appear in `src/`, `.env` committed to git, or any client-bundled code. Service role is Cloudflare Worker–only.
- **Cloudflare Worker secrets.** Razorpay key/secret, Anthropic API key, any webhook signing keys — set via `wrangler secret put`, never in `wrangler.toml` or code.
- **Vite-exposed env vars.** Anything prefixed `VITE_` is shipped to the browser. Grep for `import.meta.env.VITE_` and audit each — the only legitimate ones are the Supabase URL and anon key.

Output: a list of every env var name in use, with column "exposed to client?" (yes/no) and "is this correct?" (yes/no). Any `no` is a HIGH finding.

### 4. PII flows

Map every place PII enters and exits:

- **Entry.** Signup, onboarding, document upload (`student_documents`), profile edit. Validate at boundary (Zod schemas on form input).
- **Storage.** What's in `students.*`, `mentors.*`, `student_documents`, `auth.users.raw_user_meta_data`. Document uploads are S3-style storage with their own RLS.
- **Transmission.** What gets sent to the Anthropic API for AI features. Audit prompts for accidental over-sharing (e.g. don't send full student dossier when only the topic is needed).
- **Logs.** Structured logs (per `observability` skill) must not include emails, phone numbers, document contents, or session note bodies. User IDs are OK.

Output: a flow diagram (text-based ascii or list form) of "user → form → DB → Worker → external service" with each hop labeled.

### 5. Payment ledger integrity

See the `payments-ledger` skill for the rules. The audit checks:

- Every payment-affecting event creates a new immutable row — no UPDATEs on the ledger.
- Razorpay webhook handler dedupes on `payment_id` via the dedup table.
- Refunds create offsetting ledger entries, never edit the original.
- Revenue/payout calculations never read from mutable `bookings.status` — they read from the ledger.
- Webhook signatures are verified against `RAZORPAY_WEBHOOK_SECRET`.

### 6. Mentor verification gates

A mentor exists in three states: `unverified` (just signed up), `pending` (submitted profile, awaiting admin), `approved` (visible in browse). Audit:

- Browse / search results exclude non-approved mentors at the policy layer (Risk 4 fix in May 14 audit).
- A pending mentor can edit their own profile but cannot self-approve (BEFORE UPDATE trigger from May 14).
- An unverified mentor cannot be booked even if the frontend somehow surfaces them.
- Admin approval flow is gated to admin role only (whatever the admin signal is — service role for now).

### 7. Under-18 user protections

Uniplug serves Indian school students applying to university. Many are minors. The audit checks:

- Date of birth captured at onboarding, used to flag accounts.
- Under-18 accounts: no public profile, no chat with strangers, parent/guardian contact field present, sessions audit-logged.
- PII export and account deletion requests handled (DPDP Act compliance baseline).
- AI features applied to minor accounts run on a stricter prompt template (`ai-feature-builder` skill).

### 8. Webhook + idempotency

Every external webhook (Razorpay, Anthropic if used async, Supabase webhooks if any):

- Verifies the signature before acting.
- Uses an idempotency key (provider's event ID) recorded in a dedup table.
- Replaying the same event N times produces the same final state as replaying once.
- Failures retry with exponential backoff; permanent failures alert (per `observability` skill).
- 200 OK is only returned after the side effect committed.

## Output format

Write to `audits/<YYYY-MM-DD>/security-audit.md`. Use the May 14 audit as the template:

1. **Header** — date, Supabase project ref, branch / commit.
2. **Headline numbers** — count of HIGH / MED / LOW findings, surfaces reviewed.
3. **Per-surface section** — for each of the eight above.
4. **Top findings** — the HIGH and any MEDs that need fixing this cycle.
5. **Recommended actions** — concrete migrations, code changes, or operational fixes, in priority order.
6. **Out of scope** — what wasn't reviewed and why.

## Anti-patterns

- **Treating the frontend as the boundary.** It isn't. RLS is.
- **Auditing without rejection tests.** A policy that "looks right" is not the same as a policy that's proven to block the attack.
- **Skipping the under-18 lens.** The default Uniplug user is a minor — that's load-bearing context, not a footnote.
- **Logging PII to "see what's happening."** Production logs must be PII-free. See `observability` skill.

## See also

- `rls-review` — the deeper dive for surface 1.
- `payments-ledger` — surface 5.
- `ai-feature-builder` — informs surfaces 3 and 4.
- `observability` — informs the logs side of surface 4.
- `audits/2026-05-14/rls-audit.md` — most recent example.
