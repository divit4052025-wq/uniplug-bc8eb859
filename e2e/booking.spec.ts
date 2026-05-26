import { test, expect } from "@playwright/test";

/**
 * Phase B2 — booking.spec.ts (skeleton, awaiting E2E Supabase test project)
 *
 * Signed-in student picks a slot → confirm → booking appears in /dashboard.
 *
 * Post-A1 (book_session RPC): the booking call routes through
 * supabase.rpc("book_session", ...). Spec must NOT do a direct INSERT to
 * bookings; it goes through the UI which goes through the RPC.
 *
 * Blocked on: E2E test project + a seeded approved mentor with
 * mentor_availability. The setup script (TODO) seeds these before each
 * test run.
 */

const E2E_PROJECT_REF = process.env.E2E_SUPABASE_PROJECT_REF;

test.describe("booking via book_session RPC", () => {
  test.skip(
    !E2E_PROJECT_REF,
    "E2E_SUPABASE_PROJECT_REF not set — provision a test Supabase project per ENV.md and rerun.",
  );

  test("student books an available slot and sees it on dashboard", async ({ page }) => {
    // TODO: programmatic sign-in via Supabase Auth admin API (signInWithPassword
    // against a seeded test student).
    await page.goto("/mentor/SEEDED_MENTOR_ID");
    const firstSlot = page.locator("button[aria-pressed]").first();
    await firstSlot.click();
    await page.getByRole("button", { name: /confirm booking/i }).click();
    await expect(page.getByText(/booking confirmed|see you/i)).toBeVisible({ timeout: 10_000 });

    await page.goto("/dashboard");
    await expect(page.getByText(/upcoming sessions/i)).toBeVisible();
    // At least one booking card visible.
    await expect(page.locator("[data-testid='upcoming-session-card']").first()).toBeVisible();
  });

  test("double-book returns the slot-already-booked error", async ({ page }) => {
    // TODO: same as above; second click on the already-booked slot.
    // Asserts: friendly error surface, no console error.
  });
});
