import type { Locator } from '@playwright/test';

import { BasePage } from './base.page';

export type Availability = 'All parts' | 'In stock only' | 'Out of stock only';
export type Category = 'Engines' | 'Avionics' | 'Structures';

export class CatalogPage extends BasePage {
  readonly path = '/catalog.html';

  get search(): Locator {
    return this.page.getByLabel('Search parts');
  }

  get sort(): Locator {
    return this.page.getByLabel('Sort by');
  }

  get resultCount(): Locator {
    // aria-live="polite" — Playwright's auto-waiting means the test never has
    // to poll this by hand.
    return this.page.getByText(/part(s)? found/);
  }

  get emptyMessage(): Locator {
    return this.page.getByText('No parts match those filters.');
  }

  /**
   * The list itself, and its items.
   *
   * `getByRole('list', ...)` then `.getByRole('listitem')` is the idiomatic way
   * to reach into a collection: it scopes the item query to THIS list, so a
   * second list elsewhere on the page cannot pollute the results.
   */
  get results(): Locator {
    return this.page.getByRole('list', { name: 'Search results' });
  }

  get items(): Locator {
    return this.results.getByRole('listitem');
  }

  /** One item by its visible name — the way a person would identify it. */
  item(name: string): Locator {
    return this.items.filter({ hasText: name });
  }

  /** Radio buttons: reached by their accessible label, never by index. */
  availability(option: Availability): Locator {
    return this.page.getByRole('radio', { name: option });
  }

  category(option: Category): Locator {
    return this.page.getByRole('checkbox', { name: option });
  }

  addToCartFor(productName: string): Locator {
    return this.page.getByRole('button', { name: `Add ${productName} to cart` });
  }

  /** All visible product names, in DOM order. */
  async productNames(): Promise<string[]> {
    return this.items.locator('.name').allTextContents();
  }

  async setAvailability(option: Availability): Promise<void> {
    // .check(), not .click(). check() asserts the control ended up checked and
    // is a no-op if it already was, so it cannot silently toggle a radio off.
    await this.availability(option).check();
  }

  async toggleCategory(option: Category, on: boolean): Promise<void> {
    if (on) {
      await this.category(option).check();
    } else {
      await this.category(option).uncheck();
    }
  }
}
