import { defineConfig } from "@playwright/test";

/** Path to stored auth state for admin E2E (Personality Tools toggles, etc.). See docs/e2e-test-tool-response-delivery-plan.md for setup. */
const ADMIN_STORAGE_STATE = "playwright/.auth/admin.json";

export default defineConfig({
  testDir: "./test",
  testMatch: "**/*.test.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    { name: "default", use: {} },
    {
      name: "admin",
      use: {
        storageState: ADMIN_STORAGE_STATE,
      },
    },
  ],
});
