---
name: review-ux
description: Review UI changes for accessibility (WCAG 2.1 AA), brand consistency, mobile responsiveness, and state coverage (empty / loading / error / success).
argument-hint: "[scope: diff | files <path>... | route <route>]"
---

Invoke the **ux-reviewer** subagent (`agents/ux-reviewer.md`).

Default scope: every modified file under `src/components/` or
`src/routes/` in the current diff against `origin/main`. $ARGUMENTS can
narrow to specific files or a specific route.

The subagent will:

1. Read the affected components and pages.
2. Walk the `brand-ui` skill checklist (tokens, type, components, a11y,
   mobile).
3. Check state coverage: empty / loading / error / success.
4. Flag the recurring dusty-rose-on-text contrast trap if it appears.
5. Note whether an existing Playwright spec covers the change, or
   recommend a new one (via the `playwright-qa` skill).
6. Produce a findings table with file:line references and concrete
   fixes.
