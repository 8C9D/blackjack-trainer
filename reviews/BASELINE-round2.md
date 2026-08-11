# BASELINE - round 2

Every gate, re-run from scratch on the round-2 branch point before any round-2 change.
The round-1 end-of-run table in `PROD-READINESS.md` is a claim; this file is the measurement.

- Branch: `prod-readiness/round2-2026-08-10`
- Base commit: `0856b7df98d2b3f87788fe7d28ec6a5823878c4c` (tip of `prod-readiness/2026-08-10`, unmerged)
- Date: 2026-08-10
- Node 24.15.0, npm 11.12.1

Preflight: `git status --porcelain --untracked-files=no` printed nothing (zero modified tracked files);
`git diff` and `git diff --cached` were both empty.
The two untracked directories `.agents/` and `.codex/` are expected and were not touched.
Nothing was listening on `127.0.0.1:4200` before the E2E gate ran (`lsof -nP -iTCP:4200 -sTCP:LISTEN` exit 1).
A stray `node` process from round 1 holds `[::1]:4321`; no gate binds that port, and it is not this run's
process to kill, so it was left alone.

All nine commands ran with the tool sandbox disabled (round-1 assumption 2 reproduces: sandboxed
build/test commands abort).

## Result

| #   | gate              | command                                                                                                   | exit | result                                         |
| --- | ----------------- | --------------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------------- |
| 1   | lint              | `npm run lint`                                                                                            | 0    | `All matched files use Prettier code style!`   |
| 2   | build             | `npm run build`                                                                                           | 0    | 1 budget warning (inherited, P2-2)             |
| 3   | unit tests        | `npm test`                                                                                                | 0    | 65 files, 1533 passed                          |
| 4   | coverage gate     | `npm run test:coverage`                                                                                   | 0    | 96.11 / 93.23 / 93.28 / 97.97                  |
| 5   | E2E               | `E2E_SERVER=dist npm run e2e`                                                                             | 0    | 111 passed                                     |
| 6   | parity anti-drift | `npm run export:fixtures` + `git diff --exit-code -- ios/Fixtures`                                        | 0    | 7 fixtures written, no drift                   |
| 7   | swiftformat       | `swiftformat --lint .`                                                                                    | 0    | 0/105 files require formatting                 |
| 8   | swiftlint         | `swiftlint lint`                                                                                          | 0    | 0 violations, 0 serious in 105 files           |
| 9   | iOS build + test  | `xcodebuild -scheme BlackjackTrainer -destination 'platform=iOS Simulator,name=iPhone 16 Pro' build test` | 0    | `** TEST SUCCEEDED **`, 335 tests in 38 suites |

All nine green. The round-2 baseline matches round 1's closing table exactly on every figure, so
round 1's final claim reproduces.

## Raw output

### 1. `npm run lint` - exit 0

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

### 2. `npm run build` - exit 0

```
Application bundle generation complete. [3.888 seconds] - 2026-08-11T03:32:14.134Z

▲ [WARNING] src/app/features/chart/chart-page.component.scss exceeded maximum budget.
Budget 5.00 kB was not met by 368 bytes with a total of 5.37 kB.

Output location: /Users/arthurzhang/dev/blackjack-trainer/dist/blackjack-trainer
```

The single warning is P2-2, inherited and unchanged.

### 3. `npm test` - exit 0

```
 Test Files  65 passed (65)
      Tests  1533 passed (1533)
   Start at  23:32:25
   Duration  12.23s
```

### 4. `npm run test:coverage` - exit 0

```
 Test Files  65 passed (65)
      Tests  1533 passed (1533)

=============================== Coverage summary ===============================
Statements   : 96.11% ( 5290/5504 )
Branches     : 93.23% ( 2358/2529 )
Functions    : 93.28% ( 917/983 )
Lines        : 97.97% ( 4063/4147 )
================================================================================
```

### 5. `E2E_SERVER=dist npm run e2e` - exit 0

```
  ✓  111 [chromium] › e2e/smoke/theme.e2e.ts:83:9 › theme › reduced motion › drops transition duration when the OS asks for less motion (1.5s)

  111 passed (51.7s)
```

Recorded for round 2's own use: this figure is `111 passed` with **zero skipped**, which is what
N7 says cannot be relied on. The count is captured here so the N7 artifact has a before-value to
compare against.

### 6. parity anti-drift - exit 0

```
> blackjack-trainer@1.0.0 export:fixtures
> tsx tools/export-parity-fixtures.ts

Wrote 7 parity fixtures to /Users/arthurzhang/dev/blackjack-trainer/ios/Fixtures
```

`git diff --exit-code -- ios/Fixtures` exited 0: no drift.

### 7. `swiftformat --lint .` - exit 0

```
Running SwiftFormat...
(lint mode - no files will be changed.)
Reading config file at /Users/arthurzhang/dev/blackjack-trainer/ios/.swiftformat
SwiftFormat completed in 0.03s.
0/105 files require formatting, 3 files skipped.
```

### 8. `swiftlint lint` - exit 0

```
Linting 'MissTally.swift' (105/105)
Done linting! Found 0 violations, 0 serious in 105 files.
```

### 9. `xcodebuild ... build test` - `** TEST SUCCEEDED **`

Status read from the marker, not from `PIPESTATUS` (empty in zsh):

```
✔ Test run with 335 tests in 38 suites passed after 9.098 seconds.
** TEST SUCCEEDED **
```

One line in this output is worth pinning before someone reads it as a defect:

```
Executed 0 tests, with 0 failures (0 unexpected) in 0.000 (0.001) seconds
```

That is the **XCTest** bundle, which is empty; all 335 tests are swift-testing suites, reported by
the `Test run with 335 tests in 38 suites passed` line above it. The gate is counting real tests.
