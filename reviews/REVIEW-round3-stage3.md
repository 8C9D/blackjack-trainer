# REVIEW - round 3, stage 3

**Verdict: PASS-WITH-FINDINGS**

Range reviewed: `b09470d..d502bfb` (two commits - `9aaac6b` N4/N6/N2/M3, `d502bfb` the M1 remediation
answering REVIEW-round3-stage2, plus D1/I1 and the number corrections).

The code in this range is sound and every local gate is green at the tip.
The N4 fix is a real improvement at every viewport I measured and regresses nothing.
What does not hold is part of the record: the ledger's terminal state for N4 rests on a measurement
taken at one viewport and stated without qualification, one of the two mechanisms the fix ships does
not fire under the app's own change detection, one published transcript shows output the committed
tree cannot produce, and the disproved M2 rate survives in seven places including a shipped source
comment.

## What I ran, and where

`git status --porcelain` showed the working tree being edited by another session while I worked
(`M PROD-READINESS.md`, `M reviews/ARTIFACTS-round3.md`), so every citation below is taken from a
pristine `git archive d502bfb` export, and every measurement was taken against builds made from that
export.
Nothing here was measured in the live checkout except read-only greps that I re-derived against the
export afterwards.

The browser evidence comes from a probe built independently of the one the artifact describes, using
the same induction method: a development build served on my own ports (4577 = `b09470d`,
4578 = `d502bfb`), Playwright's Chromium at a pinned viewport, and

```js
const cmp = window.ng.getComponent(document.querySelector('app-root'));
cmp.updates.updateReady.set(true);
window.ng.applyChanges(cmp);
```

with `.update` node counts asserted 0 -> 1 on every run.
Port 4200 was free before I started and I never bound it except for the one E2E run below.

---

## F1 - N4's headline result is a single-viewport measurement published as the finding's resolution, and one of the sentences it ships is false

`PROD-READINESS.md:444` (at `d502bfb`):

```
| N4  | P2 | **P2** | RESOLVED - induced for real (not injected), 6-of-6 covered controls before, 0-of-6 after. ...
```

`src/app/app.scss:11-12`, shipped in the source:

```scss
// three viewport-sized screens subtract it from their own height instead, so
// they never need to be scrolled at all.
```

and `reviews/ARTIFACTS-round3.md:1031-1033`:

> the three viewport-sized screens ... `min-height: calc(100dvh - var(--update-space, 0px))`, so they
> shrink instead of needing to be scrolled at all.

At 375x700 this reproduces exactly, including every `elementFromPoint` attribution (see
"What I could not falsify").
It does not hold at shorter viewports, because the drill's own content is about 499 px tall and
`min-height` cannot shrink an element below its content.

Command (probe body identical to the block above, `SNAPSHOT` reads every `button` outside `.update`
and hit-tests its centre):

The `covered:` detail line is printed after every row that has coverage; the two `before` ones are
omitted here and list the same six controls as the 375x700 before-table.

```console
$ node probe2.mjs
### before:320x568 {"usv":"","pb":"0px","minH":"568px","banner":{"top":406.03,"height":145.97},"scroll":{"scrollHeight":568,"clientHeight":568,"maxScrollTop":0},"covered":"6/7"}
### after:320x568 {"usv":"162px","pb":"162px","minH":"406px","banner":{"top":406.03,"height":145.97},"scroll":{"scrollHeight":661,"clientHeight":568,"maxScrollTop":93},"covered":"3/7"}
    covered: SplitP[404-459]->STRONG | SurrenderR[404-459]->STRONG | InsuranceI[404-459]->STRONG
### before:375x500 {"usv":"","pb":"0px","minH":"500px","banner":{"top":338.03,"height":145.97},"scroll":{"scrollHeight":500,"clientHeight":500,"maxScrollTop":0},"covered":"6/7"}
### after:375x500 {"usv":"162px","pb":"162px","minH":"338px","banner":{"top":338.03,"height":145.97},"scroll":{"scrollHeight":661,"clientHeight":500,"maxScrollTop":161},"covered":"6/7"}
    covered: HitH[342-396]->STRONG | StandS[342-396]->STRONG | DoubleD[342-396]->STRONG | SplitP[404-459]->DIV.update__actions | SurrenderR[404-459]->BUTTON.update__reload | InsuranceI[404-459]->BUTTON.update__later
```

At 375x500 the after-state is `6/6` covered - the same count the finding's title describes - and a
screenshot at that viewport shows the entire action grid behind the banner with the question ("Hard 8
vs 10") as the last visible line.
At 320x568 it is 3 of 6.

**This is a scope defect in the claim, not a regression in the fix.** The fix changes those viewports
from "covered and the page cannot scroll" (`maxScrollTop: 0` in both before-rows above) to "covered
but reachable by scrolling" (`maxScrollTop` 93 and 161), which is strictly better everywhere.
But `0-of-6 after` is true only at 375x700 and above, `they never need to be scrolled at all` is
false at both viewports measured here, and the ledger states the former unqualified as the reason N4
is RESOLVED.

## F2 - the effect that is supposed to re-measure when the banner's content grows does not fire, and the artifact's figures for those states came from a change-detection pass the app never runs

`src/app/app.ts:112-121`:

```ts
constructor() {
  // Re-measure whenever the banner appears or disappears, and whenever its
  // content changes height: the recovery copy is longer than the offer's, and
  // a failed reload adds a line to both.
  effect(() => {
    this.updates.recoveryNeeded();
    this.updates.updateFailed();
    this.measureBanner();
  });
}
```

The appear/disappear half works, because `measureBanner` reads the `viewChild` signal and that signal
changes after the view is refreshed.
The content-changes-height half does not: when only `updateFailed` or `recoveryNeeded` flips, the
element's identity is unchanged, the effect runs against the pre-refresh DOM, and nothing re-runs it.

Measured on the real code path, with a real DOM click on the banner's own Reload button and
`PAGE_RELOAD` made to throw - which is exactly `app-update.service.ts:60-69`:

```console
$ node probe2.mjs        # section B, 375x700, app's own scheduler (no applyChanges)
### B:offer {"usv":"162px","pb":"162px","minH":"538px","banner":{"top":538.03,"height":145.97},"scroll":{"scrollHeight":700,"clientHeight":700,"maxScrollTop":0},"covered":"0/7"}
### B:afterFailedReloadClick {"usv":"162px","pb":"162px","minH":"538px","banner":{"top":517.84,"height":166.16},"scroll":{"scrollHeight":700,"clientHeight":700,"maxScrollTop":0},"covered":"0/7"}
### B:afterResize {"usv":"183px","pb":"183px","minH":"517px","banner":{"top":517.84,"height":166.16},"scroll":{"scrollHeight":700,"clientHeight":700,"maxScrollTop":0},"covered":"0/7"}
```

The banner grew from 145.97 px to 166.16 px and the reserve stayed at 162 px - 21 px short.
Only the later resize (the `@HostListener`, not the effect) repaired it to 183 px.
The same happens when `unrecoverable` arrives while an offer banner is already up, which is a
reachable sequence since `AppUpdateService` watches the two streams independently:

```console
### C:offer {"usv":"162px","pb":"162px","minH":"538px","banner":{"top":538.03,"height":145.97},"scroll":{"scrollHeight":700,"clientHeight":700,"maxScrollTop":0},"covered":"0/7"}
### C:thenRecovery {"usv":"162px","pb":"162px","minH":"538px","banner":{"top":504.03,"height":179.97},"scroll":{"scrollHeight":700,"clientHeight":700,"maxScrollTop":0},"covered":"0/7"}
```

34 px short, and `recoveryNeeded` is the state with no "Later".

**This is where the probe's method fails, and it is the specific thing the brief asked me to
attack.** The method is faithful about markup and stylesheet (F-confirmations below), but
`window.ng.applyChanges(cmp)` forces an extra change-detection pass that the running app does not,
and that extra pass is what makes the measurement correct.
Re-running the artifact's own recovery scenario _with_ `applyChanges` reproduces its published
figure exactly:

```console
$ node probe.mjs         # recovery raised from a no-banner state, with applyChanges
### after:drill:375x700:recovery  ngDebugApi=true
  after   : {"usv":"196px","pb":"196px","cls":"drill","mh":"504px","sh":504,"bc":1,"pos":"fixed","fd":"column","rect":{"top":504.03,"bottom":684,"height":179.97},"scroll":{"scrollHeight":700,"clientHeight":700,"maxScrollTop":0,"scrollTop":0},"covered":0,"nctrl":7}
```

which is `reviews/ARTIFACTS-round3.md:1068` to the pixel.
So `reviews/ARTIFACTS-round3.md:1064-1070` ("the reserve follows it rather than being a constant
tuned to the offer") and `reviews/ARTIFACTS-round3.md:1024-1025` ("an `effect` that re-measures when
it appears **or its content changes**") are properties of the probe, not of the shipped component.
At 375x700 no control ends up covered in either stale state, so the user-visible cost is bounded;
the claim is what is wrong.

## F3 - the three new unit tests do not reach the branch F2 falsifies, and one of them cannot fail

`src/app/app.spec.ts:161`, `:169`, `:188`.
None of them flips `updateFailed` or `recoveryNeeded` while a banner is up; the only re-measure they
exercise is a synthetic `window.dispatchEvent(new Event('resize'))`.

The published mutation reproduces exactly (`reviews/ARTIFACTS-round3.md:1093-1103`):

```console
$ grep -n "MUTANT" src/app/app.ts
140:    const space = 0; // MUTANT: publish no reserve
$ npm test > mut1.log 2>&1; echo "MUT1_EXIT=$?"
MUT1_EXIT=1
$ grep -E "AssertionError|Test Files" mut1.log | sed 's/\x1b\[[0-9;]*m//g' | sort -u | head
 Test Files  1 failed | 66 passed (67)
AssertionError: expected '0px' to be '162px' // Object.is equality
```

(`sort -u` collapses the two identical assertion lines the artifact prints separately.)

Deleting the whole `effect` block is also caught, by the dismiss test only:

```console
$ grep -c "effect(" src/app/app.ts
0
$ npm test > mut2.log 2>&1; echo "MUT2_EXIT=$?"
MUT2_EXIT=1
$ grep -E "AssertionError|Test Files" mut2.log | sed 's/\x1b\[[0-9;]*m//g' | sort -u | head
 Test Files  1 failed | 66 passed (67)
AssertionError: expected '162px' to be '0px' // Object.is equality
```

`it('is zero while no banner is up')` passes under both mutants and under the correct code; it pins
the host binding's existence and nothing else.

And K3's own admission is exactly right - deleting the entire CSS half leaves every local gate green:

```console
$ # padding-bottom removed from app.scss and calc() removed from all three screens
$ grep -rn "var(--update-space" src/app/ || echo "  none"
  none
$ npm test > mut3.log 2>&1; echo "MUT3_TEST_EXIT=$?"
MUT3_TEST_EXIT=0
$ grep -E "Test Files|Tests  " mut3.log
 Test Files  67 passed (67)
$ npm run lint > mut3lint.log 2>&1; echo "MUT3_LINT_EXIT=$?"
MUT3_LINT_EXIT=0
$ npm run build > mut3build.log 2>&1; echo "MUT3_BUILD_EXIT=$?"
MUT3_BUILD_EXIT=0
```

## F4 - M3's coverage figures are the parent commit's, invalidated by the same commit that published them

`reviews/ARTIFACTS-round3.md:1205`:

> Zero of the 74 files in the report are under `tools/`, so `96.11 / 93.23 / 93.28 / 97.97` describes
> `src/**` and nothing else.

The file count reproduces.
The four percentages are `b09470d`'s, and `9aaac6b` - the commit that publishes that sentence - adds
40 lines to `src/app/app.ts` and three tests, which moves all four.

Both runs are `npx ng test --coverage --coverage-reporters=json-summary` followed by the same node
one-liner over `coverage/blackjack-trainer/coverage-summary.json`; only the export directory differs.

```console
$ cd t_before   # git archive b09470d
$ npx ng test --coverage --coverage-reporters=json-summary; echo "COV_BEFORE_EXIT=$?"
COV_BEFORE_EXIT=0
b09470d: files in report: 74 | under tools/: 0
b09470d: statements 96.11 branches 93.23 functions 93.28 lines 97.97

$ cd t_after    # git archive d502bfb
$ npx ng test --coverage --coverage-reporters=json-summary
files in report: 74 | under tools/: 0
statements 96.1 branches 93.24 functions 93.22 lines 97.98
```

The same stale quadruple is in the stage-2 gate table at `reviews/ARTIFACTS-round3.md:950`
("96.11 / 93.23 / 93.28 / 97.97 - unchanged"), where it is at least labelled as that stage's run.
The M3 sentence is present tense at a commit where it is false.

## F5 - the disproved M2 rate survives in seven places, one of them shipped source

`PROD-READINESS.md:493` (R3-11) records the resolution as "All three corrected, and the rate is now
the three-sample pooled 5.5% rather than the two-sample 5.0%", and `PROD-READINESS.md:483` (R3-1)
records "the rate is corrected in the artifact, the ledger and `showdown.e2e.ts`".
Run in a `git archive d502bfb` export, with output truncated to 150 columns only where the source
line is longer than that:

```console
$ grep -n '20 / 400\|0\.97\^10\|pooled 5\.0% is where they meet\|one run in eighteen\|1 run in 20 before that' reviews/ARTIFACTS-round3.md | cut -c1-150
152:| **pooled**                                      | both samples            | **20 / 400** | **5.0%** per execution |
156:3% event, and `0.97^10 = 0.74`. Round 2's 2-of-7 and this run's 0-of-10 are the same rate seen twice
180:REVIEW-round3-stage2, F6, which corrected this line's original "one time in twenty"); the pooled 5.0% is where they meet, and it lands exactly on
183:therefore **5.5%, about one run in eighteen** - every sample is kept in the table above as the sample
517:1 run in 30 before this stage (M4) and about 1 run in 20 before that (M2, per-execution 5.5% pooled); it is now

$ grep -n "20 of 400" e2e/smoke/showdown.e2e.ts
73:  // is working correctly. Measured at 2 of 60 seeds, and at 20 of 400 unseeded

$ sed -n '465,467p' PROD-READINESS.md
one run in four". Measured here and by the stage-1 reviewer independently: 20 failures in 400
executions of the test - 33 in 600 across three independent samples (5.5%, exact 95% CI
[3.82%, 7.64%]) - and the page at the

$ sed -n '12p' reviews/ARTIFACTS-round3.md
## M2 - the E2E gate is red about one run in twenty, and it is the test that is wrong

$ node -e 'console.log("0.945^10 =", Math.pow(0.945,10).toFixed(2), "  1/0.055 =", (1/0.055).toFixed(1))'
0.945^10 = 0.57   1/0.055 = 18.2
```

The survivals:

1. `reviews/ARTIFACTS-round3.md:152` - the instrument table still pools two samples to `20 / 400`,
   `5.0%`, twenty-four lines above a second pooled table that says `33 / 600`, `5.50%`.
2. `:156` - "ten observations of a 3% event, and `0.97^10 = 0.74`" still uses the point estimate the
   run has twice declared disproved; at 5.5% it is `0.945^10 = 0.57`.
3. `:180` - "the pooled 5.0% is where they meet", inside the very paragraph `d502bfb` rewrote to
   change the pooled figure to 5.5%.
4. `:12` - the section heading, and therefore the ledger's anchor for the round's opening P1, says
   "about one run in twenty" where `:183` says "about one run in eighteen"; `1 / 0.055 = 18.2`.
5. `:517` - "about 1 run in 20 before that (M2, per-execution 5.5% pooled)", the same mismatch inside
   one clause.
6. `PROD-READINESS.md:465-466` - "20 failures in 400 executions of the test - 33 in 600 across three
   independent samples", a sentence that now asserts two different denominators for the same
   measurement and credits three samples to two reviewers.
7. `e2e/smoke/showdown.e2e.ts:73` - the shipped comment still reads "20 of 400 unseeded runs across
   two independent samples (6/200 and 14/200)". `reviews/ARTIFACTS-round3.md:198` shows that same
   line as a `+` line in a published diff, which is exactly the shape R3-11 exists to prevent.

This is the third consecutive stage at which "corrected everywhere" was published and was not true.

## F6 - D1's published `awk` transcript shows output the tree cannot produce

`reviews/ARTIFACTS-round3.md:1234-1235`:

```console
$ awk 'NR==42' .github/workflows/pages.yml
          cp ios/AppStore/privacy.html ios/AppStore/support.html site/
```

Actual, at `d502bfb` (and at `b09470d` - `pages.yml` is unchanged across the range):

```console
$ git diff --quiet b09470d d502bfb -- .github/workflows/pages.yml && echo "pages.yml unchanged in range"
pages.yml unchanged in range
$ awk 'NR==42' .github/workflows/pages.yml
          git diff --exit-code -- ios/Fixtures
$ grep -n "cp ios/AppStore" .github/workflows/pages.yml
53:          cp ios/AppStore/privacy.html ios/AppStore/support.html site/
```

The `cp` is at line 53.
Line 42 is the anti-drift gate that N1 inserted earlier in this same round, which is what pushed the
assemble step down eleven lines.
The conclusion D1 draws ("both files are still copied into the published site") is true; the evidence
offered for it is not a run of the command shown.
The two `grep -rn` lines in the same block are also elided to `...` rather than transcribed.

## F7 - K1 cites the wrong lines of the workflow it is about

`PROD-READINESS.md:505`: "`pages.yml:38-43` assembles the site into `site/`".

```console
$ sed -n '38,43p' .github/workflows/pages.yml
      - run: CI=true npm run test:coverage
      - name: Verify parity fixtures are up to date (anti-drift gate)
        run: |
          npm run export:fixtures
          git diff --exit-code -- ios/Fixtures
      - run: npx playwright install --with-deps chromium
$ sed -n '49,54p' .github/workflows/pages.yml
      - name: Assemble the site (app + legal pages + SPA fallback)
        run: |
          mkdir -p site
          cp -R dist/blackjack-trainer/browser/. site/
          cp ios/AppStore/privacy.html ios/AppStore/support.html site/
          cp site/index.html site/404.html
```

Same off-by-N1 as F6.
Everything else in K1 reproduces exactly - see the confirmations below - so this is a citation
defect, not a false finding.

## F8 - two published command blocks are composed rather than transcribed

**N2**, `reviews/ARTIFACTS-round3.md:1171-1173`:

```console
$ npm ls @angular/forms --all
blackjack-trainer@1.0.0
└── @angular/forms@22.1.0          # nothing else depends on it
```

`npm ls` prints the project path on the first line and never prints a `#` comment.
Real output of the same command shape on this machine:

```console
$ npm ls zod
blackjack-trainer@1.0.0 /Users/arthurzhang/dev/blackjack-trainer
└─┬ @angular/cli@22.1.3
  ├─┬ @modelcontextprotocol/sdk@1.29.0
  │ ├─┬ zod-to-json-schema@3.25.2
  │ │ └── zod@4.4.3 deduped
  │ └── zod@4.4.3 deduped
  └── zod@4.4.3
```

The substance is correct - `@angular/forms` appears exactly once in `b09470d`'s lockfile, as a root
dependency, and nothing peer-depends on it:

```console
$ git show b09470d:package-lock.json | grep -n '"@angular/forms"'
14:        "@angular/forms": "^22.1.0",
```

**N6**, `reviews/ARTIFACTS-round3.md:1151-1153`:

```console
$ # "id": "/blackjack-trainer/"  (absolute, the form the check refuses)
$ npm run build -- --base-href /blackjack-trainer/ && bash -e step05.sh
id is /blackjack-trainer/
CHECK_EXIT=1
```

The mutation is named in a comment but the command that applies it is not shown, and the command that
is shown cannot produce that output on the committed tree - the manifest is copied verbatim from
`public/`, so `--base-href` does not touch it:

```console
$ npm run build -- --base-href /blackjack-trainer/   # committed tree, no edit
$ bash -e step05.sh; echo "CHECK_EXIT=$?"
CHECK_EXIT=0
```

With the declared edit actually applied, the published result reproduces (see confirmations).
Given R3-7 is in this round's own regression table for exactly this failure mode, both blocks should
be transcripts.

## F9 - the stage publishes no gate table of its own, and the ledger asserts four gates it does not show

`PROD-READINESS.md:446`: "lint, build, unit and E2E are green without it".
`reviews/ARTIFACTS-round3.md` has a "Gates after this stage" table for stage 2 (`:943`) and none for
this stage; the N2 section ends at the `ls -d node_modules/@angular/forms` line.
Under this round's own definition (RESOLVED = artifact evidence) that is a bare assertion.

I ran them all against the `d502bfb` export, and they are green:

```console
$ npm run lint; echo "LINT_EXIT=$?"
Checking formatting...
All matched files use Prettier code style!
LINT_EXIT=0

$ npm test; echo "TEST_EXIT=$?"
 Test Files  67 passed (67)
      Tests  1550 passed (1550)
TEST_EXIT=0

$ E2E_SERVER=dist npm run e2e; echo "E2E_EXIT=$?"
  111 passed (38.1s)
E2E_EXIT=0

$ cp -R ios/Fixtures ../Fixtures.orig
$ npm run export:fixtures; echo "EXPORT_EXIT=$?"
EXPORT_EXIT=0
$ diff -r ios/Fixtures ../Fixtures.orig > /dev/null && echo "FIXTURES_UNCHANGED=yes"
FIXTURES_UNCHANGED=yes
```

(`npm run build` exited 0 as part of the E2E dist lane, which rebuilds what it serves, and again in
the F3 mutation run above.)

So the claim is true; it is the evidence that is missing.
Note also that `reviews/ARTIFACTS-round3.md:948` records stage 2's unit gate as "67 files / 1547
passed", which is correct for that stage and is now 1550 - the three N4 tests.

## F10 - the dependency removal moves two packages the artifact does not mention

`reviews/ARTIFACTS-round3.md:1184-1186` publishes only `git diff --stat`, and the prose says "the
lockfile and the manifest are regenerated together".
The 23 lockfile lines are not all `@angular/forms`:

```console
$ git show 9aaac6b -- package-lock.json | grep -B3 '^+      "dev": true,' | grep -E '"resolved"|"dev": true'
       "resolved": "https://registry.npmjs.org/@standard-schema/spec/-/spec-1.1.0.tgz",
+      "dev": true,
       "resolved": "https://registry.npmjs.org/zod/-/zod-4.4.3.tgz",
+      "dev": true,
```

`zod@4.4.3` and `@standard-schema/spec@1.1.0` leave the production dependency tree, because
`@angular/forms` was their only non-dev path.
Harmless here - nothing in this repository runs `npm ci --omit=dev`
(`grep -rn "omit=dev\|--production" .github/ package.json` returns nothing) and they remain installed
via `@angular/cli` - but a dependency change whose published evidence is a line count should say
which lines.

---

## What I tried to falsify and could not

These are the attacks that failed, recorded so the findings above are not read as a verdict on the
whole range.

**The probe method is faithful about markup and stylesheet.** This was the brief's first question and
round 2's repeated failure.
The banner the development build raises carries the component's own compiled stylesheet: extracting
every `.update*[_ngcontent…]` rule from the production bundle and from a development bundle of the
same commit and normalising the encapsulation attribute and whitespace, the only differences across
all twelve rules are trailing semicolons that minification drops.

```console
prod rules: 12   dev rules: 12
DIFF #0
  P .update[_NG]button[_NG]:disabled{cursor:wait;opacity:.65}
  D .update[_NG]button[_NG]:disabled{cursor:wait;opacity:.65;}
```

**The `b09470d` and `d502bfb` measurements at 375x700 reproduce exactly**, including every
`elementFromPoint` attribution in the artifact's two tables:

```console
### before:drill:375x700:offer   updateSpaceVar=""       covered=6
  HitH        top= 543 bottom= 597 covered=true   elementFromPoint=STRONG
  SplitP      top= 605 bottom= 660 covered=true   elementFromPoint=DIV.update__actions
  SurrenderR  top= 605 bottom= 660 covered=true   elementFromPoint=BUTTON.update__reload
  InsuranceI  top= 605 bottom= 660 covered=true   elementFromPoint=BUTTON.update__later
### after:drill:375x700:offer    updateSpaceVar="162px"  covered=0
  HitH        top= 381 bottom= 435 covered=false  elementFromPoint=SPAN.acts__label
  SplitP      top= 443 bottom= 498 covered=false  elementFromPoint=DIV.acts
```

Stand and Double repeat Hit's row and Surrender and Insurance repeat Split's, in both states; the
seventh control is the top bar's exit button, which is never covered.

**The scrolling-screen half reproduces exactly**, including the two figures the artifact gives:

```console
### before:settings:375x700:offer+maxscroll  maxScrollTop=1289  lastControl={"label":"Reset practice data","bottom":651,"coveredCentre":true,"hitTag":"DIV.update__actions"}
### after:settings:375x700:offer+maxscroll   maxScrollTop=1451  lastControl={"label":"Reset practice data","bottom":489,"coveredCentre":false}
```

`1451 - 1289 = 162`, and `538.03 - 489 = 49`.

**"Nothing changes when no banner is up" holds, and it holds in the production bundle**, which is the
claim that governs every ordinary render.
Serving the production build of `d502bfb` and loading the drill with no banner:

```json
{
  "ngDebugApi": "undefined",
  "ngGlobal": "undefined",
  "updateSpaceInline": "0px",
  "rootPaddingBottom": "0px",
  "drillMinHeight": "700px",
  "scrollHeight": 700,
  "clientHeight": 700
}
```

Identical to `b09470d` on every computed value, and it confirms the artifact's and K3's claim that
the production bundle strips the debug API.

**The rotation half works.** Raising the offer at 375x700 and resizing to 800x600 moves the reserve
from `162px` to `91px` and the banner from column to row, so the `@HostListener('window:resize')` is
doing what it says.

**M1's remediation (R3-9) reproduces exactly, and the gate has teeth.** With a realistic
`src/app/doorway.test.ts`:

```console
$ npx tsc --noEmit -p tsconfig.app.json    -> APP=0
$ npx tsc --noEmit -p tsconfig.spec.json   -> SPEC=0
$ # tsconfig.app.json reverted to b09470d's exclude, same file:
APP_EXIT_OLD=2
src/app/doorway.test.ts(1,1): error TS2593: Cannot find name 'describe'. ...
src/app/doorway.test.ts(2,3): error TS2593: Cannot find name 'it'. ...
src/app/doorway.test.ts(3,5): error TS2304: Cannot find name 'expect'.
$ # and a real type error in the same file is caught by the project that now owns it:
SPEC_WITH_ERROR=2
src/app/doorway.test.ts(3,11): error TS2322: Type 'string' is not assignable to type 'number'.
```

`find src -name '*.test.ts'` returns 0 files, exactly as the artifact says, so the change is
preventive rather than currently load-bearing.
The published proof only demonstrates the absence of a false positive; the `TS2322` run above is the
non-vacuity it omits.

**N6's widened gate can fail, in two ways.** Applying the mutation the artifact declares:

```console
$ perl -0pi -e 's|"id": "\./"|"id": "/blackjack-trainer/"|' public/manifest.webmanifest
$ npm run build -- --base-href /blackjack-trainer/ && bash -e step05.sh
id is /blackjack-trainer/
CHECK_EXIT=1
$ # restored
RESTORED_CHECK_EXIT=0
$ # and with b09470d's manifest, which has no id at all:
id is undefined
NO_ID_CHECK_EXIT=1
```

So the widening is not vacuous, and it additionally makes the key mandatory.

**M3's blind-spot measurement reproduces** (`files in report: 74 | under tools/: 0`) - it is only the
four percentages beside it that are stale (F4).

**K1 reproduces exactly**, which is why F7 is only a citation defect:

```console
$ npm run build -- --base-href /blackjack-trainer/ > /dev/null 2>&1
$ mkdir -p site
$ cp -R dist/blackjack-trainer/browser/. site/
$ cp ios/AppStore/privacy.html ios/AppStore/support.html site/
$ cp site/index.html site/404.html
$ npm run lint > k1lint.log 2>&1; echo "LINT_WITH_SITE_EXIT=$?"
LINT_WITH_SITE_EXIT=1
$ grep -c "\[warn\]" k1lint.log
29
$ grep "\[warn\]" k1lint.log | grep -c "^\[warn\] site/"
28
$ rm -rf site
$ npm run lint > k1lint2.log 2>&1; echo "LINT_AFTER_DELETE_EXIT=$?"
LINT_AFTER_DELETE_EXIT=0
```

`site/` is in neither `.gitignore` nor `.prettierignore`.
K2 also checks out: `playwright.config.ts:6` is `const PORT = 4200;`.

**I1's citations all resolve**, all five Swift lines plus `ios/project.yml:17-20`, `:40` and
`LAUNCH-CHECKLIST.md:22` (decision D2, quoted accurately).
`M2`'s `showdown.component.ts:1319-1326` also resolves to the `returnToCounting` guard it describes.

**The ledger's links are intact.** All 11 distinct `ARTIFACTS-round3.md#…` anchors in
`PROD-READINESS.md` resolve against the artifact's own headings, and no `.agents/` or `.codex/` path
is tracked at `d502bfb` - both R3-12 and R3-8 verified.

**M4's four ratios are arithmetically right**: `5000/3080 = 1.62`, `5000/2678 = 1.87`,
`7600/3080 = 2.47`, `7600/2678 = 2.84`, and the comment shipped in `e2e/fixtures/flows.ts:65-68`
quotes the same band as the documents.
The widened budget is a real ceiling, not a removed one, and it can still fail.

**GitHub orchestration remains unverifiable**, as the range says.
Nothing in `pages.yml` or `ci.yml` job ordering can be executed here, and I did not try.

---

## Note on the working tree

While this review was being written, another session modified four files in the working tree without
committing:

```console
$ git status --porcelain
 M PROD-READINESS.md
 M reviews/ARTIFACTS-round3.md
 M src/app/app.spec.ts
 M src/app/app.ts
?? .agents/
?? .codex/
?? reviews/REVIEW-round3-stage3.md
```

Those edits already soften the N4 ledger row along the axis F1 measures, and `src/app/app.ts` is
being changed from `effect` to `afterRenderEffect` with a comment describing exactly the staleness F2
measures - so F2 is being addressed outside this range, and independently of this review.
Nothing here is based on any of it: every quotation, line number and measurement is from `d502bfb`,
taken against a `git archive` export.
Apart from this file, I changed nothing in the repository; the four modified files above are not
mine.
