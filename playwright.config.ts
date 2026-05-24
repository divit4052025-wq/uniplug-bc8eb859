import { defineConfig, devices } from "@playwright/test";

/**
 * Phase B2 (2026-05-23): Playwright smoke-suite config.
 *
 * Five spec files under `e2e/` cover the critical journeys per the V1 plan:
 *  - browse.spec.ts (anonymous)  — works today, no auth fixture needed
 *  - signup.spec.ts              — skeleton, awaiting E2E Supabase test project
 *  - booking.spec.ts             — skeleton, awaiting E2E Supabase test project
 *  - review.spec.ts              — skeleton, awaiting E2E Supabase test project
 *  - notifications.spec.ts       — skeleton, awaiting E2E Supabase test project
 *
 * BASE_URL defaults to the local dev server (Vite on port 5173) and the
 * webServer block auto-starts it for `npx playwright test`. In CI, set
 * BASE_URL to a deployed staging URL or leave it default and rely on the
 * webServer.
 *
 * The auth-flow specs need a separate Supabase test project (NOT
 * ncfhmbugjeuerchleegq — that's the live prod DB). The plan calls for the
 * test project ref to be tracked in ENV.md once Divit creates it.
 */
export default defineConfig({
  testDir: "./e2e",
  // Each spec is allowed to set its own timeout for the slow flows.
  timeout: 30_000,
  expect: { timeout: 5_000 },
  // Bail fast on CI to keep PR feedback tight.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",

  use: {
    baseURL: process.env.BASE_URL || "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-iphone",
      use: { ...devices["iPhone 14"] },
    },
  ],

  // Auto-start `npm run dev` for local runs. Skip in CI where the workflow
  // either has a separate webServer step or hits a deployed staging URL.
  webServer: process.env.CI
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:5173",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
