import { defineConfig } from 'vitest/config';

// Loaded by the `ng test` Vitest runner (angular.json → test.options.runnerConfig).
// This file owns the whole shape of a coverage run; the only thing outside it
// is the opt-in switch (`ng test --coverage`, aliased as npm run test:coverage).
// Threshold floors sit a couple of points under the measured baseline
// (96.0% S / 94.2% B / 92.4% F / 98.0% L on 2026-08-03) so they catch
// regressions without flaking on small refactors. Re-measure and lift them when
// the gap grows: floors left behind a rising baseline stop being a gate — the
// previous set was written against the 2026-07-23 baseline and had drifted four
// points below, which is a whole feature's worth of coverage a regression could
// have shed unnoticed.
// What these percentages cover, stated because they are quoted as if they
// covered the repository: they cover the files the test process loads, which is
// `src/**` and nothing else. Measured — 74 files in the report, 0 of them under
// `tools/`. `tools/serve-dist.mjs` runs as a child process, which v8 coverage in
// this process cannot see, and `tools/export-parity-fixtures.ts` is never
// imported by a test (importing it would run it, rewriting tracked files under
// `ios/Fixtures` as a side effect of `npm test`). Both are tested — by their
// output and their process behaviour, in `tools/*.spec.mjs` — but no figure here
// includes them. Closing that needs a coverage-forwarding harness for the child
// process; finding M3.
export default defineConfig({
  test: {
    coverage: {
      reporter: ['text-summary'],
      thresholds: {
        statements: 94,
        branches: 92,
        functions: 90,
        lines: 96,
      },
    },
  },
});
