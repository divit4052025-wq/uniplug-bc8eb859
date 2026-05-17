---
name: playwright-qa
description: Scaffold Playwright E2E tests for critical Uniplug user journeys (signup → onboarding → browse → book → complete-session → review) with built-in axe accessibility checks.
model_class: sonnet
triggers:
  - "User says: write an E2E test, add a Playwright test, scaffold a test for <feature>"
  - "New user-facing flow lands and needs regression coverage"
  - "Before a release that touches signup, booking, or completion paths"
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Skill: playwright-qa

E2E tests cover the critical user journeys. Unit tests are useful but don't catch the integration failures that have actually hurt Uniplug — every regression that reached production was a flow break (calendar timezone, booking → completion handoff, notification trigger fire-but-not-show). E2E is the layer that catches those.

## Critical journeys

The five journeys that must always have green E2E coverage:

1. **Signup + onboarding.** Email signup → email confirmation → role pick → onboarding form complete → land on dashboard. Includes the Bug 6.2 atomicity check (no orphan auth.users without a matching mentors/students row).
2. **Browse + book.** Authenticated student → mentor browse → mentor detail page → pick slot from calendar → confirm booking → payment success (test mode) → land on confirmation.
3. **Complete session.** Mentor marks session complete → session moves to past sessions → notification fires for student → student sees the session in past sessions with "Leave Review" CTA.
4. **Review submission.** Student opens past session → submits review (rating + body) → review is visible on mentor's public profile → review can be edited within the edit window.
5. **Auth guard + redirect.** Unauthenticated user hits a protected route → redirected to sign-in → after sign-in returns to the original route (Bug 6.3 + 6.7 flow).

Each journey gets its own spec under `tests/e2e/<journey-name>.spec.ts`.

## Scaffold structure

A scaffolded test follows the structure in `scaffolds/journey-template.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Journey: <name>', () => {
  test.beforeEach(async ({ page }) => {
    // Sign in as a known test account, or start unauthenticated.
  });

  test('happy path', async ({ page }) => {
    // Step 1: navigate
    // Step 2: act
    // Step 3: assert outcome — visible content + URL
    // Step 4: axe scan at the final state
    const a11y = await new AxeBuilder({ page }).analyze();
    expect(a11y.violations).toEqual([]);
  });

  test('rejection: unauthenticated user is redirected', async ({ page }) => {
    // The defensive case — what happens when the precondition is missing.
  });

  test('edge: <known edge case from the feature spec>', async ({ page }) => {
    // E.g. booking a slot that just got taken by another student.
  });
});
```

Every journey needs at least one happy path + one rejection case + one edge case. The axe scan runs at the *final* state of each test (and at any state where the visible content changes meaningfully — sign-in modal, booking confirmation, etc.).

## Accessibility coverage

`@axe-core/playwright` flags WCAG 2.1 AA violations. Uniplug requires AA across all surfaces. Common violations to expect:

- Missing form labels (especially on `Input` and `Select` components).
- Color contrast below 4.5:1 on body text (the dusty rose `#E8C4B8` against off-white `#FFFCFB` fails — see `brand-ui` skill).
- Missing `aria-label` on icon-only buttons (lucide-react icons in the navbar are a frequent offender).
- Focus traps in modals (`@radix-ui/react-dialog` handles this if used correctly; check it isn't being overridden).

The `ux-reviewer` subagent uses this skill's axe outputs when reviewing UI.

## Test data + isolation

- Use a dedicated test Supabase project, not the production project. The project ref for that lives in `.env.test` (not committed).
- Tests create their own data via the Supabase MCP `execute_sql` or via a known set of seed accounts. Each test cleans up after itself; the suite is order-independent.
- For payment flows: Razorpay test mode keys, never live keys. Use test card `4111 1111 1111 1111` for happy path, the test cards from Razorpay's docs for declines.

## Running

`npx playwright test` runs the full suite. `npx playwright test --ui` for the interactive runner. The release-checklist gates merge on green E2E for the journeys touched by the change.

## Anti-patterns

- **`page.waitForTimeout(1000)`.** Always wait on a specific selector or response — timeouts mask real race conditions.
- **Testing through implementation details.** Click by visible role/text, not by CSS class. `page.getByRole('button', { name: 'Book session' })` not `page.locator('.btn-book-primary')`.
- **Skipping axe on the assumption "the design system handles it."** The design system can be misused. The axe scan is the proof.
- **Hardcoding production URLs or live API keys.** Tests must run against the test env. Failing loud on `process.env.RAZORPAY_KEY === undefined` is the desired behavior.

## See also

- `brand-ui` skill — for the design tokens the tests assert against.
- `release-checklist` skill — which journeys gate merge.
- `scaffolds/journey-template.spec.ts` — the starting template.
