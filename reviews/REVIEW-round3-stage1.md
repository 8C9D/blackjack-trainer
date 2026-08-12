# REVIEW - round 3, stage 1

<!-- records: historical-file - a closed round's record. Its figures and transcripts were true at the commits that produced them; this round does not rewrite them, so the figures and transcript rules do not bind here. Citations are still resolved and bounds-checked. -->

**Verdict: PASS-WITH-FINDINGS**

Range: `d413a7b..406a32e`, one commit (`406a32e`, "pin the shoe the flaky showdown spec asserted and
budget the wait for the stream it configures"). Files touched: `PROD-READINESS.md`,
`reviews/ARTIFACTS-round3.md`, `e2e/fixtures/flows.ts`, `e2e/smoke/showdown.e2e.ts`.

Every transcript in the range was treated as an unverified assertion and re-run here. Both defects
are real, both fixes hold, and neither proof is vacuous: the M2 fix survives a mutation of the `src/`
behaviour it guards, and the M4 fix has a present/absent pair that reproduces exactly. The findings
below are about published numbers, one overstated characterisation and one tense - not about the code
that shipped.

All commands ran with the tool sandbox disabled, from `/Users/arthurzhang/dev/blackjack-trainer` at
`HEAD=406a32e8e92a776eacf13cf5a38635cf3f57c08a`. `127.0.0.1:4200` was free before every E2E result
reported below (`lsof -nP -iTCP:4200 -sTCP:LISTEN` exit 1); one loop that ran against an occupied port
is described and discarded under "Tree state", not counted anywhere. The stray `node` on `[::1]:4321`
was left alone throughout.

## Findings

### F1 - the published before-rate for M2 does not reproduce; 3.0% is a low draw

`reviews/ARTIFACTS-round3.md:12` (section title, "red about one run in thirty-three"),
`reviews/ARTIFACTS-round3.md:150` and `:164` (`6 / 200`, `3.0%`), `PROD-READINESS.md:453`
("6 failures in 200 executions of the test (3.0%)"), and the committed source comment
`e2e/smoke/showdown.e2e.ts:73` ("Measured at 2 of 60 seeds and 6 of 200 unseeded runs").

I reverted exactly the one argument the fix adds - `e2e/smoke/showdown.e2e.ts:76`,
`runCountingRound(page, 1)` back to `runCountingRound(page)`, nothing else - and re-ran the
artifact's own instrument:

```console
$ git diff --stat
 e2e/smoke/showdown.e2e.ts | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
$ E2E_SERVER=dist npx playwright test \
    --grep "returning to counting keeps the drill going" --repeat-each=200
EXIT=1
  14 failed
  186 passed (4.6m)
```

14 / 200 = 7.0%, not 6 / 200 = 3.0%. Exact (Clopper-Pearson) 95% intervals, computed here by
bisection on the binomial CDF:

```console
$ python3 <clopper-pearson>
6/200 = 3.00%  CP95 [1.11%, 6.42%]
14/200 = 7.00%  CP95 [3.88%, 11.47%]
2/60 = 3.33%  CP95 [0.41%, 11.53%]
```

The artifact's own interval arithmetic is right, but its point estimate falls outside my interval and
mine falls outside its published `[1.1%, 6.4%]`. The value both samples are consistent with is the
artifact's own theoretical figure of about 5% (`reviews/ARTIFACTS-round3.md:164-166`), which makes
the gate red about one run in twenty, not one in thirty-three. The direction is conservative - the
defect was worse than filed, so the after-evidence is stronger rather than weaker - but
"one run in thirty-three" is now a section title, the re-triage rationale at
`reviews/ARTIFACTS-round3.md:264-265`, and, unlike the rest, a comment that shipped into the test
file.

The **mechanism** reproduced exactly. All 14 failures were the same assertion:

```console
$ grep -oE "Error: expect\(locator\)\.[a-zA-Z]+\(\) failed" m2-before-200.txt | sort | uniq -c
  14 Error: expect(locator).toBeHidden() failed
```

and all 14 accessibility snapshots were the count-check panel, identical in every one:

````console
$ for f in test-results/*/error-context.md; do
    awk '/^```yaml$/{f=1;next} /^```$/{f=0} f' "$f"; echo "---"; done | sort | uniq -c | sort -rn
  14 ---
  14 - region "Showdown vs dealer":
  14   - text: What is the running count?
  14   - spinbutton "What is the running count?"
  14   - paragraph: 6 cards came out at this table. Take the count with you.
  14   - heading "Play 2 hands vs the dealer" [level=2]
  14   - button "Submit [Enter]" [disabled]
````

(For accuracy rather than as a finding: the `error-context.md` files are not byte-identical - their
call logs differ in the poll counter, `13 x` versus `14 x` - but the accessibility snapshot the
artifact quotes at `reviews/ARTIFACTS-round3.md:44-51` is identical across all of them, which is what
that passage claims.)

### F2 - "both mechanisms removed rather than made less likely" is true of M2 and false of M4

`reviews/ARTIFACTS-round3.md:465-467`:

> Gate 5 was red 1 run in 30 before this stage (M4) and 1 run in 33 before that (M2, per-execution
> 3.0%); it is now 0 in 30 with both mechanisms removed rather than made less likely.

For M2 that is right, and I verified it below: the test's random input is gone and seed 1 provably
reaches a player turn. For M4 it is not. The M4 fix is a budget increase, `e2e/fixtures/flows.ts:69`:

```
await expect(estimate).toBeVisible({ timeout: 5_000 + cards * 100 });
```

which for the one 26-card caller moves the budget from 5000 ms to 7600 ms. The mechanism - a fixed
wait budget a slow enough run exceeds - is still there; its threshold moved. The artifact concedes
this in its own non-vacuity section (`reviews/ARTIFACTS-round3.md:430-431`, "The fix widens a budget,
so reverting it turns nothing red on this machine") and then the closing summary promotes it to
"mechanism removed".

Two things make that more than a wording quibble.

1. **The failure being fixed lies outside every measurement taken of it.** Run 26 failed against a
   5000 ms budget, so its wait exceeded 5000 ms. The largest wait ever recorded is about 3.0 s - the
   artifact's instrument (`reviews/ARTIFACTS-round3.md:336-339`, n=130, max 3080) and my independent
   re-run of it (F6, n=78, max 2920) agree. The failing observation is therefore a tail event of
   unmeasured magnitude, and nothing in the range shows it lands under 7600 ms rather than over it.
2. **The "defect present" experiment reproduces a different configuration.** It induces the failure
   with `Time between cards (ms)` set to 200 (`reviews/ARTIFACTS-round3.md:363-367`), a 5.2 s stream
   no committed test produces. That proves a fixed 5 s budget is too small for a 5.2 s stream - it
   is, deterministically, and I reproduced it - but it is not run 26.

The claim the evidence supports is that the budget's tolerance went from about 1.8x the measured
stream to about 2.5x. The artifact's own sentence at `reviews/ARTIFACTS-round3.md:407-408` ("on a
machine 1.8x slower than this one it fails **every** time") implies its symmetric successor: a
machine 2.5x slower still fails every time. `reviews/ARTIFACTS-round3.md:433-434` ("a slower machine
does not turn a deterministic wait into a failure") should read "a machine up to about 2.5x slower".

**Counter-evidence, recorded because it cuts against me.** Part-way through my full-suite loop an
unrelated build on this machine drove the load average to ~490 and broke eleven tests in one run -
and the 26-card test was not one of them:

```console
$ uptime
11:20  up 43 days, 23:41, 12 users, load averages: 498.12 325.95 168.97
$ grep -n "cut card" clean-run7.txt
105:  ✓   95 [chromium] › e2e/smoke/showdown.e2e.ts:183:7 › post-count showdown ›
          no hand is offered off a shoe past its cut card (16.3s)
$ grep -c "flows.ts:69" clean-run7.txt
0
```

Under a load spike severe enough to fail navigation, basic-strategy and accessibility specs
wholesale, the widened deck-estimate budget held and the wait at `flows.ts:69` appears in none of the
eleven failures. So the fix is empirically strong; the finding is that the artifact's closing
sentence claims something categorically stronger than a widened budget can deliver, and this
distinction is the one the artifact itself insists on when it rejects "raising a timeout".

### F3 - the after-count arithmetic contradicts the table directly above it

`reviews/ARTIFACTS-round3.md:222`:

> **The arithmetic.** 400 + 30 = 430 executions of the M2 test after the fix, 0 failures.

The table at `reviews/ARTIFACTS-round3.md:201-206` lists four after-instruments: `--repeat-each=200`
at "M2 fix only", 30 full-suite runs at "M2 fix only", `--repeat-each=200` at the shipping commit,
and 30 full-suite runs at the shipping commit. That is 200 + 30 + 200 + 30 = 460 executions, not 430.
One of the two 30-run blocks is dropped without explanation, and it cannot be for the first block's
red run, because `reviews/ARTIFACTS-round3.md:220` says of that block "This test itself passed in all
30." The direction is conservative - the quoted `0.97^430 = 2.0e-6` understates the evidence - and
the powers themselves are right:

```console
$ python3 -c "print(0.97**430, 0.989**430, 1/0.989**430, 0.97**10, 0.95**10)"
2.0504337159719113e-06 0.008598157313502167 116.30398974320278 0.7374241268949281 0.5987369392383787
```

so `2.0e-6`, `8.6e-3`, "about 1 in 116", `0.74` and `0.60` all check out. Only the execution count
does not.

### F4 - two errors in the paragraph clearing the call sites the fix did not seed

`reviews/ARTIFACTS-round3.md:269-270`:

> Five other specs in this file still call `runCountingRound(page)` unseeded (lines 13, 28, 92, 124
> and 189 after this change).

At the committed tree the fifth site is line 191, not 189 - 189 and 190 are the comment the same
commit added - and it is not spelled `runCountingRound(page)`:

```console
$ grep -n "runCountingRound(" e2e/smoke/showdown.e2e.ts | grep -v ", [0-9]"
13:    await runCountingRound(page);
28:    await runCountingRound(page);
92:    await runCountingRound(page);
124:    await runCountingRound(page);
191:    await runCountingRound(page, undefined, 26);
$ sed -n '189,191p' e2e/smoke/showdown.e2e.ts
    // 26 is also how long this drill streams for, which is the walk's wait
    // budget — see runCountingRound.
    await runCountingRound(page, undefined, 26);
```

The substance is fine - that site is unseeded, and "pinned by Settings rather than by the shoe" is a
correct reading of it - but the citation points two lines short, at a comment, in a file the same
commit renumbered.

The same paragraph also mis-describes one of the sites it clears
(`reviews/ARTIFACTS-round3.md:272-273`): "92 and 124 run the betting flow, whose `standEveryBox`
helper exits on the round's own terminal control". The test at 92 does call `standEveryBox`
(`e2e/smoke/showdown.e2e.ts:108`); the test at 124 never does - it deals and asserts the coach line,
ending at `e2e/smoke/showdown.e2e.ts:138`. The conclusion for 124 still holds, because it rests on
the other half of the sentence (the coach line is rendered by `@if (lastPlay())`, which I confirmed
is outside the `player-turn` branch), but half the stated reason does not apply to it. This is inside
the passage the artifact itself labels "an argument from reading, not a measurement", which is the
right label; the reading just needs to be right too.

### F5 - the deploy coupling is asserted in the present tense and does not exist at this tip

`reviews/ARTIFACTS-round3.md:264-265`:

> item 2 of this round puts this exact suite in front of the Pages deploy, where a 3%-per-execution
> flake becomes a deploy that fails for no reason about one time in thirty-three.

and `PROD-READINESS.md:421` ("item 2 puts that suite in the deploy path"), `PROD-READINESS.md:447`
("item 2 puts that gate in front of the deploy").

At `406a32e` the deploy consults nothing:

```console
$ grep -n "e2e\|needs:\|on:\|npm run" .github/workflows/pages.yml
12:on:
13:  push:
14:    branches: [main]
15:  workflow_dispatch:
36:      - run: npm ci
37:      - run: npm run build -- --base-href /blackjack-trainer/
49:    needs: build
```

`pages.yml` runs `npm ci`, `npm run build`, an assemble step and `actions/deploy-pages`; its only
`needs:` is the `build` job inside the same workflow. The E2E job lives in
`.github/workflows/ci.yml:27`, with `npm run e2e` at line 48 under `E2E_SERVER: dist`, and `pages.yml`
never references it. Read as statements about planned item 2 these sentences are not false, but they
are written as present fact, and this round's own Assumption 2 (`PROD-READINESS.md:425-427`) requires
every claim about whether a failing step blocks the deploy to be "marked UNVERIFIED and named
precisely rather than being asserted from a YAML parse". Three sentences in the shipped prose assert
it instead. I cannot test the GitHub-runner behaviour either way; the objection is only that the
tense outruns the tree.

### F6 - the committed timing band is narrower than the tree reproduces, and the two margins use opposite ends of it

`e2e/fixtures/flows.ts:63-64`, a comment that shipped:

> the 26-card caller spends 2.80-3.08 s of it just streaming - a 1.8x margin

I re-derived it by the artifact's own method: `e2e/fixtures/flows.ts` instrumented with
`const t0 = Date.now()`, a 60 s budget so nothing could fail, and a `console.log`; three full-suite
runs; instrument removed afterwards.

```console
$ for i in 1 2 3; do E2E_SERVER=dist npm run e2e > timing-run$i.txt 2>&1; echo "run$i exit=$? ..."; done
run1 exit=0  111 passed (37.4s)
run2 exit=0  111 passed (48.1s)
run3 exit=0  111 passed (54.4s)
$ for i in 1 2 3; do echo "run$i waits=$(grep -c ESTIMATE_WAIT_MS timing-run$i.txt)"; done
run1 waits=26
run2 waits=26
run3 waits=26
$ grep -h "ESTIMATE_WAIT_MS.*cards=26" timing-run*.txt
ESTIMATE_WAIT_MS 2920 cards=26
ESTIMATE_WAIT_MS 2678 cards=26
ESTIMATE_WAIT_MS 2891 cards=26
$ grep -h ESTIMATE_WAIT_MS timing-run*.txt | awk '{print $2}' | sort -n \
    | awk '{a[NR]=$1} END {print "n="NR, "min="a[1], "median="a[int(NR/2)], "max="a[NR]}'
n=78 min=38 median=332 max=2920
```

The **structural** figure checks out exactly: 26 deck-estimate waits per full-suite run, which is the
artifact's `n=130` over five runs. That is not obvious, and it is worth recording that it survives
scrutiny - 20 of the 23 textual call sites are in `showdown.e2e.ts`, and the other three sit inside
`for (const scheme of ['dark', 'light'])` loops at `e2e/smoke/accessibility.e2e.ts:276`, `:299` and
`:326`, so they generate six tests rather than three.

The **band** does not: the 26-card caller measured 2678-2920 ms here, below the committed floor of
2.80 s. That is machine noise and it changes nothing, but the comment states one machine's measured
range as though it were a property of the caller.

Separately, the two margins quoted are computed against opposite ends of the same range: 1.8x is
5000 / 2802 (`e2e/fixtures/flows.ts:64`) while 2.5x is 7600 / 3080
(`reviews/ARTIFACTS-round3.md:425`). On a consistent basis the pair is 1.6x -> 2.5x, or 1.8x -> 2.7x.

## Reproduced and held

Everything below is a claim from the range that I tried to break and could not.

**The fix works under repetition at the shipping commit.**

```console
$ E2E_SERVER=dist npx playwright test \
    --grep "returning to counting keeps the drill going" --repeat-each=50
EXIT=0
  50 passed (45.3s)
```

**Seed 35 makes the defect deterministic**, as claimed at `reviews/ARTIFACTS-round3.md:84-93`.
Mutation: `runCountingRound(page, 1)` to `(page, 35)` at `e2e/smoke/showdown.e2e.ts:76`, nothing
else.

````console
$ E2E_SERVER=dist npx playwright test \
    --grep "returning to counting keeps the drill going" --repeat-each=10
SEED35_EXIT=1
  10 failed
$ awk '/^```yaml$/{f=1;next} /^```$/{f=0} f' test-results/*/error-context.md | sort | uniq -c
  10 - region "Showdown vs dealer":
  10   - heading "Play 2 hands vs the dealer" [level=2]
  10   - paragraph: 6 cards came out at this table. Take the count with you.
  10   - text: What is the running count?
  10   - spinbutton "What is the running count?"
  10   - button "Submit [Enter]" [disabled]
````

**The "if and only if" correlation over 60 shoes holds.** The artifact's probe
(`scratchpad/seed-probe.mjs`) is not committed, so its transcript cannot be re-run; I wrote an
independent one as a throwaway spec (`e2e/smoke/zzz-seedprobe.e2e.ts`, deleted afterwards) that walks
the test's exact steps at seeds 0-59 inside the normal suite harness and records the two facts
separately - whether the opening deal left a player turn, and whether the region hid inside the
assertion's own 5000 ms.

```console
$ E2E_SERVER=dist npx playwright test --grep "seedprobe"
EXIT=0
  60 passed (34.4s)
$ grep "hidden=NO" probe-lines.txt
seed=35 playerTurn=n dealAnother=Y verdicts=2 hidden=NO countCheckPanels=1
seed=56 playerTurn=n dealAnother=Y verdicts=2 hidden=NO countCheckPanels=1
$ grep "playerTurn=n" probe-lines.txt
seed=35 playerTurn=n dealAnother=Y verdicts=2 hidden=NO countCheckPanels=1
seed=56 playerTurn=n dealAnother=Y verdicts=2 hidden=NO countCheckPanels=1
```

Two of sixty, the same two seeds the artifact names, and the correlation is exact in both
directions. Those two shoes are the two documented ways a round ends before a decision, and seed 1 is
the guaranteed player turn:

```console
PROBE seed=1  playerTurn=Y dealer="DEALER"      boxes="... HAND 1 (18) | HAND 2 (20)"
PROBE seed=35 playerTurn=n dealer="DEALER (13)" verdicts="Blackjack! You win (pays 3:2). | Blackjack! You win (pays 3:2)."
PROBE seed=56 playerTurn=n dealer="DEALER (21)" verdicts="Dealer blackjack — dealer wins. | Dealer blackjack — dealer wins."
```

Seed 1's totals, 18 and 20, match the comment's "Q+8, 9+A" at `e2e/smoke/showdown.e2e.ts:69`; seeds
35 and 56 match "a natural in every box" and "a dealer natural" respectively.

**The M2 proof is not vacuous.** With the shipped test unchanged, dropping the guard at
`src/app/features/card-counting/showdown.component.ts:1320` (`this.phase() !== 'player-turn'`
removed, nothing else):

```console
$ git diff --stat
 src/app/features/card-counting/showdown.component.ts | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
$ E2E_SERVER=dist npx playwright test \
    --grep "returning to counting keeps the drill going" --repeat-each=5
MUTANT_EXIT=1
  5 failed
    Error: expect(locator).toBeHidden() failed
```

**The M4 present/absent pair reproduces.** Helper reverted to `d413a7b`'s fixed 5 s budget, caller
mutated to `Time between cards (ms)` = 200 with `runCountingRound(page)`:

```console
$ E2E_SERVER=dist npx playwright test \
    --grep "no hand is offered off a shoe past its cut card" --repeat-each=5
PRESENT_EXIT=1
  5 failed
    Error: expect(locator).toBeVisible() failed
    Locator: getByLabel('How many decks remain?')
    Expected: visible
    Timeout: 5000ms
    Error: element(s) not found
```

Same locator, message and timeout as the run-26 transcript at
`reviews/ARTIFACTS-round3.md:299-306`. Restoring the shipped helper and passing the caller's own card
count, with the same 200 ms stream still in place:

```console
$ E2E_SERVER=dist npx playwright test \
    --grep "no hand is offered off a shoe past its cut card" --repeat-each=5
ABSENT_EXIT=0
  5 passed (13.2s)
```

**The M4 fix leaves no sibling behind.** The only caller that streams more than 3 cards is the
cut-card test:

```console
$ grep -rn "Number of cards" e2e/
e2e/smoke/showdown.e2e.ts:188:    await page.getByLabel('Number of cards').fill('26');
e2e/smoke/card-counting.e2e.ts:15:    await page.getByLabel('Number of cards').fill('3');
e2e/smoke/card-counting.e2e.ts:155:    await expect(page.getByLabel('Number of cards')).toHaveCount(0);
e2e/fixtures/flows.ts:12:  await page.getByLabel('Number of cards').fill('3');
e2e/fixtures/flows.ts:26:  await page.getByLabel('Number of cards').fill('3');
e2e/fixtures/flows.ts:40:  await page.getByLabel('Number of cards').fill('3');
```

I also checked the three deck-estimate waits outside the patched helper -
`e2e/smoke/card-counting.e2e.ts:72`, `e2e/smoke/card-counting.e2e.ts:129` and
`e2e/smoke/accessibility.e2e.ts:385`. All three are 3-card streams (`shrinkDrill` and
`configureBetSpread` both fill `3`), so none is exposed to the same defect and none needed the same
change.

**The fix does not narrow the gate.** Pinning seed 1 removes the roughly-5% of runs in which this
test happened to exercise the resolved-round exit instead of the mid-hand one it names. That path is
not lost: `e2e/smoke/showdown.e2e.ts:357` (`leaving the table asks what its cards did to the count`)
and `e2e/smoke/showdown.e2e.ts:382` (`the count check can be turned off in Settings`) both reach it
deterministically, via seed 1 plus `standEveryBox`. The assertion in the changed test is unchanged.

**Every source citation in the artifact resolves**, checked by reading the tree at `406a32e`:
`showdown.component.ts:197` is `@if (phase() === 'count-check') {`; `:386` is
`@if (lastPlay(); as v) {`, a sibling of the `phase() === 'player-turn'` block at `:374` rather than a
child of it, so the claim at `reviews/ARTIFACTS-round3.md:272-274` that the coach line survives an
early settle is structurally right; `:952-1000` spans `dealHand()` through `peekAndContinue()`;
`:1319-1326` is `returnToCounting()` with the guard on 1320.
`src/app/features/card-counting/counting-settings.component.ts:109` is `min="100"`, and
`src/app/core/models/shoe.model.ts:13-14` are `PENETRATION_PRESETS = [0.5, ...]` and
`MIN_PENETRATION = 0.5`, so "1 deck at the minimum 0.5 penetration puts the cut card out at exactly
26 cards" is sound. `e2e/smoke/showdown.e2e.ts:65` at `d413a7b` is the test declaration the artifact
quotes. The claim at `reviews/ARTIFACTS-round3.md:188-190` that four other specs already use `?seed=`
for this exact hazard is exact: lines 49, 342, 361 and 398, each with a comment about guaranteeing a
player turn.

**Gate 5 at the tip.** Twelve consecutive full-suite runs of `E2E_SERVER=dist npm run e2e`, each a
fresh invocation that rebuilds the bundle it serves. This host is shared with other projects' builds,
so the loop records the one-minute load average with each run rather than claiming a quiet machine:

```console
$ for i in $(seq 1 12); do E2E_SERVER=dist npm run e2e > final-run$i.txt 2>&1; \
    echo "run$i exit=$?  $(grep -oE '[0-9]+ (passed|failed) \([^)]+\)' final-run$i.txt | tail -1)  \
    load=$(uptime | sed 's/.*load averages: //' | awk '{print $1}')"; done
run1 exit=0  111 passed (40.6s)  load=23.77
run2 exit=0  111 passed (57.2s)  load=34.23
run3 exit=0  111 passed (41.1s)  load=38.03
run4 exit=0  111 passed (40.1s)  load=59.23
run5 exit=0  111 passed (39.0s)  load=37.98
run6 exit=0  111 passed (45.7s)  load=36.04
run7 exit=0  111 passed (37.8s)  load=36.94
run8 exit=0  111 passed (50.4s)  load=41.43
run9 exit=0  111 passed (41.8s)  load=83.47
run10 exit=0  111 passed (33.1s)  load=63.57
run11 exit=0  111 passed (32.5s)  load=46.37
run12 exit=0  111 passed (36.2s)  load=34.79
```

12 of 12, `111 passed` every time, zero skipped in every run, and both tests this range touches
passed in all twelve:

```console
$ for i in $(seq 1 12); do printf "run%-2s skipped=%s tests=%s\n" "$i" \
    "$(grep -c 'skipped' final-run$i.txt)" "$(grep -c '✓' final-run$i.txt)"; done
run1  skipped=0 tests=111
...
run12 skipped=0 tests=111
$ grep -h "returning to counting keeps the drill going\|no hand is offered off a shoe past its cut card" \
    final-run*.txt | grep -oE "(✓|✘)" | sort | uniq -c
  24 ✓
```

Local runs take no retries and use the default worker count (`playwright.config.ts:18-19`,
`retries: process.env.CI ? 1 : 0`), so each of those 24 is a single unaided observation. This is
twelve observations per test, not thirty; it is consistent with the artifact's 30 of 30 and it does
not independently establish it.

**About the machine.** My first attempt at this loop was ruined by other work on the same host: an
unrelated Rust/Tauri build, another project's `ng test`, and several `swift-frontend` compilations
drove the load average to ~490, and runs 6 and 7 of that attempt failed 2 and 11 tests respectively -
across `navigation`, `basic-strategy`, `accessibility`, `persistence`, `review-round`, `seeded` and
`showdown`. Those runs are not evidence about this range and I discarded them; they are recorded
because they bound what a full-suite green means. Both tests this range touches passed in every one
of them, including run 7 (`returning to counting keeps the drill going` in 27.9s,
`no hand is offered off a shoe past its cut card` in 16.3s). The artifact's closing 30-of-30 is
explicitly qualified "with nothing else running on the machine"
(`reviews/ARTIFACTS-round3.md:438-439`), and that qualification is doing real work.

**The changed tests do not pass only in isolation.** Both ran in every full-suite run recorded above,
under the default parallel worker count, and `111 passed` with zero skipped each time.

## Gate 1 at the tip

The range adds prose comments to two committed TypeScript files, so the format half of gate 1 is the
one that could break. Both halves are clean for the range's files and for this review file:

```console
$ npm run typecheck
TYPECHECK_EXIT=0
$ npx prettier --check PROD-READINESS.md reviews/ARTIFACTS-round3.md \
    e2e/fixtures/flows.ts e2e/smoke/showdown.e2e.ts reviews/REVIEW-round3-stage1.md
Checking formatting...
All matched files use Prettier code style!
RANGE_FORMAT_EXIT=0
```

**Out of range, but it must be said, because a reader will run `npm run lint` and see red.** While
this review was being written, a later stage began working in the same working tree. `npm run lint`
is now red for a reason that has nothing to do with `d413a7b..406a32e`:

```console
$ npm run lint
LINT_EXIT=1
...
[warn] site/404.html
[warn] site/chunk--v5M_Gm0.js
...
[warn] Code style issues found in 28 files. Run Prettier with --write to fix.
$ git check-ignore site; echo "check-ignore exit=$?"
check-ignore exit=1
```

`site/` is the directory `.github/workflows/pages.yml:39-43` assembles, evidently produced by running
that step locally. It is in neither `.gitignore` nor `.prettierignore`, so `prettier --check .`
descends into a build output tree and gate 1 fails. That belongs to whoever is running item 2, and I
did not touch it; I record it only so that this stage is not blamed for it, and because it is the
same defect class round 2 filed against `dist/`.

I re-ran the two halves separately to confirm the range itself is clean, which is the transcript
above.

## Tree state

Everything I mutated is restored. The three files
(`e2e/smoke/showdown.e2e.ts`, `e2e/fixtures/flows.ts`,
`src/app/features/card-counting/showdown.component.ts`) were restored from copies taken before the
first mutation, and the throwaway probe spec was deleted:

```console
$ git diff --stat -- e2e/ src/ PROD-READINESS.md reviews/ARTIFACTS-round3.md
(no output)
$ git rev-parse HEAD
406a32e8e92a776eacf13cf5a38635cf3f57c08a
$ git status --porcelain
 M .github/workflows/ci.yml
 M .github/workflows/pages.yml
?? .agents/
?? .codex/
?? reviews/REVIEW-round3-stage1.md
?? site/
```

Of those entries, only `reviews/REVIEW-round3-stage1.md` is mine. `.agents/` and `.codex/` were
untracked before this review and were not touched. The two modified workflow files and `site/`
appeared in this working tree while I was measuring - a later stage is working in the same checkout -
and I left all three exactly as I found them; nothing in `e2e/`, `src/`, `PROD-READINESS.md` or
`reviews/ARTIFACTS-round3.md` is modified.

`dist/` is gitignored and was last rebuilt from the committed tree by the final full-suite loop.

One operational note, since it cost me a whole twelve-run loop. My first attempt at the final loop
returned `exit=1` twelve times in a row, in seconds each, with no test summary at all:

```console
$ tail -3 final-run1.txt
Error: http://127.0.0.1:4200 is already used, make sure that nothing is running
on the port/url or set reuseExistingServer:true in config.webServer.
$ ps -o pid,ppid,lstart,command -p 47000
  PID  PPID STARTED                      COMMAND
47000 46919 Tue 11 Aug 11:28:59 2026     node tools/serve-dist.mjs
$ ps -o pid,ppid,command -p 46919
  PID  PPID COMMAND
46919 46918 /bin/sh -c npm run build && PORT=4200 node tools/serve-dist.mjs
```

A `serve-dist` was holding 4200. I killed that process and its parent shell only, confirmed the port
free, and re-ran; the stray `node` on `[::1]:4321` was left alone throughout
(`lsof -nP -iTCP:4321 -sTCP:LISTEN` still shows PID 1607).

**I got that one wrong, and it should be recorded.** I read PID 47000 as an orphan of my own stopped
loop. Its start time (11:28:59) is a second before my first run, and Playwright refuses the port
before spawning its `webServer`, so it cannot have been spawned by the run that then failed on it -
it was almost certainly the concurrent stage's live E2E run, which my kill would have broken. A
second live `npm run e2e` appeared at 11:41:09, immediately after my loop released the port:

```console
$ ps -A -o pid,command | grep -E "npm run e2e|playwright test" | grep -v grep
59126 npm run e2e
59148 node .../node_modules/.bin/playwright test
```

The standing hazard is worth naming for the rest of this round: **two stages sharing one working tree
cannot both hold `127.0.0.1:4200`**, so gate 5 serialises by luck, and a stage that finds the port
busy cannot tell a peer's live run from its own orphan. Anyone re-measuring gate 5 here should check
`ps` for a live `playwright test` before touching whatever holds the port.

The failure mode itself is the good one: `reuseExistingServer` is false for the dist lane
(`playwright.config.ts:51`), so an occupied port fails loudly rather than letting a suite report green
against a bundle it never built - R0-4's fix doing its job. It also means my twelve runs cannot have
been served by anyone else's process: each rebuilt and served its own
`dist/blackjack-trainer/browser` (`tools/serve-dist.mjs:12`), which is not the `site/` tree the other
stage assembled.

## Verdict

**PASS-WITH-FINDINGS.** Both defects are real and both fixes hold. M2's is a genuine removal of a
random input, proven non-vacuous against a `src/` mutation and confirmed by an independent 60-seed
sweep that reproduces the artifact's correlation exactly in both directions. M4's has a
deterministic present/absent pair and survived a load spike that broke eleven unrelated tests.

F2 is the one worth acting on before the round closes: the closing summary claims M4's mechanism was
removed when it was rescaled, and that is exactly the distinction the same document insists on when
it rejects "raising a timeout". F1, F3, F4 and F6 are published numbers and citations that do not
match the tree, all conservative in direction, and F1 has leaked into a committed source comment. F5
is a tense that outruns the deploy workflow as it stands at this tip.
