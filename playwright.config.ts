import { defineConfig, devices } from '@playwright/test';

// The dev server the E2E suite drives. `npm start` (ng serve) binds here.
const PORT = 4200;
const baseURL = `http://127.0.0.1:${PORT}`;

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
    command:
      (process.env.E2E_SERVER ?? (process.env.CI ? 'dist' : 'serve')) === 'dist'
        ? `PORT=${PORT} node tools/serve-dist.mjs`
        : 'npm start -- --host 127.0.0.1',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
