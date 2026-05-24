import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const TEST_STUDENT_EMAIL = process.env.E2E_STUDENT_EMAIL ?? "";
const TEST_STUDENT_PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? "";

if (!TEST_STUDENT_EMAIL || !TEST_STUDENT_PASSWORD) {
  throw new Error(
    "E2E_STUDENT_EMAIL / E2E_STUDENT_PASSWORD must be set. " +
      "These are test-tier credentials against the test Supabase project — never use prod.",
  );
}

test.describe("Journey: <name — e.g. browse-and-book>", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /sign in/i }).click();
    await page.getByLabel(/email/i).fill(TEST_STUDENT_EMAIL);
    await page.getByLabel(/password/i).fill(TEST_STUDENT_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("happy path: <one-line summary>", async ({ page }) => {
    // 1. Navigate
    await page.getByRole("link", { name: /browse mentors/i }).click();
    await expect(page).toHaveURL(/\/mentors/);

    // 2. Act
    // TODO: the user actions for this journey.

    // 3. Assert outcome
    // TODO: the final-state assertion. URL + visible content.

    // 4. Accessibility scan at the final state
    const a11y = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(a11y.violations).toEqual([]);
  });

  test("rejection: <a precondition violation, e.g. unauthenticated access>", async ({ page }) => {
    // Reset session for this test
    await page.context().clearCookies();
    await page.goto("/the-protected-route");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("edge: <known edge case from the feature spec>", async ({ page }) => {
    // E.g. booking a slot that just got taken; reviewing a session
    // that's already been reviewed; opening a notification that was
    // marked read in another tab.
    // TODO
  });
});
