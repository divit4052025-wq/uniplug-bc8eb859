import { test, expect } from "@playwright/test";

/**
 * Phase B2 — browse.spec.ts
 *
 * Anonymous browse journey. No auth fixture needed; hits the live Supabase
 * project via the same VITE_SUPABASE_* env baked into the build.
 *
 * Asserts: home page renders, "Browse" CTA navigates, /browse page loads
 * the mentor list (or empty state), and a mentor card opens a mentor
 * detail page if any mentors are approved.
 */

test.describe("anonymous browse", () => {
  test("home page renders the hero and CTAs", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText(/UniPlug/i);
    await expect(
      page.getByRole("link", { name: /find your plug|get started/i }).first(),
    ).toBeVisible();
  });

  test("browse page lists mentors or shows empty state", async ({ page }) => {
    await page.goto("/browse");
    // Either the mentor grid renders OR an empty-state message is visible.
    const mentorCard = page
      .locator("[data-testid='mentor-card']")
      .or(page.getByText(/no mentors yet|coming soon|check back/i));
    await expect(mentorCard.first()).toBeVisible({ timeout: 10_000 });
  });

  test("mentor detail page loads if a mentor exists", async ({ page }) => {
    await page.goto("/browse");
    const firstCard = page.locator("[data-testid='mentor-card']").first();
    if (await firstCard.isVisible().catch(() => false)) {
      await firstCard.click();
      await expect(page).toHaveURL(/\/mentor\/.+/);
      await expect(page.locator("h1, h2").first()).toBeVisible();
    } else {
      test.skip(true, "no mentors available — empty-state path tested above");
    }
  });
});
