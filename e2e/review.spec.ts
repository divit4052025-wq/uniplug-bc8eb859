import { test, expect } from "@playwright/test";

/**
 * Phase B2 — review.spec.ts (skeleton, awaiting E2E Supabase test project)
 *
 * Student with a completed booking writes a review → appears on mentor page.
 * The reviews INSERT policy requires a completed booking; the seed seeds
 * one before this test runs.
 *
 * Blocked on: E2E test project + seeded completed booking + signed-in
 * student fixture.
 */

const E2E_PROJECT_REF = process.env.E2E_SUPABASE_PROJECT_REF;

test.describe("review submission", () => {
  test.skip(
    !E2E_PROJECT_REF,
    "E2E_SUPABASE_PROJECT_REF not set — provision a test Supabase project per ENV.md and rerun.",
  );

  test("student writes a review and it appears on mentor page", async ({ page }) => {
    // TODO: sign-in fixture + seeded completed booking against SEEDED_MENTOR_ID.
    await page.goto("/dashboard");
    await page.getByRole("link", { name: /past sessions/i }).click();
    await page
      .getByRole("button", { name: /write a review/i })
      .first()
      .click();
    await page.getByLabel(/rating/i).click(); // TODO: select stars
    await page.getByLabel(/review/i).fill("Great session, learned a lot.");
    await page.getByRole("button", { name: /submit/i }).click();

    await page.goto("/mentor/SEEDED_MENTOR_ID");
    await expect(page.getByText(/great session, learned a lot/i)).toBeVisible({ timeout: 10_000 });
  });
});
