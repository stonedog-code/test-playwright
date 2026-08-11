/**
 * The demo application under test.
 *
 * Deliberately dependency-free and deliberately small: the point of this repo
 * is the tests, and a reference suite that cannot be run because its app needs
 * a database and three API keys is a reference nobody runs.
 *
 * It exists so every pattern in the README has something real to run against —
 * a login flow, a list, radio buttons, checkboxes, a select, a table, a dialog,
 * a file upload, and a JSON API.
 */
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// __dirname, not import.meta.url: package.json declares no "type": "module",
// so this file runs as CommonJS and import.meta is unavailable there.
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT ?? 3100);

interface Product {
  id: string;
  name: string;
  category: 'engines' | 'avionics' | 'structures';
  priceCents: number;
  inStock: boolean;
}

const PRODUCTS: Product[] = [
  { id: 'eng-1', name: 'Ion Thruster Mk II', category: 'engines', priceCents: 249_900, inStock: true },
  { id: 'eng-2', name: 'Solid Booster A', category: 'engines', priceCents: 189_500, inStock: false },
  { id: 'avi-1', name: 'Star Tracker 9', category: 'avionics', priceCents: 74_250, inStock: true },
  { id: 'avi-2', name: 'Flight Computer X', category: 'avionics', priceCents: 132_000, inStock: true },
  { id: 'str-1', name: 'Payload Fairing', category: 'structures', priceCents: 88_000, inStock: false },
  { id: 'str-2', name: 'Interstage Ring', category: 'structures', priceCents: 45_750, inStock: true },
];

const VALID_USER = { username: 'testpilot', password: 'correct-horse' };
const SESSION_COOKIE = 'demo_session';
const SESSION_TOKEN = 'session-token-for-testing';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function isAuthenticated(req: IncomingMessage): boolean {
  return (req.headers.cookie ?? '').includes(`${SESSION_COOKIE}=${SESSION_TOKEN}`);
}

const server = createServer((req, res) => {
  void handle(req, res).catch((error: unknown) => {
    json(res, 500, { error: error instanceof Error ? error.message : 'unknown' });
  });
});

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  const route = `${req.method ?? 'GET'} ${url.pathname}`;

  // ---- API -----------------------------------------------------------------

  if (route === 'POST /api/login') {
    const body = JSON.parse((await readBody(req)) || '{}') as Partial<typeof VALID_USER>;

    // A deliberate small delay, so the tests have to deal with a real pending
    // state rather than an instantaneous transition. Auto-waiting handles it;
    // a hardcoded sleep would be the wrong answer.
    await new Promise((resolve) => setTimeout(resolve, 150));

    if (body.username === VALID_USER.username && body.password === VALID_USER.password) {
      res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${SESSION_TOKEN}; Path=/; HttpOnly; SameSite=Lax`);
      json(res, 200, { ok: true, username: body.username });
      return;
    }
    json(res, 401, { ok: false, error: 'Incorrect username or password' });
    return;
  }

  if (route === 'POST /api/logout') {
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; Max-Age=0`);
    json(res, 200, { ok: true });
    return;
  }

  if (route === 'GET /api/session') {
    json(res, isAuthenticated(req) ? 200 : 401, { authenticated: isAuthenticated(req) });
    return;
  }

  if (route === 'GET /api/products') {
    const category = url.searchParams.getAll('category');
    const stock = url.searchParams.get('stock') ?? 'all';
    const search = (url.searchParams.get('search') ?? '').toLowerCase();

    let results = PRODUCTS;
    if (category.length > 0) results = results.filter((p) => category.includes(p.category));
    if (stock === 'in') results = results.filter((p) => p.inStock);
    if (stock === 'out') results = results.filter((p) => !p.inStock);
    if (search) results = results.filter((p) => p.name.toLowerCase().includes(search));

    json(res, 200, { count: results.length, products: results });
    return;
  }

  if (route === 'GET /api/products/unstable') {
    // Fails half the time on purpose, so the README has something real to
    // demonstrate retries and `expect.poll` against.
    if (Math.random() < 0.5) {
      json(res, 503, { error: 'temporarily unavailable' });
      return;
    }
    json(res, 200, { ok: true });
    return;
  }

  if (route === 'POST /api/orders') {
    if (!isAuthenticated(req)) {
      json(res, 401, { error: 'sign in first' });
      return;
    }

    const body = JSON.parse((await readBody(req)) || '{}') as Record<string, unknown>;
    const errors: Record<string, string> = {};

    const email = typeof body.email === 'string' ? body.email : '';

    if (!body.fullName) errors.fullName = 'Full name is required';
    if (!email) errors.email = 'Email is required';
    else if (!email.includes('@')) errors.email = 'Enter a valid email address';
    if (!body.country) errors.country = 'Choose a country';
    if (!body.shipping) errors.shipping = 'Choose a shipping speed';
    if (body.terms !== true) errors.terms = 'You must accept the terms';

    if (Object.keys(errors).length > 0) {
      json(res, 400, { errors });
      return;
    }

    json(res, 201, { orderId: 'ORD-40128', total: '$1,234.00' });
    return;
  }

  // ---- Static --------------------------------------------------------------

  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.join(PUBLIC_DIR, path.normalize(requested).replace(/^(\.\.[/\\])+/, ''));

  // Anything under /account requires a session, so the auth-state pattern has
  // something real to protect.
  if (requested.startsWith('/account') && !isAuthenticated(req)) {
    res.writeHead(302, { Location: '/login.html?next=' + encodeURIComponent(requested) });
    res.end();
    return;
  }

  try {
    const content = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] ?? 'application/octet-stream' });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><h1>Not found</h1>');
  }
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`demo app listening on http://127.0.0.1:${PORT}`);
});
