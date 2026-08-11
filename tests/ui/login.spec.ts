import { expect, test } from '../fixtures';

/**
 * The one file that drives the login form by hand.
 *
 * `signedOut: true` drops the saved session for this file only — every other UI
 * test starts already authenticated, courtesy of auth.setup.ts. That split is
 * the point: a broken login page should fail these four tests, not all of them.
 */
test.use({ signedOut: true });

test.describe('signing in', () => {
  test('rejects the wrong password and says so', async ({ loginPage }) => {
    await loginPage.goto();

    await loginPage.signIn('testpilot', 'wrong-password');

    // A web-first assertion: it retries until the element appears or the
    // expect timeout elapses. No waitForSelector, no sleep.
    await expect(loginPage.error).toHaveText('Incorrect username or password');

    // And it must NOT have navigated.
    await expect(loginPage.page).toHaveURL(/login\.html/);
  });

  test('shows a pending state while the request is in flight', async ({ loginPage }) => {
    await loginPage.goto();

    await loginPage.username.fill('testpilot');
    await loginPage.password.fill('correct-horse');
    await loginPage.submit.click();

    // The server delays 150ms deliberately, so this state is real.
    // toBeDisabled and toBeVisible both retry, which is what makes asserting
    // on a transient state possible at all without a race.
    await expect(loginPage.submit).toBeDisabled();
    await expect(loginPage.pendingIndicator).toBeVisible();
  });

  test('signs in and lands on the orders page', async ({ loginPage, page }) => {
    await loginPage.goto();

    await loginPage.signIn('testpilot', 'correct-horse');

    await expect(page).toHaveURL(/account\/orders\.html/);
    await expect(page.getByTestId('current-user')).toHaveText('testpilot');
  });

  test('sends a signed-out visitor to the login page and back again', async ({ page, loginPage }) => {
    // Deep-link to a protected page while signed out.
    await page.goto('/account/orders.html');

    await expect(page).toHaveURL(/login\.html\?next=/);

    await loginPage.signIn('testpilot', 'correct-horse');

    // The `next` parameter must survive the round trip, or every protected
    // deep link dumps the user on a default page after signing in.
    await expect(page).toHaveURL(/account\/orders\.html/);
  });
});
