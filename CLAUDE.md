# test-playwright

Reference Playwright framework for browser and API end-to-end testing. Public,
MIT, and written to be read — the README is the deliverable, pasted into OneNote
as a development reference. Treat the code as documentation that happens to run.

## Commits go direct to `main`

**This repo is a sanctioned exception to the trunk-based PR rule in
`~/.claude/CLAUDE.md`.** Commit straight to `main`; no branch, no PR, no review
gate. The marker `.claude/allow-commit-on-main` at the repo root is what tells
the `block-commit-on-main` hook to allow it.

Single-author reference repo, no runtime, no deploy, no consumers to break. The
exemption is **not inherited** — it covers this repo only, at this root.

## What must stay true

- **The suite is green at every commit.** `npm run ci` before committing.
- **The demo app stays accessible.** `tests/ui/accessibility.spec.ts` passes
  today with zero axe violations, and that is load-bearing: every `getByRole`
  and `getByLabel` example in the README depends on the app actually exposing
  those roles and labels. If axe goes red, the examples stop being honest.
- **No `waitForTimeout`, no `{ force: true }`, anywhere.** Both are lint errors.
  A reference that demonstrates a sleep will be copied into fifty tests.
- **Never suppress a lint rule.** No `eslint-disable`, in any form. Fix the
  code, or replace the rule with a better-informed one.
- **The README quotes real output.** Test counts and timings come from actual
  runs; re-run and paste rather than editing numbers by hand.
- **Every example carries its "why".** A snippet showing `check()` is worth
  little; one explaining that `click()` would toggle a checkbox back off is why
  somebody reads this instead of the Playwright docs.
- **No internal detail leaks.** This repo is public: no tracker ids, no branch
  names, no internal hostnames.

## Layout

```
app/                  the demo application under test (dependency-free)
  server.ts           node:http server + JSON API
  public/             login, catalog, checkout, account pages
tests/
  auth.setup.ts       signs in once, saves storage state to .auth/
  fixtures.ts         custom fixtures + page-object wiring
  pages/              page objects (locators and actions; NO assertions)
  ui/                 browser tests
  api/                request-only tests, no browser
playwright.config.ts  projects: setup, chromium, firefox, webkit, mobile, api
```

## Commands

`npm test` runs chromium + api (the browsers installed by default).
`npm run test:all-browsers` needs `npx playwright install firefox webkit` first.
`npm run ci` is typecheck + lint + test.

## Toolchain notes

- Node 24 via nvm — fresh shells give 22.17.1, so `nvm use 24` first.
- `npx playwright install --with-deps` fails on this machine (it needs sudo).
  Use plain `npx playwright install chromium`; the system libraries are already
  present.
- `.auth/user.json` holds a real session cookie and is gitignored. Keep it that
  way.
