import { expect, test } from '@playwright/test';

/**
 * API tests, in the `api` project — no browser, no storageState, no page.
 *
 * The `request` fixture is a standalone HTTP client that shares Playwright's
 * config (baseURL, proxy, TLS) but starts no browser. These run in a fraction
 * of the time of a UI test, so anything provable at this level belongs here.
 *
 * Note this file imports from '@playwright/test' directly rather than from
 * ../fixtures: the page-object fixtures would drag a browser in for nothing.
 */

interface ProductsResponse {
  count: number;
  products: Array<{ id: string; name: string; category: string; priceCents: number; inStock: boolean }>;
}

test.describe('GET /api/products', () => {
  test('returns every part by default', async ({ request }) => {
    const response = await request.get('/api/products');

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');

    const body = (await response.json()) as ProductsResponse;
    expect(body.count).toBe(6);
    expect(body.products).toHaveLength(6);
  });

  test('every product carries the fields the UI needs', async ({ request }) => {
    const response = await request.get('/api/products');
    const body = (await response.json()) as ProductsResponse;

    // Assert the SHAPE, not one hardcoded row. A schema-shaped assertion keeps
    // passing when the data changes and fails when the contract does.
    for (const product of body.products) {
      expect(product).toEqual({
        id: expect.stringMatching(/^[a-z]{3}-\d+$/),
        name: expect.any(String),
        category: expect.stringMatching(/^(engines|avionics|structures)$/),
        priceCents: expect.any(Number),
        inStock: expect.any(Boolean),
      });
      expect(product.priceCents).toBeGreaterThan(0);
    }
  });

  test.describe('filtering', () => {
    // A data-driven loop: one case per row, each producing its own named test.
    // Generating tests in a loop keeps the report readable — a single test
    // looping internally reports one failure and hides which case broke.
    const cases: Array<{ name: string; params: Record<string, string>; expected: number }> = [
      { name: 'in stock', params: { stock: 'in' }, expected: 4 },
      { name: 'out of stock', params: { stock: 'out' }, expected: 2 },
      { name: 'engines', params: { category: 'engines' }, expected: 2 },
      { name: 'avionics', params: { category: 'avionics' }, expected: 2 },
      { name: 'search by name', params: { search: 'thruster' }, expected: 1 },
      { name: 'search matches nothing', params: { search: 'warp core' }, expected: 0 },
      { name: 'engines in stock', params: { category: 'engines', stock: 'in' }, expected: 1 },
    ];

    for (const { name, params, expected } of cases) {
      test(`filters by ${name}`, async ({ request }) => {
        const response = await request.get('/api/products', { params });

        expect(response.status()).toBe(200);
        const body = (await response.json()) as ProductsResponse;
        expect(body.count).toBe(expected);
      });
    }
  });

  test('search is case-insensitive', async ({ request }) => {
    const upper = await request.get('/api/products', { params: { search: 'THRUSTER' } });
    const lower = await request.get('/api/products', { params: { search: 'thruster' } });

    expect((await upper.json())).toEqual(await lower.json());
  });
});

test.describe('POST /api/login', () => {
  test('accepts the correct credentials and sets a session cookie', async ({ request }) => {
    const response = await request.post('/api/login', {
      data: { username: 'testpilot', password: 'correct-horse' },
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, username: 'testpilot' });

    // Assert the security attributes, not just that a cookie exists. HttpOnly
    // missing is a real vulnerability and completely invisible from the UI.
    const setCookie = response.headers()['set-cookie'] ?? '';
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');
  });

  test.describe('rejects bad credentials', () => {
    const badCases = [
      { name: 'wrong password', data: { username: 'testpilot', password: 'nope' } },
      { name: 'unknown user', data: { username: 'nobody', password: 'correct-horse' } },
      { name: 'empty body', data: {} },
    ];

    for (const { name, data } of badCases) {
      test(name, async ({ request }) => {
        const response = await request.post('/api/login', { data });

        expect(response.status()).toBe(401);

        // The error must not distinguish "no such user" from "wrong password":
        // doing so lets an attacker enumerate valid usernames.
        expect(await response.json()).toMatchObject({
          ok: false,
          error: 'Incorrect username or password',
        });
      });
    }
  });
});

test.describe('POST /api/orders', () => {
  test('requires a session', async ({ request }) => {
    const response = await request.post('/api/orders', {
      data: { fullName: 'Test Pilot' },
    });

    // This project has no storageState, so the request is genuinely anonymous.
    // Testing authorisation from a signed-in browser context would prove
    // nothing — this is why the api project deliberately omits it.
    expect(response.status()).toBe(401);
  });

  test('validates and then accepts a complete order', async ({ request }) => {
    // Sign in on this request context; the cookie persists for later calls.
    await request.post('/api/login', {
      data: { username: 'testpilot', password: 'correct-horse' },
    });

    const incomplete = await request.post('/api/orders', { data: { fullName: 'Test Pilot' } });
    expect(incomplete.status()).toBe(400);
    expect((await incomplete.json()).errors).toMatchObject({
      email: 'Email is required',
      country: 'Choose a country',
      shipping: 'Choose a shipping speed',
      terms: 'You must accept the terms',
    });

    const complete = await request.post('/api/orders', {
      data: {
        fullName: 'Test Pilot',
        email: 'pilot@example.com',
        country: 'gb',
        shipping: 'express',
        terms: true,
      },
    });
    expect(complete.status()).toBe(201);
    expect(await complete.json()).toMatchObject({ orderId: 'ORD-40128' });
  });
});

test.describe('flaky endpoints', () => {
  test('expect.poll retries until an unreliable endpoint answers', async ({ request }) => {
    // /api/products/unstable fails ~50% of the time on purpose. Polling is the
    // honest way to handle a genuinely eventually-consistent dependency — but
    // note what it is NOT for: papering over a race in your own application.
    await expect
      .poll(async () => (await request.get('/api/products/unstable')).status(), {
        timeout: 10_000,
        intervals: [100, 250, 500],
      })
      .toBe(200);
  });
});
