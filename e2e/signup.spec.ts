import { test, expect } from "@playwright/test";

/**
 * Phase B2 — signup.spec.ts (skeleton, awaiting E2E Supabase test project)
 *
 * Student signup journey:
 *  1. Navigate to /student-signup
 *  2. Fill the form with a unique fixture email
 *  3. Submit → land on /dashboard (or email-confirm page in prod)
 *  4. Confirm via the test project's auth admin API (bypassing real email)
 *  5. Land on /dashboard
 *
 * Blocked on: E2E_SUPABASE_URL + E2E_SUPABASE_SERVICE_ROLE_KEY env vars
 * pointing at a separate test project (NOT the live ncfhmbugjeuerchleegq).
 * Plan: Divit provisions the test project; the ref is documented in
 * ENV.md once created. Until then this spec runs but skips.
 */

const E2E_PROJECT_REF = process.env.E2E_SUPABASE_PROJECT_REF;

test.describe("student signup", () => {
  test.skip(
    !E2E_PROJECT_REF,
    "E2E_SUPABASE_PROJECT_REF not set — provision a test Supabase project per ENV.md and rerun.",
  );

  test("student signs up and lands on dashboard", async ({ page }) => {
    const email = `e2e-student-${Date.now()}@uniplug-e2e.local`;
    await page.goto("/student-signup");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill("Test1234!");
    await page.getByLabel(/full name/i).fill("E2E Student");
    await page.getByLabel(/grade/i).fill("Grade 11");
    await page.getByLabel(/school/i).fill("Test School");
    await page.getByLabel(/phone/i).fill("+91 0000000000");
    await page.getByRole("button", { name: /sign up/i }).click();

    // TODO: confirm via E2E Supabase admin API once the test project lands.
    // For now expect either /dashboard (auto-confirm enabled in test project)
    // or the "check your email" page (production-like behavior).
    await expect(page).toHaveURL(/\/(dashboard|confirm-email|verify)/, { timeout: 10_000 });
  });
});
