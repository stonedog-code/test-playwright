import { expect, test } from '../fixtures';

/**
 * A worked tour of locators, kept as runnable tests so the README's advice is
 * verified rather than asserted.
 *
 * The priority order, best first:
 *
 *   1. getByRole      — what it IS to a user and to a screen reader
 *   2. getByLabel     — form controls, via their label
 *   3. getByPlaceholder / getByText / getByAltText / getByTitle
 *   4. getByTestId    — an explicit contract, invisible to users
 *   5. CSS / XPath    — last resort; couples the test to markup
 *
 * The reasoning is not aesthetic. A getByRole test fails when the button stops
 * being reachable — which is also when a keyboard or screen-reader user stops
 * being able to use it. A CSS test fails when somebody renames a class, which
 * nobody outside the codebase can perceive.
 */
test.describe('choosing a locator', () => {
  test('getByRole is the first choice', async ({ catalogPage, page }) => {
    await expect(page.getByRole('heading', { name: 'Catalog', level: 1 })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Search results' })).toBeVisible();
    await expect(catalogPage.availability('All parts')).toBeChecked();
  });

  test('exact vs substring matching', async ({ catalogPage, page }) => {
    // The catalogPage fixture is what navigated us here.
    await expect(catalogPage.heading).toBeVisible();

    // By default name matching is case-insensitive and ignores surrounding
    // whitespace, but it is a FULL-STRING match.
    await expect(page.getByRole('heading', { name: 'catalog' })).toBeVisible();

    // A regex gives substring or anchored matching when you need it.
    await expect(page.getByRole('heading', { name: /cat/i })).toBeVisible();

    // getByText, by contrast, defaults to SUBSTRING. This trips people up in
    // the opposite direction, so be explicit when it matters.
    await expect(page.getByText('parts found', { exact: false })).toBeVisible();
  });

  test('strict mode is a feature, not an obstacle', async ({ catalogPage, page }) => {
    // Two or more matches make an action throw rather than silently pick the
    // first. That error is the framework telling you the locator is ambiguous
    // — and an ambiguous locator is a test that will one day click the wrong
    // thing.
    const allAddButtons = catalogPage.page.getByRole('button', { name: /Add .* to cart/ });
    await expect(allAddButtons).toHaveCount(6);

    // Resolve ambiguity by SCOPING (preferred) ...
    const row = page.getByRole('listitem').filter({ hasText: 'Star Tracker 9' });
    await expect(row.getByRole('button')).toBeEnabled();

    // ... or, if you truly mean "the first one", say so explicitly.
    await expect(allAddButtons.first()).toBeVisible();
  });

  test('filter narrows a collection', async ({ catalogPage, page }) => {
    // by text it contains
    await expect(catalogPage.items.filter({ hasText: 'Ion Thruster' })).toHaveCount(1);

    // by a descendant it contains
    await expect(catalogPage.items.filter({ has: page.getByText('Out of stock') })).toHaveCount(2);

    // by what it does NOT contain
    await expect(catalogPage.items.filter({ hasNotText: 'Out of stock' })).toHaveCount(4);
  });

  test('chaining scopes one locator inside another', async ({ catalogPage }) => {
    const engines = catalogPage.item('Ion Thruster Mk II');

    // Everything below is searched only inside that list item.
    await expect(engines.getByRole('button')).toHaveAccessibleName('Add Ion Thruster Mk II to cart');
    await expect(engines.getByText('In stock')).toBeVisible();
  });

  test('nth, first and last — use sparingly', async ({ catalogPage }) => {
    // Positional locators are fragile: they encode an ordering nobody promised.
    // They are reasonable when the ORDER is what you are testing.
    await catalogPage.sort.selectOption({ label: 'Price (low to high)' });

    await expect(catalogPage.items.first()).toContainText('Interstage Ring');
    await expect(catalogPage.items.last()).toContainText('Ion Thruster Mk II');
    await expect(catalogPage.items.nth(1)).toContainText('Star Tracker 9');
  });

  test('or() and and() combine locators', async ({ catalogPage, page }) => {
    const list = page.getByRole('list', { name: 'Search results' });
    const emptyState = page.getByText('No parts match those filters.');

    // or() matches either one. Useful when a UI can render one of two things
    // and the test should not have to know in advance which it will get.
    await expect(list.or(emptyState).first()).toBeVisible();

    await catalogPage.search.fill('warp core');

    // A gotcha worth knowing before it costs you an afternoon: or() matches
    // elements that are PRESENT, not elements that are visible. The empty <ul>
    // is still in the DOM with a `hidden` attribute, so `.first()` picks it in
    // DOM order and toBeVisible fails with "Received: hidden".
    //
    // When you know which branch you expect, assert on it directly.
    await expect(emptyState).toBeVisible();
    await expect(list).toBeHidden();

    // and() narrows to elements matching BOTH locators — here, the buttons
    // that are 'add to cart' buttons AND are not disabled.
    await catalogPage.search.fill('');
    const addInStock = page
      .getByRole('button', { name: /Add .* to cart/ })
      .and(page.locator('button:not([disabled])'));

    await expect(addInStock).toHaveCount(4);
  });

  test('reading values out of the page', async ({ catalogPage }) => {
    // allTextContents() returns every match at once — no loop, one round trip.
    const names = await catalogPage.items.locator('.name').allTextContents();
    expect(names).toHaveLength(6);
    expect(names).toContain('Payload Fairing');

    // For a single value, prefer a retrying assertion over reading and
    // comparing: textContent() is one snapshot in time.
    await expect(catalogPage.resultCount).toHaveText('6 parts found');
  });
});

test.describe('waiting', () => {
  test('web-first assertions replace explicit waits', async ({ catalogPage }) => {
    await catalogPage.search.fill('thruster');

    // Retries until it matches or times out. There is no waitForSelector, no
    // waitForTimeout, and no polling loop anywhere in this repo.
    await expect(catalogPage.items).toHaveCount(1);
  });

  test('expect.poll for values that are not locators', async ({ page }) => {
    // For anything Playwright cannot observe directly — an API, a computed
    // value, a database row — expect.poll retries the function.
    await expect
      .poll(async () => {
        const response = await page.request.get('/api/products?stock=in');
        return ((await response.json()) as { count: number }).count;
      }, { timeout: 5_000 })
      .toBe(4);
  });

  test('waiting for a specific response', async ({ page, catalogPage }) => {
    const responsePromise = page.waitForResponse(
      (response) => response.url().includes('/api/products') && response.status() === 200,
    );

    await catalogPage.setAvailability('In stock only');

    const response = await responsePromise;
    expect(((await response.json()) as { count: number }).count).toBe(4);
  });
});
