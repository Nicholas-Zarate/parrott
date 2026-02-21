/**
 * E2E: Request restart modal on Personality page.
 * Clicks "Request restart", checks modal content (title, two send options, cancel).
 */

import { test, expect } from "@playwright/test";

test.describe("RequestRestartModal", () => {
  test("opens from Personality and shows title and both send options", async ({
    page,
  }) => {
    await page.goto("/personality");
    await expect(page.getByRole("heading", { name: /personality/i })).toBeVisible({
      timeout: 10_000,
    });

    // Request restart lives inside the Ending details section; expand it
    await page.locator("details").filter({ hasText: "Ending" }).locator("summary").click();
    const openBtn = page.getByTestId("request-restart-open");
    await expect(openBtn).toBeVisible();
    await openBtn.click();

    const dialog = page.getByRole("dialog", { name: /request server restart/i });
    await expect(dialog).toBeVisible();

    await expect(
      dialog.getByRole("heading", { name: /request server restart/i })
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: /send to voice chat/i })
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: /send to #parrot channel/i })
    ).toBeVisible();
    await expect(dialog.getByRole("button", { name: /cancel/i })).toBeVisible();
  });

  test("closes when Cancel is clicked", async ({ page }) => {
    await page.goto("/personality");
    await expect(page.getByRole("heading", { name: /personality/i })).toBeVisible({
      timeout: 10_000,
    });

    await page.locator("details").filter({ hasText: "Ending" }).locator("summary").click();
    await page.getByTestId("request-restart-open").click();
    const dialog = page.getByRole("dialog", { name: /request server restart/i });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: /cancel/i }).click();
    await expect(dialog).toBeHidden();
  });
});
