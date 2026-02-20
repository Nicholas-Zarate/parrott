# E2E Test Plan: Tool Response Delivery (Text/Voice)

## What “the bot uses it correctly” means

Two layers need to be validated:

1. **Config path**: Admin sets toggles in UI → RPC updates `tools_meta_data.response_delivery` → next page load (or agent refresh) reads the new value.
2. **Handler path**: When the bot replies to an @mention, it uses `toolsCalled` + `toolMetadata` to set `doText` / `doVoice` in the mention handler.

Playwright runs in the browser and can only drive the **client**. We use a **Playwright test admin session** (stored auth state) so E2E runs as an admin and can assert toggles and persistence.

---

## Auth: Playwright admin session

- ~~**No auth** — assert Personality loads, Tools tab shows, tool rows show response delivery labels (or read-only “Text”).~~
- ~~**Optional, if auth feasible** — sign in as admin and test toggle + persist.~~
- **Use a Playwright admin session:** Run tests in a project that loads `storageState` from a pre-recorded admin login (e.g. `playwright/.auth/admin.json`). Tests then run as admin: they see Text/Voice switches, can toggle, and we assert persistence after reload.

**Auth config (Playwright):** Use a second project in `playwright.config.ts` that sets `use.storageState: "playwright/.auth/admin.json"` (or similar). The default project stays unauthenticated for other tests; the tool-response-delivery E2E runs in the admin project.

---

## Quick to-do: set up Playwright admin session

1. ~~**Create auth setup script**~~ — Done: `client/test/auth-setup.test.ts` (run with `PLAYWRIGHT_RECORD_ADMIN=1`; see **How to use the admin session** below).
2. ~~**Add `.gitignore` entry**~~ — Done: `client/playwright/.auth/`.
3. ~~**In `playwright.config.ts`**~~ — Done: `admin` project with `storageState: 'playwright/.auth/admin.json'`.
4. **CI:** Run the auth setup once (or use a CI secret with a pre-generated admin storageState); or skip the admin project in CI if you don’t have test Discord OAuth.

---

## How to use the admin session

**1. Record the admin session (one-time or when session expires)**

From the `client/` directory (app can be running or Playwright will start it):

**Windows (PowerShell / cmd) — use the script (recommended):**

```powershell
cd client
npm run test:admin-auth
```

The script uses `cross-env` to set `PLAYWRIGHT_RECORD_ADMIN=1` so it works on Windows without extra syntax.

**Windows (PowerShell) — without cross-env:**

```powershell
cd client
$env:PLAYWRIGHT_RECORD_ADMIN=1; npx playwright test test/auth-setup.test.ts --project=default --headed
```

**Unix (Bash / sh):**

```bash
cd client
PLAYWRIGHT_RECORD_ADMIN=1 npx playwright test test/auth-setup.test.ts --project=default --headed
```

A browser opens. **Sign in as an admin** (Discord OAuth). The test waits up to 2 minutes for the nav to show "Organization", then goes to Personality → Tools, verifies switches are visible, and saves state to `playwright/.auth/admin.json`. The DB must have at least one tool so the Tools tab is visible.

**2. Run the tool-response-delivery E2E (with admin session)**

```bash
cd client
npx playwright test test/personality-tools-response-delivery.test.ts
```

These tests run only in the `admin` project (they use `test.describe.configure({ project: 'admin' })`), so they load the stored session and run as admin.

**3. Run all tests (default + admin)**

```bash
cd client
npx playwright test
```

Runs every test in both `default` and `admin` projects. The auth-setup test is skipped unless `PLAYWRIGHT_RECORD_ADMIN=1` is set (or you use `npm run test:admin-auth`).

---

## Test review (step-by-step) and improvements

**Auth setup (`auth-setup.test.ts`):**

- Creates `playwright/.auth/` before saving state. Waits for "Organization" (admin nav) with 2 min timeout so you can sign in. Then Personality → Tools and verifies switches. **Requirement:** DB must have at least one tool so the Tools tab is visible (otherwise the tab is hidden and the test fails).
- **Improvement:** Comment updated with Windows (PowerShell) and cross-env usage.

**Personality Tools E2E (`personality-tools-response-delivery.test.ts`):**

1. **Test 1 (load + Tools tab):** Asserts heading, Tools tab visible, list visible. If the DB has no tools, `hasPromptContent` is false and the Tools tab is not rendered — test will fail (expected when no data).
2. **Test 2 (Text/Voice UI):** Scoped to the list; uses `.first()` for labels to avoid multiple matches. Good.
3. **Test 3 (toggle + persist):** Uses first row’s second switch (Voice). After click, **replaced fixed `waitForTimeout(1500)`** with **`expect(voiceSwitch).toBeEnabled({ timeout: 5000 })`** so we wait for the RPC to finish (switch is disabled while `saving`). Then reload and assert the same switch state. **Caveat:** Assumes tool list order is stable across reload; if the API returns tools in a different order, the “first” row could be a different tool.

**Windows / admin session:**

- **Issue:** `PLAYWRIGHT_RECORD_ADMIN=1 npm run test:admin-auth` fails on PowerShell because `VAR=value` is not valid.
- **Fix:** Use **`cross-env`** in the npm script so the script sets the env var on all platforms. Run **`npm run test:admin-auth`** from `client/` (no env var needed). Alternatively on PowerShell: `$env:PLAYWRIGHT_RECORD_ADMIN=1; npm run test:admin-auth`.

---

## Playwright E2E: scope and placement

**Test file:** `client/test/personality-tools-response-delivery.test.ts` — use `test.describe.configure({ project: 'admin' })` so the test runs only in the admin project (with stored session), not in the default unauthenticated project.

**Test cases:**

| Case | What it does |
|------|----------------|
| Personality page loads and Tools tab exists | `goto /personality`, click “Tools” tab, expect Tools tab content visible. |
| Tool list shows response delivery UI (admin) | As admin, expect tool rows to show Text and Voice **switches** (not only read-only). |
| Admin can toggle and persist | Toggle Voice for one tool (e.g. echo), reload page, expect that tool’s Voice switch still checked (or read-only label “Voice” / “Text + voice”). |

---

## Files and components the E2E touches

| Layer | File(s) | Role |
|-------|---------|------|
| **Test** | `client/test/personality-tools-response-delivery.test.ts` | Playwright: navigate, click Tools tab, assert tool list and Text/Voice UI; toggle + reload and assert persistence (admin session). |
| **Config** | `client/playwright.config.ts` | Add project with `use.storageState: 'playwright/.auth/admin.json'` for admin E2E. |
| **Route** | `client/app/personality/page.tsx` | Fetches tools and `response_delivery`; renders PersonalityTabs. |
| **Tabs** | `client/components/personality-tabs.tsx` | Passes `toolDescriptions` and `isAdmin` to ToolDescriptionsList. |
| **List** | `client/components/prompt-config-lists.tsx` | ToolDescriptionsList: Text/Voice switches and RPC call. |
| **Backend** | Supabase `tools_meta_data.response_delivery`, RPC `update_tool_response_delivery` | Persistence. |

---

## Optional: agent-side test (handler logic)

To prove the **bot** uses `response_delivery` correctly, add a Node test in the agent (e.g. `agent/test/mention-response-delivery.test.js`) that, given mock `toolsCalled` and `toolMetadata`, asserts the resulting `doText` / `doVoice` (and thus edit vs TTS) match the configured values. No Playwright required.
