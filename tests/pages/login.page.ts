import type { Locator } from '@playwright/test';

import { BasePage } from './base.page';

export class LoginPage extends BasePage {
  readonly path = '/login.html';

  // Locators are GETTERS, not fields assigned in the constructor.
  //
  // A locator is lazy — it resolves when it is used, not when it is created —
  // so a getter re-resolves against the current DOM every time. Fields work
  // too, but getters make it obvious that nothing is captured up front, which
  // matters on a page that re-renders.
  get username(): Locator {
    return this.page.getByLabel('Username');
  }

  get password(): Locator {
    return this.page.getByLabel('Password');
  }

  get submit(): Locator {
    return this.page.getByRole('button', { name: 'Sign in' });
  }

  /** role="alert" is what makes this reachable without a CSS selector. */
  get error(): Locator {
    return this.page.getByRole('alert');
  }

  get pendingIndicator(): Locator {
    return this.page.getByText('Signing in…');
  }

  async signIn(username: string, password: string): Promise<void> {
    await this.username.fill(username);
    await this.password.fill(password);
    await this.submit.click();
  }
}
