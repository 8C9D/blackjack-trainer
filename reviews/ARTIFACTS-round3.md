# ARTIFACTS - round 3

Evidence for every round-3 finding: the defect present, then absent, produced by running the thing.
Baseline for every "green" claim here: [`reviews/BASELINE-round3.md`](reviews/BASELINE-round3.md).

Every transcript names the exact tree state it was taken at, because round 2 shipped three that did
not hold at the commit carrying them. Where a proof was invalidated by a later stage it is re-derived
and the superseded version is kept and marked, not deleted.

All commands ran with the tool sandbox disabled.

## M2 - the E2E gate is red about one run in thirty-three, and it is the test that is wrong

**Severity: P1** (carried from round 2's NEXT ROUND table, re-triaged from scratch below).

### What the failure is

`e2e/smoke/showdown.e2e.ts:65` before this change:

```ts
test('returning to counting keeps the drill going', async ({ page }) => {
  await configure(page, '2');
  await runCountingRound(page);
  await page.getByRole('button', { name: 'Play 2 hands vs the dealer' }).click();

  await expect(page.getByRole('region', { name: 'Showdown vs dealer' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to counting' }).click();

  // Back on the count feedback, with the graded rep still counted.
  await expect(page.getByRole('region', { name: 'Showdown vs dealer' })).toBeHidden();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
});
```

### Diagnosis: not a lost click, not a teardown race, not a defect in `src/`

The cause is in the test, and the evidence is the page itself at the moment the assertion expires.
Playwright writes an accessibility snapshot next to every failure; **all six** failures in the
200-repeat run below produced byte-identical snapshots:

<!-- Fenced without a language tag on purpose: prettier reformats embedded YAML
     (singleQuote), and this block is quoted as the tool emitted it. -->

```
- region "Showdown vs dealer":
  - heading "Play 2 hands vs the dealer" [level=2]
  - paragraph: 6 cards came out at this table. Take the count with you.
  - text: What is the running count?
  - spinbutton "What is the running count?"
  - button "Submit [Enter]" [disabled]
```

That is the **count check** (`showdown.component.ts:197`, `phase() === 'count-check'`), which lives
inside the same `<section aria-label="Showdown vs dealer">`. So the click was not lost - it landed and
did exactly what the component says it does:

```ts
// src/app/features/card-counting/showdown.component.ts:1319-1326
protected returnToCounting(): void {
  if (this.countCheck() && this.dealt.length > 0 && this.phase() !== 'player-turn') {
    this.countVerdict.set(null);
    this.phase.set('count-check');
    return;
  }
  this.leaveTable();
}
```

Leaving **mid-hand** (`player-turn`) closes the table directly. Leaving **after the round is over**
asks for the count first, and the region stays up until that is answered - by design, and asserted by
two other specs in the same file (`leaving the table asks what its cards did to the count`, and
`the count check can be turned off in Settings`).

The opening deal reaches `resolved` without any player action whenever it settles every box at once,
which `dealHand()` → `peekAndContinue()` (`showdown.component.ts:952-1000`) does in two cases: a
dealer natural, or a natural in every box. The test did not pin the shoe, so it was asserting the
mid-hand exit against a round that was sometimes already over.

**No defect in `src/`.** The component does what its code, its comments and its other specs say. The
test asserted a phase it had not pinned.

### Defect present, deterministically

Mutation: `runCountingRound(page)` → `runCountingRound(page, 35)` in that test and nothing else.
Seed 35 was found by the probe below; it deals a natural to **both** boxes (dealer 13), so the round
is over before any decision.

```console
$ E2E_SERVER=dist npx playwright test \
    --grep "returning to counting keeps the drill going" --repeat-each=10
EXIT=1
  10 failed
```

Ten of ten, where the same test unseeded fails about one time in thirty-three. The failure text is
M2's, verbatim:

```
Error: expect(locator).toBeHidden() failed
Locator:  getByRole('region', { name: 'Showdown vs dealer' })
Expected: hidden
Received: visible
Timeout:  5000ms
```

### The mechanism, measured across 60 shoes

A probe (`scratchpad/seed-probe.mjs`, not committed - it drives its own `serve-dist` on port 4300 so
it cannot disturb the suite's port) walks the test's exact steps at seeds 0-59 and records two things
independently: whether the opening deal left a player turn, and whether the region hid within the
assertion's own 5000 ms.

```console
$ node seed-probe.mjs 0 59
seed   0  playerTurn=Y  dealAnother=n  verdicts=0  => hidden=YES  countCheckPanels=0
...
seed  35  playerTurn=n  dealAnother=Y  verdicts=2  => hidden=NO   countCheckPanels=1
...
seed  56  playerTurn=n  dealAnother=Y  verdicts=2  => hidden=NO   countCheckPanels=1
...
--- summary ---
seeds walked: 60
region did NOT hide: 2 (35, 56)
of those, opening deal left no player turn: 2
of those, count-check panel is what stayed on screen: 2
seeds with no player turn at all: 2 (35, 56)
```

The correlation is exact in both directions over 60 shoes: **the region fails to hide if and only if
the opening deal left no player turn**, and in every such case the count-check panel is what is on
screen. The two failing seeds are the two different ways a round can end before a decision:

```console
$ node seed-probe.mjs 35 35
    dealer:  Dealer (13)
    verdicts:  Blackjack! You win (pays 3:2).  |  Blackjack! You win (pays 3:2).

$ node seed-probe.mjs 56 56
    dealer:  Dealer (21)
    verdicts:  Dealer blackjack — dealer wins.  |  Dealer blackjack — dealer wins.
```

### Before-rate

Two instruments, because the brief's ten full-suite runs turned out not to be able to measure this.

| instrument                                      | tree state           | failures    | rate                   |
| ----------------------------------------------- | -------------------- | ----------- | ---------------------- |
| `E2E_SERVER=dist npm run e2e` x10 (whole suite) | `d413a7b`, unpatched | **0 / 10**  | 0% observed            |
| the one test, `--repeat-each=200`               | `d413a7b`, unpatched | **6 / 200** | **3.0%** per execution |

The full-suite instrument came back 0 of 10 - see `reviews/BASELINE-round3.md`. That is not evidence
the test is sound: the suite runs this test exactly once per run, so ten runs is ten observations of a
3% event, and `0.97^10 = 0.74`. Round 2's 2-of-7 and this run's 0-of-10 are the same rate seen twice
through too small a window. The per-execution measurement is the one the fix is judged against:

```console
$ E2E_SERVER=dist npx playwright test \
    --grep "returning to counting keeps the drill going" --repeat-each=200
  6 failed
  194 passed (1.6m)
```

6/200 = 3.0%, exact (Clopper-Pearson) 95% CI [1.1%, 6.4%]. The theoretical rate for "a two-box opening deal settles every box"
is about 5%; the measured 3% is inside the interval and the difference is not load-bearing for
anything here.

### Fix

```diff
+  // The exit this test names is the one taken mid-hand, which is the only phase
+  // that leaves the table directly: once a round is over the same button opens
+  // the count check first and the region stays up by design (the walk-away spec
+  // below covers that path). So the shoe is pinned to a guaranteed player turn —
+  // seed 1 opens Q+8, 9+A vs dealer 3+8. Unseeded, this test asserted a phase it
+  // had not pinned: an opening deal that settles every box before any player
+  // action — a dealer natural (seed 56), or a natural in every box (seed 35) —
+  // ends the round, and the assertion below then times out on a count check that
+  // is working correctly. Measured at 2 of 60 seeds and 6 of 200 unseeded runs.
   test('returning to counting keeps the drill going', async ({ page }) => {
     await configure(page, '2');
-    await runCountingRound(page);
+    await runCountingRound(page, 1);
```

This is the fix the brief allows and not one it rejects: no timeout was raised, no retry added, no
`waitForTimeout`, nothing quarantined. The assertion is unchanged. What changed is that the test now
creates the state it asserts, using the same `?seed=` pin that four other specs in this file already
use for exactly this hazard - `boxes are played in order` (line 44) carries a comment saying an
unseeded shoe "can legitimately deal a dealer blackjack and resolve both boxes before any player
action, which would make this action-order test probabilistic". That is this defect, written down in
the same file, one test above the one that had it.

### Defect absent - after-rate

Measured twice: once with only the M2 fix in the tree, and again at the commit that ships it, after
M4's fix had also changed `e2e/fixtures/flows.ts` underneath it. Both are reported, because the second
measurement is the one that is valid at the shipping commit and the first would otherwise be a
transcript invalidated by a later change in the same stage - round 2's R2-3.

| instrument                                      | tree state               | failures    |
| ----------------------------------------------- | ------------------------ | ----------- |
| the one test, `--repeat-each=200`               | M2 fix only              | **0 / 200** |
| `E2E_SERVER=dist npm run e2e` x30 (whole suite) | M2 fix only              | **0 / 30**  |
| the one test, `--repeat-each=200`               | M2 + M4, shipping commit | **0 / 200** |
| `E2E_SERVER=dist npm run e2e` x30 (whole suite) | M2 + M4, shipping commit | **0 / 30**  |

```console
$ E2E_SERVER=dist npx playwright test \
    --grep "returning to counting keeps the drill going" --repeat-each=200
  200 passed (2.2m)          # M2 fix only

$ E2E_SERVER=dist npx playwright test \
    --grep "returning to counting keeps the drill going" --repeat-each=200
  200 passed (1.4m)          # shipping commit, M2 + M4
```

The first block of 30 full-suite runs was **29 green and 1 red**, and the red one is not this test:
run 26 reported `110 passed`, exit 1, on `no hand is offered off a shoe past its cut card`. That is a
second, unrelated intermittent, measured and fixed as **M4** below. This test itself passed in all 30.

**The arithmetic.** 400 + 30 = 430 executions of the M2 test after the fix, 0 failures. At the
measured before-rate of 3.0%, the chance of that is `0.97^430 = 2.0e-6`. At the low end of the
before-rate's exact confidence interval (1.1%) it is `0.989^430 = 8.6e-3`, about 1 in 116.

The rates are the weaker half of the argument. The stronger half: the test no longer has a random
input. The failure needed an opening deal that settles every box, and the shoe is now pinned to one
that cannot - seed 1 deals Q+8 and 9+A against a dealer 3+8, and the probe confirms `playerTurn=Y`.
The failure mode is not unlikely now, it is unreachable.

### Non-vacuity: what a broken exit path still costs

Reverting the fix turns nothing red (that is the point of it), so the proof is the other direction:
mutate **the behaviour the test guards** and show the fixed test still catches it.

Mutation, and nothing else - `src/app/features/card-counting/showdown.component.ts:1320`, dropping the
guard that makes a mid-hand exit leave directly:

```diff
-    if (this.countCheck() && this.dealt.length > 0 && this.phase() !== 'player-turn') {
+    if (this.countCheck() && this.dealt.length > 0) {
```

```console
$ E2E_SERVER=dist npx playwright test \
    --grep "returning to counting keeps the drill going" --repeat-each=5
MUTANT_EXIT=1
  5 failed
    Error: expect(locator).toBeHidden() failed
    Locator:  getByRole('region', { name: 'Showdown vs dealer' })
    Expected: hidden
    Received: visible
```

Five of five. The mutation was reverted with `cp` from a copy taken before it, and
`git diff --stat src/` prints nothing at the committed tree.

### Re-triage

**P1 → P1, unchanged, but for a different reason than round 2 gave.** Round 2 rated it P1 as "a
release gate that is red roughly one run in four". The rate is 3% per execution, not 25% per run, and
the gate is not wrong about the app - the app is fine. It stays P1 because of what it does to
everything else: a gate that fails for a reason unrelated to what it tests trains its readers to
re-run it, and item 2 of this round puts this exact suite in front of the Pages deploy, where a
3%-per-execution flake becomes a deploy that fails for no reason about one time in thirty-three.

### What this does not fix

Five other specs in this file still call `runCountingRound(page)` unseeded (lines 13, 28, 92, 124 and
189 after this change). Each was read against this mechanism and none asserts a phase-dependent
transition: lines 13 and 28 assert regions and headings that an already-resolved round still renders;
92 and 124 run the betting flow, whose `standEveryBox` helper exits on the round's own terminal
control and whose coach line is rendered by `@if (lastPlay())` inside the template branch that covers
`player-turn` **and** `resolved` alike (`showdown.component.ts:386`), so settling early does not
remove it; 189 is pinned by Settings rather than by the shoe. That is an argument from reading, not a
measurement, and it is recorded as such - the 30 full-suite runs above are the measurement that
covers them, at one observation each.

## M4 - a second, different intermittent in the same gate, found by measuring M2

**Severity: P2. New this round**, discovered by this run's own after-measurement rather than by a
reviewer. It is not a regression from this run: nothing in this round touches the failing test, its
helper, or the drill it walks, and the failure is a property of the budget that was already there.

### How it surfaced

The 30 full-suite runs taken as M2's after-evidence were **not** 30 green. Run 26:

```console
run25 exit=0   111 passed (36.9s)
run26 exit=1   110 passed (51.0s)
run27 exit=0   111 passed (57.7s)
```

```
✘  95 [chromium] › e2e/smoke/showdown.e2e.ts:183:7 › post-count showdown ›
      no hand is offered off a shoe past its cut card (7.5s)

   Error: expect(locator).toBeVisible() failed
   Locator: getByLabel('How many decks remain?')
   Expected: visible
   Timeout: 5000ms
   Error: element(s) not found
     at fixtures/flows.ts:59
     at runCountingRound (e2e/fixtures/flows.ts:59:26)
     at e2e/smoke/showdown.e2e.ts:189:5
```

Had M2's after-evidence been "run the suite until it is green", this would have been recorded as a
clean 30 for M2 and shipped with a second coin-flip still in the gate.

### Diagnosis: a fixed wait budget for a stream whose length the caller sets

`runCountingRound` (`e2e/fixtures/flows.ts:52`) starts the drill and then waits for the deck-estimate
form. The form does not appear until every card has streamed, and how many cards that is belongs to
the caller's Settings walk, not to the helper: `configureCounting` asks for 3, but
`no hand is offered off a shoe past its cut card` needs a shoe past its cut card, so it asks for 26 -
which at the app's **minimum** 100 ms interval (`counting-settings.component.ts:109`, `min="100"`) is
2.6 s of an assertion budget fixed at Playwright's 5 s default.

That configuration is not reducible: 1 deck at the minimum 0.5 penetration
(`shoe.model.ts:13-14`) puts the cut card out at exactly 26 cards, and 100 ms is the floor the input
enforces. The test is already asking for the cheapest shoe that can be spent.

Measured, rather than argued. `runCountingRound` was temporarily instrumented with
`const t0 = Date.now()` around the wait and a 60 s budget so nothing could fail, and the full suite
was run five times:

```console
$ # e2e/fixtures/flows.ts, temporarily:
$ #   const t0 = Date.now();
$ #   await expect(estimate).toBeVisible({ timeout: 60_000 });
$ #   console.log(`ESTIMATE_WAIT_MS ${Date.now() - t0}`);
$ for i in 1 2 3 4 5; do E2E_SERVER=dist npm run e2e > timing-run$i.txt 2>&1; done
$ grep -h ESTIMATE_WAIT_MS timing-run*.txt | awk '{print $2}' | sort -n | awk '$1>1500'
2802 2805 2805 2809 3080
$ grep -h ESTIMATE_WAIT_MS timing-run*.txt | awk '{print $2}' | sort -n \
    | awk '{a[NR]=$1} END {print "n="NR, "min="a[1], "median="a[int(NR/2)], "max="a[NR]}'
n=130 min=276 median=793 max=3080
```

130 waits across five full-suite runs. The 26-card caller is the tail: 2802-3080 ms, against a 5000 ms
budget - a margin of **1.8x**, where every other caller sits at 276-800 ms with a margin of 6x or
better. One run in 30 spent the whole budget.

Two things this measurement settles, both of which a reviewer should check rather than take:

- It is **not** a hang or a stuck state. The form arrives; it arrives late.
- The instrument was removed before anything was committed. `git diff --stat e2e/fixtures/flows.ts`
  against the pre-instrument copy printed nothing.

**Honest caveat about the load.** During those first 30 full-suite runs this session was also running
other commands on the same machine (`tsc`, `prettier`, `codesign`, `npm view`). That extra load is
part of why run 26 crossed the line, and it is exactly the condition a CI runner is in. The margin
is thin on its own terms - a 2-core GitHub runner is slower than this machine at rest - and item 2 of
this round puts this suite in front of the deploy.

### Defect present, deterministically

The mechanism is "the stream outruns a fixed budget", so it is induced by making the stream longer
using only settings the product already offers. Mutation, and nothing else, in that one test:

```diff
   await page.getByLabel('Number of cards').fill('26');
+  await page.getByLabel('Time between cards (ms)').fill('200');
   await runCountingRound(page);
```

26 cards at 200 ms is a 5.2 s stream against the same fixed 5 s budget, with the helper **unpatched**:

```console
$ E2E_SERVER=dist npx playwright test \
    --grep "no hand is offered off a shoe past its cut card" --repeat-each=5
PRESENT_EXIT=1
  5 failed
    Error: expect(locator).toBeVisible() failed
    Locator: getByLabel('How many decks remain?')
    Expected: visible
    Timeout: 5000ms
```

Five of five, and the failure is the same locator, the same message and the same line as run 26's.

### Fix

```diff
-export async function runCountingRound(page: Page, seed?: number): Promise<void> {
+export async function runCountingRound(page: Page, seed?: number, cards = 3): Promise<void> {
...
-  await expect(estimate).toBeVisible();
+  await expect(estimate).toBeVisible({ timeout: 5_000 + cards * 100 });
```

and, at the one caller that streams more than the default:

```diff
   await page.getByLabel('Number of cards').fill('26');
-  await runCountingRound(page);
+  await runCountingRound(page, undefined, 26);
```

**Why this is not the move M2's brief rejects.** The brief rejects raising a timeout, and it is right
to: M2's region was never going to hide, so any budget would have failed. Here the opposite holds -
the form is not racing anything, it arrives on a schedule the test itself set in Settings, and the
5 s default is simply ignorant of that schedule. The budget is now that schedule plus the same 5 s
every other wait in the suite gets. A wait that is under-specified for its own configuration is a
test defect in its own right: on a machine 1.8x slower than this one it fails **every** time, not
intermittently.

`grep -rn "Number of cards" e2e/` confirms this is the only caller that streams more than 3: every
other one takes the default, whose budget moves from 5000 ms to 5300 ms.

### Defect absent

Same 5.2 s stream, patched helper, caller passing its own card count:

```console
$ E2E_SERVER=dist npx playwright test \
    --grep "no hand is offered off a shoe past its cut card" --repeat-each=5
ABSENT_EXIT=0
  5 passed (11.4s)
```

The temporary 200 ms mutation was then removed; the committed test streams at the 100 ms the
configure helper sets, with a 7600 ms budget against a measured 2.80-3.08 s - a margin of 2.5x
instead of 1.8x, and one that grows with whatever the caller asks for rather than staying fixed.

### Non-vacuity

The fix widens a budget, so reverting it turns nothing red on this machine - that is what made the
defect invisible for two rounds. The proof is the pair above: with the budget fixed at 5 s the test
fails 5 of 5 against a stream it was configured to produce, and with the budget scaled it passes 5 of
5 against the same stream. The property the gate now has, and did not have, is that a slower machine
does not turn a deterministic wait into a failure.

## Gate 5 at the end of stage 1

Thirty consecutive full-suite runs at the commit that ships M2 and M4, with nothing else running on
the machine:

```console
$ for i in $(seq 1 30); do E2E_SERVER=dist npm run e2e > run$i.txt 2>&1; echo "run$i exit=$?"; done
run1 exit=0   111 passed (42.8s)     run16 exit=0   111 passed (40.8s)
run2 exit=0   111 passed (38.8s)     run17 exit=0   111 passed (37.0s)
run3 exit=0   111 passed (34.4s)     run18 exit=0   111 passed (34.8s)
run4 exit=0   111 passed (36.6s)     run19 exit=0   111 passed (44.4s)
run5 exit=0   111 passed (53.7s)     run20 exit=0   111 passed (53.5s)
run6 exit=0   111 passed (43.8s)     run21 exit=0   111 passed (31.0s)
run7 exit=0   111 passed (50.3s)     run22 exit=0   111 passed (44.5s)
run8 exit=0   111 passed (40.7s)     run23 exit=0   111 passed (30.2s)
run9 exit=0   111 passed (1.4m)      run24 exit=0   111 passed (37.2s)
run10 exit=0   111 passed (37.8s)    run25 exit=0   111 passed (39.5s)
run11 exit=0   111 passed (1.0m)     run26 exit=0   111 passed (38.1s)
run12 exit=0   111 passed (50.6s)    run27 exit=0   111 passed (39.0s)
run13 exit=0   111 passed (44.9s)    run28 exit=0   111 passed (41.3s)
run14 exit=0   111 passed (38.4s)    run29 exit=0   111 passed (49.8s)
run15 exit=0   111 passed (40.1s)    run30 exit=0   111 passed (39.7s)
```

(Two columns for width; the loop ran them in order.) 30 of 30, `111 passed` every time, zero skipped.

**What this does and does not establish.** It is one observation per run of each of the 111 tests, so
it is strong evidence about the suite as a whole and weak evidence about any single test - which is
the same limitation that made round 2's and this run's earlier full-suite numbers unable to see M2.
The per-test evidence is the `--repeat-each` measurements recorded against M2 and M4. Gate 5 was red
1 run in 30 before this stage (M4) and 1 run in 33 before that (M2, per-execution 3.0%); it is now
0 in 30 with both mechanisms removed rather than made less likely.
