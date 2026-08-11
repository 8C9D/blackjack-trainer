# REVIEW-pass4 - Pass 4 (failure behaviour), finding W2

Independent adversarial review of `a52847d449497a4acc254b3f275ddacba9321671..ac6a523020c63ce63eaf323118de16d39aedae5d`.
Subject: the single commit `ac6a523`, "tell the trainee when the service worker can no longer serve the app", which the frozen work list assigns to W2 with a terminal state target of RESOLVED (`PROD-READINESS.md:183`).

- Reviewed at `ac6a523020c63ce63eaf323118de16d39aedae5d`, branch `prod-readiness/2026-08-10`.
- Stage diff: six files, +208/-27 (`git show --stat ac6a523`); two source files, two spec files, two records.
- Everything below was re-run or re-read by this reviewer.
  Nothing recorded by the builder is taken on trust: every number in `reviews/ARTIFACTS.md` was reproduced from scratch, including the mutation run, and the one claim in it that cannot be reproduced is reported as a finding.

## VERDICT: PASS-WITH-FINDINGS

The code change is real, minimal, correctly scoped, and it does what the work list asked.
I did not stop at the builder's harness: I induced a genuine `UNRECOVERABLE_STATE` from the shipped `ngsw-worker.js` in a real Chromium against the production bundle, watched the new banner appear, clicked its Reload button, and confirmed the app came back working.
Every gate in `reviews/BASELINE.md` was re-run on both platforms and every one matches baseline or exceeds it.
No feature was smuggled in, no prohibited action was taken, the fix does not relocate a bug, and it hides no error that the app previously surfaced.

It is not a clean pass for six reasons, all P2, none of them a product defect and none of them a reason to revert.
The largest is that the stage's own artifact records a limitation that is not true: it states the state cannot be produced in a real browser by any tooling in this repository, and this repository's own Playwright produces it in about forty seconds.
That claim is now in two committed records (`reviews/ARTIFACTS.md:130-133` and the `PROD-READINESS.md:202` status row) as the reason W2 is only partly verified, and it is the kind of untested negative that a later run would inherit and never re-test.

Why not REJECT: the shipped behaviour survives every check I could put it through, including the end-to-end one the builder said was impossible.
Why not a clean PASS: one recorded limitation is false, one recorded coverage claim is false, one of the two statements the new subscription installs is asserted by no test, and the stage rewrote part of the frozen work list in the same commit that benefits from the rewrite.

---

## Part 1 - The fix, verified against the shipped service worker

### 1.1 The state was induced for real, which the artifact says is impossible

`reviews/ARTIFACTS.md:77-78` and `:130-133` both rest on the premise that an unrecoverable worker cannot be produced here.
It can.
`dist/blackjack-trainer/browser/ngsw-worker.js:582-583` throws `SwUnrecoverableStateError` on exactly one condition - a hashed asset that is absent from the cache and answered `404` by the server - and `:1845-1846` broadcasts it to clients.
That is the real-world redeploy: the old chunk is gone from the origin and gone from the cache.

I reproduced it with nothing but Node and the repository's own Playwright, entirely on `127.0.0.1`, against the production bundle built by `npm run build`:

```
serving /Users/arthurzhang/dev/blackjack-trainer/dist/blackjack-trainer/browser at http://127.0.0.1:4330
SW state after first load: {"reg":"ready","controller":false}
controlled after reload: true
asset cache: ngsw:/:076486ed...:assets:app:cache, entries: 25, victim: /chunk-B1fQDNKP.js
cache entry deleted: true
page fetch of victim: status 404
BANNER: {
 "aria": "App needs reloading",
 "text": "Reload to repair this app Some of its stored files are missing, so parts of it will not
          work. Reloading fetches a fresh copy. Your practice is saved separately and is not
          affected. Reload",
 "buttons": ["Reload"]
}
```

The banner that appears is the one the unit tests describe: recovery copy, `aria-label="App needs reloading"`, one button.
So the changed path is verified end to end against the real worker, not only against a `Subject` in a test bed.

I then tested the promise the new copy makes, because it is the only user-facing claim in the change:

```
AFTER RELOAD: {"url":"/","hasBanner":false,"controlled":true,
 "bodyText":"Blackjack Trainer MONDAY EVENING 0/20 hands today No streak yet Continue - Basic Strategy ..."}
DRILL AFTER RELOAD: {"bodyText":"Basic Strategy 0/20 esc DEALER SHOWS A,A vs 2 Hit H Stand S ...","hasBanner":false}
```

"Reloading fetches a fresh copy" is true: after the user-initiated reload the shell loads, the banner is gone, and a lazy-loaded drill route (the class of file that broke) loads again.
There is no reload loop and no blank page.
The copy's other two claims hold as well: the trigger is literally a missing stored file, and `localStorage` is untouched by the service worker's caches.

### 1.2 The mutation evidence in the artifact is real

`reviews/ARTIFACTS.md:80-96` claims the three behavioural tests fail when only the subscription is deleted.
I deleted exactly the block at `src/app/core/services/app-update.service.ts:40-43`, left the signal and the template branch in place, and ran `npm test`:

```
× asks for a reload, with no way to dismiss it, when the worker breaks
× reports a worker that can no longer serve its version
× will not let a broken worker be dismissed
Test Files  2 failed | 63 passed (65)
exit 1
```

Identical to the recorded artifact, test for test.
The file was restored from a byte copy taken before the mutation and `git diff --exit-code` is clean; the only untracked paths are the pre-existing `.agents/` and `.codex/`.

### 1.3 The rendering, and how I determined it

Two independent methods, because this stage touches user-visible UI.

**Real worker, real browser** (above): the screenshot of the induced state is pixel-identical in layout to the injected one.

**Every state and viewport**: `ng serve` on port 4322 (4200 was left alone), then `window.ng.getComponent(<app-root>)` to drive `recoveryNeeded` / `updateReady` / `updateFailed` and read back real geometry:

| state / viewport                | flex-direction | banner box | buttons                   | overflows viewport |
| ------------------------------- | -------------- | ---------- | ------------------------- | ------------------ |
| update ready, 900 x 700         | row            | 608 x 75   | Reload 82x44, Later 70x44 | no                 |
| recovery, 900 x 700             | row            | 608 x 103  | Reload 82x44              | no                 |
| recovery + failed, 900 x 700    | row            | 608 x 123  | Reload 82x44              | no                 |
| recovery, 375 x 700             | column         | 343 x 180  | Reload 82x44              | no                 |
| recovery, 320 x 640             | column         | 288 x 180  | Reload 82x44              | no                 |
| recovery, 900 x 700, dark theme | row            | 608 x 103  | Reload 82x44              | no                 |

The recovery banner is the same card as the update banner in every respect that the design owns: same surface, hairline, 1rem radius, shadow, accent Reload button, same 44px minimum tap target, same column stack under the 34rem breakpoint, same behaviour in dark theme.
The only visual differences are the ones the diff makes on purpose: three lines of copy instead of one, and no second button.
`document.documentElement.scrollWidth === clientWidth` at 320px, so nothing overflows.
The error line still renders below the copy in `var(--bad)` when a reload fails in the recovery state, which no test covers but which I checked directly.

I consider the rendering correct and consistent with the existing design.

### 1.4 Scope and prohibited actions

No endpoint, screen, route, command, flag, table, column, config key or persisted key is added.
`git diff --name-status a52847d..ac6a523` is six files: `PROD-READINESS.md`, `reviews/ARTIFACTS.md`, `src/app/app.ts`, `src/app/app.spec.ts`, `src/app/core/services/app-update.service.ts`, `src/app/core/services/app-update.service.spec.ts`.
`git diff a52847d..ac6a523 -- package.json package-lock.json .github ios angular.json vitest.config.ts playwright.config.ts tsconfig*.json ngsw-config.json public` is empty, so no dependency, workflow, deploy, build or test configuration moved.
No push (`origin/main` is still `796a4e4`, the branch has no upstream), no rebase, amend, force update or tag change (`git reflog` shows ten plain entries and one checkout), no file deleted, no credential touched.
Every probe I ran was local: `127.0.0.1:4330` for the induced-worker run, `localhost:4322` for the render checks.

---

## Part 2 - Review 0's conditions on W2, checked one at a time

`reviews/REVIEW-0.md:51-55` ruled the fix in scope and attached five named conditions.
The ledger repeats them at `PROD-READINESS.md:97`.

1. **"Reuse the existing banner and its existing reload/dismiss controls"** - partly met.
   The banner is reused exactly: `src/app/app.ts:31-74` keeps `aside.update`, `.update__copy`, `.update__actions`, `.update__reload` and adds no CSS (`git diff` does not touch `src/app/app.scss`).
   The reload control is reused.
   The dismiss control is deliberately not rendered in the recovery state (`app.ts:62`).
   I accept the substance - a fault banner that can be dismissed leaves a trainee with a broken app and no explanation, and the service comment at `app-update.service.ts:46-48` says exactly that - but it is not what the condition says, and the consequence was never measured.
   See F4-2.
2. **"Keep the reload user-initiated"** - met.
   Nothing calls `reload()` or `activateUpdate()` automatically; the only caller is the button's `(click)`.
   Confirmed in the real induction: the banner sat there until I clicked it.
3. **"Add no new injectable and no new persisted key"** - met.
   The diff adds one `signal(false)` to the existing root-provided `AppUpdateService`; `grep` for `localStorage` in the diff returns nothing, and `writeJson`/storage is untouched.
4. **"Add no new component, config key"** - met.
   No new file exists anywhere in the diff; both source files already existed.
5. **"Add a unit test that pushes an `UnrecoverableStateEvent` through the service"** - met.
   `app-update.service.spec.ts:37-44` builds the event from the real exported type, whose shape at `node_modules/@angular/service-worker/types/service-worker.d.ts:99-102` is `{type: 'UNRECOVERABLE_STATE', reason: string}`, and `:447` is the member the ledger cites, at the exact line cited.
   Five service tests and one shell test push it.

"If the fix grows a new component or a new user setting it has become a feature": it grew neither.

---

## Part 3 - Findings

All six are P2.
I found no P0 and no P1.
Severity is held down deliberately: no data is lost, nothing is exposed, no failure is silent to the user (the whole point of the change is that one now is not), and the deploy is unaffected.

### F4-1 - the artifact and the ledger record a limitation that is false

**P2 | evidence: `reviews/ARTIFACTS.md:130-133` states "the state cannot be produced in a real browser by any tooling in this repository, so it is UNVERIFIED end-to-end against an actual damaged service worker", and `PROD-READINESS.md:202` carries the same claim into the status table as "Partly UNVERIFIED: no tooling here can induce a genuinely damaged worker"; the transcript in Part 1.1 induces it with `node` plus `node_modules/playwright`, both already in this repository, and `dist/.../ngsw-worker.js:582` is the single documented trigger | why the builder missed it: the limitation was inferred from the unit-test harness (a `Subject` cannot break a worker) and generalised to all tooling without being tested; a negative claim is the one kind of claim that no green run can support, and nothing in the repository checks prose.**

The practical cost is not today's correctness, which is fine, but tomorrow's: this sentence is the reason a future run would not attempt the end-to-end check, and it is now recorded twice.
The recipe is three steps and needs no network: serve `dist/blackjack-trainer/browser`, evict one hashed asset from the `ngsw:...:assets:app:cache` and make the server answer `404` for it, then fetch it from the page.

This is the stage's own record, not a pre-existing finding, so it belongs inside this stage.
It is closed by correcting both sentences, not by any code change.

### F4-2 - dropping "Later" leaves the drill's controls unreachable with no way out

**P2 | evidence: measured on `/drill/basic-strategy` at 375x700 with the banner shown - `document.documentElement.scrollHeight === clientHeight === 700` (the page does not scroll) and `elementFromPoint` at the centre of the Hit button returns a `SPAN` inside `.update`, not the button; the six action controls Hit/Stand/Double/Split/Surrender/Insurance all intersect the banner box in both states (recovery banner 180px tall, update banner 146px); `src/app/app.ts:62` removes the only control that clears the banner in the recovery state | why the builder missed it: the rendering was checked as a banner in isolation (`reviews/ARTIFACTS.md:121-128` reasons only about `.update__actions` laying out one child) and never on top of a screen the trainee is using, so a change in what the banner blocks was never in view.**

The overlap itself is pre-existing and is not this stage's doing - the update-ready banner covers the same six controls.
What this stage changes is that in the recovery state there is no "Later" to press, so on a phone the trainee cannot answer the hand and cannot get the banner out of the way; the only exit is the reload.
I am rating it P2 and not higher because the reload is verified in Part 1.1 to actually fix the app, no practice is lost by taking it, and the state only arises when the app is genuinely damaged.
I am not asking for the dismiss button back: hiding a fault is worse, and Review 0's other conditions would fight it.
The honest resolution is to record the consequence next to the decision, so that the "no way to dismiss" choice is documented as a trade with a known cost rather than as a free improvement.

This is a consequence of this stage's own change, so it belongs inside this stage.
The pre-existing half of it goes to NEXT ROUND as N4 below.

### F4-3 - one of the two lines the new subscription installs is asserted by nothing

**P2 | evidence: `src/app/core/services/app-update.service.ts:41` (`this.updateFailed.set(false)` inside the `unrecoverable` handler); with that single line deleted and everything else intact, `npm test` reports `Test Files 65 passed (65)`, `Tests 1532 passed (1532)`, exit 0 | why the builder missed it: the mutation experiment was run at the granularity of the whole subscription block, which fails loudly, so the weaker line inside it was never probed; line coverage cannot see it either, because the line executes on every unrecoverable event and is simply never asserted.**

The line is also questionable on its own terms.
`updateFailed` means "your last reload attempt failed", and the recovery state is the one state where reload is the only action the trainee has.
Clearing that flag on an incoming unrecoverable event removes the "Could not reload. Please try again." line from a banner whose only button just failed.
The interleaving is rare (the worker would have to announce the fault immediately after a reload throw), which is why this is P2 and not P1, and it is the reason I am reporting it as an unasserted line rather than as a defect: I cannot show a user reaching it, only that nothing in the suite pins the behaviour either way.

Introduced by this stage's own change, so it belongs inside this stage.

### F4-4 - the artifact's rendering evidence claims a test assertion that does not exist

**P2 | evidence: `reviews/ARTIFACTS.md:123-125` says the recovery state reuses "`.update`, `.update__copy`, `.update__reload` - and the shell test asserts each of them"; the new shell test at `src/app/app.spec.ts:72-89` never queries `.update__copy`, and the only assertion on that class in the file is `app.spec.ts:63`, inside the pre-existing update-ready test | why the builder missed it: the sentence describes what the DOM reuses and then asserts test coverage of it from memory of the neighbouring test, in the same paragraph, without re-reading the spec.**

Nothing is actually uncovered, which is why this is P2 and not higher: `.update__copy` sits on the shared wrapper at `app.ts:38`, outside both template branches, so the existing update-ready test does exercise it.
The claim as written is still false about the test the stage added.

A second, smaller inaccuracy in the same paragraph: `reviews/ARTIFACTS.md:127` says "`src/app/app.scss:87` styles buttons by class", but line 87 is `.update button`, a descendant element selector.
The line number is right and the conclusion it supports (no positional or child-count selector, so one button lays out under the existing rules) is right, which I verified by measurement rather than by reading, so I am not raising that half as a separate finding.

This is the stage's own record, so it belongs inside this stage.

### F4-5 - the new fault state announces itself politely, against this app's own precedent for faults

**P2 | evidence: `src/app/app.ts:38` keeps `role="status" aria-live="polite"` for the recovery copy, while the app's other "this is broken" surface, the storage banner at `src/app/app.ts:17-26`, uses `role="alert"`; the stage's own template comment at `app.ts:28-30` and its service comment at `app-update.service.ts:46-48` both classify this state as a fault rather than an offer, which is the distinction the two roles encode | why the builder missed it: the shared `.update__copy` element was reused wholesale under Review 0's "reuse the existing banner" condition, so the one attribute on it that is state-dependent was never revisited.**

Two effects, both modest.
A polite live region yields to whatever the screen reader is already saying, which is the wrong priority for a broken app.
More to the point, the region is inserted into the DOM at the same moment as its content, and live regions that appear whole are frequently not announced at all, so a screen-reader user may get nothing.
Both are equally true of the pre-existing update-ready state, which is why I assign P2 and why I would accept either outcome: a conditional `role` confined to the recovery branch is a two-token change inside this stage's own template, and recording it for a later run is also defensible.
I flag it because the stage argued in its own comments that this state is categorically different from an update, then rendered it with the update's announcement semantics.

### F4-6 - the frozen work list was reordered in the commit that benefits from the reorder

**P2 | evidence: `PROD-READINESS.md:174-178` replaces "Ordering within the P1 band is by blast radius, smallest first, which is also the pass order below" with a new paragraph ruling that the blast-radius rule governs trimming only, and the table at `:180-187` moves W2 from order 4 to order 2 and R0-4 from 2 to 4; both edits are in `ac6a523`, the commit that executes W2 | why the builder missed it: the ledger section is titled "the frozen work list", and an edit that makes the current stage the next one in the table is exactly the edit whose author cannot also be its reviewer.**

I checked whether the substance is defensible, and it is.
The old sentence was self-contradictory: it claimed the blast-radius order "is also the pass order below" while the pass column read 2, 7, 6, 4.
No finding was added, removed, re-severitied or re-targeted; all six rows and all six terminal-state targets are unchanged; and W2 is assigned to pass 4 in both versions of the table, so executing it in this stage is correct under either reading.
I cannot verify the trimming rule's original wording, because the run's own prompt is not a committed artifact and this review only sees the tree.
So the finding is not that the run did the wrong work - it did the right work - but that a document declared frozen was rewritten without an independent record, and this review is that record.

---

## Part 4 - The explicit checks this review was required to make

- **Fabricated or unreproducible findings:** one, F4-1, and it is a fabricated _limitation_ rather than a fabricated finding: the artifact asserts something is impossible that took me one script to do.
  Everything else in `reviews/ARTIFACTS.md` for W2 reproduces exactly - the mutation output test-for-test, `1532 passed`, and all four coverage numbers to the decimal.
- **Evidence citations that do not say what they are claimed to say:** two, both in F4-4.
  I re-derived every line number cited in this review against the files at this commit, including the two in `node_modules`, rather than reusing any from the ledger or from earlier reviews.
  The ledger's own W2 citations (`app-update.service.ts:23-32`, `service-worker.d.ts:447`, `app.ts:28-56`) still point where they claim.
- **Severity inflation:** none by the stage; it asserts no severities.
  My own six findings are all P2, and where P1 was arguable (F4-1, since the run's own rule at `PROD-READINESS.md:195` makes an unverified fix non-RESOLVED) I took the lower grade and said why: the fix is verified, by me, more thoroughly than the artifact claims is possible, so the defect is in the record and not in the behaviour.
- **Severity deflation:** one to watch, disclosed rather than hidden.
  The ledger holds W2 at P1 rather than P0 "silent failure" on Review 0's reasoning that the user does see a broken app.
  My induction supports that: the app before the fix was visibly degraded, not silently wrong, and no data was at risk.
  P1 upheld.
- **Features smuggled in under the no-features rule:** none.
  The diff adds one signal to an existing service and one branch to an existing banner, with no new file, route, flag, config key, persisted key or dependency.
  The user-visible copy is the thing Review 0 explicitly ruled in scope at `reviews/REVIEW-0.md:51-55`, under conditions checked one by one in Part 2.
- **Prohibited actions taken:** none.
  Verified: no push, no upstream, no rebase/amend/force/tag change in the reflog, no workflow or deploy file in the diff, no dependency change, no file deleted, no credential touched, and every host I contacted was `127.0.0.1` or `localhost`.
- **Fixes that relocated a bug rather than removed it:** no.
  The event is handled at the only place it can arrive, and the remedy the banner offers was verified to actually repair the app rather than to move the failure (Part 1.1).
  I specifically checked for the relocation this change could plausibly have made - a reload loop, since an unrecoverable worker still controls the page - and the reloaded app came up clean, uncontrolled by the broken version, with the banner gone and lazy routes loading.
- **Error handling that hides errors:** one candidate, F4-3, and it is thin.
  `app-update.service.ts:41` clears the "reload failed" flag when the fault arrives; nothing else in the diff swallows anything, no `catch` was added, and the pre-existing `try`/`catch` in `reload()` is untouched.
- **Verification that does not actually exercise the changed path:** the unit tests do exercise it, which mutation A proves.
  The gap is the opposite of the pattern this run keeps hitting: the changed path is more verifiable than the record says (F4-1).
  One line inside it is executed but unasserted (F4-3).
- **Anything marked resolved without an artifact:** no.
  W2 is `RESOLVED` at `PROD-READINESS.md:202` and its artifact exists at `reviews/ARTIFACTS.md:75-133`; B1's artifact and status row, which REVIEW-pass2 required, are present at `:10-71` and `:199`, and the comment correction that review asked for is in place at `tools/serve-dist.mjs:42-48`.
  N3 is recorded in NEXT ROUND at `PROD-READINESS.md:166`.

---

## Part 5 - Gates re-run by this reviewer at `ac6a523`

Every command was run with the tool sandbox disabled, as `reviews/BASELINE.md:14-20` requires, and `xcodebuild`'s status is read from the `** TEST SUCCEEDED **` marker per `reviews/BASELINE.md:223-227`.

| Gate               | Result at `ac6a523`                                                       | vs BASELINE           |
| ------------------ | ------------------------------------------------------------------------- | --------------------- |
| `npm run lint`     | exit 0, "All matched files use Prettier code style!"                      | same                  |
| `npm run build`    | exit 0, one budget warning on `chart-page.component.scss`, 368 bytes over | same                  |
| `npm test`         | 65 files, 1532 tests, all passed                                          | +6 tests, none failed |
| `test:coverage`    | 96.11 / 93.23 / 93.28 / 97.97, all four floors met                        | all four up           |
| E2E (`dist`)       | 111 passed, port 4200 confirmed free with `lsof` beforehand               | same                  |
| Parity anti-drift  | `EXPORT_EXIT=0`, `FIXTURE_DIFF_EXIT=0`                                    | no drift              |
| `swiftformat`      | exit 0, 0/105 files require formatting                                    | same                  |
| `swiftlint`        | exit 0, no output                                                         | same                  |
| `xcodebuild` tests | `** TEST SUCCEEDED **`, 335 tests in 38 suites                            | same                  |

Nothing is worse than baseline on either platform.
The coverage figures match the artifact's to the last digit, which is worth stating because they are the numbers a reader is most likely to assume were copied forward rather than measured.
The iOS gates cannot be affected by a change to four TypeScript files, but they were run rather than assumed.

`lsof -nP -iTCP:4200 -sTCP:LISTEN` was empty immediately before the E2E run, so R0-4's silent-server-reuse hazard did not apply and the suite genuinely ran against `tools/serve-dist.mjs`.
The `ng serve` I used for the render checks was bound to port 4322 for the same reason, and was never running during the E2E run.

Working tree after everything above: `git status --porcelain` shows only the two pre-existing untracked directories `.agents/` and `.codex/`, plus this file.
`git diff --exit-code` is clean, so the one file I mutated for Part 1.2 is byte-restored.
Nothing was committed.
All servers, probe scripts, mutation backups and screenshots live in the scratchpad outside the repository.

---

## Part 6 - For NEXT ROUND, not this run's work list

**N4 | P2 | the fixed bottom banner covers the drill's action controls, in both banner states.**
Measured at 375x700 on `/drill/basic-strategy`: the page does not scroll (`scrollHeight === clientHeight === 700`) and all six answer controls intersect the banner, with `elementFromPoint` at the Hit button's centre returning banner content in both the update-ready (146px) and recovery (180px) states.
This is pre-existing - the update-ready banner predates this run and behaves the same way - and it is not a regression from this stage's changes, so it does not enter the frozen work list.
It is recorded here because this stage is what made it visible and because the stage-specific half of it, the missing escape hatch, is F4-2.

---

## Part 7 - What must happen before this stage can be called closed

1. Correct the false limitation in both places it is recorded (`reviews/ARTIFACTS.md:130-133` and the `PROD-READINESS.md:202` status row).
   The honest replacement is the induction recipe in Part 1.1, which turns "UNVERIFIED end-to-end" into verified, and W2's status from partly-qualified into plain RESOLVED.
2. Correct the coverage claim at `reviews/ARTIFACTS.md:123-125`.
   The new shell test does not assert `.update__copy`; the pre-existing one does.
3. Record the cost of dropping "Later" (F4-2) beside the decision, and decide F4-3 and F4-5 explicitly rather than by omission: either assert `app-update.service.ts:41` in a test or drop the line, and either give the recovery branch `role="alert"` or record why it keeps `role="status"`.
4. Add a line to the ledger noting that the frozen work list's ordering was rewritten in `ac6a523` and that this review accepted the substance (F4-6).
5. Nothing in the shipped behaviour needs to change.
   The fix is correct, it renders correctly in both themes at every viewport I tried, and the remedy it offers demonstrably works against a genuinely damaged service worker.
