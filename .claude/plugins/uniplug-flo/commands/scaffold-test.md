---
name: scaffold-test
description: Scaffold a Playwright E2E test for a feature or user journey. Takes a feature description as argument.
argument-hint: "<feature or journey description, e.g. 'student books mentor session'>"
---

Invoke the **playwright-qa** skill (`skills/playwright-qa/SKILL.md`).

Use `$ARGUMENTS` as the feature description. If $ARGUMENTS is empty, ask
the user which journey to scaffold and offer the five canonical ones:

1. Signup + onboarding
2. Browse + book
3. Complete session
4. Review submission
5. Auth guard + redirect

Steps:

1. Map the feature/journey to one of the five (or note it's a new one
   that should be added to the canonical list).
2. Copy `skills/playwright-qa/scaffolds/journey-template.spec.ts` to
   `tests/e2e/<slug>.spec.ts`.
3. Fill in: page navigation, the user actions, the final-state
   assertion, and the axe scan.
4. Include at least one rejection case (precondition violation) and one
   edge case (per the skill spec).
5. Show the scaffolded file to the user before considering the task
   complete.

Do not run the test unless the user asks — scaffolding is the deliverable.
