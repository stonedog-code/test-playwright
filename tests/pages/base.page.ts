import type { Locator, Page } from '@playwright/test';

/**
 * The shared base for every page object.
 *
 * A page object is a place to put LOCATORS and the small vocabulary of actions
 * a page offers. It is not a place to put assertions: a page object that
 * asserts turns every test into a call to `page.checkEverythingIsFine()`, and
 * the failure message stops telling you what the test wanted.
 *
 * Rule of thumb: page objects answer "how do I reach this?", tests answer
 * "what should be true?".
 */
export abstract class BasePage {
  // `page` is public on purpose. Tests legitimately need it for the things
  // that are not page-specific — page.route, page.on('dialog'), expect(page)
  // — and hiding it only produces a page object that grows a passthrough
  // method for every Playwright API somebody happens to need.
  constructor(readonly page: Page) {}

  /** Path this page lives at, relative to baseURL. */
  abstract readonly path: string;

  /** Navigates directly. Prefer this over clicking through the UI for setup. */
  async goto(query: Record<string, string> = {}): Promise<void> {
    const search = new URLSearchParams(query).toString();
    await this.page.goto(search ? `${this.path}?${search}` : this.path);
  }

  // ---- Shared furniture ----------------------------------------------------

  get mainNav(): Locator {
    return this.page.getByRole('navigation', { name: 'Main' });
  }

  get heading(): Locator {
    return this.page.getByRole('heading', { level: 1 });
  }

  /** The transient status message. `role="status"` is why getByRole finds it. */
  get toast(): Locator {
    return this.page.getByRole('status');
  }

  async clickNav(name: string): Promise<void> {
    await this.mainNav.getByRole('link', { name }).click();
  }
}
