import { test, expect } from "@playwright/test";

/**
 * Phase B2 — notifications.spec.ts (skeleton, awaiting E2E Supabase test project)
 *
 * Booking trigger creates a notification → /notifications shows it →
 * mark-read flips it. Tests the create_booking_notification AFTER INSERT
 * trigger (migration 20260430125456) end-to-end.
 *
 * Blocked on: E2E test project + seeded mentor + signed-in student to
 * trigger a fresh booking → notification cycle.
 */

const E2E_PROJECT_REF = process.env.E2E_SUPABASE_PROJECT_REF;

test.describe("booking notifications", () => {
  test.skip(
    !E2E_PROJECT_REF,
    "E2E_SUPABASE_PROJECT_REF not set — provision a test Supabase project per ENV.md and rerun.",
  );

  test("booking creates a notification visible in /notifications", async ({ page }) => {
    // TODO: sign-in fixture + create a fresh booking via book_session RPC.
    await page.goto("/notifications");
    const notif = page.locator("[data-testid='notification-row']").first();
    await expect(notif).toBeVisible({ timeout: 10_000 });
    await expect(notif).toHaveAttribute("data-read", "false");

    await notif.getByRole("button", { name: /mark read|mark as read/i }).click();
    await expect(notif).toHaveAttribute("data-read", "true");
  });
});
