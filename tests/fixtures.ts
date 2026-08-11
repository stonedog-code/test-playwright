import { test as base, expect } from '@playwright/test';

import { CatalogPage } from './pages/catalog.page';
import { CheckoutPage } from './pages/checkout.page';
import { LoginPage } from './pages/login.page';

/**
 * Custom fixtures.
 *
 * A fixture is set-up that Playwright creates on demand, only for the tests
 * that ask for it, and tears down automatically. That last part is the reason
 * to prefer fixtures over `beforeEach`: a fixture's teardown runs even when the
 * test fails, and it composes — one fixture can depend on another.
 *
 * The practical effect is that a test starts with the phrase that matters:
 *
 *   test('filters by availability', async ({ catalogPage }) => {
 *
 * rather than three lines of construction before the first meaningful one.
 */
interface Pages {
  loginPage: LoginPage;
  catalogPage: CatalogPage;
  checkoutPage: CheckoutPage;
}

interface Options {
  /** Set per-file with test.use({ signedOut: true }) to drop the saved session. */
  signedOut: boolean;
}

export const test = base.extend<Pages & Options>({
  signedOut: [false, { option: true }],

  // Overriding the built-in storageState fixture is how a single file opts out
  // of the shared authenticated session, without a second Playwright project.
  storageState: async ({ signedOut, storageState }, use) => {
    await use(signedOut ? undefined : storageState);
  },

  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  catalogPage: async ({ page }, use) => {
    const catalogPage = new CatalogPage(page);
    // A fixture may also do the navigation, so the test body is only about
    // behaviour. Keep this to setup that EVERY consumer wants.
    await catalogPage.goto();

    // Wait for the FIRST load to settle before handing the page over.
    //
    // page.goto resolves on the load event, but this page fetches its list
    // afterwards. Without this line a test that registers waitForResponse and
    // then changes a filter can catch the tail of the INITIAL request instead
    // of the one it triggered — which passes when run alone and fails under
    // parallel load. That is the classic "flaky only in CI" shape.
    await expect(catalogPage.resultCount).toBeVisible();

    await use(catalogPage);
  },

  checkoutPage: async ({ page }, use) => {
    const checkoutPage = new CheckoutPage(page);
    await checkoutPage.goto();
    await use(checkoutPage);
  },
});

export { expect };
