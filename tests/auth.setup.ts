import path from 'node:path';

import { expect, test as setup } from '@playwright/test';

/**
 * Signs in once for the whole run and saves the session to disk.
 *
 * Every UI project declares `dependencies: ['setup']` and
 * `storageState: '.auth/user.json'`, so tests start already authenticated.
 *
 * Why this matters: walking the login form at the start of every test is the
 * single biggest waste of time in most suites, and it means a broken login page
 * fails 200 tests instead of one. Here, exactly one test drives the form — the
 * one in tests/ui/login.spec.ts, which is about the form itself.
 */
const AUTH_FILE = path.join(__dirname, '..', '.auth', 'user.json');

setup('authenticate', async ({ page }) => {
  await page.goto('/login.html');

  await page.getByLabel('Username').fill('testpilot');
  await page.getByLabel('Password').fill('correct-horse');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Wait for a real signal that the session exists, not for a timeout.
  // Saving state before the cookie is set produces an empty file and a suite
  // that fails everywhere with no obvious cause.
  await page.waitForURL('**/account/orders.html');
  await expect(page.getByTestId('current-user')).toHaveText('testpilot');

  await page.context().storageState({ path: AUTH_FILE });
});
