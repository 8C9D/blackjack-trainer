# BASELINE

Raw output of every gate this repository ships, captured before any code in this
production-readiness run was touched.
Every later "green" claim in `PROD-READINESS.md` or in a stage review is measured
against this file, not against an assumed-clean starting state.

- Commit sha: `fc7d0c32de8e89f41fd3457a1e5bd014b40e43d5`
- Branch: `prod-readiness/2026-08-10` (created from `main` at that sha)
- Date captured: 2026-08-10
- Machine: darwin 24.6.0, Node v24.15.0, npm 11.12.1
- Tracked working tree at capture: clean (`git diff` and `git diff --cached` both empty)

## Sandbox note

Every command below was run with the tool sandbox disabled.
The first sandboxed attempt at `npm run build` died with exit 134 (SIGABRT) and no
diagnostic output; the identical command outside the sandbox exits 0.
That is a harness constraint, not a repository defect, and it is recorded here so a
reviewer re-running these commands gets the same result rather than a spurious failure.

## Summary

| Gate                      | Command                                                                                                   | Exit  | Result                                                |
| ------------------------- | --------------------------------------------------------------------------------------------------------- | ----- | ----------------------------------------------------- |
| Web build                 | `npm run build`                                                                                           | 0     | PASS (1 budget warning)                               |
| Web unit tests            | `npm test`                                                                                                | 0     | PASS - 65 files, 1526 tests                           |
| Web coverage gate         | `npm run test:coverage`                                                                                   | 0     | PASS - all four thresholds met                        |
| Web lint                  | `npm run lint` (tsc + prettier)                                                                           | 0     | PASS                                                  |
| Web E2E                   | `E2E_SERVER=dist npm run e2e`                                                                             | 0     | PASS - 111 tests                                      |
| Parity fixture anti-drift | `npm run export:fixtures` + `git diff --exit-code -- ios/Fixtures`                                        | 0 / 0 | PASS - no drift                                       |
| iOS format lint           | `swiftformat --lint .`                                                                                    | 0     | PASS - 0/105 files need formatting                    |
| iOS lint                  | `swiftlint lint --quiet`                                                                                  | 0     | PASS - no output                                      |
| iOS build + test          | `xcodebuild -scheme BlackjackTrainer -destination 'platform=iOS Simulator,name=iPhone 16 Pro' build test` | -     | PASS - `** TEST SUCCEEDED **`, 335 tests in 38 suites |

There are **no pre-existing failures**. The only non-clean signal anywhere in the
baseline is one Angular budget **warning** (not an error) on a component stylesheet,
reproduced verbatim below.

## Raw output

### `npm run build`

```
> blackjack-trainer@1.0.0 build
> ng build

❯ Building...
✔ Building...
Initial chunk files | Names                               |  Raw size | Estimated transfer size
main-YOQCEWHU.js    | main                                | 279.90 kB |                74.72 kB
styles-KH7BOXCE.css | styles                              |   5.63 kB |                 1.03 kB

                    | Initial total                       | 285.53 kB |                75.74 kB

Lazy chunk files    | Names                               |  Raw size | Estimated transfer size
chunk-B9emg3a4.js   | card-counting-page-component        |  74.37 kB |                16.26 kB
chunk-CE5QZJto.js   | settings-page-component             |  36.74 kB |                 8.76 kB
chunk-DrWP4CJQ.js   | -                                   |  23.65 kB |                 6.54 kB
chunk-DjFQtfJ6.js   | deviations-drill-page-component     |  17.29 kB |                 5.23 kB
chunk-DUzHXM56.js   | -                                   |  16.04 kB |                 4.04 kB
chunk-ne-WcsV-.js   | -                                   |  14.80 kB |                 1.88 kB
chunk-BDeGaBQu.js   | progress-page-component             |  14.79 kB |                 4.19 kB
chunk-C7FK27JH.js   | -                                   |  10.99 kB |                 3.41 kB
chunk-QZdv0PyQ.js   | basic-strategy-drill-page-component |  10.95 kB |                 3.42 kB
chunk-j-p1V5Ju.js   | home-page-component                 |   9.51 kB |                 2.96 kB
chunk-C8JXhG7D.js   | -                                   |   5.99 kB |                 1.98 kB
chunk-CuNLaG4h.js   | -                                   |   4.19 kB |                 1.73 kB
chunk-MAGUMMuP.js   | -                                   |   3.44 kB |                 1.30 kB
chunk-Dn9yqq_o.js   | -                                   |   3.17 kB |                 1.12 kB
chunk-B1zTR_X8.js   | -                                   |   1.86 kB |               831 bytes
...and 5 more lazy chunks files. Use "--verbose" to show all the files.

Application bundle generation complete. [2.562 seconds] - 2026-08-10T22:56:28.262Z

▲ [WARNING] src/app/features/chart/chart-page.component.scss exceeded maximum budget. Budget 5.00 kB was not met by 368 bytes with a total of 5.37 kB.

Output location: /Users/arthurzhang/dev/blackjack-trainer/dist/blackjack-trainer
```

Exit code: 0

### `npm test`

```
> blackjack-trainer@1.0.0 test
> ng test

Using Vitest configuration file: /Users/arthurzhang/dev/blackjack-trainer/vitest.config.ts
❯ Building...
✔ Building...
Application bundle generation complete. [2.799 seconds] - 2026-08-10T22:56:38.078Z

 RUN  v4.1.10 /Users/arthurzhang/dev/blackjack-trainer

 Test Files  65 passed (65)
      Tests  1526 passed (1526)
   Start at  18:56:38
   Duration  4.77s (transform 3.99s, setup 4.32s, import 6.27s, tests 19.88s, environment 54.09s)
```

Exit code: 0

### `npm run test:coverage`

```
> ng test --coverage

Using Vitest configuration file: /Users/arthurzhang/dev/blackjack-trainer/vitest.config.ts
❯ Building...
✔ Building...
Application bundle generation complete. [2.674 seconds] - 2026-08-10T22:57:09.066Z

 RUN  v4.1.10 /Users/arthurzhang/dev/blackjack-trainer
      Coverage enabled with v8

 Test Files  65 passed (65)
      Tests  1526 passed (1526)
   Start at  18:57:09
   Duration  6.30s (transform 4.14s, setup 4.37s, import 6.36s, tests 24.26s, environment 43.26s)

 % Coverage report from v8

=============================== Coverage summary ===============================
Statements   : 96.1% ( 5275/5489 )
Branches     : 93.22% ( 2354/2525 )
Functions    : 93.27% ( 916/982 )
Lines        : 97.96% ( 4053/4137 )
================================================================================
```

Exit code: 0. Configured floors (`vitest.config.ts`): statements 94, branches 92,
functions 90, lines 96. All four are met, with the narrowest margin on lines
(97.96% vs a floor of 96).

### `npm run lint`

```
> blackjack-trainer@1.0.0 lint
> npm run typecheck && npm run format:check

> blackjack-trainer@1.0.0 typecheck
> tsc --noEmit -p tsconfig.app.json

> blackjack-trainer@1.0.0 format:check
> prettier --check .

Checking formatting...
All matched files use Prettier code style!
```

Exit code: 0

### `E2E_SERVER=dist npm run e2e`

```
> blackjack-trainer@1.0.0 e2e
> playwright test

  111 passed (31.2s)
```

Exit code: 0. Run against the production bundle built above, matching what CI does
(`.github/workflows/ci.yml` sets `E2E_SERVER: dist`).

### Parity fixture anti-drift gate

```
> blackjack-trainer@1.0.0 export:fixtures
> tsx tools/export-parity-fixtures.ts

Wrote 7 parity fixtures to /Users/arthurzhang/dev/blackjack-trainer/ios/Fixtures
EXPORT_EXIT=0
FIXTURE_DIFF_EXIT=0
```

`git diff --exit-code -- ios/Fixtures` exits 0, so the committed iOS fixtures match
what the web source of truth exports. This is the gate in `.github/workflows/ci.yml`.

### iOS: `swiftformat --lint .`

```
Running SwiftFormat...
(lint mode - no files will be changed.)
Reading config file at /Users/arthurzhang/dev/blackjack-trainer/ios/.swiftformat
SwiftFormat completed in 0.07s.
0/105 files require formatting, 3 files skipped.
SWIFTFORMAT_EXIT=0
```

### iOS: `swiftlint lint --quiet`

```
SWIFTLINT_EXIT=0
```

No violations printed.

### iOS: `xcodebuild build test`

Command:

```
xcodebuild -scheme BlackjackTrainer \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath build/DerivedData \
  build test
```

Tail of output:

```
✔ Suite TextTests passed after 0.001 seconds.
✔ Test run with 335 tests in 38 suites passed after 5.490 seconds.
2026-08-10 18:58:08.604 xcodebuild[12031:76772064] [MT] IDETestOperationsObserverDebug: 17.054 elapsed -- Testing started completed.

Test session results, code coverage, and logs:
	/Users/arthurzhang/dev/blackjack-trainer/ios/build/DerivedData/Logs/Test/Run-BlackjackTrainer-2026.08.10_18-57-38--0400.xcresult

** TEST SUCCEEDED **
```

The capture wrapper printed an empty `XCODEBUILD_PIPE_EXIT=` because `PIPESTATUS`
is a bash array and this shell is zsh (`pipestatus`, 1-indexed).
The exit status is therefore read from `** TEST SUCCEEDED **`, which xcodebuild
prints only on success, and from the 335/335 test count.
A reviewer re-running this should read the same marker rather than that variable.

## What "not worse than baseline" means for this run

A pass may not:

- turn any exit code above from 0 to non-zero,
- reduce the passing counts (1526 web unit / 111 web E2E / 335 iOS),
- drop any coverage metric below the configured floors,
- introduce a new build warning, or turn the existing budget warning into an error,
- introduce drift in `ios/Fixtures`.
