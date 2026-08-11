import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:3100';

export default defineConfig({
  testDir: './tests',

  /**
   * Files run in parallel, and so do tests within a file. Leave this on: it is
   * the setting that keeps a suite fast enough to run on every push, and it
   * surfaces shared-state bugs early rather than on the day you need to
   * parallelise.
   */
  fullyParallel: true,

  /** Fail the build if a `test.only` was committed — it would silently skip everything else. */
  forbidOnly: !!process.env.CI,

  /**
   * Retries on CI only.
   *
   * Retries hide flakiness, so they are a pragmatic concession, not a fix.
   * Playwright marks a test that passed on retry as "flaky" rather than
   * "passed" — treat that as a bug report, not as green.
   */
  retries: process.env.CI ? 2 : 0,

  /** One worker on CI: shared runners are slow and oversubscription causes timeouts. */
  workers: process.env.CI ? 1 : undefined,

  /** A test that needs more than 30s is usually waiting on something it should assert. */
  timeout: 30_000,

  expect: {
    /** Web-first assertions retry for this long before failing. */
    timeout: 5_000,
  },

  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }], ['list']]
    : [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: BASE_URL,

    /**
     * A trace is a full recording — DOM snapshots, network, console — openable
     * with `npx playwright show-trace`. `on-first-retry` keeps the cost near
     * zero while guaranteeing a failure that reproduces has one attached.
     */
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    /** Fail fast on a mistyped selector rather than sitting at the default 30s. */
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  projects: [
    /**
     * A setup project that signs in once and saves the cookies to disk.
     * Every UI project depends on it, so no test has to walk the login form
     * unless the login form is what it is testing.
     */
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },

    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: '.auth/user.json' },
      dependencies: ['setup'],
      testIgnore: /tests\/api\//,
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], storageState: '.auth/user.json' },
      dependencies: ['setup'],
      testIgnore: /tests\/api\//,
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], storageState: '.auth/user.json' },
      dependencies: ['setup'],
      testIgnore: /tests\/api\//,
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'], storageState: '.auth/user.json' },
      dependencies: ['setup'],
      testIgnore: /tests\/api\//,
    },

    /**
     * API tests need no browser at all, so they get their own project with no
     * storageState and no device. They run in a fraction of the time.
     */
    {
      name: 'api',
      testMatch: /tests\/api\/.*\.spec\.ts/,
      use: { baseURL: BASE_URL },
    },
  ],

  /**
   * Playwright starts the demo app itself and waits for it to answer.
   *
   * `reuseExistingServer` locally means a server you already have running is
   * left alone; on CI it is always started fresh, so a stale process cannot
   * make a broken build look green.
   */
  webServer: {
    command: 'npm start',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
