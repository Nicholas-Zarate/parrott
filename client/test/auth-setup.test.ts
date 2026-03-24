/**
 * One-time setup: record admin session for E2E tests that need isAdmin (e.g. Personality Tools toggles).
 * Run: npm run test:admin-auth  (from client/; works on Windows via cross-env)
 * Or:  PLAYWRIGHT_RECORD_ADMIN=1 npx playwright test test/auth-setup.test.ts --project=default --headed  (Unix)
 * Or:  $env:PLAYWRIGHT_RECORD_ADMIN=1; npm run test:admin-auth  (PowerShell without cross-env)
 * When the browser opens, sign in as an admin (Discord OAuth). The test waits up to 2 minutes for
 * "Settings" in the nav, then goes to Personality → Tools and saves state to playwright/.auth/admin.json.
 * Requires the DB to have at least one tool (so the Tools tab is visible).
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const ADMIN_STORAGE_PATH = "playwright/.auth/admin.json";

test.describe("Auth setup (record admin session)", () => {
  test.skip(
    !process.env.PLAYWRIGHT_RECORD_ADMIN,
    "Run with PLAYWRIGHT_RECORD_ADMIN=1 to record admin session"
  );

  test("wait for admin login then save storage state", async ({ page }) => {
    const authDir = path.dirname(ADMIN_STORAGE_PATH);
    fs.mkdirSync(authDir, { recursive: true });

    await page.goto("/");

    // Wait for admin indicator: Settings in nav (only shown when isAdmin)
    await expect(page.getByText("Settings")).toBeVisible({ timeout: 120_000 });

    // Go to Personality → Tools and ensure we see admin UI (switches)
    await page.goto("/personality");
    const toolsTab = page.getByTestId("personality-tools-tab");
    await toolsTab.click();
    await expect(page.getByTestId("tool-descriptions-list")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("switch").first()).toBeVisible({
      timeout: 10_000,
    });

    await page.context().storageState({ path: ADMIN_STORAGE_PATH });
  });
});
