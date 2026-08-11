# BASELINE - round 3

Every gate, re-run from scratch at the round-3 branch point before any round-3 change.
The round-2 closing table in `PROD-READINESS.md` is a claim; this file is the measurement.

- Branch: `prod-readiness/round3-2026-08-11`
- Base commit: `fff96bca7d34ed07960dae829a9c667c333fb10b` (tip of `prod-readiness/round2-2026-08-10`, unmerged)
- Date: 2026-08-11
- Node 24.15.0, npm 11.12.1

Preflight: `git status --porcelain --untracked-files=no` printed nothing (zero modified tracked files);
`git diff` and `git diff --cached` were both empty.
The two untracked directories `.agents/` and `.codex/` are expected and were not touched.
Nothing was listening on `127.0.0.1:4200` before the E2E gate ran (`lsof -nP -iTCP:4200 -sTCP:LISTEN` exit 1).
The stray `node` process holding `[::1]:4321` is still there; no gate binds that port, and it is not this
run's process to kill, so it was left alone.

All nine commands ran with the tool sandbox disabled (the round-1 and round-2 assumption reproduces:
sandboxed build/test commands abort).

## Result

| #   | gate              | command                                                                                                   | exit | result                                         |
| --- | ----------------- | --------------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------------- |
| 1   | lint              | `npm run lint`                                                                                            | 0    | `All matched files use Prettier code style!`   |
| 2   | build             | `npm run build`                                                                                           | 0    | 1 budget warning (inherited, P2-2)             |
| 3   | unit tests        | `npm test`                                                                                                | 0    | 67 files, 1547 passed                          |
| 4   | coverage gate     | `npm run test:coverage`                                                                                   | 0    | 96.11 / 93.23 / 93.28 / 97.97                  |
| 5   | E2E               | `E2E_SERVER=dist npm run e2e` **x10**                                                                     | 0x10 | `111 passed` on all ten - see the table below  |
| 6   | parity anti-drift | `npm run export:fixtures` + `git diff --exit-code -- ios/Fixtures`                                        | 0    | 7 fixtures written, no drift                   |
| 7   | swiftformat       | `swiftformat --lint .`                                                                                    | 0    | 0/105 files require formatting                 |
| 8   | swiftlint         | `swiftlint lint`                                                                                          | 0    | 0 violations, 0 serious in 105 files           |
| 9   | iOS build + test  | `xcodebuild -scheme BlackjackTrainer -destination 'platform=iOS Simulator,name=iPhone 16 Pro' build test` | 0    | `** TEST SUCCEEDED **`, 335 tests in 38 suites |

All nine green. Two figures moved against round 2's baseline and both are accounted for: the unit gate
is 67 files / 1547 tests rather than 65 / 1533, which is round 2's own two `tools/*.spec.mjs` files
(N3); the coverage percentages are unchanged to two decimals.

## Gate 5 as a distribution, not a figure

The round-3 brief asks for ten runs because M2 - the intermittent failure of
`e2e/smoke/showdown.e2e.ts:65` - is judged against a before-rate. Ten consecutive full-suite runs of
`E2E_SERVER=dist npm run e2e`, each a fresh invocation (each rebuilds the bundle it serves):

| run | exit | result               |
| --- | ---- | -------------------- |
| 1   | 0    | `111 passed (1.3m)`  |
| 2   | 0    | `111 passed (1.1m)`  |
| 3   | 0    | `111 passed (44.0s)` |
| 4   | 0    | `111 passed (38.0s)` |
| 5   | 0    | `111 passed (37.6s)` |
| 6   | 0    | `111 passed (41.5s)` |
| 7   | 0    | `111 passed (35.3s)` |
| 8   | 0    | `111 passed (37.9s)` |
| 9   | 0    | `111 passed (32.9s)` |
| 10  | 0    | `111 passed (35.4s)` |

**0 failures in 10 runs.** This is the honest number and it is not the number round 2 recorded
(2 failures in 7 runs at the same commit, on the same machine). It does not disprove round 2: at a
per-run failure probability of 0.05, `P(0 failures in 10) = 0.95^10 = 0.60`, so ten green runs is the
most likely single outcome of a genuinely intermittent test at that rate. What it does establish is
that **the full-suite run is too coarse an instrument to measure this defect**: a before-rate of "0 of
10" cannot make any after-rate implausible, so no number of green runs after a fix would prove
anything on this evidence alone.

The measurement M2's fix is actually judged against is therefore the **per-execution** rate of the one
test, measured with `--repeat-each`, and it is recorded in `reviews/ARTIFACTS-round3.md` under M2
rather than here, because it was taken after this baseline. Both numbers are reported.

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
Application bundle generation complete. [2.250 seconds] - 2026-08-11T13:28:22.936Z

▲ [WARNING] src/app/features/chart/chart-page.component.scss exceeded maximum budget.
Budget 5.00 kB was not met by 368 bytes with a total of 5.37 kB.

Output location: /Users/arthurzhang/dev/blackjack-trainer/dist/blackjack-trainer
```

The single warning is P2-2, inherited and unchanged.

### 3. `npm test` - exit 0

```
 Test Files  67 passed (67)
      Tests  1547 passed (1547)
   Start at  09:28:26
   Duration  6.61s
```

### 4. `npm run test:coverage` - exit 0

```
 Test Files  67 passed (67)
      Tests  1547 passed (1547)

=============================== Coverage summary ===============================
Statements   : 96.11% ( 5290/5504 )
Branches     : 93.23% ( 2358/2529 )
Functions    : 93.28% ( 917/983 )
Lines        : 97.97% ( 4063/4147 )
================================================================================
```

### 5. `E2E_SERVER=dist npm run e2e` - exit 0, ten times

The loop that produced the table above, verbatim:

```console
$ for i in $(seq 1 10); do E2E_SERVER=dist npm run e2e > run$i.txt 2>&1; echo "run$i exit=$?"; done
run1 exit=0   111 passed (1.3m)
run2 exit=0   111 passed (1.1m)
run3 exit=0   111 passed (44.0s)
run4 exit=0   111 passed (38.0s)
run5 exit=0   111 passed (37.6s)
run6 exit=0   111 passed (41.5s)
run7 exit=0   111 passed (35.3s)
run8 exit=0   111 passed (37.9s)
run9 exit=0   111 passed (32.9s)
run10 exit=0   111 passed (35.4s)
```

Every run reports `111 passed` with zero skipped, which is the figure N7's fix exists to make
meaningful.

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
SwiftFormat completed in 0.05s.
0/105 files require formatting, 3 files skipped.
```

### 8. `swiftlint lint` - exit 0

```
Linting 'Fixtures.swift' (105/105)
Done linting! Found 0 violations, 0 serious in 105 files.
```

### 9. `xcodebuild ... build test` - `** TEST SUCCEEDED **`

Status read from the marker, not from `PIPESTATUS` (empty in zsh):

```
	 Executed 0 tests, with 0 failures (0 unexpected) in 0.000 (0.001) seconds
✔ Test run with 335 tests in 38 suites passed after 6.091 seconds.
** TEST SUCCEEDED **
```

The `Executed 0 tests` line is the empty XCTest bundle, as round 2 recorded; all 335 tests are
swift-testing suites.
