import { expect, test } from '../fixtures';

/**
 * Forms, validation, tables, dialogs, file upload, and network interception.
 */
test.describe('checkout', () => {
  test('shows the basket contents in a table', async ({ checkoutPage }) => {
    // Find a row by what it contains, never by index. Row 2 becomes row 3 the
    // moment somebody adds an item, and an index-based test then passes while
    // asserting about the wrong thing.
    const row = checkoutPage.basketRow('Star Tracker 9');

    await expect(row).toBeVisible();
    await expect(row.getByRole('cell', { name: '2', exact: true })).toBeVisible();
    await expect(row.getByRole('cell', { name: '$1,485.00' })).toBeVisible();
  });

  test.describe('validation', () => {
    test('reports every missing required field at once', async ({ checkoutPage }) => {
      await checkoutPage.placeOrder.click();

      await expect(checkoutPage.errorFor('fullName')).toHaveText('Full name is required');
      await expect(checkoutPage.errorFor('email')).toHaveText('Email is required');
      await expect(checkoutPage.errorFor('country')).toHaveText('Choose a country');
      await expect(checkoutPage.errorFor('shipping')).toHaveText('Choose a shipping speed');
      await expect(checkoutPage.errorFor('terms')).toHaveText('You must accept the terms');

      await expect(checkoutPage.confirmation).toBeHidden();
    });

    test('rejects a malformed email', async ({ checkoutPage }) => {
      await checkoutPage.fillOrder({
        fullName: 'Test Pilot',
        email: 'not-an-email',
        country: 'United Kingdom',
        shipping: 'Express (2 days)',
        acceptTerms: true,
      });

      await checkoutPage.placeOrder.click();

      await expect(checkoutPage.errorFor('email')).toHaveText('Enter a valid email address');
    });

    test('clears previous errors on the next attempt', async ({ checkoutPage }) => {
      await checkoutPage.placeOrder.click();
      await expect(checkoutPage.errorFor('fullName')).toBeVisible();

      await checkoutPage.fillOrder({
        fullName: 'Test Pilot',
        email: 'pilot@example.com',
        country: 'Germany',
        shipping: 'Standard (5–7 days)',
        acceptTerms: true,
      });
      await checkoutPage.placeOrder.click();

      // Stale errors left on screen after a successful submit are a real bug
      // and an easy one to miss without this assertion.
      await expect(checkoutPage.errorFor('fullName')).toBeHidden();
    });
  });

  test('places an order and confirms it', async ({ checkoutPage }) => {
    await checkoutPage.fillOrder({
      fullName: 'Test Pilot',
      email: 'pilot@example.com',
      country: 'United States',
      deliverBy: '2026-09-01',
      shipping: 'Orbital drop (next launch window)',
      acceptTerms: true,
    });

    await checkoutPage.placeOrder.click();

    await expect(checkoutPage.confirmation).toBeVisible();
    await expect(checkoutPage.orderId).toHaveText('ORD-40128');
  });

  test.describe('checkbox defaults', () => {
    test('newsletter starts checked and terms starts unchecked', async ({ checkoutPage }) => {
      await expect(checkoutPage.newsletter).toBeChecked();
      await expect(checkoutPage.terms).not.toBeChecked();
    });

    test('uncheck is idempotent', async ({ checkoutPage }) => {
      await checkoutPage.newsletter.uncheck();
      await expect(checkoutPage.newsletter).not.toBeChecked();

      // uncheck() on an already-unchecked box is a no-op. click() would toggle
      // it back ON — which is why check/uncheck exist.
      await checkoutPage.newsletter.uncheck();
      await expect(checkoutPage.newsletter).not.toBeChecked();
    });
  });

  test.describe('native dialogs', () => {
    test('accepting the confirm resets the form', async ({ checkoutPage, page }) => {
      await checkoutPage.fullName.fill('Test Pilot');

      // The handler must be registered BEFORE the action that opens the
      // dialog. Playwright auto-dismisses dialogs, so without this the confirm
      // returns false and the branch under test never runs.
      page.once('dialog', (dialog) => {
        expect(dialog.type()).toBe('confirm');
        expect(dialog.message()).toContain('Cancel this order?');
        void dialog.accept();
      });

      await checkoutPage.cancelOrder.click();

      await expect(checkoutPage.fullName).toHaveValue('');
      await expect(checkoutPage.toast).toHaveText('Order cancelled');
    });

    test('dismissing the confirm leaves the form alone', async ({ checkoutPage, page }) => {
      await checkoutPage.fullName.fill('Test Pilot');

      page.once('dialog', (dialog) => void dialog.dismiss());

      await checkoutPage.cancelOrder.click();

      await expect(checkoutPage.fullName).toHaveValue('Test Pilot');
    });
  });

  test('uploads a file', async ({ checkoutPage }) => {
    // setInputFiles takes a path, or an in-memory buffer as here. The buffer
    // form needs no fixture file on disk, which keeps the repo clean and the
    // test self-explanatory.
    await checkoutPage.exportLicence.setInputFiles({
      name: 'export-licence.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Licence number 55-2261'),
    });

    await expect(checkoutPage.page.getByText('Selected: export-licence.txt')).toBeVisible();
  });

  test.describe('network interception', () => {
    test('shows the server errors it is given', async ({ checkoutPage, page }) => {
      // route() replaces the response, so a failure path can be tested without
      // making the server produce it. Register it before the request happens.
      await page.route('**/api/orders', async (route) => {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ errors: { email: 'That address is blocked' } }),
        });
      });

      await checkoutPage.fillOrder({
        fullName: 'Test Pilot',
        email: 'pilot@example.com',
        country: 'Japan',
        shipping: 'Express (2 days)',
        acceptTerms: true,
      });
      await checkoutPage.placeOrder.click();

      await expect(checkoutPage.errorFor('email')).toHaveText('That address is blocked');
    });

    test('sends the values the user actually entered', async ({ checkoutPage, page }) => {
      // waitForRequest must be started BEFORE the click, or the request can
      // complete before anyone is listening. Note there is no `await` on this
      // line — the promise is awaited after the action.
      const requestPromise = page.waitForRequest('**/api/orders');

      await checkoutPage.fillOrder({
        fullName: 'Test Pilot',
        email: 'pilot@example.com',
        country: 'United Kingdom',
        shipping: 'Express (2 days)',
        acceptTerms: true,
      });
      await checkoutPage.placeOrder.click();

      const request = await requestPromise;
      expect(request.postDataJSON()).toMatchObject({
        fullName: 'Test Pilot',
        email: 'pilot@example.com',
        country: 'gb', // the VALUE, while the user picked the label
        shipping: 'express',
        terms: true,
      });
    });
  });
});
