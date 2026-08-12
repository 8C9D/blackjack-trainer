# REVIEW-pass6 - Pass 6 (BUILD AND DEPLOY)

<!-- records: historical-file - a closed round's record. Its figures and transcripts were true at the commits that produced them; this round does not rewrite them, so the figures and transcript rules do not bind here. Citations are still resolved and bounds-checked. -->

Independent adversarial review of `5c9ca364c07aadb73035eec67cac98d4f928a5d9..6131b07d972889195cad015dd439b6ae348f1024`.
Subject: the single commit `6131b07` "point the installed app at itself rather than the site root", which claims finding **W1** RESOLVED.

- Reviewed at `6131b07d972889195cad015dd439b6ae348f1024`, branch `prod-readiness/2026-08-10`.
- Stage diff: 4 files, +77/-3 - `public/manifest.webmanifest` (2 values), `e2e/smoke/navigation.e2e.ts` (+9), `reviews/ARTIFACTS.md` (+65), `PROD-READINESS.md` (1 status row).
- Every transcript below was produced by this reviewer. Nothing in `reviews/ARTIFACTS.md` was accepted as evidence; each load-bearing claim was reproduced from scratch, including the "before" half, which was reconstructed from `git show 5c9ca36:public/manifest.webmanifest` rather than from the builder's description of it.

## VERDICT: PASS-WITH-FINDINGS

The fix is real, minimal, and correct in the configuration it exists for, and I could not break it.
Chrome itself resolves the installed start URL to the app under the Pages base href after the change and to the origin root before it; the root-hosted configuration is bit-for-bit unaffected, including the browser-computed application id; the service worker's registration scope under the Pages layout now equals the manifest scope; and the new E2E assertion demonstrably fails when the old manifest is served, so the gate is not vacuous.
All nine gates in `reviews/BASELINE.md` are green at this commit, three of them (coverage, parity anti-drift, iOS) beyond anything the stage claimed.
No feature was smuggled in, no prohibited action was taken, and the one thing marked RESOLVED has an artifact that reproduces.

It is not a clean pass for four reasons, all P2 and all about the record rather than the code.
The stage changes the PWA's computed application identity on the only deployment it targets and says nothing about it (F6-1).
Its green claim covers four of BASELINE's nine gates while asserting the stage is safe (F6-2).
One sentence of the artifact asserts more than any local source establishes (F6-3).
And the permanent gate this stage installed is a string comparison, because no gate in this repository ever builds or serves the base-href bundle at all (F6-4, pre-existing, NEXT ROUND).

Nothing in the shipped behaviour needs to change.

---

## Part 1 - The fix, re-verified against a real Pages build

### 1.1 The build is what the workflow builds, and the manifest is not rewritten

`.github/workflows/pages.yml:37` is `- run: npm run build -- --base-href /blackjack-trainer/`.
Built that way into a scratch directory:

```
=== base href ===
<base href="/blackjack-trainer/"
=== manifest link ===
<link rel="manifest" href="manifest.webmanifest">
=== diff vs public ===
BYTE-IDENTICAL to public/
```

So the index is rewritten and the manifest is not, exactly as `PROD-READINESS.md:96` claims.
The manifest link is relative and therefore resolves against `<base>`, which is what makes `./` land on the app rather than on whatever route the user happened to be on.

### 1.2 Chrome's own resolution, before and after

Both trees are the same base-href build; the only difference is the manifest, taken from `5c9ca36` for "before" and from `6131b07` for "after".
Each is served on 127.0.0.1 under `/blackjack-trainer/`, loaded in Chromium, and interrogated with CDP `Page.getAppManifest`.

```
===== BEFORE (parent-commit manifest, Pages base href) =====
{
  "page": "http://127.0.0.1:4340/blackjack-trainer/",
  "manifestUrl": "http://127.0.0.1:4340/blackjack-trainer/manifest.webmanifest",
  "rawStartUrl": "/",
  "rawScope": "/",
  "browserStartUrl": "http://127.0.0.1:4340/",
  "browserScope": "http://127.0.0.1:4340/",
  "browserId": "http://127.0.0.1:4340/",
  "errors": []
}
===== AFTER (this commit's manifest, Pages base href) =====
{
  "page": "http://127.0.0.1:4341/blackjack-trainer/",
  "manifestUrl": "http://127.0.0.1:4341/blackjack-trainer/manifest.webmanifest",
  "rawStartUrl": "./",
  "rawScope": "./",
  "browserStartUrl": "http://127.0.0.1:4341/blackjack-trainer/",
  "browserScope": "http://127.0.0.1:4341/blackjack-trainer/",
  "browserId": "http://127.0.0.1:4341/blackjack-trainer/",
  "errors": []
}
```

The artifact at `reviews/ARTIFACTS.md:196-221` reproduces exactly, down to the port numbers I happened to reuse.
`errors: []` in both runs, so the manifest was installable before and after; the defect was never a parse failure, only a wrong destination.

### 1.3 The install entry point does not matter - a configuration the artifact did not exercise

The artifact only ever installs from the app root.
The realistic install happens wherever the trainee is standing, so I repeated it from a deep route served through the SPA fallback that `pages.yml:43` creates:

```
===== AFTER: installed from a deep route under the Pages prefix =====
{
  "visited": "http://127.0.0.1:4350/blackjack-trainer/drill/basic-strategy",
  "baseURI": "http://127.0.0.1:4350/blackjack-trainer/",
  "manifestUrl": "http://127.0.0.1:4350/blackjack-trainer/manifest.webmanifest",
  "rawStartUrl": "./",
  "browserStartUrl": "http://127.0.0.1:4350/blackjack-trainer/",
  "browserScope": "http://127.0.0.1:4350/blackjack-trainer/",
  "errors": []
}
===== BEFORE: same deep route =====
{
  "visited": "http://127.0.0.1:4351/blackjack-trainer/drill/basic-strategy",
  "baseURI": "http://127.0.0.1:4351/blackjack-trainer/",
  "manifestUrl": "http://127.0.0.1:4351/blackjack-trainer/manifest.webmanifest",
  "rawStartUrl": "/",
  "browserStartUrl": "http://127.0.0.1:4351/",
  "browserScope": "http://127.0.0.1:4351/",
  "errors": []
}
```

`./` is anchored to the manifest URL, and the manifest URL is anchored to `<base href>`, so a deep-route install still starts the app at its own root.
This was the most plausible way for a relative `start_url` to be subtly wrong, and it is not.

### 1.4 The root-hosted configuration is untouched

Default `npm run build`, served at the origin root, same interrogation:

```
===== ROOT DEPLOY, BEFORE =====
  "rawStartUrl": "/",  "browserStartUrl": "http://127.0.0.1:4342/",  "browserId": "http://127.0.0.1:4342/"
===== ROOT DEPLOY, AFTER =====
  "rawStartUrl": "./", "browserStartUrl": "http://127.0.0.1:4343/",  "browserId": "http://127.0.0.1:4343/"
```

Identical resolved values, and identical computed id.
That covers `ng serve`, `tools/serve-dist.mjs` (the E2E and CI server), and any future root-hosted deploy.

### 1.5 The fix did not relocate the bug, and the built output has no second copy of it

Two consumers could have made the change hollow, and neither does.

The generated `ngsw.json` under the base-href build carries the prefix on every URL it owns, so the service worker is not anchored to the origin root:

```
index: /blackjack-trainer/index.html
app group: /blackjack-trainer/favicon.ico, /blackjack-trainer/index.html,
           /blackjack-trainer/main-URJSXYEM.js, /blackjack-trainer/manifest.webmanifest,
           /blackjack-trainer/styles-KH7BOXCE.css
cards:     /blackjack-trainer/cards/10C.svg ...
assets:    /blackjack-trainer/icons/icon-192.png ...
```

And booting the real bundle under the Pages layout shows the app runs there and the worker's scope now equals the manifest's:

```
{
  "heading": "Blackjack Trainer",
  "swRegistration": {
    "scope": "http://127.0.0.1:4344/blackjack-trainer/",
    "script": "http://127.0.0.1:4344/blackjack-trainer/ngsw-worker.js"
  },
  "failedOr4xx": []
}
```

Before the change the manifest claimed a scope (`/`) wider than the worker's; after it, they agree.
Nothing else in the shipped surface is anchored to the origin root: `git grep -n 'href="/\|src="/\|action="/' -- src/ ios/AppStore/ public/` returns only `src/index.html:6`, the `<base>` tag the build rewrites, and every in-app navigation goes through the Angular router, which is base-href aware.
`git grep -ln "WKWebView\|SFSafariViewController" -- ios/` is empty, so the iOS app is not a consumer of this manifest.

---

## Part 2 - Review 0's condition on W1, checked individually

Review 0 attached exactly one condition (`reviews/REVIEW-0.md:42-43`, restated at `PROD-READINESS.md:96`): the E2E test must assert the **raw** `start_url`/`scope` strings, not a resolved URL, because under `serve-dist` the base href is `/` and a resolved assertion would pass either way.

**Condition met, literally.**
`e2e/smoke/navigation.e2e.ts:126-127` asserts `manifest.start_url` and `manifest.scope` against `'./'`, on the value read from the served bundle, with no resolution step.

**Condition met, non-vacuously.**
I replaced only the manifest inside `dist/blackjack-trainer/browser` (gitignored; `git check-ignore -v` confirms `/dist`) with the parent commit's, left everything else alone, and ran the single test through the real `E2E_SERVER=dist` harness:

```
  ✘  1 [chromium] › e2e/smoke/navigation.e2e.ts:114:7 › the PWA manifest is linked and carries installable icons
    Expected: "./"
    Received: "/"
      > 126 |     expect(manifest.start_url).toBe('./');
  1 failed
E2E_EXIT=1
```

The artifact's version of this transcript (`reviews/ARTIFACTS.md:236-248`) reports `1 failed / 12 passed`, which matches the 13 tests in that file (`grep -c "^  test(" e2e/smoke/navigation.e2e.ts` → 13).
The quoted line number 126 is the line the assertion actually occupies.
Restored afterwards, and the full suite is green below.

---

## Part 3 - Findings

All four are P2. None of them requires a code change. Each says explicitly whether it is a regression from this run.

### F6-1 - the fix changes the app's identity on the Pages deploy, and nothing records it

**Severity P2** (see the reasoning at the end of this entry for why not P1).
**This stage's own change**, so it belongs to this stage - but the remedy is documentation, not code.

Evidence, from the same CDP runs as Part 1.2 - Chrome's computed application id, which `public/manifest.webmanifest` does not declare and which therefore falls back to `start_url`:

```
BEFORE  "browserId": "http://127.0.0.1:4340/"
AFTER   "browserId": "http://127.0.0.1:4341/blackjack-trainer/"
```

On the root-hosted configuration the id is unchanged (Part 1.4), so this is specific to the deployment the fix exists for.

`reviews/ARTIFACTS.md:223-234` makes the stage's safety argument under the heading "The root deploy is unaffected", and closes it: "Identical to the old behaviour, which is why the change is safe for local dev, the `serve-dist` E2E server, and any future root-hosted deploy."
That sentence enumerates every configuration except `/blackjack-trainer/`, which is the one the change was made for and the one where the identity is not preserved.

What follows from a changed id is standard PWA identity behaviour rather than something this harness can measure - installing a progressive web app is not scriptable here, and I am labelling the consequence as inference, not as reproduced fact: a copy installed from a live Pages site before this commit keeps the old identity, is not updated by the new manifest, and would go on launching the origin root until the user uninstalls and reinstalls.
The migration that preserves identity is an explicit `"id": "/"` alongside `"start_url": "./"`, which is a new manifest member and therefore arguably a new config key under this run's scope rule - which is precisely why the honest move is to record the trade rather than to make it silently.

Why P2 and not P1: `LAUNCH-CHECKLIST.md:59` still lists O4, "turn on Pages", as an open owner action, and `PROD-READINESS.md:129` (assumption 3) concedes the site could not be confirmed live, so there is no evidence that any installed copy exists.
No data is lost, and the pre-fix state of any such copy was already broken, so nothing working is being taken away.
Ambiguity resolved downward, per the run's own rule.

Why the builder missed it: the safety analysis was framed as "does the root deploy still work", and by that framing the answer is yes.
Application identity is a property of the manifest that only becomes visible when you ask the browser for it - and the builder did ask the browser, via the very same `Page.getAppManifest` call, whose response carries the `id` field. The evidence was in the tool output and was not read.

### F6-2 - the stage's green claim covers four of BASELINE's nine gates

**Severity P2. Not a regression** - every gate is in fact green; this is a completeness gap in the record.

`reviews/ARTIFACTS.md:251-252`: "Gates with the fix: lint 0, build 0 (same single budget warning), 1533 unit tests, E2E 111 passed with port 4200 confirmed free first."

`reviews/BASELINE.md` lists nine gates and defines "not worse than baseline" over all of them, including a coverage floor and a fixture anti-drift check that this run's own CI enforces.
The claim evidences four.
Unstated and unclaimed: `npm run test:coverage`, the parity fixture anti-drift gate, `swiftformat --lint`, `swiftlint`, and `xcodebuild build test`.

I ran all five. All are green (Part 5), so the omission cost nothing this time.
It is still a gap, because the coverage gate is the one BASELINE flags as having the narrowest margin (lines 97.96% against a floor of 96), and "the diff cannot have moved it" is a judgement the record should show being made rather than skip.

Why the builder missed it: the diff touches no `src` file and no iOS file, so those gates felt self-evidently unaffected, and BASELINE's rule reads as a table rather than as a checklist.

### F6-3 - one artifact sentence asserts more than any local source establishes

**Severity P2. Not a regression from this stage** - the wording is inherited from the frozen work list at `PROD-READINESS.md:96`. **NEXT ROUND / record-only.**

`reviews/ARTIFACTS.md:219-221`: "On the live host that 'site root' is `https://8c9d.github.io/`, a different project on the shared origin - so before this change, launching the installed app opened someone else's site."

The cited support for the shared-origin fact is `src/app/core/models/backup.model.ts:10-13`, which I read at this commit. It says the app "ships on a shared \*.github.io origin where another app's keys can carry the same prefix".
That establishes the _origin_ is shared across the owner's Pages projects. It does not establish that anything is published at the origin root `/`, which on a `<owner>.github.io` domain is a separate user-site repository that may or may not exist.
`PROD-READINESS.md:129` independently concedes the site's liveness could not be confirmed.

The verified claim is "the installed app did not open this app", which I reproduced and which is fully sufficient for W1 at P1.
"Opened someone else's site" is one unverified possibility among two, the other being a 404.
Substance and severity of W1 are unaffected; only the sharpness of the sentence is.

Why the builder missed it: the phrasing was carried forward verbatim from a row Review 0 had already confirmed, and confirmation of the finding was treated as confirmation of every clause in its prose.

### F6-4 - no gate in this repository ever builds or serves the base-href bundle

**Severity P2. Pre-existing, not a regression from this run's changes. NEXT ROUND.**

`playwright.config.ts:24-39` serves the suite at the origin root in both modes (`npm start` or `node tools/serve-dist.mjs`, `baseURL` = `http://127.0.0.1:4200`).
`.github/workflows/ci.yml` never passes `--base-href`; `.github/workflows/pages.yml:37` builds it and runs no test against it.
So the permanent protection this stage installed for W1 is a string comparison, and the configuration W1 is about is exercised nowhere but in this stage's artifact and in this review.

That is exactly the form Review 0 required, and the stage complied, so this is not a stage defect.
It is worth recording because the string check does not cover every way the fix can be undone: adding an explicit `"id": "/"`, or changing the base href in `pages.yml` without touching the manifest, both leave `start_url === './'` true and the installed app wrong.

This is the same shape as `reviews/REVIEW-pass2.md` F2-3 and `reviews/REVIEW-0.md` R0-4, and it should be considered alongside them rather than separately.

---

## Part 4 - The explicit checks this review was required to make

**Fabricated or unreproducible findings.** None. W1 reproduces in both directions, in the deployment it names, with the browser it names.

**Evidence citations that do not say what they are claimed to say.** One, F6-3. All other citations check out: `pages.yml:37` is the base-href build line; `pages.yml:41-42` is the assembly step; `e2e/smoke/navigation.e2e.ts:126` is the quoted assertion; `reviews/ARTIFACTS.md:243-247`'s failing transcript matches the failure I reproduced and the 13-test file it ran in.

**A citation that deliberately describes the pre-fix state - checked, not a finding.** `PROD-READINESS.md:96` still reads "`public/manifest.webmanifest:5-6` sets `"start_url": "/"`", which those lines no longer say. This is the run's convention for a frozen work list (B1's row at `PROD-READINESS.md:98` has the identical property: `tools/serve-dist.mjs:32` is no longer outside a `try`), and the Status table carries the resolution. Consistent, and not this stage's invention.

**Severity inflation or deflation.** None. W1 stays P1 and the stage did not touch its severity. P1 is right: the PWA install path fails 100% of the time on the target deployment, it is neither data loss nor a deploy blocker, and the user does see something, so the P0 "silent failure" bar is not met.

**Features smuggled in under the no-features rule.** None. The diff changes the values of two existing manifest members - no new member, key, route, screen, flag, column or endpoint - and adds two assertions to an existing test. Assumption 6 (`PROD-READINESS.md:132`), that the manifest is an application asset rather than deploy configuration, holds: I confirmed the file is copied verbatim into the bundle and served to the browser, and `pages.yml` is untouched.

**Prohibited actions.** None.
`git diff 5c9ca36..6131b07 --stat` names four files, none of them a workflow, deploy, infrastructure, dependency or lockfile.
`git branch -vv` shows `prod-readiness/2026-08-10` with no upstream; `main` is `[origin/main: ahead 24]`, which predates this run - nothing was pushed.
`git reflog` shows only plain `commit:` entries from `fc7d0c3` forward; the one `commit (amend)` in the log is dated 2026-08-06, before the run began.
Both tags (`pre-trim-full-featureset`, `v1.0.0`) are present.
No file was deleted. Every URL touched in the stage's artifact and in this review is on 127.0.0.1.

**Fixes that relocated a bug rather than removed it.** No. The resolved value is correct in the Pages configuration, unchanged in the root configuration, and stable across install entry points (Part 1.3). The one plausible relocation - a manifest scope disagreeing with the service worker's registration scope - measures as newly _in_ agreement (Part 1.5).

**Error handling that hides errors.** Not applicable; the diff contains no error handling.

**Verification that does not exercise the changed path.** The stage's artifact does exercise it, in a real base-href build with a real browser, which is the strongest verification this run has produced so far. The permanent gate does not, and cannot without a base-href lane: F6-4.

**Anything marked resolved without an artifact.** No. W1 is the only status change, and its artifact exists, is specific, and reproduces. `R0-4` is still `pending` at `PROD-READINESS.md:207`, correctly, since it is assigned to pass 7.

**Safety in every deployment configuration.** Checked four: Pages under `/blackjack-trainer/` from the app root and from a deep route, the origin root, and the `serve-dist` bundle the E2E suite and CI use. Correct in all four. The iOS app does not consume the manifest.

---

## Part 5 - Gates re-run by this reviewer at `6131b07`

Sandbox disabled for all of them, per `reviews/BASELINE.md`. Port 4200 was confirmed free before each E2E run.

| Gate                        | Result at `6131b07`                                               | BASELINE                 | Verdict           |
| --------------------------- | ----------------------------------------------------------------- | ------------------------ | ----------------- |
| Web lint                    | `LINT_EXIT=0`, "All matched files use Prettier code style!"       | 0                        | same              |
| Web build                   | `BUILD_EXIT=0`, one budget warning on `chart-page.component.scss` | 0, same single warning   | same              |
| Web unit tests              | `TEST_EXIT=0`, 65 files, 1533 passed                              | 1526 passed              | better (+7)       |
| Web coverage gate           | `COV_EXIT=0`, stmts 96.11 / br 93.23 / fn 93.28 / lines 97.97     | floors 94 / 92 / 90 / 96 | above every floor |
| Web E2E (`E2E_SERVER=dist`) | `E2E_EXIT=0`, 111 passed (41.3s)                                  | 111 passed               | same              |
| Parity fixture anti-drift   | `EXPORT_EXIT=0`, `FIXTURE_DIFF_EXIT=0`                            | 0 / 0                    | same              |
| iOS format lint             | `SWIFTFORMAT_EXIT=0`, 0/105 files require formatting              | 0/105                    | same              |
| iOS lint                    | `SWIFTLINT_EXIT=0`, no output                                     | no violations            | same              |
| iOS build + test            | `** TEST SUCCEEDED **`, 335 tests in 38 suites                    | 335 tests                | same              |

The iOS status is read from the `** TEST SUCCEEDED **` marker, not from a `PIPESTATUS` variable, as BASELINE instructs.
`git diff fc7d0c3..HEAD -- ios/` is empty for the whole run, so the three iOS gates could not have moved - I ran them anyway rather than assert it.

Working tree after all of the above: `git status --porcelain` shows only the two untracked directories `.agents/` and `.codex/` that were there at BASELINE, and `git diff` / `git diff --cached` are both empty.
The only file I altered for an experiment was the manifest inside `dist/` (gitignored), which was restored, and the tree was rebuilt afterwards.

---

## Part 6 - For NEXT ROUND, not this run's work list

**N5 | P2 | no gate builds or serves the `--base-href /blackjack-trainer/` bundle.**
Full evidence in F6-4.
Pre-existing: the E2E suite has always run at the origin root, and this run did not change that.
Adding a base-href lane is new test infrastructure beyond any frozen finding, and it overlaps `reviews/REVIEW-0.md` R0-4 (pass 7) and `PROD-READINESS.md:166` N3 - whoever picks it up should read all three together.

**N6 | P2 | `public/manifest.webmanifest` declares no `id`, so the app's identity is whatever path it is deployed under.**
Measured in F6-1.
Any future change of the published base path silently re-identifies the installed app.
The fix is a new manifest member, which this run's scope rule puts out of reach; it should be decided deliberately once, alongside the question of whether the Pages site has ever been live.

---

## Part 7 - What must happen before this stage can be called closed

1. Record F6-1 in `reviews/ARTIFACTS.md` beside the "The root deploy is unaffected" section, and correct the sentence at `reviews/ARTIFACTS.md:233-234` so its safety claim does not enumerate every configuration except the one the fix targets. The trade being recorded is: the Pages deploy gains a correct start URL and a correct identity, and any copy installed from a previously-live Pages site keeps the old identity.
2. Either extend the gate line at `reviews/ARTIFACTS.md:251-252` to the full BASELINE set, or say in one clause which gates were not run and why (F6-2). Both are honest; silently claiming four out of nine is not.
3. Soften `reviews/ARTIFACTS.md:219-221` to what the sources support: before this change the installed app launched the origin root, which is not this app (F6-3).
4. Add N5 and N6 to NEXT ROUND. Do not add either to the frozen work list, and do not add an `id` member to the manifest in this run.
5. Nothing in the shipped behaviour needs to change. The manifest fix is correct, it is verified in the deployment it exists for and in the three it does not, and the gate it installed fails on the old value.
