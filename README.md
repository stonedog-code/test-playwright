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

```ts
const cases = [
  { name: 'in stock', params: { stock: 'in' }, expected: 4 },
  { name: 'engines', params: { category: 'engines' }, expected: 2 },
];

for (const { name, params, expected } of cases) {
  test(`filters by ${name}`, async ({ request }) => { ... });
}
```

Generate one **test per case** rather than looping inside a single test. A
single looping test reports one failure and hides which case broke.

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
