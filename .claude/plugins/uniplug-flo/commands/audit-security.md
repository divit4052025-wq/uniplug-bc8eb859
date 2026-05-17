---
name: audit-security
description: Run a Uniplug-wide security audit across all eight surfaces (RLS, routes, secrets, PII, payments, mentor gates, under-18, webhooks). Output to audits/<date>/security-audit.md.
argument-hint: "[surfaces: all | rls | routes | secrets | pii | payments | mentors | under-18 | webhooks] [scope: full | scoped]"
---

Invoke the **security-reviewer** subagent (`agents/security-reviewer.md`).

Default: full audit across all eight surfaces. If $ARGUMENTS specifies a
subset (e.g. `rls payments`), audit those surfaces only and note the
scope explicitly in the report header.

The subagent will:

1. Walk the `security-audit` skill checklist for each requested surface.
2. Delegate RLS deep-dive to the `db-reviewer` subagent and payments
   deep-dive to the `payments-reviewer` subagent.
3. Grade findings HIGH / MED / LOW.
4. Write a structured report to
   `audits/$(date -u +%Y-%m-%d)/security-audit.md` (or a
   `-scoped` suffix if not full coverage).
5. Surface the top HIGH findings inline in the response so the user sees
   them immediately, with paths to the full report.

Format reference: `audits/2026-05-14/rls-audit.md`.
