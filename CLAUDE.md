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

**But `main` is now branch-protected** (`["All tiers green"]`), so a direct push
bypasses the gate rather than satisfying it — it works only because
`enforce_admins` is `false`. Recent work has used PRs for exactly that reason,
and a PR here costs nothing: `#1` and `#3` both went through one. Prefer a PR
when the change can fail CI; keep the direct path for README typos and for the
case the escape hatch exists for, which is CI itself being broken.

## GitHub Actions RUNS here, and `main` is protected

**This section said the opposite until 2026-08-25, and it was measurably wrong.**
Actions is enabled, the workflow runs on every push and PR, and `main` requires
a passing check:

```console
$ gh api repos/stonedog-code/test-playwright/actions/permissions
actions_enabled=true  allowed=all
$ gh api repos/stonedog-code/test-playwright/branches/main/protection \
    -q '.required_status_checks.contexts'
["All tiers green"]
```

Verified by execution, not by the setting: run `32893632375` on `main` completed
`success` with real runner ids and executed steps.

**A note claiming CI does not run is the most expensive kind of stale guidance** —
it tells the next reader to discount a red check, and the day it stops being true
is the day a real failure gets waved through on its authority. That nearly
happened: `main` sat red for hours on a genuine two-browser failure while this
file said nothing runs.

**Check a red before believing it, in either direction:**

```bash
gh api repos/stonedog-code/test-playwright/actions/runs/<id>/jobs \
  -q '.jobs[] | "\(.name): \(.conclusion) runner=\"\(.runner_name)\" steps=\(.steps|length)"'
```

`runner=""` with `steps=0` means no runner was allocated and nothing executed —
the verdict says nothing about the branch. A runner id plus executed steps means
the failure is real.

`npm run ci` is still worth running before you push: it is faster than CI and it
is the only gate that exists on a machine with no network. But it is **not**
equivalent — it runs **chromium only**, so the firefox and webkit shards can be
red while it is green. That gap is why the 2026-08-25 breakage was invisible
locally.

The workflow in `.github/workflows/test.yml` is part of what this repo teaches.
Do not delete it.

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
