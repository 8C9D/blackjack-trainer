import { defineConfig } from 'vitest/config';

// Loaded by the `ng test` Vitest runner (angular.json → test.options.runnerConfig).
// This file owns the whole shape of a coverage run; the only thing outside it
// is the opt-in switch (`ng test --coverage`, aliased as npm run test:coverage).
// Threshold floors sit a couple of points under the measured baseline
// (94.5% S / 91.9% B / 90.6% F / 97.5% L on 2026-07-23) so they catch
// regressions without flaking on small refactors.
export default defineConfig({
  test: {
    coverage: {
      reporter: ['text-summary'],
      thresholds: {
        statements: 92,
        branches: 89,
        functions: 88,
        lines: 95,
      },
    },
  },
});
