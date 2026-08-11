import AxeBuilder from '@axe-core/playwright';

import { expect, test } from '../fixtures';

/**
 * Automated accessibility checks.
 *
 * Two honest caveats up front, because a suite that overstates this is worse
 * than one that omits it:
 *
 *  - Automated tooling catches roughly a third of real accessibility problems.
 *    It finds missing labels, poor contrast and broken structure; it cannot
 *    tell you whether the flow makes sense with a screen reader.
 *  - A green axe run is a floor, not a certificate.
 *
 * It is still worth having, for a reason unrelated to compliance: the same
 * properties axe checks — labels, roles, accessible names — are exactly what
 * getByRole and getByLabel depend on. A page that fails axe is a page whose
 * tests have to fall back to CSS selectors.
 */
const PAGES = [
  { name: 'home', path: '/' },
  { name: 'login', path: '/login.html' },
  { name: 'catalog', path: '/catalog.html' },
  { name: 'checkout', path: '/checkout.html' },
];

for (const { name, path } of PAGES) {
  test(`${name} page has no detectable accessibility violations`, async ({ page }) => {
    await page.goto(path);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    // Report the violations, not just the count. `expect(x).toHaveLength(0)`
    // tells you something is wrong; this tells you what and where.
    expect(
      results.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        nodes: violation.nodes.map((node) => node.target).flat(),
      })),
    ).toEqual([]);
  });
}

test('every form control has an accessible name', async ({ page }) => {
  await page.goto('/checkout.html');

  // A control with no accessible name is unusable with a screen reader AND
  // unreachable with getByLabel — the bug and the testing problem are the
  // same bug.
  const controls = page.locator('input:not([type="hidden"]), select, textarea');
  const count = await controls.count();
  expect(count).toBeGreaterThan(0);

  for (let index = 0; index < count; index++) {
    const control = controls.nth(index);
    const accessibleName = await control.evaluate((element) => {
      const labelled = element.getAttribute('aria-label');
      if (labelled) return labelled;
      const id = element.getAttribute('id');
      if (id) {
        const label = document.querySelector(`label[for="${id}"]`);
        if (label?.textContent?.trim()) return label.textContent.trim();
      }
      return element.closest('label')?.textContent?.trim() ?? '';
    });

    expect(accessibleName, `control #${index} has no accessible name`).not.toBe('');
  }
});

test('the page has exactly one h1 and headings do not skip levels', async ({ page }) => {
  await page.goto('/catalog.html');

  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);

  const levels = await page
    .locator('h1, h2, h3, h4, h5, h6')
    .evaluateAll((elements) => elements.map((element) => Number(element.tagName[1])));

  // Jumping h1 → h3 leaves a screen-reader user unable to tell what the h3
  // belongs to. This is the kind of structural rule axe checks only partially.
  for (let index = 1; index < levels.length; index++) {
    const previous = levels[index - 1] ?? 0;
    const current = levels[index] ?? 0;
    expect(current - previous, `heading level jumped from h${previous} to h${current}`)
      .toBeLessThanOrEqual(1);
  }
});
