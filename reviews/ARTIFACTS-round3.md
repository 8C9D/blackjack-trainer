# ARTIFACTS - round 3

Evidence for every round-3 finding: the defect present, then absent, produced by running the thing.
Baseline for every "green" claim here: [`reviews/BASELINE-round3.md`](reviews/BASELINE-round3.md).

Every transcript names the exact tree state it was taken at, because round 2 shipped three that did
not hold at the commit carrying them. Where a proof was invalidated by a later stage it is re-derived
and the superseded version is kept and marked, not deleted.

All commands ran with the tool sandbox disabled.

## M2 - the E2E gate fails on one test, and it is the test that is wrong

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

Ten of ten, where the same test unseeded fails about one time in eighteen. The failure text is
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

| instrument                                      | tree state              | failures     | rate                   |
| ----------------------------------------------- | ----------------------- | ------------ | ---------------------- |
| `E2E_SERVER=dist npm run e2e` x10 (whole suite) | `d413a7b`, unpatched    | **0 / 10**   | 0% observed            |
| the one test, `--repeat-each=200`               | `d413a7b`, unpatched    | **6 / 200**  | 3.0% per execution     |
| the one test, `--repeat-each=200`, independent  | `406a32e`, fix reverted | **14 / 200** | 7.0% per execution     |
| the one test, `--repeat-each=200`, independent  | `d502bfb`, fix reverted | **13 / 200** | 6.5% per execution     |
| **pooled**                                      | all three samples       | **33 / 600** | **5.5%** per execution |

The full-suite instrument came back 0 of 10 - see `reviews/BASELINE-round3.md`. That is not evidence
the test is sound: the suite runs this test exactly once per run, so ten runs is ten observations of a
5.5% event, and `0.945^10 = 0.57`. Round 2's 2-of-7 and this run's 0-of-10 are the same rate seen twice
through too small a window. The per-execution measurement is the one the fix is judged against:

```console
$ E2E_SERVER=dist npx playwright test \
    --grep "returning to counting keeps the drill going" --repeat-each=200
  6 failed
  194 passed (1.6m)
```

**This section's first published figure was 3.0%, from the first sample alone, and it did not
reproduce.** REVIEW-round3-stage1 (F1) reverted exactly the one argument this fix adds and re-ran the
same instrument, getting 14 of 200 - 7.0%. Both are samples of one rate, so they are pooled rather
than one being preferred:

| sample                    | failures | rate  | exact (Clopper-Pearson) 95% CI |
| ------------------------- | -------- | ----- | ------------------------------ |
| this run                  | 6 / 200  | 3.00% | [1.11%, 6.42%]                 |
| REVIEW-round3-stage1 (F1) | 14 / 200 | 7.00% | [3.88%, 11.47%]                |
| REVIEW-round3-stage2      | 13 / 200 | 6.50% | [3.51%, 10.86%]                |
| **pooled**                | 33 / 600 | 5.50% | **[3.82%, 7.64%]**             |

Neither point estimate lies inside the other's interval, which two 200-trial samples of a ~5% event
do about one time in nine (enumerated exactly over all pairs of `Binomial(200, 0.05)` outcomes by
REVIEW-round3-stage2, F6, which corrected this line's original "one time in twenty"); the pooled figure is where they meet, and it lands on the
independently derived theoretical rate for "a two-box opening deal settles every box" (a dealer
natural at about 4.8%, plus a natural in every box). The rate used everywhere in this round is
therefore **5.5%, about one run in eighteen** (`1 / 0.055 = 18.2`) - every sample is kept in the table above as the sample
it was, not deleted. (The third row arrived with REVIEW-round3-stage2, which reverted the fix and
measured again; the pooled figure moved from 5.0% to 5.5% and its interval tightened.)

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
+  // is working correctly. Measured at 2 of 60 seeds, and at 33 of 600 unseeded
+  // runs across three independent samples (6/200, 14/200, 13/200).
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

**The arithmetic.** The four instruments in the table are 200 + 30 + 200 + 30 = **460** executions of
the M2 test after the fix, 0 failures. (An earlier version of this line said 430, silently dropping
one of the two 30-run blocks - REVIEW-round3-stage1, F3.) At the pooled before-rate of 5.5% the
chance of 460 consecutive passes is `0.945^460 = 5.0e-12`; at the low end of the pooled interval
(3.82%) it is `0.9618^460 = 1.7e-8`, about 1 in 60 million. Neither reviewer's own repeats at the
shipping commit (50 and 12 full-suite runs) are counted in that 460.

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
release gate that is red roughly one run in four". The rate is 5.5% per execution, not 25% per run, and
the gate is not wrong about the app - the app is fine. It stays P1 because of what it does to
everything else: a gate that fails for a reason unrelated to what it tests trains its readers to
re-run it, and item 2 of this round is about to put this exact suite in front of the Pages deploy,
where a 5.5%-per-execution flake would become a deploy that fails for no reason about one run in
eighteen. That last sentence is a statement about what item 2 does once it lands, not about this
commit: at the commit this section ships with, `pages.yml` still consults nothing, and whether a
failing step blocks the deploy is a property of GitHub's runner that this run cannot execute
(ROUND 3 ASSUMPTION 2, and REVIEW-round3-stage1 F5, which caught the original present tense).

### What this does not fix

Five other specs in this file still call `runCountingRound(page)` unseeded (lines 13, 28, 92, 124 and
191 after this change - the last of them now passing its own card count). Each was read against
this mechanism and none asserts a phase-dependent
transition: lines 13 and 28 assert regions and headings that an already-resolved round still renders;
92 and 124 run the betting flow, whose `standEveryBox` helper exits on the round's own terminal
control and whose coach line is rendered by `@if (lastPlay())` inside the template branch that covers
`player-turn` **and** `resolved` alike (`showdown.component.ts:386`), so settling early does not
remove it; 191 is pinned by Settings rather than by the shoe. That is an argument from reading, not a
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
budget - a margin of **1.6-1.9x**, where every other caller sits at 276-800 ms with a margin of 6x or
better. One run in 30 spent the whole budget. (The band is 2.68-3.08 s once
REVIEW-round3-stage1's independent instrumented runs are pooled in: it reproduced the structure
exactly - 26 deck-estimate waits per full-suite run - and the 26-card caller at 2678-2920 ms, below
the floor this section first published. The band is what two machines-worth of runs measured, not a
property of the code.)

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
test defect in its own right: a machine more than about **1.9x** slower than this one fails **every**
time, not intermittently - the threshold is `5000 / 2678`, the budget over the fastest stream ever
measured, because "every time" has to hold at the quick end of the band. The same sentence bounds the
fix and is stated here rather than left for a reader to derive: with the fix the threshold is
`7600 / 2678`, so a machine more than about **2.8x** slower fails every time. This raises the ceiling;
it does not remove it. (Both figures were first published against the wrong end of the band - 1.8x and
"2.5x fails every time" - and corrected after REVIEW-round3-stage2, F2 and F5.)

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
configure helper sets, with a 7600 ms budget against a measured 2.68-3.08 s - a margin of 2.5-2.8x
where it was 1.6-1.9x, and one that grows with whatever the caller asks for rather than staying
fixed. Both pairs are quoted against the same ends of the same band: `5000/3080 = 1.62`,
`5000/2678 = 1.87`, `7600/3080 = 2.47`, `7600/2678 = 2.84`. Earlier versions did not do that twice -
first comparing 5000/2802 with 7600/3080 (REVIEW-round3-stage1, F6), then rounding one end down and
the other up (REVIEW-round3-stage2, F5).

### Non-vacuity

The fix widens a budget, so reverting it turns nothing red on this machine - that is what made the
defect invisible for two rounds. The proof is the pair above: with the budget fixed at 5 s the test
fails 5 of 5 against a stream it was configured to produce, and with the budget scaled it passes 5 of
5 against the same stream. The property the gate now has, and did not have, is that the budget is a
function of what the caller streams rather than a constant that is wrong for anything but the
default.

**What this fix does not establish, stated because the closing summary first overclaimed it.** Run
26's wait exceeded 5000 ms; how far it exceeded it was never measured, because the assertion that
would have measured it is the one that failed. The largest wait ever recorded for this caller is
3080 ms, across 8 instrumented full-suite runs on two occasions. So nothing here proves run 26's tail
lands under 7600 ms rather than over it - only that the tolerance moved from 1.6-1.9x the measured
stream to 2.5-2.8x. A readiness signal from the app would remove the ceiling instead of raising it;
none exists, and adding one would be a product change this round's scope rule forbids. Recorded as a
bounded improvement, not a removal (REVIEW-round3-stage1, F2).

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
1 run in 30 before this stage (M4) and about 1 run in 18 before that (M2, per-execution 5.5% pooled); it is now
0 in 30. The two fixes are not the same kind of fix, and the distinction matters: M2's random input
is **removed** - the shoe is pinned and the failing state is unreachable - while M4's is
**rescaled**, from a fixed budget to one that follows the caller's own stream. An earlier version of
this paragraph called both of them removals (REVIEW-round3-stage1, F2).

## N1 - a red CI does not stop the deploy, and now it is asked to

**Severity: P1** (round 2 re-triaged P2 → P1; re-derived from scratch below and left at P1).

### Defect present, at the parent commit

```console
$ git show 772e4a7:.github/workflows/pages.yml | grep -n "on:\|branches\|run:\|needs:\|uses:"
12:on:
14:    branches: [main]
29:    runs-on: ubuntu-latest
31:      - uses: actions/checkout@v5
32:      - uses: actions/setup-node@v5
34:          node-version: 22
36:      - run: npm ci
37:      - run: npm run build -- --base-href /blackjack-trainer/
39:        run: |
44:      - uses: actions/upload-pages-artifact@v4
49:    needs: build
50:    runs-on: ubuntu-latest
56:        uses: actions/deploy-pages@v4
```

Two shell steps before the artifact upload, neither of them a gate, and no reference to `ci.yml`,
which fires independently on the same event. Lint, unit tests, coverage, the parity anti-drift gate
and E2E therefore do not guard the deploy: any failure that is not a build failure publishes.

### Applied, not re-filed

The patch recorded at `reviews/ARTIFACTS-round2.md` under N1 was applied verbatim into the `build`
job of `.github/workflows/pages.yml`, at the six-space indentation that file's `steps:` list needs.
The job now runs, in order: `npm ci`, `npm run lint`, `CI=true npm run test:coverage`, the anti-drift
gate, `npx playwright install --with-deps chromium`, `npm run build`, `npm run e2e` with
`E2E_SERVER: dist`, and only then the base-href build it actually publishes.

Both files parse. Checked with a real YAML parser rather than by eye, and the `env:` block is
attached to the step it is written under rather than to the job:

```console
$ ruby -ryaml -e 'd = YAML.load_file(".github/workflows/pages.yml")
  d["jobs"]["build"]["steps"].each_with_index { |s, i| puts "#{i+1}. #{(s["name"] || s["run"] || s["uses"]).to_s.lines.first.strip}"; puts "     env: #{s["env"].inspect}" if s["env"] }
  puts "deploy needs: #{d["jobs"]["deploy"]["needs"].inspect}"'
1. actions/checkout@v5
2. actions/setup-node@v5
3. npm ci
4. npm run lint
5. CI=true npm run test:coverage
6. Verify parity fixtures are up to date (anti-drift gate)
7. npx playwright install --with-deps chromium
8. npm run build
9. npm run e2e
     env: {"E2E_SERVER" => "dist"}
10. npm run build -- --base-href /blackjack-trainer/
11. Assemble the site (app + legal pages + SPA fallback)
12. actions/upload-pages-artifact@v4
deploy needs: "build"
```

### Every shell step run locally, verbatim from the YAML

Not transcribed by hand: a runner reads the workflow with a YAML parser, writes each step's `run:`
script to a file, and executes it with `bash -e`, which is the documented default shell for `run:` on
`ubuntu-latest`, with the step's own `env` merged. `CI=true` was exported for the whole job, as
GitHub does.

```console
$ CI=true ruby run-workflow-steps.rb .github/workflows/pages.yml build out/ "npm ci" "playwright install"
=== summary ===
 1  not-a-run-step               actions/checkout@v5
 2  not-a-run-step               actions/setup-node@v5
 3  SKIPPED (non-local resource) npm ci
 4  PASS                         npm run lint
 5  PASS                         CI=true npm run test:coverage
 6  PASS                         Verify parity fixtures are up to date (anti-drift gate)
 7  SKIPPED (non-local resource) npx playwright install --with-deps chromium
 8  PASS                         npm run build
 9  FAIL(1)                      npm run e2e
10  PASS                         npm run build -- --base-href /blackjack-trainer/
11  PASS                         Assemble the site (app + legal pages + SPA fallback)
12  not-a-run-step               actions/upload-pages-artifact@v4
failed steps: 1
```

**Step 9's failure in that run is not a result and is recorded so nobody reads it as one.** It is
`net::ERR_CONNECTION_REFUSED at http://127.0.0.1:4200/` from test 85 onward - the web server
disappeared mid-run. The stage-1 reviewer was working in the same checkout at the time and reports
killing a `serve-dist` on port 4200 that it took for its own orphan; it was this run's live server.
Re-run alone, with nothing else on the machine:

```console
$ echo "load before: $(uptime | sed 's/.*load averages: //')"
load before: 9.22 44.20 97.85
$ CI=true E2E_SERVER=dist bash -e out/step09.sh   # out/step09.sh is one line: npm run e2e
Running 111 tests using 1 worker
  111 passed (2.7m)
STEP9_EXIT=0
```

(Those were two commands in one shell invocation; an earlier version of this block showed the load
line inside the step's own output, which the one-line script cannot print - REVIEW-round3-stage2, F7.
The reviewer re-ran the same extracted script independently and got `111 passed (2.8m)`, 1 worker.
`run-workflow-steps.rb` is a scratch script, not committed: it is quoted in full above, and the
property that matters - that what ran is the YAML's own `run:` text - is checkable by extracting the
steps with any YAML parser, which is what the reviewer did.)

`workers: 1` and `retries: 1` are what `playwright.config.ts:18-19` select under `CI`, so that run is
the shape the deploy job will use, not the local parallel one. **Operational fact for anyone running
these gates: two E2E runs cannot share this machine.** Both lanes bind `127.0.0.1:4200`, and the dist
lane refuses to reuse a port it did not start, so a concurrent run does not queue - it corrupts
whichever run loses the port.

Two steps could not be run and are named rather than glossed:

- **`npm ci`** needs the npm registry, a non-local resource this run may not contact.
- **`npx playwright install --with-deps chromium`** needs the network and `sudo` for OS packages.
  What it would do here, without contacting anything:

```console
$ npx playwright install --dry-run chromium
Chrome for Testing 151.0.7922.34 (playwright chromium v1234)
  Install location:    /Users/arthurzhang/Library/Caches/ms-playwright/chromium-1234
  Download url:        https://cdn.playwright.dev/builds/cft/151.0.7922.34/mac-arm64/chrome-mac-arm64.zip

FFmpeg (playwright ffmpeg v1011)
  Install location:    /Users/arthurzhang/Library/Caches/ms-playwright/ffmpeg-1011
  ...
Chrome Headless Shell 151.0.7922.34 (playwright chromium-headless-shell v1234)
  Install location:    /Users/arthurzhang/Library/Caches/ms-playwright/chromium_headless_shell-1234
DRYRUN_EXIT=0
```

(That is this machine's cache layout, not the runner's - `--with-deps` additionally installs OS
packages through `sudo apt-get`, which is the part that cannot run here at all.)

### Non-vacuity: the deploy job now refuses what it used to publish

Reverting the patch turns nothing red - no gate asserts a gate's own preconditions - so the proof is
to break **the thing the new steps guard** and show the step that now stands in front of the deploy
exits non-zero. Target: the parity anti-drift gate, because it is the one that protects the claim
this app exists to make (that its charts match the iOS app's).

Mutation, and nothing else - `tools/export-parity-fixtures.ts:174`, exporting 5 of the 58 counting
systems:

```diff
-  const systems = COUNTING_SYSTEMS.map((s) => ({
+  const systems = COUNTING_SYSTEMS.slice(0, 5).map((s) => ({
```

```console
$ bash -e out/step06.sh       # the anti-drift step, verbatim from pages.yml
Wrote 7 parity fixtures to .../ios/Fixtures
diff --git a/ios/Fixtures/counting-systems.json b/ios/Fixtures/counting-systems.json
-  "description": "All 58 counting systems with per-rank and per-color values.",
-  "count": 58,
+  "description": "All 5 counting systems with per-rank and per-color values.",
+  "count": 5,
STEP6_EXIT_DEGRADED=1

$ # exporter restored, ios/Fixtures restored with git checkout
$ bash -e out/step06.sh
STEP6_EXIT_RESTORED=0
```

Exit 1 from a step in the `build` job, where before this patch there was no such step at all: the
same mutation pushed to `main` would have deployed, because `pages.yml` ran `npm ci` and a build and
nothing else.

### What is UNVERIFIED, precisely

Local execution proves each step runs and that each one exits non-zero when its subject is broken. It
does not prove the deploy is blocked. **These claims cannot be tested from here and are UNVERIFIED:**

1. that a non-zero step actually fails the `build` job (GitHub's documented `run:` semantics, not
   something in this repository);
2. that `deploy`'s `needs: build` prevents `actions/deploy-pages@v4` from running when `build` fails;
3. that the `concurrency: pages` group and `cancel-in-progress: true` behave as intended when a gated
   build takes ~10 minutes longer than the ungated one did;
4. that `npm ci` and `npx playwright install --with-deps chromium` succeed on `ubuntu-latest`;
5. that the two workflows' independent triggers do not race in some way this reading missed.

Every one of those needs GitHub Actions, which this run may not execute. **N1 is therefore not
RESOLVED. It is PATCH-READY**: the patch is applied and every locally-runnable part of it is proven,
and the orchestration - the half that gives the finding its name - is the half no local evidence can
reach. Round 2's whole subject was gates that do not gate what they name, and writing "RESOLVED" on a
YAML parse would be that defect committed by the run that named it.

## N5 - no gate builds the bundle that is actually deployed

**Severity: P1** (round 2's re-triage; re-derived and left at P1: this is what let W1 - an installed
PWA launching at another project's site on the shared `8C9D.github.io` origin - survive round 1's
entire baseline green).

### Defect present, at the parent commit

```console
$ git show 772e4a7:.github/workflows/ci.yml | grep -c "base-href"
0
$ grep -rn "base-href" e2e/ tools/ playwright.config.ts package.json
(no matches)
```

Only `pages.yml:37` builds `--base-href /blackjack-trainer/`, and it deploys it without testing it.

### Applied

The `pages-bundle` job recorded at `reviews/ARTIFACTS-round2.md` under N5 was added to
`.github/workflows/ci.yml`, including round 2's correction of its own broken snippet (the
`require("….webmanifest")` that threw `SyntaxError` because Node routes a non-`.json` extension
through the JavaScript loader). Run verbatim from the YAML:

```console
$ ruby run-workflow-steps.rb .github/workflows/ci.yml pages-bundle out/ "npm ci"
=== summary ===
 1  not-a-run-step               actions/checkout@v5
 2  not-a-run-step               actions/setup-node@v5
 3  SKIPPED (non-local resource) npm ci
 4  PASS                         npm run build -- --base-href /blackjack-trainer/
 5  PASS                         The deployed bundle must be relocatable under a sub-path
failed steps: 0
```

### Non-vacuity: three mutations, one per property the check asserts

Each mutates the deployed bundle - the thing the gate guards - rebuilds it, and runs the check
verbatim.

**A. `start_url` back to the origin root** (this is W1, the defect that shipped):

```diff
-  "start_url": "./",
+  "start_url": "/",
```

```console
$ npm run build -- --base-href /blackjack-trainer/   # exit 0, the bundle builds fine
$ bash -e out/step05.sh
start_url is /
CHECK_EXIT=1
```

**B. an icon with an origin-absolute `src`:**

```diff
-      "src": "icons/icon-192.png",
+      "src": "/icons/icon-192.png",
```

```console
$ bash -e out/step05.sh
icon /icons/icon-192.png
CHECK_EXIT=1
```

**C. the deploy built without its base href** - what would ship if `pages.yml:37` lost the flag:

```console
$ npm run build                                      # no --base-href
$ grep -o '<base href="[^"]*">' dist/blackjack-trainer/browser/index.html
<base href="/">
$ bash -e out/step05.sh
CHECK_EXIT=1

$ npm run build -- --base-href /blackjack-trainer/   # restored
$ bash -e out/step05.sh
CHECK_EXIT=0
```

Three properties, three mutations, three refusals, and a passing restore. `public/manifest.webmanifest`
was restored from a copy taken before the mutations; `git diff --stat public/` prints nothing.

### What is UNVERIFIED

That the `pages-bundle` job runs at all is GitHub's business: it has no `needs:`, so it is a third
independent job in `ci.yml`, and whether a failing `ci.yml` job blocks anything depends on branch
protection this repository's settings may or may not have. **N5 is PATCH-READY, not RESOLVED**, for
the same reason as N1 - and with one more limit worth stating plainly: this is a check **beside** the
deployed bundle, not a suite that exercises it. It asserts the base href and that every manifest URL
is relative. It does not click a single link in the sub-path bundle. Running the E2E suite against a
sub-path mount would mean rewriting every `page.goto('/...')` in the suite, which no finding here
scopes. Recorded as the honest smaller option, as round 2 recorded it.

## M1 - nothing typechecks `e2e/**`, and the config that would could not run

**Severity: P2** (round 2's), re-derived and left there: it is a gate that does not exist rather than
a defect users can reach.

### Defect present

```console
$ npx tsc -p tsconfig.e2e.json --noEmit
error TS2688: Cannot find type definition file for 'node'.
  The file is in the program because:
    Entry point of type library 'node' specified in compilerOptions
TSC_E2E_EXIT=2
$ ls -d node_modules/@types/*        # before the install below; no `node` entry
node_modules/@types/chai
node_modules/@types/deep-eql
node_modules/@types/estree
node_modules/@types/gensync
node_modules/@types/jsesc
```

(Both blocks are from before this stage's install; `ls` cannot reproduce them at the shipping
commit, which is the point of the fix.)

`npm run lint` ran `tsc --noEmit -p tsconfig.app.json` alone, whose `include` is `src/**/*.ts`, so
`e2e/**`, `playwright.config.ts` and `src/**/*.spec.ts` were typechecked by nothing. Playwright and
Vitest both compile with esbuild, which strips types without checking them.

### The dependency was reachable without the network

`@types/node` is in neither dependency list, and this run may not contact the registry. It is,
however, already in the local npm cache, so the install is a local operation:

```console
$ npm view @types/node version --offline
26.1.2
$ npm install --save-dev @types/node --offline --dry-run
add undici-types 8.3.0
add @types/node 26.1.2
added 2 packages in 417ms
```

Run for real, `--offline` throughout, so nothing was fetched:

```console
$ npm install --save-dev @types/node --offline
found 0 vulnerabilities
$ git diff --stat package.json package-lock.json
 package-lock.json | 18 ++++++++++++++++++
 package.json      |  1 +
```

This is the one dependency change in the round, and it is the one the brief's item 3 authorises.

### Fix: the gate now runs all three projects

```diff
-    "typecheck": "tsc --noEmit -p tsconfig.app.json",
+    "typecheck": "tsc --noEmit -p tsconfig.app.json && tsc --noEmit -p tsconfig.spec.json && tsc --noEmit -p tsconfig.e2e.json",
```

and `*.test.ts` moves to the project that has the runner's globals. **This half was published wrong
first**: it claimed `**/*.test.ts` was covered by "no tsconfig", and REVIEW-round3-stage2 (F1) showed
it was already in the app project, whose `include` is `src/**/*.ts` and whose `exclude` was only
`src/**/*.spec.ts`. It was not a gap - it was a file class compiled by the wrong project, one with
`types: []`, so the first real `*.test.ts` would have failed `npm run lint` with
`Cannot find name 'describe'` about a correct file. The corrected patch is two lines, not one:

```diff
# tsconfig.spec.json — typecheck it here, where the vitest globals are declared
-  "include": ["src/**/*.d.ts", "src/**/*.spec.ts"]
+  "include": ["src/**/*.d.ts", "src/**/*.spec.ts", "src/**/*.test.ts"]

# tsconfig.app.json — and stop the app project compiling it under `types: []`
-  "exclude": ["src/**/*.spec.ts"],
+  "exclude": ["src/**/*.spec.ts", "src/**/*.test.ts"],
```

Both projects were green before being wired in, so this widens the gate without moving the goalposts:
`tsc -p tsconfig.spec.json --noEmit` exits 0 at this tree, and `tsc -p tsconfig.e2e.json --noEmit`
exits 0 once `@types/node` exists.

### Non-vacuity: the same mutation, old gate and new

Target: `e2e/fixtures/lane.ts`, which M1 names as "the single source of truth for E2E lane selection
that nothing typechecks".

```diff
-export const SERVES_DIST = requested === 'dist';
+export const SERVES_DIST: number = requested === 'dist';
```

```console
$ npm run lint                       # the widened gate
e2e/fixtures/lane.ts(30,14): error TS2322: Type 'boolean' is not assignable to type 'number'.
LINT_MUTANT_EXIT=2

$ npx tsc --noEmit -p tsconfig.app.json   # what the gate used to be, same mutation
OLD_GATE_EXIT=0
```

And for `*.test.ts`, the proof that matters is not "is it typechecked" - it was - but "is it
typechecked by a project that knows what a unit test looks like". A realistic temporary
`src/app/doorway.test.ts` (deleted immediately after):

```ts
describe('doorway', () => {
  it('is collected by the unit runner', () => {
    expect(1).toBe(1);
  });
});
```

```console
$ npm run lint                       # with both halves of the patch
(no TS errors; the only failure in this run is an unrelated unformatted review file)
$ npx tsc --noEmit -p tsconfig.app.json
APP=0
$ npx tsc --noEmit -p tsconfig.spec.json
SPEC=0
```

Before the `exclude` half, the same file gave `APP_EXIT=2` with three errors
(`Cannot find name 'describe' / 'it' / 'expect'`) - measured by REVIEW-round3-stage2 (F1) and the
reason that half exists. `find src -name '*.test.ts'` returns 0 files today, so nothing in the tree
was broken; what was broken was the first person to use the name.

**Still uncovered, and named rather than implied:** `tools/*.spec.mjs`, the two specs round 2 added,
which the unit runner does execute (2 of the 67 test files) and which no tsconfig typechecks before
or after this change. They are JavaScript on purpose, with round 2's reasoning recorded in them.

### Where this lands in CI, now that CI is editable

Nowhere new, and that is the point: `npm run lint` is already a step in `ci.yml`'s `validate` job,
and N1 has just added it to `pages.yml`'s `build` job. Widening what `typecheck` means propagates to
both without touching either workflow again - which is the shape this round's brief prefers (make an
existing gate fail when the thing it names is broken, rather than add a check beside it).

### Gates after this stage

| gate                | result                                            |
| ------------------- | ------------------------------------------------- |
| 1 lint              | exit 0 - now three tsc projects, not one          |
| 2 build             | exit 0, the inherited budget warning              |
| 3 unit              | exit 0, 67 files / 1547 passed                    |
| 4 coverage          | exit 0, 96.11 / 93.23 / 93.28 / 97.97 - unchanged |
| 5 E2E (`CI=true`)   | exit 0, `111 passed`, 1 worker                    |
| 6 parity anti-drift | exit 0, no drift                                  |

## N4 - the update banner covers the whole drill

**Severity: P2** (round 2's, re-derived and left there: while the banner is up the drill cannot be
played at all at this viewport, but the common state carries a "Later" that dismisses it).

### The state was induced, not injected - and that is the whole method

Round 2 measured this by injecting the shell's markup into a live page, got it wrong twice, published
a "correction" of round 1 that was itself wrong, and had to withdraw it. The failure was that
Angular's emulated encapsulation stamps `_ngcontent-*` on **every** styled element and the probe
stamped only the root, so the banner's children matched none of their rules.

No markup is injected here. A **development** build keeps Angular's global debug API, so the probe
reaches the live `App` component and sets the same signal `AppUpdateService` sets on a
`VERSION_READY` event:

```js
const cmp = window.ng.getComponent(document.querySelector('app-root'));
cmp.updates.updateReady.set(true);
window.ng.applyChanges(cmp);
```

The banner that appears is the component's own template, with the component's own stylesheet, laid
out by Chromium. Only the trigger is simulated. The probe asserts the API is really there
(`typeof window.ng?.getComponent === 'function'`) and refuses to measure anything if it is not, and
it counts `.update` nodes before and after (0 → 1) so a probe that measured nothing could not report
a geometry. It serves its own bundle on its own port, so it cannot disturb the E2E suite.

### Defect present - at `b09470d`, 375x700, `/drill/basic-strategy`

```json
{
  "position": "fixed",
  "flexDirection": "column",
  "bannerRect": { "top": 538.03, "bottom": 684, "height": 145.97 },
  "updateSpaceVar": "",
  "scroll": { "scrollHeight": 700, "clientHeight": 700 },
  "innerHeight": 700
}
```

| control   | top | bottom | intersects banner | centre covered | `elementFromPoint` at its centre |
| --------- | --- | ------ | ----------------- | -------------- | -------------------------------- |
| Hit       | 543 | 597    | yes               | **yes**        | `STRONG` (inside `.update`)      |
| Stand     | 543 | 597    | yes               | **yes**        | `STRONG`                         |
| Double    | 543 | 597    | yes               | **yes**        | `STRONG`                         |
| Split     | 605 | 660    | yes               | **yes**        | `DIV.update__actions`            |
| Surrender | 605 | 660    | yes               | **yes**        | `BUTTON.update__reload`          |
| Insurance | 605 | 660    | yes               | **yes**        | `BUTTON.update__later`           |

`covered centres: 6 of 6`. Round 2's figures reproduce **exactly** - `top: 538.03`, `height: 145.97`,
column layout below the 34rem breakpoint, `scrollHeight === clientHeight === 700` so nothing can be
scrolled out from under it - this time from a banner the app raised rather than one a probe built.

A second instance of the same defect, which no round had recorded, on a screen that **does** scroll.
Settings at maximum scroll, banner up (the last control that belongs to the page, not to the banner):

```console
BEFORE settings@maxscroll: {"maxScrollTop":1289,"scrollTop":1289,
  "lastOwnControl":"Reset practice data","bottom":651,"bannerTop":538.03,
  "centreCoveredByBanner":true}
```

Scrolling to the end does not help: the page ends exactly at the viewport floor, and the banner is
in front of the last 146 px of it.

### Fix

The shell measures what the banner stands in front of and publishes it; the layouts subtract it.

- `src/app/app.ts` - a `viewChild` on the banner, an **`afterRenderEffect`** that re-measures when it
  appears or its content changes (the recovery copy is longer, and a failed reload adds a line), a
  `@HostListener('window:resize')` for the row/column breakpoint, and a host binding
  `[style.--update-space]`. It shipped for one commit as a plain `effect`, which is wrong for the
  content-change half and is corrected below. The measurement is `window.innerHeight - rect.top`: its own height plus
  the gap it floats above, in one read.
- `src/app/app.scss` - `:host { padding-bottom: var(--update-space, 0px) }`, which is what lets a
  **scrolling** screen scroll its last control clear.
- the three viewport-sized screens (`drill-page.scss`, `home-page.component.scss`,
  `card-counting-page.component.scss`) - `min-height: calc(100dvh - var(--update-space, 0px))`, so
  they shrink instead of needing to be scrolled - wherever there is room to shrink into. The
  viewports where there is not are measured and published below.

With no banner the property is `0px` and every computed value is what it was: `calc(100dvh - 0px)` is
`100dvh`, `padding-bottom: 0px` is nothing. That is the ordinary case, i.e. every render but the two
that raise a banner.

### Defect absent - same probe, same viewport, same screen

```json
{
  "position": "fixed",
  "flexDirection": "column",
  "bannerRect": { "top": 538.03, "bottom": 684, "height": 145.97 },
  "updateSpaceVar": "162px",
  "scroll": { "scrollHeight": 700, "clientHeight": 700 }
}
```

| control   | top (was) | bottom (was) | intersects banner | centre covered |
| --------- | --------- | ------------ | ----------------- | -------------- |
| Hit       | 381 (543) | 435 (597)    | no                | **no**         |
| Stand     | 381 (543) | 435 (597)    | no                | **no**         |
| Double    | 381 (543) | 435 (597)    | no                | **no**         |
| Split     | 443 (605) | 498 (660)    | no                | **no**         |
| Surrender | 443 (605) | 498 (660)    | no                | **no**         |
| Insurance | 443 (605) | 498 (660)    | no                | **no**         |

`covered centres: 0 of 6`, and the banner has not moved: it is still at `top: 538.03` with
`height: 145.97`. The drill moved up by exactly the 162 px the shell published. The page still does
not scroll (`700 === 700`), so nothing was traded for it.

The **recovery** state - the one with no "Later", which a trainee cannot dismiss - is taller, and the
reserve follows it rather than being a constant tuned to the offer:

```console
after-drill-recovery: {"updateSpace":"196px","bannerTop":504.03,"bannerHeight":179.97,
  "scrollHeight":700,"clientHeight":700}
```

And the scrolling screen:

```console
AFTER  settings@maxscroll: {"maxScrollTop":1451,"scrollTop":1451,
  "lastOwnControl":"Reset practice data","bottom":489,"bannerTop":538.03,
  "centreCoveredByBanner":false}
```

`maxScrollTop` grew by exactly 162, and the last control clears the banner by 49 px.

### The limit of this fix, found by attacking it rather than by a reviewer

375x700 is the viewport the finding cites, and at that viewport the fix is complete. It is not
complete everywhere, and the difference is worth publishing rather than leaving for someone to trip
over. Same probe, both banner states, `covered` = action controls whose centre `elementFromPoint`
resolves inside `.update`:

| viewport | before: covered | before: scrollable | after: covered at rest | after: scrollable | after: covered at max scroll |
| -------- | --------------- | ------------------ | ---------------------- | ----------------- | ---------------------------- |
| 375x700  | 6 / 6           | 0 px               | **0 / 6**              | 0 px              | 0 / 6                        |
| 1280x800 | 6 / 6           | 0 px               | **0 / 6**              | 0 px              | 0 / 6                        |
| 700x375  | 0 / 6           | already scrolled   | 0 / 6                  | yes               | 0 / 6                        |
| 320x568  | 6 / 6           | **0 px**           | 3 / 6                  | 93 px             | **0 / 6**                    |
| 375x500  | 6 / 6           | **0 px**           | 6 / 6                  | 161 px            | **0 / 6**                    |

The drill's content has a natural minimum of about 499 px (cards, question, two rows of controls). On
a viewport tall enough to hold that plus the banner, subtracting the reserve moves the controls out
from under it and the page still does not scroll - the 375x700 and 1280x800 rows. On a shorter one
the subtraction cannot compress content that is already at its minimum, so the page becomes
scrollable by exactly the reserve instead:

```console
BEFORE 375x500: scrollable=0px    covered@top=6/6  ->  scrolled to 0:   covered=6/6
BEFORE 320x568: scrollable=0px    covered@top=6/6  ->  scrolled to 0:   covered=6/6
AFTER  375x500: scrollable=161px  covered@top=6/6  ->  scrolled to 161: covered=0/6
AFTER  320x568: scrollable=93px   covered@top=3/6  ->  scrolled to 93:  covered=0/6
```

So the honest claim is not "the banner never covers a control". It is: **before, the controls were
unreachable at every scroll position on every viewport that could not already scroll; after, they are
reachable on all of them** - without scrolling where the layout has room, and by scrolling where it
does not. That is the difference between a drill that cannot be played and one that can. A fix that
held the stronger claim at every viewport would have to shrink the drill's own minimum, which is a
redesign of the drill rather than a fix to the banner.

**It still renders correctly.** Screenshots at 375x700 with each banner state up were read, not just
measured: the drill keeps its progress bar, dealer card, hand, the "Hard 10 vs 7" question and all
six action buttons, with the banner below them and nothing clipped or overlapping. The 196 px
recovery reserve is the tightest case and it also holds.

### The measurement was taken at the wrong moment, for one commit

Published first as an `effect`, with the claim that it "re-measures when it appears **or its content
changes**". The appear/disappear half worked; the content half did not, and
REVIEW-round3-stage3 (F2) proved it by driving the real path - a DOM click on the banner's own Reload
button with the injected page reload throwing (`app-update.service.ts:60-69`). When only the copy
changes the element is the same element, so an `effect` runs against the DOM as it was before the
refresh and measures the old height.

Re-measured here, with **no** `applyChanges` anywhere - the app's own scheduler runs change detection,
which is the whole point:

```console
EFFECT offer then a failed reload   after updateFailed    reserve=162px banner={top:517.84,height:166.16}  short by 21px
EFFECT offer then the worker breaks after recoveryNeeded  reserve=162px banner={top:504.03,height:179.97}  short by 34px

FIXED  offer then a failed reload   after updateFailed    reserve=183px banner={top:517.84,height:166.16}  short by 0
FIXED  offer then the worker breaks after recoveryNeeded  reserve=196px banner={top:504.03,height:179.97}  short by 0
```

The fix is the primitive: `effect` → **`afterRenderEffect`**, which runs after the DOM is refreshed
and re-runs on the same signal dependencies.

**This also indicts the earlier measurement, and the artifact says so rather than quietly restating
it.** The published 196 px recovery figure was correct only because the probe called
`window.ng.applyChanges(cmp)`, forcing an extra change-detection pass the running app never performs.
The probe was faithful about markup and stylesheet - the reviewer diffed the compiled `.update` rules
between the dev and production bundles and found them identical modulo trailing semicolons - and
unfaithful about **timing**. That is the failure mode the brief warned about for simulated states,
found in the one place the method could still hide it, and it is why the re-measurement above drives
the signal and then waits rather than forcing a render.

### Non-vacuity

The behavioural half is guarded by four unit tests in `src/app/app.spec.ts` (the geometry is
stubbed because jsdom has no layout engine; what they assert is the wiring). Mutating only the
measurement:

```diff
-    const space = rect.height === 0 ? 0 : window.innerHeight - rect.top;
+    const space = 0; // MUTANT: publish no reserve
```

```console
$ npm test
AssertionError: expected '0px' to be '162px'
AssertionError: expected '0px' to be '162px'
 Test Files  1 failed | 66 passed (67)
```

And dropping the signal dependencies the `afterRenderEffect` re-runs on:

```diff
     afterRenderEffect(() => {
-      this.updates.recoveryNeeded();
-      this.updates.updateFailed();
       this.measureBanner();
     });
```

```console
$ npm test
AssertionError: expected '162px' to be '183px'
 Test Files  1 failed | 66 passed (67)
```

**What the fourth test does not do, stated because it would be easy to assume it does.** It passes
against a plain `effect` as well - measured, by reverting `afterRenderEffect` to `effect` and running
it: `1551 passed`. jsdom has no render timing to distinguish them. So the ordering property that F2
was about is guarded by no local gate at all; the only evidence for it is the browser measurement
above. That is the same gap K3 records for the CSS half.

**What no gate guards, stated rather than implied.** The CSS half - that the three screens subtract
the property and the shell pads by it - is asserted by nothing automatic. jsdom cannot lay out a
`calc()`, and the banner cannot be raised in the E2E suite because the production bundle strips the
debug API and a real `VERSION_READY` needs a second deployed build. The evidence that the layout
changes is the browser measurement above, taken by hand. If someone deletes
`min-height: calc(100dvh - var(--update-space, 0px))` tomorrow, the unit tests stay green.

## N6 - the manifest declares no `id`

**Severity: P3** (round 2's re-triage, unchanged).

**Recorded as a deliberate exception to the no-new-config rule**, which the round's brief allows for
this one key on condition that what it pins is shown. `public/manifest.webmanifest` gains one line:

```diff
+  "id": "./",
   "start_url": "./",
```

What it pins, against the origin this is deployed to:

```console
$ node -e 'const base="https://8c9d.github.io/blackjack-trainer/"; ...'
id      -> https://8c9d.github.io/blackjack-trainer/
start_url -> https://8c9d.github.io/blackjack-trainer/
identical: true
```

The application identity already falls back to `start_url`, so this changes nothing today and pins
what is already true - which is the point: once a copy is installed its identity is fixed, and a
later change to `start_url` would silently orphan it. Round 1 objected that an explicit `id` "would
pin identity to the broken value"; that objection died with W1, which made `start_url` relative.

**The gate added for N5 was extended to cover it in the same commit**, because a `/`-rooted `id` is
the same defect the check exists to catch and it would otherwise have been the one manifest URL
nothing looked at:

```diff
-            for (const [k, v] of [["start_url", m.start_url], ["scope", m.scope]])
+            for (const [k, v] of [["id", m.id], ["start_url", m.start_url], ["scope", m.scope]])
```

Non-vacuity, same method as N5's other three properties - mutate the deployed bundle, rebuild, run the
check verbatim from the YAML:

```console
$ sed -i '' 's|"id": "./"|"id": "/blackjack-trainer/"|' public/manifest.webmanifest
$ grep -n '"id"' public/manifest.webmanifest
5:  "id": "/blackjack-trainer/",
$ npm run build -- --base-href /blackjack-trainer/ > /dev/null && bash -e step05.sh
id is /blackjack-trainer/
CHECK_EXIT=1
$ # manifest restored from the copy taken before the edit, rebuilt
$ bash -e step05.sh
RESTORED_EXIT=0
```

## N2 - `@angular/forms` is a runtime dependency nothing imports

**Severity: P3** (round 2's re-triage, unchanged: not in the bundle, not in any advisory chain, it is
dependency hygiene).

Round 2 left this **UNVERIFIED** because removal needs `npm install` and it could not reach the
registry. `npm uninstall` resolves from the lockfile and the local cache, so with `--offline` it is a
local operation and the question can be answered.

Re-verified before removing:

```console
$ git show b09470d:package-lock.json | grep -n '"@angular/forms"'
14:        "@angular/forms": "^22.1.0",
$ grep -rn "@angular/forms" src e2e tools | wc -l
       0
$ grep -c "ReactiveFormsModule\|FormsModule\|NgModel" dist/blackjack-trainer/browser/main-*.js
0
```

```console
$ npm uninstall @angular/forms --offline
found 0 vulnerabilities
UNINSTALL_EXIT=0
$ git diff --stat package.json package-lock.json
 package-lock.json | 23 ++---------------------
 package.json      |  1 -
$ git show 9aaac6b -- package-lock.json | grep -B3 '^+      "dev": true,' \
    | grep -E '"resolved"|"dev": true'
       "resolved": "https://registry.npmjs.org/@standard-schema/spec/-/spec-1.1.0.tgz",
+      "dev": true,
       "resolved": "https://registry.npmjs.org/zod/-/zod-4.4.3.tgz",
+      "dev": true,
$ ls -d node_modules/@angular/forms
node_modules/@angular/forms is gone
```

The lockfile and the manifest are regenerated together, which is what round 2 said it could not do
safely by hand. Those 23 lines are not all `@angular/forms`: two other packages, `zod@4.4.3` and
`@standard-schema/spec@1.1.0`, are re-marked `dev` because `@angular/forms` was their only
non-dev path. Nothing here runs `npm ci --omit=dev` (`grep -rn "omit=dev\|--production" .github/
package.json` returns nothing) and both remain installed via `@angular/cli`, so nothing changes -
but a dependency change whose evidence was a line count should say which lines
(REVIEW-round3-stage3, F10).

## M3 - the coverage gate is blind to `tools/`

**Severity: P3** (round 2's, unchanged). **DEFERRED**, with the blind spot measured rather than
argued and recorded where the number is defined.

```console
$ npx ng test --coverage --coverage-reporters=json-summary
$ node -e '...Object.keys(coverage-summary.json)...'
files in report: 74 | under tools/: 0
```

Zero of the 74 files in the report are under `tools/`, so the reported percentages describe `src/**`
and nothing else. (An earlier version of this sentence quoted `96.11 / 93.23 / 93.28 / 97.97`, which
were the _parent_ commit's figures - the same commit that published the sentence moved all four by
adding `src/app/app.ts` code and three tests. REVIEW-round3-stage3, F4. The current figures are in
this stage's gate table below, and the point does not depend on them: it is the file list that is
missing `tools/`, not the arithmetic.)

**Not closed, and the reason is not effort.** Adding `tools/**` to the coverage `include` would
report both files at 0% - `serve-dist.mjs` because v8 coverage in the test process cannot see a child
process, `export-parity-fixtures.ts` because no test imports it (importing it would run it, rewriting
tracked files under `ios/Fixtures` as a side effect of `npm test`). That would take the reported
figures below their thresholds and turn the gate red over two files that **are** tested, by their
output and their process behaviour, in the two `tools/*.spec.mjs` specs round 2 added. A coverage
number that says 0% for a tested file is not more honest than one that says nothing about it.

What this round does instead is make the number impossible to misread, in the file that owns it
(`vitest.config.ts`): a comment naming what the percentages cover, what they do not, why, and the
finding id. That is a record, not a gate, and M3 stays open on that basis.

## D1 - the support address is still a placeholder, and it now blocks a gated deploy

**Severity: P1, DEFERRED.** The owner decision arrived as "still unknown".

Re-verified at this commit:

```console
$ awk 'NR==65' ios/AppStore/privacy.html
  <a href="mailto:CONTACT_EMAIL_HERE">CONTACT_EMAIL_HERE</a>.</p>
$ awk 'NR==55' ios/AppStore/support.html
    <a href="mailto:CONTACT_EMAIL_HERE">CONTACT_EMAIL_HERE</a> and I'll get back to you.
$ grep -rn CONTACT_EMAIL_HERE ios/ .github/ docs/
ios/AppStore/support.html:55:    <a href="mailto:CONTACT_EMAIL_HERE">CONTACT_EMAIL_HERE</a> and I'll get back to you.
ios/AppStore/privacy.html:65:  <a href="mailto:CONTACT_EMAIL_HERE">CONTACT_EMAIL_HERE</a>.</p>
$ awk 'NR==53' .github/workflows/pages.yml
          cp ios/AppStore/privacy.html ios/AppStore/support.html site/
```

(The `cp` is at line 53, not the 42 an earlier version of this block published: N1 inserted four
steps above it earlier in this same round and pushed it down eleven lines - REVIEW-round3-stage3, F6.)

Both cited lines are exactly where round 2 left them, both files are still copied into the published
site, and the placeholder appears nowhere else.

**The placeholder is left visible, and no address was invented.** A privacy policy that names a
mailbox nobody reads is worse than one that visibly has not been filled in, and App Store review
opens both of these URLs.

**What changed this round is what it blocks.** Before item 2, a push to `main` deployed whatever it
was given. After it, the deploy runs behind every gate this repository has - and not one of them
looks at these two files, so the placeholder would still ship. That is deliberate: a gate that fails
on `CONTACT_EMAIL_HERE` would block the deploy of an app whose only defect is one string the owner
already has. It stays a launch blocker (`LAUNCH-CHECKLIST.md` O5/O6), not a code finding.

## I1 - the iCloud data-loss path, and the entitlement question

**Severity: P1, DEFERRED.** The owner has decided **not to provision** iCloud KVS, so the path is not
reachable; the defect is real and fixing it properly changes user-visible sync behaviour.

### The provisioner warning still matches the code at every line it cites

`LAUNCH-CHECKLIST.md` O2 carries a warning added in round 2, above the provisioning steps. Every
citation was re-read at this commit:

| citation                         | what is at those lines                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| `CloudKeyValueStore.swift:63-72` | `cloud.synchronize()`, then the seed loop: `data(forKey:) != nil ? adopt : push`    |
| `StatsStore.swift:63-65`         | `private func persist()` → `StatsPersistence.save(...)` → `pushToCloud()`           |
| `StatsStore.swift:78`            | `stats = value`, the wholesale replace that makes adoption last-writer-wins         |
| `AppModel.swift:49-78`           | `let cloud = UbiquitousKeyValueStore()` … `StatsCloudSync(cloud:stores:)`, 9 stores |
| `PracticeDataSection.swift:16`   | `Button("Reset practice data", role: .destructive) { confirmingReset = true }`      |

All five resolve exactly. The warning does not overstate the code, and it is still above the steps
the person who could flip the switch would follow.

### The entitlement: evaluated, not performed

The question is whether to remove `com.apple.developer.ubiquity-kvstore-identifier` from
`ios/BlackjackTrainer/BlackjackTrainer.entitlements` and `CODE_SIGN_ENTITLEMENTS` from
`ios/project.yml:40`.

**What is measurable here.** The entitlement is declared and expands correctly, but it does not reach
the signature of anything this repository can build:

```console
$ codesign -d --entitlements - .../Build/Products/Debug-iphonesimulator/BlackjackTrainer.app
<?xml version="1.0" ...><plist version="1.0"><dict></dict></plist>     # empty

$ plutil -p .../BlackjackTrainer.build/BlackjackTrainer.app.xcent
{ }                                                                     # signed entitlements: none

$ plutil -p .../BlackjackTrainer.build/BlackjackTrainer.app-Simulated.xcent
{
  "application-identifier" => "C3W798H8U8.com.arthurzhang.blackjacktrainer.app"
  "com.apple.developer.ubiquity-kvstore-identifier" => "C3W798H8U8.com.arthurzhang.blackjacktrainer.app"
}
```

So `$(TeamIdentifierPrefix)$(CFBundleIdentifier)` resolves, the simulator's _simulated_ entitlements
carry the key, and the code signature carries nothing. Gate 9 is green with the entitlement declared,
and it would be green without it: **no local build can distinguish the two states.**

**The argument for removal.** With the entitlement declared, turning the capability on is a **portal
switch** - no app update, no release, no review. The day it is flipped, every copy already on a phone
starts running `CloudKeyValueStore.swift:63-72`, whose failure mode is that a device with an
unpopulated KVS cache writes its empty state over the shared key and the wipe propagates
(`StatsStore.swift:78` replaces local state wholesale). Removing it makes that path unreachable by
configuration alone: activating sync would then require shipping a build, which is the same moment
the race would have to be fixed.

**The argument against.** `LAUNCH-CHECKLIST.md:22` (decision D2, answered 2026-08-06) records
"the entitlement stays declared and inert, O2/O11 leave the critical path, and provisioning later
turns sync on without an app update" as a deliberate choice. Removing the entitlement deletes exactly
the property that decision was made to keep. Silently reversing a recorded design decision is what
these runs are not for, and the entitlement causes **no concrete defect today**: it is unprovisioned,
inert, and absent from every artifact this repository produces.

**Recommendation: keep it declared, and leave the decision with the owner** - the conservative option,
and the one that respects D2. The control is the O2 warning, which sits above the provisioning steps
and has now been verified line by line for the second round running. The recommendation flips if, and
only if, the owner intends to provision before the launch-seed race is fixed: at that moment the
entitlement stops being inert, and removing it is cheaper and more certain than remembering to read a
checklist.

**Archive/export signing: still CANNOT ASSESS, and now precisely bounded.** `ios/project.yml:17-20`
sets `CODE_SIGN_STYLE: Automatic`, `CODE_SIGNING_REQUIRED: YES` and `DEVELOPMENT_TEAM: C3W798H8U8`,
so a device archive signs against a real team and needs a provisioning profile carrying every
declared entitlement. Whether one exists - and whether Xcode would mint it with
`-allowProvisioningUpdates`, which is a per-account permission - is a question for Apple's servers
and this account's credentials. Neither is reachable here, and the simulator build proves nothing
about it because it signs with no entitlements at all. What would settle it, for whoever has the
account: `xcodebuild -scheme BlackjackTrainer -destination 'generic/platform=iOS' archive` with and
without the entitlement, and compare.

## Gates after stage 3 and its remediation

Every gate, at the commit that ships N4's `afterRenderEffect` correction and the record fixes
REVIEW-round3-stage3 asked for. Run with the sandbox disabled, nothing else on the machine.

| #   | gate              | command                                                                                                   | exit | result                                         |
| --- | ----------------- | --------------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------------- |
| 1   | lint              | `npm run lint`                                                                                            | 0    | three tsc projects + prettier, all clean       |
| 2   | build             | `npm run build`                                                                                           | 0    | the inherited chart-page budget warning        |
| 3   | unit tests        | `npm test`                                                                                                | 0    | 67 files, **1551 passed**                      |
| 4   | coverage gate     | `npm run test:coverage`                                                                                   | 0    | **96.16 / 93.28 / 93.22 / 98.00**              |
| 5   | E2E               | `E2E_SERVER=dist npm run e2e`                                                                             | 0    | `111 passed (37.2s)`                           |
| 6   | parity anti-drift | `npm run export:fixtures` + `git diff --exit-code -- ios/Fixtures`                                        | 0    | 7 fixtures written, no drift                   |
| 7   | swiftformat       | `swiftformat --lint .`                                                                                    | 0    | 0/105 files require formatting                 |
| 8   | swiftlint         | `swiftlint lint`                                                                                          | 0    | 0 violations, 0 serious in 105 files           |
| 9   | iOS build + test  | `xcodebuild -scheme BlackjackTrainer -destination 'platform=iOS Simulator,name=iPhone 16 Pro' build test` | 0    | `** TEST SUCCEEDED **`, 335 tests in 38 suites |

The coverage figures moved from the baseline's `96.11 / 93.23 / 93.28 / 97.97` because this round adds
code and tests to `src/app/app.ts` and `src/app/app.spec.ts`; the file count is unchanged at 74 and
still contains nothing under `tools/` (M3). Unit tests are 1551 rather than the baseline's 1547: four
added for N4. The iOS gates are untouched by this round and reproduce the baseline exactly.

## Closing gate 5, as a distribution

Twelve consecutive full-suite runs at `d1eea82`, the round's last code commit, with nothing else on
the machine:

```console
$ for i in $(seq 1 12); do E2E_SERVER=dist npm run e2e > run$i.txt 2>&1; echo "run$i exit=$?"; done
run1 exit=0   111 passed (38.1s)     run7  exit=0   111 passed (30.3s)
run2 exit=0   111 passed (37.3s)     run8  exit=0   111 passed (37.6s)
run3 exit=0   111 passed (38.2s)     run9  exit=0   111 passed (38.2s)
run4 exit=0   111 passed (35.9s)     run10 exit=0   111 passed (37.0s)
run5 exit=0   111 passed (40.0s)     run11 exit=0   111 passed (38.1s)
run6 exit=0   111 passed (36.2s)     run12 exit=0   111 passed (38.9s)
```

(Two columns for width; the loop ran them in order.) The round's full ledger of gate-5 runs -
10 before, 30 with M2's fix alone, 30 with both, 12 at the close - is in `PROD-READINESS.md` under
"Gates at the end of round 3".
