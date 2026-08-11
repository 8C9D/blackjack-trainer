import { defineConfig, devices } from '@playwright/test';

// The dev server the E2E suite drives. `npm start` (ng serve) binds here.
const PORT = 4200;
const baseURL = `http://127.0.0.1:${PORT}`;

// Which server backs the suite. CI defaults to the production bundle; locally
// the default is ng serve.
const SERVES_DIST = (process.env.E2E_SERVER ?? (process.env.CI ? 'dist' : 'serve')) === 'dist';

// Chromium-only in v1: one browser is enough to catch wiring / routing /
// responsive regressions. Add Firefox/WebKit only if a real cross-browser bug
// motivates it. The `webServer` block owns the dev-server lifecycle so
// `npm run e2e` is a single command.
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Which server backs the suite is its own switch, not conflated with CI's
    // retries/workers/reporter knobs: E2E_SERVER=dist serves the production
    // bundle (requires a prior `npm run build`) via the dependency-free static
    // server; CI defaults to dist. Locally the default is ng serve, bound to
    // IPv4 explicitly: its default host resolves to ::1 (IPv6) on macOS, but
    // the readiness check and baseURL use 127.0.0.1, and a mismatch makes
    // Playwright wait forever for a server that is up.
    command: SERVES_DIST
      ? `PORT=${PORT} node tools/serve-dist.mjs`
      : 'npm start -- --host 127.0.0.1',
    url: baseURL,
    // Attaching to whatever already answers on the port is a convenience for the
    // `serve` lane, where the thing you have running is the thing under test.
    // The dist lane is never reused: it exists to test the production bundle
    // specifically, and a stray `ng serve` on this port would let the whole
    // suite pass green having never started serve-dist or loaded a built file —
    // a gate reporting on an artifact it did not run. Refusing the port instead
    // turns that into a startup error naming the port.
    reuseExistingServer: !process.env.CI && !SERVES_DIST,
    timeout: 120_000,
  },
});
