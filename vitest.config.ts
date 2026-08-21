import { defineConfig } from 'vitest/config';

// Loaded by the `ng test` Vitest runner (angular.json → test.options.runnerConfig).
// This file owns the whole shape of a coverage run; the only thing outside it
// is the opt-in switch (`ng test --coverage`, aliased as npm run test:coverage).
// Threshold floors sit a couple of points under the measured baseline: each is
// the nearest integer to two points below its figure (96.07% S / 92.97% B /
// 93.54% F / 97.85% L on 2026-08-20). Two points catch a regression while
// absorbing small refactors and the branch figure's known jitter (round 4
// measured twelve consecutive runs and saw one branch of difference).
// Re-tuned 2026-08-20, closing finding K6: the previous floors were written
// against a src/**-only baseline from 2026-08-03, before this report gained
// the records checker below — which is why branch headroom had shrunk under a
// point while function headroom had grown past three. Re-measure and re-tune
// when the gap moves again: floors left behind a rising baseline stop being a
// gate — one earlier set had drifted four points below its baseline, a whole
// feature's worth of coverage a regression could have shed unnoticed.
// What these percentages cover, stated because they are quoted as if they
// covered the repository: they cover the files the test process loads. Measured
// on 2026-08-12 — 75 files in the report, 1 of them under `tools/`.
//
// The blind spot is narrower than "coverage cannot see `tools/`", which is what
// this comment used to say and what finding M3 was filed as. What decides it is
// how a tool is reached, not where it lives:
//   - `tools/check-records.mjs` is imported in-process by its spec, so it is in
//     the report like any other module (94.14 / 86.45 / 100 / 95.69).
//   - `tools/serve-dist.mjs` runs as a child process, which v8 coverage in this
//     process cannot see.
//   - `tools/export-parity-fixtures.ts` calls `main()` at the bottom of the
//     file, so importing it would run it and rewrite tracked files under
//     `ios/Fixtures` as a side effect of `npm test`. Nothing imports it.
// Both of the last two are tested — by their output and their process
// behaviour, in `tools/*.spec.mjs` — but no figure here includes them. Closing
// that needs coverage collected from a child process and merged into this
// report, plus guarding the exporter's `main()` so it can be imported at all;
// finding M3, still open and now measured rather than assumed.
export default defineConfig({
  test: {
    coverage: {
      reporter: ['text-summary'],
      thresholds: {
        statements: 94,
        branches: 91,
        functions: 92,
        lines: 96,
      },
    },
  },
});
