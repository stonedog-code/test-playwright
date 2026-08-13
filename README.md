# Playwright Test Framework — Reference

A working, runnable reference for end-to-end testing with Playwright: browser
tests, API tests, page objects, fixtures, saved authentication, accessibility
checks, and a catalogue of tips for driving real UI primitives.

Everything here passes, lints clean, and typechecks. It ships its own demo
application, so there is nothing to point it at and nothing to configure.

**Repo:** `github.com/nehsa-net/test-playwright` · **Licence:** MIT
**Stack:** Playwright 1.62 · TypeScript 5.7 · axe-core

---

## Pasting this into OneNote

Open the README on GitHub in a browser (the rendered view, not "Raw"), select
the article body, copy, paste into OneNote. Headings, tables and code blocks
survive intact.

Pasting from the raw `.md` gives plain text with `#` and backticks showing — if
that happens, you copied the wrong view.

After pasting: select all and set code blocks to Consolas 10pt, and drag the
right edge of any table to widen it.

---

## Quick start

```bash
git clone git@github.com:nehsa-net/test-playwright.git
cd test-playwright
npm ci
npx playwright install chromium

npm test              # chromium + api
npm run test:api      # API only — no browser, ~2s
npm run test:ui       # browser only
npm run test:watch    # the interactive UI mode
npm run report        # open the last HTML report
```

Node 24 is required. Fresh shells on this machine give 22.17.1, so:

```bash
source ~/.nvm/nvm.sh && nvm use 24
```

Playwright starts the demo app itself — there is no separate server to run.

**Actual output:**

```
Running 69 tests using 16 workers
  ...
  69 passed (5.1s)
```

52 browser tests and 17 API tests. For Firefox and WebKit:

```bash
npx playwright install firefox webkit
npm run test:all-browsers
```

---

## Running the tests without CI

**GitHub Actions is disabled on this repository.** Nothing runs automatically on
push, so the gate is whatever you run by hand.

The workflow in `.github/workflows/test.yml` is kept deliberately: it is
reference material, and it has been verified by executing it in a real runner
container with [`act`](https://github.com/nektos/act). It is accurate; it is
simply not switched on.

| Command | What it covers |
|---|---|
| `npm test` | Chromium plus the API project. The one to run on every change |
| `npm run test:api` | API tier only — no browser, ~2s |
| `npm run test:ui` | Browser tier only |
| `npm run test:all-browsers` | Chromium, Firefox and WebKit |
| `npm run test:watch` | Playwright UI mode, for developing a test |
| `npm run typecheck` / `npm run lint` | Types and lint on their own |
| `npm run ci` | Everything the workflow would run |

**`npm run ci` is the gate.** With Actions off it is the only thing between a
mistake and `main`, so run it before every commit — not just before the ones
that feel risky.

---

## Where Playwright fits

Playwright is the **end-to-end tier**. It answers the one question unit and
integration tests structurally cannot: *can a person actually do this, in a real
browser, start to finish?*

| Tier | Tool here | Answers |
|---|---|---|
| Unit | Jest / `go test` | Does this function do what it says? |
| Integration | Jest + testcontainers | Do the seams hold — route, service, database? |
| **E2E** | **Playwright** | Can a person complete the journey in a browser? |

Two consequences worth stating, because both get this wrong in practice:

- **Do not re-test business logic here.** A Playwright test costs seconds and a
  browser; a unit test costs milliseconds. Push everything down that can go
  down, and keep this tier for journeys.
- **Do test the things only a browser can see.** jsdom has no layout engine, so
  every element reports a zero-sized box: a jsdom test will happily agree that
  a 400px panel fits a 375px screen. Overflow, focus order, tap-target size,
  and "is the button actually clickable" are answerable only here.

---

## How it works

### Layout

```
app/                   the demo app — dependency-free node:http server
  server.ts            static files + a small JSON API
  public/              login, catalog, checkout, account pages
tests/
  auth.setup.ts        signs in once, saves the session to .auth/
  fixtures.ts          custom fixtures, page objects wired in
  pages/               page objects — locators and actions, no assertions
  ui/                  browser tests
  api/                 request-only tests, no browser
playwright.config.ts   projects, reporters, webServer, timeouts
```

### Projects

Each project is a distinct way of running the suite:

| Project | What it is | storageState |
|---|---|---|
| `setup` | Signs in once, writes `.auth/user.json` | — |
| `chromium` / `firefox` / `webkit` | The UI tier per engine | signed in |
| `mobile-chrome` | Pixel 7 viewport and user agent | signed in |
| `api` | `request` only, **no browser** | deliberately none |

The `api` project having no `storageState` is not an oversight. It is what makes
`test('requires a session')` meaningful — from a signed-in context, an
authorisation test proves nothing.

### Sign in once, not once per test

```ts
// tests/auth.setup.ts
setup('authenticate', async ({ page }) => {
  await page.goto('/login.html');
  await page.getByLabel('Username').fill('testpilot');
  await page.getByLabel('Password').fill('correct-horse');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await page.waitForURL('**/account/orders.html');       // a real signal
  await expect(page.getByTestId('current-user')).toHaveText('testpilot');

  await page.context().storageState({ path: AUTH_FILE });
});
```

```ts
// playwright.config.ts
{ name: 'chromium', use: { storageState: '.auth/user.json' }, dependencies: ['setup'] }
```

Walking the login form in every test is the biggest single waste of time in most
suites, and it means a broken login page fails 200 tests instead of one. Here
exactly one file drives the form — `tests/ui/login.spec.ts`, which is *about*
the form.

One file opts back out, via a fixture option:

```ts
test.use({ signedOut: true });   // drops the saved session for this file only
```

**Save state only after a real signal.** Writing it before the cookie is set
produces an empty file and a suite that fails everywhere with no obvious cause.

### Fixtures over `beforeEach`

```ts
export const test = base.extend<Pages>({
  catalogPage: async ({ page }, use) => {
    const catalogPage = new CatalogPage(page);
    await catalogPage.goto();
    await expect(catalogPage.resultCount).toBeVisible();   // let the first load settle
    await use(catalogPage);
  },
});
```

```ts
test('filters by availability', async ({ catalogPage }) => {
```

A fixture runs only for tests that ask for it, tears down even when the test
fails, and composes — one fixture can depend on another. The test body then
starts with the line that matters instead of three lines of construction.

### Page objects: locators, not assertions

```ts
export class CatalogPage extends BasePage {
  readonly path = '/catalog.html';

  get items(): Locator {
    return this.results.getByRole('listitem');
  }

  availability(option: Availability): Locator {
    return this.page.getByRole('radio', { name: option });
  }

  async setAvailability(option: Availability): Promise<void> {
    await this.availability(option).check();
  }
}
```

**Page objects answer "how do I reach this?"; tests answer "what should be
true?"** A page object that asserts turns every test into
`page.checkEverythingIsFine()`, and the failure message stops telling you what
the test wanted.

Locators are **getters**, not fields assigned in the constructor. A locator is
lazy — it resolves when used, not when created — and a getter makes that
obvious on a page that re-renders.

---

## Dependency injection

**Playwright's fixture system is a dependency-injection container**, and it is
worth naming it that way: once you see it as one, the rest of the API stops
looking like a grab-bag of helpers.

A test declares what it needs in its parameter list. The runner constructs those
things in dependency order, only for the tests that asked for them, and disposes
of them afterwards — including when the test fails.

```ts
test('filters by availability', async ({ catalogPage, page }) => { … });
//                                       ^^^^^^^^^^^  ^^^^
//                                       declared, never constructed
```

That test does not know how a `CatalogPage` is built, what it costs, or what has
to be torn down. It states a requirement; the container satisfies it.

### The four kinds, and when each is right

| Kind | Shape | Reach for it when |
|---|---|---|
| Built-in | `{ page, context, request, browser }` | Always — everything else builds on these |
| Custom | `base.extend<{ catalogPage: CatalogPage }>({ … })` | Setup that more than one test wants |
| Option | `signedOut: [false, { option: true }]` | A **value** varies per file or per project |
| Worker | `[fn, { scope: 'worker' }]` | Setup too expensive to repeat for every test |

### Constructor injection into page objects

```ts
export abstract class BasePage {
  constructor(readonly page: Page) {}          // the dependency arrives; it is not imported
}
```

```ts
catalogPage: async ({ page }, use) => {
  const catalogPage = new CatalogPage(page);   // `page` injected by the runner
  await catalogPage.goto();
  await use(catalogPage);
},
```

**A page object must never reach for a module-level `page`.** Files run in
parallel in separate workers, and a shared module-level browser handle is the
one bug that makes a suite unfixable: tests pass alone, fail together, and the
failure lands in whichever test happened to run second.

### Fixtures compose — that is the part `beforeEach` cannot do

```ts
export const test = base.extend<Pages & Options>({
  signedOut: [false, { option: true }],

  // Overriding a BUILT-IN fixture. This is how one file opts out of the shared
  // session without a second Playwright project.
  storageState: async ({ signedOut, storageState }, use) => {
    await use(signedOut ? undefined : storageState);
  },

  catalogPage: async ({ page }, use) => { … },   // depends on `page`
});
```

Three things are happening that `beforeEach` has no answer for:

- **`storageState` is overridden, and the override receives the original.**
  A fixture can wrap the thing it replaces, so opting out of authentication is
  four lines rather than a duplicated project.
- **`catalogPage` depends on `page`,** and Playwright resolves the order. With
  `beforeEach` the ordering is whatever the file happens to declare.
- **Teardown runs on failure.** Everything after `await use(...)` is teardown,
  and it executes even when the test threw — which is exactly when cleanup
  matters most.

### Worker fixtures: expensive setup, shared honestly

```ts
type Worker = { seededAccount: { id: string; email: string } };

export const test = base.extend<object, Worker>({
  seededAccount: [
    async ({}, use, workerInfo) => {
      const account = await createAccount(`pilot-${workerInfo.workerIndex}@example.test`);
      await use(account);
      await deleteAccount(account.id);          // teardown, once per worker
    },
    { scope: 'worker' },
  ],
});
```

A worker fixture is built once per worker process and shared by every test that
worker runs. That is a real saving on anything slow — seeding a tenant, starting
a container — and a real hazard: **shared state is shared mutation.** Key
anything the fixture creates by `workerInfo.workerIndex` so parallel workers
cannot collide, and keep worker-scoped values read-only from the test's point of
view. If a test needs to mutate it, it belongs at test scope.

### Automatic fixtures: setup nobody has to remember to ask for

```ts
failOnConsoleError: [
  async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await use();

    expect(errors, 'the page logged console errors').toEqual([]);
  },
  { auto: true },
],
```

`{ auto: true }` runs the fixture for every test in scope whether or not it was
requested. Use it for cross-cutting guarantees — console errors, a trace
annotation, a per-test seed — and for nothing else. An auto fixture that does
real setup is a `beforeEach` with the ordering hidden, which is worse than a
`beforeEach`.

### Injecting into the app, not just the test

The seams do not stop at the test process. The browser side takes injection too:

```ts
// A deterministic clock — the app's `new Date()` now returns this
await page.clock.setFixedTime(new Date('2026-08-13T09:00:00Z'));

// A deterministic backend, for a path the real server will not produce
await page.route('**/api/orders', (route) =>
  route.fulfill({ status: 503, body: '{"error":"upstream down"}' }),
);

// A deterministic environment, before any app script runs
await page.addInitScript(() => {
  window.localStorage.setItem('feature.newCheckout', 'on');
});
```

`addInitScript` runs **before** the page's own scripts on every navigation,
which is what makes it the right place for feature flags and seeded storage.
Setting them after `goto` races the app's own bootstrap, and that race is
usually won locally and lost in CI.

### Anti-patterns

| Instead of | Do | Because |
|---|---|---|
| A module-level `let page` shared across tests | Take `page` as a fixture parameter | Parallel workers make shared handles unfixable |
| `beforeEach` constructing four page objects | One fixture per page object | Fixtures build only what the test asked for |
| A `global.setup.ts` writing to module state | A worker fixture, keyed per worker | Module state is not shared across workers, so it silently differs |
| `process.env.THING` read inside a test | An option fixture set per project | Options appear in the report and in `test.use`; env vars do not |
| A page object that news up its own `Page` | Constructor injection | An object that builds its own dependencies cannot be faked or scoped |

---

## Parameterization

Four axes, from smallest to largest. Reach for the smallest one that fits.

| Axis | Mechanism | Varies |
|---|---|---|
| Case | A loop generating tests | Input data |
| File / block | `test.use({ … })` | A fixture's value |
| Project | `projects: [ … ]` in the config | Browser, viewport, storage state, baseURL |
| Shard | `--shard=1/4` | Nothing — it splits the same suite across machines |

### One test per case, never one test in a loop

```ts
const cases = [
  { name: 'in stock', params: { stock: 'in' }, expected: 4 },
  { name: 'out of stock', params: { stock: 'out' }, expected: 2 },
  { name: 'engines', params: { category: 'engines' }, expected: 2 },
  { name: 'search matches nothing', params: { search: 'warp core' }, expected: 0 },
];

for (const { name, params, expected } of cases) {
  test(`filters by ${name}`, async ({ request }) => {
    const response = await request.get('/api/products', { params });

    expect(response.status()).toBe(200);
    expect((await response.json()).count).toBe(expected);
  });
}
```

The loop is **outside** `test`, so each row becomes its own test: it gets its
own name in the report, its own trace, its own retry, and it runs in parallel
with the others. Loop *inside* a single test and all of that collapses — one
failure, no indication which row broke, and every row after the first failure
never runs.

Adding a case is one line. That is the real reason to do this: a suite where
adding a case is cheap gets more cases.

### Titles must be unique, and must say the case

```ts
test(`filters by ${name}`, …)                  // good — the report names the case
test(`case ${index}`, …)                       // bad — "case 4" tells you nothing
test('filters', …)                             // bad — duplicate titles collide
```

Duplicate titles are not rejected, they are merged in your head and not in the
report: `--grep`, `test.only` and the HTML report all treat the title as the
identity of the test. If two rows can produce the same title, put the
distinguishing value in it.

For an object case, interpolate deliberately rather than dumping JSON — a title
containing a full payload is unreadable and changes every time the payload does.

### Generate from the source of truth

```ts
const PAGES = [
  { name: 'home', path: '/' },
  { name: 'login', path: '/login.html' },
  { name: 'catalog', path: '/catalog.html' },
  { name: 'checkout', path: '/checkout.html' },
];

for (const { name, path } of PAGES) {
  test(`${name} page has no detectable accessibility violations`, async ({ page }) => {
    await page.goto(path);
    …
  });
}
```

The value here is not brevity — it is that **a new page cannot be added without
a decision**. If the list lives next to the routes it covers, forgetting to test
a page becomes visible.

Do not generate cases from something the app produces at runtime. Cases read
from a live API mean the suite silently shrinks to zero tests the day the API
returns an empty list, and a suite of zero tests passes.

### Parameterizing a fixture: `test.use`

```ts
// tests/ui/login.spec.ts — this whole file runs signed out
test.use({ signedOut: true });
```

```ts
test.describe('mobile viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the nav collapses', async ({ page }) => { … });
});
```

`test.use` sets a fixture's value for a file or a `describe` block. It works on
built-in options (`viewport`, `locale`, `timezoneId`, `colorScheme`,
`storageState`, `baseURL`) and on your own option fixtures identically.

**`test.use` is hoisted to the block, not applied at the line.** It cannot go
inside a `test`, and it applies to every test in the block regardless of where
you wrote it. Putting it halfway down a file reads as though the tests above are
unaffected; they are not.

### Custom options, set per project

An option fixture plus a project is how you run the *same* tests against
different data or environments.

```ts
// fixtures.ts
interface Options {
  tier: 'free' | 'pro';
}

export const test = base.extend<Options>({
  tier: ['free', { option: true }],
});
```

```ts
// playwright.config.ts
projects: [
  { name: 'free', use: { tier: 'free' } },
  { name: 'pro',  use: { tier: 'pro' } },
],
```

```ts
test('shows the plan badge', async ({ page, tier }) => {
  await expect(page.getByTestId('plan')).toHaveText(tier);
});
```

The option's value shows up in the HTML report and in the trace, which a
`process.env` read does not. When somebody asks "which tier was that failure
on?", the answer is on the screen instead of in a shell history.

### Projects: the matrix axis

```ts
projects: [
  { name: 'setup', testMatch: /auth\.setup\.ts/ },
  { name: 'chromium',      use: { ...devices['Desktop Chrome'],  storageState: '.auth/user.json' },
    dependencies: ['setup'], testIgnore: /tests\/api\// },
  { name: 'mobile-chrome', use: { ...devices['Pixel 7'],         storageState: '.auth/user.json' },
    dependencies: ['setup'], testIgnore: /tests\/api\// },
  { name: 'api', testMatch: /tests\/api\/.*\.spec\.ts/, use: { baseURL: BASE_URL } },
],
```

Projects parameterize the **whole suite**, and they are the only axis that can
vary the browser engine. Two details in the block above earn their keep:

- **`dependencies` is ordering, not parameterization.** `setup` runs first and
  its artifacts are available to the projects that depend on it.
- **The `api` project deliberately has no `storageState`.** Parameterizing by
  project lets one axis be *less* configured than the others, which is what
  makes `test('requires a session')` meaningful.

Run one axis with `--project=mobile-chrome`. Note that a project a test never
matches produces no failure, so a `testMatch` typo silently runs zero tests —
check the count, not just the colour.

### Skipping and tagging generated cases

```ts
for (const { name, path, mobileOnly } of PAGES) {
  test(`${name} renders`, async ({ page, isMobile }) => {
    test.skip(mobileOnly && !isMobile, 'this page only exists on the mobile nav');
    …
  });
}
```

```ts
test('full checkout journey', { tag: '@slow' }, async ({ page }) => { … });
```

```bash
npx playwright test --grep @slow
npx playwright test --grep-invert @slow
```

**Skip inside the test with a reason, rather than filtering the array.** A
filtered array produces a suite that silently has fewer tests; `test.skip` with
a reason produces a report line saying which case was skipped and why. Skipped
and never-generated look identical in a pass count and are very different
things.

### When not to parameterize

- **When the cases assert different things.** A table whose rows each need a
  different assertion is three tests wearing a trenchcoat; the shared body ends
  up full of `if (expected.error)`.
- **When there are two cases.** Two explicit tests read better than a
  two-row table plus a loop.
- **When the parameter is the expected value only.** `expect(sum(a, b)).toBe(c)`
  over a table of arithmetic tests the table, not the code.

---

## Tips and tricks

### Choosing a locator

Priority order, best first:

| Rank | Locator | Use for |
|---|---|---|
| 1 | `getByRole` | Almost everything — buttons, links, headings, lists, form controls |
| 2 | `getByLabel` | Form fields, via their visible label |
| 3 | `getByPlaceholder`, `getByText`, `getByAltText`, `getByTitle` | Content with no role |
| 4 | `getByTestId` | An explicit contract when nothing above works |
| 5 | CSS / XPath | Last resort |

The reasoning is not aesthetic. **A `getByRole` test fails when the button stops
being reachable — which is also when a keyboard or screen-reader user stops
being able to use it.** A CSS test fails when somebody renames a class, which no
user can perceive. One failure is information; the other is noise.

```ts
page.getByRole('button', { name: 'Place order' })
page.getByRole('heading', { name: 'Catalog', level: 1 })
page.getByRole('list', { name: 'Search results' })
page.getByLabel('Email address')
page.getByTestId('product-eng-1')            // last resort
```

### Exact vs substring — they differ by method

```ts
// getByRole name: FULL-STRING, case-insensitive, whitespace-trimmed
page.getByRole('heading', { name: 'catalog' })     // matches "Catalog"
page.getByRole('heading', { name: 'cat' })         // does NOT match
page.getByRole('heading', { name: /cat/i })        // matches — regex for substring

// getByText: SUBSTRING by default
page.getByText('parts found')                      // matches "6 parts found"
page.getByText('6 parts found', { exact: true })   // full string
```

This asymmetry catches everybody once. When it matters, be explicit.

### Strict mode is a feature

Two or more matches make an action **throw** rather than silently pick the
first. An ambiguous locator is a test that will one day click the wrong thing.

```ts
// Resolve by SCOPING — preferred
const row = page.getByRole('listitem').filter({ hasText: 'Star Tracker 9' });
await row.getByRole('button').click();

// Or say explicitly that you mean the first
await page.getByRole('button', { name: /Add .* to cart/ }).first().click();
```

### Filtering and chaining a collection

```ts
items.filter({ hasText: 'Ion Thruster' })                    // contains text
items.filter({ has: page.getByText('Out of stock') })        // contains an element
items.filter({ hasNotText: 'Out of stock' })                 // does NOT contain

// Chaining scopes the search inside the first locator
const row = catalogPage.item('Ion Thruster Mk II');
await expect(row.getByText('In stock')).toBeVisible();
```

Scoping is what stops `getByText('In stock')` matching four badges and throwing
a strict-mode violation.

### `or()` and `and()` — and one real gotcha

```ts
const outcome = list.or(emptyState);
await expect(outcome.first()).toBeVisible();
```

**`or()` matches elements that are PRESENT, not visible.** A list hidden with
the `hidden` attribute still matches, so `.first()` picks it in DOM order and
`toBeVisible()` fails with `Received: hidden`. When you know which branch you
expect, assert on it directly.

```ts
// and() narrows to elements matching BOTH
page.getByRole('button', { name: /Add .* to cart/ })
    .and(page.locator('button:not([disabled])'))
```

### Lists and collections

```ts
const items = page.getByRole('list', { name: 'Search results' }).getByRole('listitem');

await expect(items).toHaveCount(6);                       // retries — no race

// Contents AND order, in one retrying assertion
await expect(items.locator('.name')).toHaveText([
  'Flight Computer X', 'Interstage Ring', 'Ion Thruster Mk II', 'Star Tracker 9',
]);

// Read everything at once when you need the values
const names = await items.locator('.name').allTextContents();
```

**Never do this:**

```ts
const count = await items.count();      // one snapshot in time
expect(count).toBe(6);                  // no retry — the classic flake
```

`toHaveCount` retries; `count()` does not. Same for `textContent()` versus
`toHaveText()`.

### Radio buttons

```ts
await page.getByRole('radio', { name: 'In stock only' }).check();

await expect(page.getByRole('radio', { name: 'In stock only' })).toBeChecked();
await expect(page.getByRole('radio', { name: 'All parts' })).not.toBeChecked();
```

- **`check()`, not `click()`.** `check()` asserts the control ended up checked
  and is a no-op if it already was. `click()` on a checkbox toggles it *off*.
- **Reach a radio by its label, never by index.** `nth(1)` silently becomes the
  wrong option the day somebody reorders the group.
- **Assert the deselection too.** Mutual exclusivity is the half people forget,
  and it is exactly what breaks when a `name` attribute is mistyped.

### Checkboxes

```ts
await checkbox.check();
await checkbox.uncheck();
await expect(checkbox).toBeChecked();
await expect(checkbox).not.toBeChecked();
```

`uncheck()` on an already-unchecked box is a no-op — which is the whole point.
Test the default state explicitly: a checkbox that ships checked when it should
not is a consent bug, not a cosmetic one.

### Selects

```ts
await select.selectOption({ label: 'Price (low to high)' });   // by visible text
await select.selectOption('price-asc');                        // by value
await select.selectOption({ index: 2 });                       // avoid

await expect(select).toHaveValue('price-asc');
await select.selectOption(['a', 'b']);                         // multi-select
```

Prefer `{ label }`: it is what a person sees, and it survives a change to the
underlying value.

### Text inputs

```ts
await input.fill('Test Pilot');        // clears then sets — use this
await input.fill('');                  // how you clear a field
await input.pressSequentially('abc');  // real keystrokes, for autocomplete
await expect(input).toHaveValue('Test Pilot');
```

`fill()` sets the value in one operation and fires one `input` event. Use
`pressSequentially` only when the app reacts to individual keystrokes.

### Tables

```ts
const row = table.getByRole('row').filter({ hasText: 'Star Tracker 9' });
await expect(row.getByRole('cell', { name: '$1,485.00' })).toBeVisible();
```

**Find a row by what it contains, never by index.** Row 2 becomes row 3 the
moment somebody adds an item, and an index-based test then passes while
asserting about the wrong thing.

### Native dialogs

```ts
page.once('dialog', (dialog) => {
  expect(dialog.type()).toBe('confirm');
  expect(dialog.message()).toContain('Cancel this order?');
  void dialog.accept();
});

await page.getByRole('button', { name: 'Cancel order' }).click();
```

**Register the handler BEFORE the action that opens the dialog.** Playwright
auto-dismisses dialogs it has no handler for, so without this the `confirm()`
returns `false` and the branch under test never runs — the test passes and
proves nothing.

Test both paths: `dialog.accept()` and `dialog.dismiss()`.

### File upload

```ts
await fileInput.setInputFiles({
  name: 'export-licence.txt',
  mimeType: 'text/plain',
  buffer: Buffer.from('Licence number 55-2261'),
});

await fileInput.setInputFiles('tests/fixtures/licence.pdf');   // from disk
await fileInput.setInputFiles([]);                             // clear
```

The buffer form needs no fixture file on disk, which keeps the repo clean and
the test self-explanatory.

### Navigation

```ts
await page.goto('/catalog.html');           // relative to baseURL
await page.goBack();
await page.reload();

await expect(page).toHaveURL(/account\/orders\.html/);
await expect(page).toHaveTitle(/Catalog/);
await page.waitForURL('**/account/orders.html');
```

Prefer `expect(page).toHaveURL()` over `waitForURL` in assertions — it retries
and produces a better failure message.

### Waiting — the single most important section

**There is no `waitForTimeout` anywhere in this repo, and it is a lint error.**
A sleep is either too short (flaky) or too long (slow), and it is wrong on a
different machine either way.

Playwright auto-waits before every action: it waits for the element to be
attached, visible, stable, enabled and unobscured. Web-first assertions retry
until they pass or time out. Between the two, explicit waits are almost never
needed.

```ts
await expect(items).toHaveCount(1);        // retries
await expect(toast).toBeHidden();          // retries — proves it went away
await expect(submit).toBeDisabled();       // retries — catches transient states
```

For values Playwright cannot observe directly:

```ts
await expect.poll(async () => {
  const response = await page.request.get('/api/products?stock=in');
  return (await response.json()).count;
}, { timeout: 5_000, intervals: [100, 250, 500] }).toBe(4);
```

For a specific network response — **start the wait before the action**:

```ts
const responsePromise = page.waitForResponse(
  (r) => r.url().includes('/api/products') && r.status() === 200,
);
await catalogPage.setAvailability('In stock only');    // triggers it
const response = await responsePromise;                 // now await
```

No `await` on the first line. Awaiting there means the request can complete
before anyone is listening, and the test hangs until timeout.

### Network interception

```ts
// Replace a response, to test a failure path the server will not produce
await page.route('**/api/orders', async (route) => {
  await route.fulfill({
    status: 400,
    contentType: 'application/json',
    body: JSON.stringify({ errors: { email: 'That address is blocked' } }),
  });
});

await page.route('**/*.png', (route) => route.abort());   // block images
await page.route('**/api/**', (route) => route.continue());  // pass through
```

Assert on what the app **sent**, not only what it rendered:

```ts
const request = await requestPromise;
expect(request.postDataJSON()).toMatchObject({ country: 'gb', shipping: 'express' });
```

### API testing without a browser

```ts
test('filters by category', async ({ request }) => {
  const response = await request.get('/api/products', { params: { category: 'engines' } });

  expect(response.status()).toBe(200);
  expect((await response.json()).count).toBe(2);
});
```

The `request` fixture shares the config (baseURL, proxy, TLS) and starts no
browser. Anything provable at this level belongs here — 17 API tests run in
under three seconds.

Assert the **shape**, not one hardcoded row:

```ts
expect(product).toEqual({
  id: expect.stringMatching(/^[a-z]{3}-\d+$/),
  name: expect.any(String),
  priceCents: expect.any(Number),
  inStock: expect.any(Boolean),
});
```

And assert security properties the UI cannot show you:

```ts
const setCookie = response.headers()['set-cookie'] ?? '';
expect(setCookie).toContain('HttpOnly');
expect(setCookie).toContain('SameSite=Lax');
```

### Data-driven tests

Generate one **test per case** rather than looping inside a single test — a
single looping test reports one failure and hides which case broke. See
[Parameterization](#parameterization) for the four axes and their trade-offs.

### Debugging

| Command | What it does |
|---|---|
| `npm run test:watch` | Playwright UI mode — time-travel through each step |
| `npm run test:debug` | Step through with the inspector |
| `npm run test:headed` | Watch it run in a real window |
| `npm run codegen` | Click through the app; Playwright writes the selectors |
| `npm run report` | Open the last HTML report |
| `npx playwright show-trace <zip>` | Open a trace: DOM snapshots, network, console |
| `npx playwright test -g "name"` | Run tests matching a name |
| `--repeat-each=20` | Hunt a flaky test |

**The trace is the thing to reach for on a CI failure.** `trace:
'on-first-retry'` keeps the cost near zero while guaranteeing that any failure
which reproduces has a full recording attached.

`page.pause()` in a test opens the inspector at that line — the fastest way to
try locators against a live page.

---

## Accessibility

```ts
const results = await new AxeBuilder({ page })
  .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
  .analyze();

expect(results.violations.map((v) => ({ id: v.id, help: v.help }))).toEqual([]);
```

Two honest caveats, because overstating this is worse than omitting it:

- **Automated tooling catches roughly a third of real accessibility problems.**
  It finds missing labels, poor contrast and broken structure. It cannot tell
  you whether the flow makes sense with a screen reader.
- **A green axe run is a floor, not a certificate.**

It is still worth having for a reason unrelated to compliance: the properties
axe checks — labels, roles, accessible names — are exactly what `getByRole` and
`getByLabel` depend on. **A page that fails axe is a page whose tests have to
fall back to CSS selectors.** The two problems are the same problem.

Report the violations, not just the count: `toHaveLength(0)` tells you something
is wrong, the mapped array tells you what and where.

---

## Flakiness

A flaky test is a bug report, not a scheduling problem. Playwright marks a test
that passed on retry as **flaky** rather than **passed** — treat that colour as
red.

| Cause | Fix |
|---|---|
| `count()` / `textContent()` compared to a value | Use the retrying assertion — `toHaveCount`, `toHaveText` |
| `waitForTimeout` | Delete it; assert on the outcome instead |
| A wait registered after the action | Start `waitForResponse` before the click |
| Tests sharing data or a fixed port | Give each test unique data; let the server choose the port |
| Page still loading when the test starts | Wait for a real signal in the fixture |
| Animation mid-flight | Playwright waits for stability; if not, assert the end state |
| `{ force: true }` | Remove it — it skips the actionability checks that would have told you why |

One real example from this repo. `waiting for a specific response` passed alone
and failed under parallel load: `page.goto` resolves on the load event, but the
catalog fetches its list *afterwards*, so `waitForResponse` sometimes caught the
tail of the **initial** request instead of the one the test triggered. The fix
was one line in the fixture:

```ts
await catalogPage.goto();
await expect(catalogPage.resultCount).toBeVisible();   // let the first load settle
```

Reproduce a suspected flake before believing it fixed:

```bash
npx playwright test --repeat-each=20 -g "the test name"
```

---

## Best practices

The short list. Everything here is expanded somewhere above; this is the version
to read before a review.

### Locators

- **`getByRole` first, CSS last.** A role-based test fails when the control
  becomes unreachable — which is when real users lose it too. A class-based test
  fails when somebody renames a class, which nobody can perceive.
- **Never locate by index.** `nth(1)` becomes the wrong element the day an item
  is inserted, and the test keeps passing while asserting about something else.
  Filter by content instead.
- **Let strict mode do its job.** An ambiguous locator is a test that will one
  day click the wrong thing. Scope it; only reach for `.first()` when "the first
  one" is genuinely what you mean.

### Waiting

- **No `waitForTimeout`, ever.** It is a lint error in this repo. A sleep is
  either too short or too slow, and it is wrong on a different machine either
  way.
- **Assert, don't sample.** `toHaveCount` retries; `await count()` compared to a
  number does not. The same holds for `toHaveText` versus `textContent()`.
- **Register the wait before the action** — `waitForResponse`, `page.on('dialog')`,
  `waitForEvent`. Registering afterwards is a race you win locally.
- **Never `{ force: true }`.** It skips the actionability checks that were about
  to tell you why the click could not land.

### Structure

- **Page objects hold locators; tests hold assertions.** A page object that
  asserts turns every test into `checkEverythingIsFine()` and destroys the
  failure message.
- **Fixtures over `beforeEach`** — they compose, they tear down after a failure,
  and they run only for the tests that asked.
- **Sign in once via a setup project**, not once per test. Otherwise a broken
  login page fails two hundred tests instead of the one that is about login.
- **Navigate directly for setup, click through only for the journey under
  test.** Clicking through four pages to reach the fifth makes every test a test
  of all five.

### Scope

- **Push assertions down a tier wherever they will go.** A Playwright test costs
  seconds and a browser; keep this tier for journeys and for what only a browser
  can see — overflow, focus order, tap targets, actual clickability.
- **Test the awkward paths**: validation errors, empty states, permission
  failures, the back button. That is where the bugs are and where coverage stops.
- **Assert what the app sent, not only what it rendered.** A form that posts the
  wrong country code renders perfectly.

### Data and isolation

- **Every test creates its own data.** Tests that share a row pass in the order
  you happen to run them.
- **Never depend on test order.** `fullyParallel` is on precisely so that this
  assumption breaks early rather than on the day you need to parallelize.
- **Let the server pick its port.** A fixed port is a collision waiting for a
  second worker.

### Signals

- **A flaky test is a bug report.** Playwright reports a test that passed on
  retry as flaky rather than passed — treat that colour as red.
- **Check the test count, not just the colour.** A `testMatch` typo, a filtered
  case array and a skipped file all produce a green run of nothing.
- **`forbidOnly` on CI.** A committed `test.only` silently skips the rest of the
  file, and green is exactly what it looks like.

---

## Setting this up in a new repo

### Step 1 — Make the app testable

Playwright needs no seams in your code, but it needs **accessible markup**:

- Every input has a `<label for="...">` or an `aria-label`.
- Buttons say what they do — `aria-label="Add Ion Thruster Mk II to cart"` when
  the visible text is just "Add to cart".
- Lists are lists, tables are tables, headings descend one level at a time.
- Status messages carry `role="status"` or `role="alert"`.

Do this and `getByRole` works everywhere. Skip it and every test becomes a CSS
selector that breaks on the next redesign.

### Step 2 — Scaffold

```bash
npm init playwright@latest      # or copy this repo's config
cp <test-playwright>/playwright.config.ts .
cp <test-playwright>/eslint.config.mjs .
cp -r <test-playwright>/.github/workflows/test.yml .github/workflows/
mkdir -p tests/{pages,ui,api}
cp <test-playwright>/tests/fixtures.ts tests/
cp <test-playwright>/tests/pages/base.page.ts tests/pages/
```

Point `webServer.command` at how your app starts, and `baseURL` at where it
listens. Add `.auth/` to `.gitignore` — it holds a real session token.

### Step 3 — Write in this order

1. **A smoke test.** One journey, end to end. It will find more than you expect.
2. **`auth.setup.ts`**, as soon as anything needs signing in.
3. **API tests** for every endpoint the UI depends on. They are ten times faster
   and they localise a failure to the server instead of the page.
4. **Page objects**, once a locator appears in a third test — not before.
5. **The awkward journeys**: validation errors, empty states, permission
   failures, the back button. These are where the bugs are, and they are also
   the ones people skip.
6. **Accessibility checks** per page.

### Step 4 — Wire the gate

> **Note:** Actions is switched off on *this* repository (see "Running the tests
> without CI"), so the gate here is `npm run ci`, run by hand. The advice in this
> section is for the repo you are setting up, where you should wire it properly.


Copy the workflow and require the **All tiers green** check in branch
protection. Note the matrix installs only the browser each shard needs, and
`fail-fast: false` — the point of a matrix is finding out which browsers are
affected, so Firefox should not be cancelled because Chromium failed.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `strict mode violation: resolved to N elements` | Ambiguous locator | Scope it, or `.first()` if you mean it |
| `Target closed` | Page or context closed mid-action | Usually a missing `await` earlier |
| Element found but not clickable | Something covers it | Read the trace; do NOT reach for `force` |
| Test passes alone, fails in the suite | Shared state, or a race with initial load | Unique data per test; settle the page in the fixture |
| `browserType.launch: Executable doesn't exist` | Browser not installed | `npx playwright install chromium` |
| `install --with-deps` asks for sudo | System libraries | Drop `--with-deps` if the libraries are present |
| Auth state empty, everything fails | State saved before the cookie was set | Assert a real signal first |
| Assertion never fails, even when wrong | Missing `await` on `expect` | The `missing-playwright-await` lint rule catches it |
| Dialog branch never runs | Handler registered after the click | Register `page.once('dialog')` first |
| `webServer` times out | App slow to start, or wrong URL | Raise `webServer.timeout`; check the URL answers |

---

## Commands reference

| Command | What it does |
|---|---|
| `npm test` | Chromium + API |
| `npm run test:ui` | Browser tests only |
| `npm run test:api` | API tests only — no browser |
| `npm run test:all-browsers` | Chromium, Firefox, WebKit |
| `npm run test:mobile` | Pixel 7 viewport |
| `npm run test:headed` | Watch it run |
| `npm run test:debug` | Step through with the inspector |
| `npm run test:watch` | Playwright UI mode |
| `npm run codegen` | Record selectors by clicking |
| `npm run report` | Open the HTML report |
| `npm run ci` | Typecheck + lint + tests |
| `npx playwright test --repeat-each=20 -g "x"` | Hunt a flake |
| `npx playwright show-trace <zip>` | Open a trace |

---

## See also

- **test-jest** — unit and integration tiers for TypeScript and Node.
- **test-go** — the same three tiers for Go services.
