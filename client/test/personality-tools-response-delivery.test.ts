/**
 * E2E: Personality → Tools tab and per-tool response delivery (Text/Voice toggles).
 * Requires admin session: run auth-setup first (see docs/e2e-test-tool-response-delivery-plan.md).
 */

import { test, expect } from "@playwright/test";

test.describe.configure({ project: "admin" });

test.describe("Personality Tools – response delivery (text/voice)", () => {
  test("Personality page loads and Tools tab exists", async ({ page }) => {
    await page.goto("/personality");
    await expect(page.getByRole("heading", { name: /personality/i })).toBeVisible();

    const toolsTab = page.getByTestId("personality-tools-tab");
    await expect(toolsTab).toBeVisible();
    await toolsTab.click();
    await expect(page.getByTestId("tool-descriptions-list")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("tool list shows response delivery UI (Text and Voice)", async ({
    page,
  }) => {
    await page.goto("/personality");
    const toolsTab = page.getByTestId("personality-tools-tab");
    await toolsTab.click();
    const list = page.getByTestId("tool-descriptions-list");
    await expect(list).toBeVisible({ timeout: 15_000 });

    await expect(list.getByText("Text").first()).toBeVisible();
    await expect(list.getByText("Voice").first()).toBeVisible();
  });

  test("admin sees switches and can toggle then persist after reload", async ({
    page,
  }) => {
    await page.goto("/personality");
    const toolsTab = page.getByTestId("personality-tools-tab");
    await toolsTab.click();
    const list = page.getByTestId("tool-descriptions-list");
    await expect(list).toBeVisible({ timeout: 15_000 });

    const firstRow = list.locator("li").first();
    const voiceSwitch = firstRow.getByRole("switch").nth(1);
    const switchCount = await firstRow.getByRole("switch").count();
    test.skip(switchCount < 2, "No Text/Voice switches (not admin or no tools)");

    const voiceCheckedBefore = await voiceSwitch.isChecked();
    await voiceSwitch.click();
    await expect(voiceSwitch).toBeChecked({ checked: !voiceCheckedBefore });

    await expect(voiceSwitch).toBeEnabled({ timeout: 5000 });

    await page.reload();
    await page.getByTestId("personality-tools-tab").click();
    await expect(page.getByTestId("tool-descriptions-list")).toBeVisible({
      timeout: 15_000,
    });
    const firstRowAfter = page
      .getByTestId("tool-descriptions-list")
      .locator("li")
      .first();
    const voiceSwitchAfter = firstRowAfter.getByRole("switch").nth(1);
    await expect(voiceSwitchAfter).toBeChecked({
      checked: !voiceCheckedBefore,
    });
  });
});
