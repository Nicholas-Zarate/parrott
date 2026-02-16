This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Testing (Playwright)

Tests use [Playwright Test](https://playwright.dev/docs/test). One runner for both unit-style tests and (when you add them) e2e browser tests.

**Run tests**

```bash
npm run test
# or
pnpm test
```

**What’s in place**

- **Config:** `playwright.config.ts` — `testDir`: `./test`, `testMatch`: `**/*.test.ts`, `baseURL`: `http://localhost:3000` for future e2e.
- **Unit-style tests:** `test/*.test.ts` — run in Node (no browser). Current: `test/logs-helpers.test.ts` for `lib/logs-helpers.ts`.
- **E2E later:** Add `test/*.spec.ts` or `test/e2e/*.spec.ts` and use `page`, `context`, etc. For e2e you can start the app with `webServer` in config or run the dev server yourself.

**Playwright CLI / “console”**

- **List/run:** `npx playwright test` (or `npm run test`).
- **UI mode:** `npx playwright test --ui` — interactive run and debug.
- **Report:** After a run, `npx playwright show-report` opens the HTML report (if you set `reporter: 'html'` in config).
- **No browser needed** for current unit tests; they run in Node. When you add e2e, Playwright will use the browser for those.
