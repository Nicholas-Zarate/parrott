import { test, expect } from "@playwright/test";

test.describe("Activities page", () => {
  test("shows page title and description", async ({ page }) => {
    await page.goto("/activities");
    await expect(page.getByRole("heading", { name: "Activities" })).toBeVisible();
    await expect(page.getByText("activity_listeners")).toBeVisible();
  });

  test("shows loading state then resolves to list, empty, or error", async ({
    page,
  }) => {
    await page.goto("/activities");
    const loading = page.getByTestId("activities-loading");
    await expect(loading).toBeVisible();
    const list = page.getByTestId("activities-list");
    const empty = page.getByTestId("activities-empty");
    const error = page.getByTestId("activities-error");
    await expect(loading).toBeHidden({ timeout: 15_000 });
    await expect(list.or(empty).or(error)).toBeVisible();
  });

  test("Activities nav link is present and navigates to /activities", async ({
    page,
  }) => {
    await page.goto("/");
    const activitiesLink = page.getByRole("link", { name: /activities/i });
    await expect(activitiesLink).toBeVisible();
    await expect(activitiesLink).toHaveAttribute("href", "/activities");
    await activitiesLink.click();
    await expect(page).toHaveURL(/\/activities/);
  });

  test("activity card can be expanded and collapsed", async ({ page }) => {
    await page.goto("/activities");
    await page.getByTestId("activities-loading").toBeHidden({ timeout: 15_000 });
    const list = page.getByTestId("activities-list");
    const listVisible = await list.isVisible();
    test.skip(!listVisible, "Activities list not visible (empty or error state)");
    const firstCard = page.getByTestId("activity-card").first();
    const cardVisible = await firstCard.isVisible();
    test.skip(!cardVisible, "No activity cards in list");
    const toggle = firstCard.getByRole("button");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(
      firstCard.getByText("Message").or(firstCard.getByText("Context"))
    ).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});
