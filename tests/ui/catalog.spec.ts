import { expect, test } from '../fixtures';

/**
 * Working with collections and form controls: lists, radio buttons,
 * checkboxes, a select, and a search field.
 *
 * The `catalogPage` fixture has already navigated by the time the body runs.
 */
test.describe('catalog', () => {
  test('lists every part by default', async ({ catalogPage }) => {
    // toHaveCount retries, so there is no race against the fetch that fills
    // the list. Reading `.count()` into a variable and comparing it would be
    // a snapshot of one moment and the classic source of flake.
    await expect(catalogPage.items).toHaveCount(6);
    await expect(catalogPage.resultCount).toHaveText('6 parts found');
  });

  test.describe('radio buttons', () => {
    test('filters to in-stock parts', async ({ catalogPage }) => {
      await catalogPage.setAvailability('In stock only');

      await expect(catalogPage.items).toHaveCount(4);

      // Assert on the whole collection at once. toHaveText with an array
      // checks contents AND order in a single retrying assertion.
      await expect(catalogPage.items.locator('.name')).toHaveText([
        'Flight Computer X',
        'Interstage Ring',
        'Ion Thruster Mk II',
        'Star Tracker 9',
      ]);
    });

    test('filters to out-of-stock parts', async ({ catalogPage }) => {
      await catalogPage.setAvailability('Out of stock only');

      await expect(catalogPage.items).toHaveCount(2);
      await expect(catalogPage.item('Solid Booster A')).toBeVisible();
    });

    test('radios are mutually exclusive', async ({ catalogPage }) => {
      await catalogPage.setAvailability('In stock only');

      await expect(catalogPage.availability('In stock only')).toBeChecked();
      // The half people forget: selecting one must DESELECT the others.
      await expect(catalogPage.availability('All parts')).not.toBeChecked();
      await expect(catalogPage.availability('Out of stock only')).not.toBeChecked();
    });
  });

  test.describe('checkboxes', () => {
    test('narrows to one category', async ({ catalogPage }) => {
      await catalogPage.toggleCategory('Engines', true);

      await expect(catalogPage.items).toHaveCount(2);
      await expect(catalogPage.category('Engines')).toBeChecked();
    });

    test('checkboxes combine rather than replace', async ({ catalogPage }) => {
      await catalogPage.toggleCategory('Engines', true);
      await catalogPage.toggleCategory('Avionics', true);

      // Unlike radios, two checked boxes mean the union of both.
      await expect(catalogPage.items).toHaveCount(4);
    });

    test('unchecking restores the full list', async ({ catalogPage }) => {
      await catalogPage.toggleCategory('Engines', true);
      await expect(catalogPage.items).toHaveCount(2);

      await catalogPage.toggleCategory('Engines', false);
      await expect(catalogPage.items).toHaveCount(6);
    });

    test('combines with the availability radio', async ({ catalogPage }) => {
      await catalogPage.toggleCategory('Engines', true);
      await catalogPage.setAvailability('In stock only');

      await expect(catalogPage.items).toHaveCount(1);
      await expect(catalogPage.item('Ion Thruster Mk II')).toBeVisible();
    });
  });

  test.describe('select', () => {
    test('sorts by price ascending', async ({ catalogPage }) => {
      // selectOption by label, not by value: the label is what a person sees.
      await catalogPage.sort.selectOption({ label: 'Price (low to high)' });

      const names = await catalogPage.productNames();
      expect(names[0]).toBe('Interstage Ring'); // $457.50, the cheapest
      expect(names.at(-1)).toBe('Ion Thruster Mk II'); // $2,499.00
    });

    test('sorts by price descending', async ({ catalogPage }) => {
      await catalogPage.sort.selectOption({ label: 'Price (high to low)' });

      const names = await catalogPage.productNames();
      expect(names[0]).toBe('Ion Thruster Mk II');
    });

    test('reports the selected option', async ({ catalogPage }) => {
      await catalogPage.sort.selectOption('price-asc');

      await expect(catalogPage.sort).toHaveValue('price-asc');
    });
  });

  test.describe('search', () => {
    test('narrows as you type', async ({ catalogPage }) => {
      await catalogPage.search.fill('thruster');

      await expect(catalogPage.items).toHaveCount(1);
      await expect(catalogPage.item('Ion Thruster Mk II')).toBeVisible();
    });

    test('shows an empty state when nothing matches', async ({ catalogPage }) => {
      await catalogPage.search.fill('warp core');

      await expect(catalogPage.items).toHaveCount(0);
      await expect(catalogPage.emptyMessage).toBeVisible();
      await expect(catalogPage.resultCount).toHaveText('0 parts found');
    });

    test('search is case-insensitive', async ({ catalogPage }) => {
      await catalogPage.search.fill('ION THRUSTER');

      await expect(catalogPage.items).toHaveCount(1);
    });
  });

  test.describe('list items', () => {
    test('disables Add to cart for an out-of-stock part', async ({ catalogPage }) => {
      await expect(catalogPage.addToCartFor('Solid Booster A')).toBeDisabled();
      await expect(catalogPage.addToCartFor('Ion Thruster Mk II')).toBeEnabled();
    });

    test('adding a part shows a transient confirmation', async ({ catalogPage }) => {
      await catalogPage.addToCartFor('Ion Thruster Mk II').click();

      await expect(catalogPage.toast).toHaveText('Ion Thruster Mk II added to cart');

      // The toast hides itself after 2s. Asserting it goes away is what proves
      // the timer works — and toBeHidden retries, so no sleep is needed.
      await expect(catalogPage.toast).toBeHidden({ timeout: 5_000 });
    });

    test('scopes assertions to one row', async ({ catalogPage }) => {
      const row = catalogPage.item('Star Tracker 9');

      // Scoping to the row is what stops "In stock" matching some other item's
      // badge. A bare page.getByText('In stock') would match four elements and
      // throw a strict-mode violation.
      await expect(row.getByText('In stock')).toBeVisible();
      await expect(row.getByText('$742.50')).toBeVisible();
    });

    test('finds a row by its test id when no accessible handle exists', async ({ catalogPage }) => {
      // data-testid is the LAST resort, used here only to demonstrate it. It
      // is invisible to users, so it cannot tell you the UI is still usable.
      await expect(catalogPage.page.getByTestId('product-eng-1')).toContainText('Ion Thruster Mk II');
    });
  });
});
