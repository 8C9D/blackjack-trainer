# REVIEW-0 - Stage 0 (RECON)

Independent adversarial review of `fc7d0c32de8e89f41fd3457a1e5bd014b40e43d5..438349bbb365ca1bacda07d16c15d65565b24af6`.
Subject: `PROD-READINESS.md` (every finding, individually) and `reviews/BASELINE.md`.

- Reviewed at: `438349bbb365ca1bacda07d16c15d65565b24af6`, branch `prod-readiness/2026-08-10`
- Stage diff: two added files, `PROD-READINESS.md` (+165) and `reviews/BASELINE.md` (+237). No code changed (`git diff --name-status fc7d0c3..HEAD`).
- Everything below was re-run or re-read by this reviewer. Nothing is taken from the builder's word.

## VERDICT: PASS-WITH-FINDINGS

The five ledger findings are all real: every one was independently reproduced or read at its cited line, and none is fabricated.
No feature was smuggled in (the stage changed no code), no prohibited action was taken, and nothing is marked resolved.

It is not a clean pass. The stage's own two commits turn `npm run lint` from exit 0 (BASELINE) to exit 1, which is the exact regression `reviews/BASELINE.md:229-237` forbids.
Nine evidence citations point at the wrong lines, one of them at a line that does not exist.
Three defects inside the boundaries Stage 0 itself identified were missed, one of which means a green local E2E run is not evidence about the artifact it claims to test.

Why not REJECT: the deliverable's substance survives verification finding-by-finding, the severities are defensible, and the gate regression is a formatting fix in the stage's own two markdown files.
R0-1 must nonetheless be fixed in the next commit, before any code fix lands, because until it is, every "lint green" claim in this run is false.

---

## Part 1 - The ledger's findings, verified one by one

### W1 - manifest `start_url` / `scope` - CONFIRMED, severity P1 upheld, fix in scope

Verified: `public/manifest.webmanifest:5-6` is `"start_url": "/"`, `"scope": "/"`; `.github/workflows/pages.yml:37` builds `--base-href /blackjack-trainer/`; `pages.yml:41-42` publishes that bundle as the site root.
Independently reproduced the load-bearing claim with the real Pages build rather than the default one:

```
npx ng build --base-href /blackjack-trainer/ --output-path $TMPDIR/basehref-build
<base href="/blackjack-trainer/"      <- index.html rewritten
"start_url": "/"                      <- manifest NOT rewritten (byte-identical to public/)
```

So an installed PWA resolves `start_url` against the manifest URL and launches `https://8c9d.github.io/`, not the app.
The corroborating shared-origin claim at `src/app/core/models/backup.model.ts:10-13` says what it is quoted as saying.
The "untested today" claim holds: `e2e/smoke/navigation.e2e.ts:114-130` asserts `display`, maskable icon sizes and icon 200s, and never reads `start_url` or `scope`.
Assumption 6 (the manifest is an application asset, not deploy configuration) is correct: it is copied verbatim into the bundle and served to the browser, and `pages.yml` is untouched by the fix.

Conditions on the fix: the E2E manifest test must be extended to assert the raw `start_url` / `scope` strings, not the resolved URL, since under `serve-dist` the base href is `/` and a resolved assertion would pass either way.
Without that, the fix ships unexercised.

### W2 - `SwUpdate.unrecoverable` never subscribed - CONFIRMED, severity P1 upheld, fix RULED IN SCOPE

Verified: `src/app/core/services/app-update.service.ts:23-32` subscribes only to `versionUpdates` filtered to `VERSION_READY`; `unrecoverable` is declared at `node_modules/@angular/service-worker/types/service-worker.d.ts:447` (exact line, correct member) and `grep -rn "unrecoverable" src/ e2e/` returns nothing.
`src/app/app.ts:28-56` renders the banner only for `updateReady()`.
The service worker is live in production builds (`src/app/app.config.ts:33-36`, `enabled: !isDevMode()`), so the path is reachable in the shipped artifact.

Scope ruling, which the ledger explicitly asked Review 0 to make: **in scope**, with conditions.
The change adds no route, no screen, no flag, no config key and no new component; it adds a branch to an existing `aside.update` banner that already owns a reload button, a dismiss button and an error line.
That is "make what already exists correct, safe and observable" applied to a failure state the app already has and currently hides.
Conditions: reuse the existing banner and its existing reload/dismiss controls, keep the reload user-initiated exactly as the ledger proposes, add no new injectable and no new persisted key, and add a unit test that pushes an `UnrecoverableStateEvent` through the service so the changed path is actually exercised.
If the fix grows a new component or a new user setting, it has become a feature and must be reverted to DEFERRED.

Severity note: P1 is accepted, but the ledger did not discharge its own rule about ambiguity. This sits near P0 "silent failure"; it stays P1 because the user does see a broken app, they are only told nothing about why, and no data is lost.

### B1 - `serve-dist.mjs` dies on a malformed percent-escape - CONFIRMED and REPRODUCED, severity P1 upheld

Reproduced verbatim on a fresh server at `PORT=4399`:

```
GET /manifest.webmanifest -> 200
GET /%.js                 -> 000   (connection dead)
GET /manifest.webmanifest -> 000   (process gone)

URIError: URI malformed
    at Server.<anonymous> (file:///Users/arthurzhang/dev/blackjack-trainer/tools/serve-dist.mjs:32:26)
Node.js v24.15.0
```

`tools/serve-dist.mjs:32` is exactly the cited line and there is no `try` around it.
The blast-radius reasoning is right: this server is the Playwright `webServer` for `E2E_SERVER=dist` (`playwright.config.ts:32-35`), which is what CI runs (`.github/workflows/ci.yml:48-50`), and it never runs in production.
P1 rather than P0 is defensible on that basis.

Conditions on the fix: catch only the parse/decode. Wrapping the whole request handler in one `try` would satisfy the finding while hiding every other error the handler can raise, which is the "error handling that hides errors" failure mode this run is meant to catch.
The 404 path already in place at lines 45-48 must stay a separate catch, and the reproduction command above must be re-run as the artifact.

### D1 - `CONTACT_EMAIL_HERE` in the published legal pages - CONFIRMED, severity P1 upheld, DEFERRAL accepted

Verified at the exact lines: `ios/AppStore/privacy.html:65` and `ios/AppStore/support.html:55` both carry `mailto:CONTACT_EMAIL_HERE`.
`pages.yml:42` copies both into the site and `pages.yml:6-8` declares them as the App Store privacy and support URLs.
`LAUNCH-CHECKLIST.md:59` and `LAUNCH-CHECKLIST.md:165` say exactly what they are quoted as saying.
`PRIVACY_URL_HERE`, mentioned at `LAUNCH-CHECKLIST.md:167`, is stale checklist text: `git grep PRIVACY_URL_HERE` finds it only in that line, not in either HTML file.

The deferral is correct. Inventing a support address on a live privacy policy would create a black hole for user mail, which is worse than a visible placeholder.
One accuracy correction for the ledger: the pages are not published yet.
Pages source has not been flipped to GitHub Actions (`LAUNCH-CHECKLIST.md:59`, owner action O4 still open), so the correct tense is "would publish on the first deploy". The severity does not change, because App Store submission needs a working support URL either way.

### I1 - iCloud KVS launch seed can overwrite the shared key - CONFIRMED in substance, one citation wrong, severity P1 upheld

Verified: `ios/BlackjackTrainer/Stores/CloudKeyValueStore.swift:63` calls `cloud.synchronize()` and lines 66-72 loop the nine stores, calling `pushToCloud()` at line 70 whenever `cloud.data(forKey:)` is nil.
`synchronize()` does not wait for a download, so the ledger's race is real.
The wiring is live: `ios/BlackjackTrainer/App/AppModel.swift:49` constructs the store and lines 74-78 pass all nine `CloudSyncable`s into `StatsCloudSync`.

Citation correction: the ledger cites `Stores/StatsStore.swift:79-86` for "adoption replaces local wholesale", but `adoptFromCloud` is lines 74-80 and the line that actually replaces local state is `stats = value` at line 78, outside the cited range. Lines 82-85 are `pushToCloud`.
Likewise `AppModel.swift:49-76` stops two lines short of the store list it is cited for (it ends at line 78).
Substance unaffected; the ranges must be corrected because later stages verify against them.

Severity: P1 upheld. The deflation from P0 rests on assumption 5 (iCloud unprovisioned), which the ledger correctly flags as load-bearing and out-of-repo, and which is corroborated in-tree at `LAUNCH-CHECKLIST.md:22-23` and `TRIM-REPORT.md:70`.
Worth stating plainly in the DEFERRED entry, because it is not stated there: `LAUNCH-CHECKLIST.md:22` records that provisioning turns sync on **without an app update**, so the shipped binary becomes P0 the day the owner flips a portal switch, with no code change to trigger a re-review.

The deferral reasoning is accepted, including the specific point that narrowing the launch seed would relocate the race to the first recorded rep rather than remove it. That is the correct call under this run's rules.

### P2-1 through P2-7 - all seven confirmed

- P2-1: reproduced exactly. `npm audit` gives 3 moderate, one chain, `@hono/node-server <2.0.5` via `@modelcontextprotocol/sdk` via `@angular/cli`, advisory GHSA-frvp-7c67-39w9, Windows-only path traversal in `serve-static`. The only offered fix is `@angular/cli@21.0.4` against an installed `^22.1.3`, a major downgrade. Correctly refused. See R0-3 for an inaccuracy in the sentence that follows the finding.
- P2-2: reproduced verbatim, same file, same 368 bytes, warning not error, and present in BASELINE, so inherited.
- P2-3: substance confirmed (`src/main.ts:8` is exactly as quoted, no `<noscript>` anywhere in `src/index.html`), citation wrong: `<app-root></app-root>` is at line 34, not 32. See R0-2. See also R0-6 on the scope inconsistency between this item and W2.
- P2-4: confirmed. No `<meta http-equiv>` in `src/index.html`, and my own sweep of `src/` for `innerHTML|eval\(|new Function|bypassSecurityTrust|document.write` returns zero hits, matching `docs/security-pass-2026-08-06.md:29`. The cited document exists.
- P2-5: confirmed by reading `ngsw-config.json` against `pages.yml:42`. Neither legal page matches any asset group, and ngsw's default navigation rules exclude dotted paths from the index fallback, so they 404 offline.
- P2-6: exact and correct. `flow-prefs.service.ts:213` is the `!`, line 208 is the `oneOf` that makes it safe today.
- P2-7: exact and correct. `settings-page.component.ts:402` is `await file.text()` inside a `try` that catches read failure but not size.

### NOT DEFECTS - re-verified, all seven stand

The path-traversal ruling was re-run on a **fresh** server, which matters: my first attempt returned `000` for the traversal probe only because the B1 crash had already killed the process. On a clean server:

```
/%2e%2e/%2e%2e/%2e%2e/package.json -> 404
/../../package.json (--path-as-is) -> 404
/%5C..%5C..%5Cpackage.json         -> 404
/favicon.ico                       -> 200
/drill/basic-strategy              -> 200
```

The other six were re-read and hold: the privacy text's accuracy given assumption 5, the Team ID at `ios/project.yml:20` (public in every provisioning profile), `preconditionFailure` as a deliberate build-integrity fail-loud, `BackupService.restore` semantics on an empty backup, the deliberate double filter (`backup.model.ts:96-103` parse vs `backup.service.ts:130-135` write), and the drill timers.
All three timer citations are exact: `src/app/features/drill/basic-strategy-drill-page.component.ts:275`, `src/app/features/drill/deviations-drill-page.component.ts:316`, `src/app/features/card-counting/card-counting-page.component.ts:439`.
`AppModel.swift:102` is wrong, though: `preconditionFailure` is at line 95.

### CANNOT ASSESS - accepted

All four are genuinely non-local or non-determinable here (Apple portal, two provisioned devices, a live network fetch, non-Chromium browsers Playwright is not configured for).
The observation that `ios-ci.yml` only ever builds for the simulator and therefore never exercises a signed device build is correct and correctly left as report-only.

---

## Part 2 - This reviewer's findings

### R0-1 - the stage's own commits break the lint gate

**P1 | evidence: command output at `438349b`, and `reviews/BASELINE.md:229-237` | why the builder missed it: the gates were run to capture the baseline and never re-run after the artifacts were written, so the one changed path in the entire stage was the one path never verified.**

```
$ npm run lint
> tsc --noEmit -p tsconfig.app.json      (ok)
> prettier --check .
[warn] PROD-READINESS.md
[warn] reviews/BASELINE.md
[warn] Code style issues found in 2 files.
LINT_EXIT=1
```

BASELINE records this gate at exit 0 and then states the rule this violates: "A pass may not turn any exit code above from 0 to non-zero" (`reviews/BASELINE.md:231-232`).
`.github/workflows/ci.yml:19` runs `npm run lint` on every push and PR to `main`, so CI is red at this commit.
Neither new file is covered by `.prettierignore`, which does exempt `.agents/` and `.codex/` (lines 10-11) and `ios/` (line 24) but not `reviews/`.
The cause is markdown table padding only: `npx prettier PROD-READINESS.md | diff -` shows the difference is column alignment in the four tables.
Fix is `npx prettier --write PROD-READINESS.md reviews/BASELINE.md`, and this review file must be checked the same way before it is committed.

### R0-2 - nine evidence citations do not point where they are claimed to point

**P2 | evidence: listed below, each checked against the file at this commit | why the builder missed it: the line numbers were written from memory of a read rather than re-derived from the file after the surrounding prose was edited, and nothing in the stage re-checks them.**

- `src/app/app.config.ts:38-41` for the service-worker boundary: the file is 38 lines long, so lines 39-41 do not exist. `provideServiceWorker` is at lines 33-36.
- `ios/BlackjackTrainer/App/AppModel.swift:102` for `preconditionFailure`: it is at line 95. Line 102 is `basicStrategy: basicStrategy,`.
- `src/index.html:32` for the bare `<app-root>`: it is at line 34. Line 32 is `</head>`.
- `package.json:12` for `packageManager`: it is at line 22. Line 12 is the `export:fixtures` script.
- `package.json:14` for `engines`: it is at lines 23-25. Line 14 is `format:check`.
- `ios/BlackjackTrainer/Stores/StatsStore.swift:79-86` for wholesale adoption: the replacing line is 78 (see I1 above).
- `ios/BlackjackTrainer/App/AppModel.swift:49-76` for the nine-store wiring: it ends at line 78.
- `tsconfig.json:8-25` for `strict: true` plus the extra flags: `strict` is at line 6, outside the range. The other four flags are inside it.
- `src/app/core/services/backup.service.ts:78-124` (`restore` is 83-126) and `:129-134` (`replaceNamespace` is 130-135), plus `package.json:3-19` (scripts are 4-20) and `src/app/app.ts:29-57` (the banner is 28-56): all off by one to five lines.

None of these falsifies a finding. They matter because the ledger is the contract every later stage is verified against, and a reviewer sent to line 39 of a 38-line file has to reconstruct the claim before it can be checked.

### R0-3 - the third-party-dependency evidence is wrong as written

**P2 | evidence: `npm ls --omit=dev --all` vs `PROD-READINESS.md:62` and `:106` | why the builder missed it: the count came from `npm audit` metadata (`dependencies.prod = 12`, which I reproduce) but the enumeration came from the nine direct entries in `package.json:26-36`, and the two figures were merged into one sentence without expanding the tree.**

The ledger says "12 production dependencies, all `@angular/*` + `rxjs` + `tslib`".
The production tree also contains `zod@4.4.3` and `@standard-schema/spec@1.1.0`, both pulled in by `@angular/forms`.
The conclusion survives: `grep -rn "@angular/forms" src/` returns zero hits, `grep -c ZodError` over the built bundle returns nothing, so neither ships, and neither is in the advisory chain.
Two consequences worth recording rather than acting on: the "no third-party SDKs" boundary row rests on an enumeration that is false as stated, and `@angular/forms` is a declared runtime dependency that no source file imports.
Removing it is a dependency change, which this run's scope forbids, so it belongs in NEXT ROUND, not the work list.

### R0-4 - a green local E2E run is not evidence that the production bundle was tested

**P1 | evidence: `playwright.config.ts:37`, plus the reproduction below | why the builder missed it: the gate was judged by its exit code and its "111 passed" line, neither of which records which server answered, and the port was free on the machine when the baseline was captured, so the failure mode never presented.**

`reuseExistingServer: !process.env.CI` means that when anything already listens on `127.0.0.1:4200`, `E2E_SERVER=dist npm run e2e` silently attaches to it instead of starting `tools/serve-dist.mjs`, and the suite then tests whatever that server serves.
Reproduced deliberately, with `ng serve` (the Vite dev server, identifiable by `/@vite/client` in its HTML) already bound to 4200:

```
$ E2E_SERVER=dist npm run e2e -- e2e/smoke/navigation.e2e.ts
  13 passed (3.8s)
$ grep -c "serving /Users" <run log>
  0        # tools/serve-dist.mjs never started
```

The "dist" gate reported a full pass while never touching the production bundle it names.
This is worse than B1, which the ledger rates P1: B1 fails loudly as a mass of E2E errors, whereas this one fails green.
It also cannot be audited after the fact, because Playwright does not pipe the `webServer` stdout, so no run log distinguishes the two servers.
I rate it P1 rather than P2 despite CI being immune (`CI=true` disables reuse, `.github/workflows/ci.yml:48-50`), because it is precisely the "undiagnosable release gate" reasoning the ledger applied to B1, and because the whole of `reviews/BASELINE.md` was captured through this gate on a developer machine.
Not P0: no user-facing path and no data is involved.

What this does not mean: BASELINE's E2E row is not thereby wrong. I confirmed `lsof -nP -iTCP:4200 -sTCP:LISTEN` was empty before my own clean re-run, which passed 111/111 against `serve-dist`, so the number reproduces.
The defect is that the gate carries no evidence of its own validity, so every future re-run needs the same manual port check to mean anything.
`playwright.config.ts` is test configuration, not CI/CD or deploy configuration, so a fix is permitted in this run.

### R0-5 - a red CI does not stop the public deploy

**P2, report-only | evidence: `.github/workflows/pages.yml:12-15` against `.github/workflows/ci.yml:3-7` | why the builder missed it: the "How this ships" section traced what `pages.yml` publishes but not what gates it, and both workflows were read for their contents rather than for their triggers.**

Both workflows fire independently on push to `main`.
`pages.yml` runs `npm ci` and `npm run build` and then deploys; it never runs `npm run lint`, the unit tests, the coverage gate, the parity anti-drift gate or the E2E suite, and it does not depend on the `CI` workflow's result.
So any failure that is not a build failure publishes to `https://8c9d.github.io/blackjack-trainer/` anyway.
That is live right now: at this commit CI is red (R0-1) and a push to `main` would still deploy.
For a trainer whose entire value is being right about strategy charts, the parity and unit gates are the ones that matter, and neither guards the deploy.
P2 rather than P1 because the repo has a single owner who merges deliberately, and because the deploy is a static site that can be redeployed in a minute.
Fixing it means editing a workflow file, which this run may only report. It belongs in NEXT ROUND.

### R0-6 - the scope rulings for W2 and P2-3 contradict each other

**P2 | evidence: `PROD-READINESS.md:97` against `PROD-READINESS.md:108` | why the builder missed it: the two items were written in different sections under different framings, one as a fix with a scope caveat and one as a documented non-fix.**

W2 is proposed as in scope while conceding "this adds one line of user-facing copy", and is justified as error handling for an existing boundary.
P2-3, whose remedy is also one line of user-facing copy in the shell for a failure state that already exists, is ruled out as "new user-visible content in the shell, which reads as a feature".
Both cannot be right on their stated grounds.
My ruling, so the builder cannot cite the ledger's own precedent selectively: W2 is in scope (see the conditions above) because the app is in a broken state the user can act on and the banner that would carry it already exists; P2-3 stays out of scope and stays P2, but the reason must be restated as "the fix adds a static element to `index.html` that no existing surface owns", not "user-visible copy is a feature".
If a later stage wants to fix P2-3, it needs a fresh scope ruling, not this ledger's sentence.

---

## Part 3 - The explicit checks this review was required to make

- **Fabricated or unreproducible findings:** none. All five findings and all seven P2 items reproduce. B1 and the traversal NOT-DEFECT were re-run as live commands; W1 was re-derived from an actual `--base-href /blackjack-trainer/` build.
- **Citations that do not say what they are claimed to say:** nine, listed in R0-2, plus the dependency enumeration in R0-3. No finding collapses as a result.
- **Severity inflation:** none found. W1, W2, B1 and D1 at P1 are each defensible under "fails under realistic load or edge input, or undiagnosable in prod", and the seven P2s are correctly P2.
- **Severity deflation:** two to watch, both disclosed by the ledger rather than hidden. I1 is data loss held at P1 by an out-of-repo assumption; W2 is near "silent failure" and stays P1 only because the user sees a broken app. Both upheld, with the reasoning recorded above.
- **Features smuggled in:** none possible; the stage changed no code. The one forward-looking scope question (W2) is ruled on in Part 1.
- **Prohibited actions:** none. Branch `prod-readiness/2026-08-10` has no upstream, `git branch -r` shows only `origin/main` and `origin/HEAD`, the base commit `fc7d0c3` is intact and is the direct parent chain of both new commits, the reflog shows two plain commits after a checkout with no rebase or amend, no file was deleted, no credential was touched, no workflow or deploy file was modified, and no non-local resource was contacted.
- **Fixes that relocate rather than remove a bug:** no fixes were applied this stage. The one place the risk was live, I1, the ledger identified the relocation itself and refused the narrow fix. Correct.
- **Error handling that hides errors:** not introduced this stage. Flagged forward as a condition on B1's fix.
- **Verification that does not exercise the changed path:** two instances. R0-1 is the stage's own artifacts breaking the gate that was never re-run, and R0-4 is a gate that can pass without running the artifact it names. Conditions attached to W1 and W2 so their fixes are not the third.
- **Anything marked resolved without an artifact:** nothing. The status table at `PROD-READINESS.md:159-165` carries three `pending` and two `DEFERRED`, both deferrals with stated reasons.

## Part 4 - Gates re-run by this reviewer at `438349b`

Every command below was run with the tool sandbox disabled, as `reviews/BASELINE.md:14-20` warns is necessary.

- `npm run build` - exit 0. Same single budget warning on `chart-page.component.scss`, 368 bytes over. Matches baseline.
- `npm test` / `npm run test:coverage` - exit 0. 65 files, 1526 tests, coverage 96.1 / 93.22 / 93.27 / 97.96. Identical to baseline, all four floors met.
- `npm run lint` - **exit 1**. Baseline says 0. See R0-1.
- `E2E_SERVER=dist npm run e2e` - exit 0, 111 passed, with port 4200 verified free beforehand. Matches baseline. See R0-4 for why that precondition had to be checked by hand.
- `npm run export:fixtures` then `git diff --exit-code -- ios/Fixtures` - 0 and 0. No drift.
- `swiftformat --lint .` - exit 0, 0/105 files require formatting. `swiftlint lint --quiet` - exit 0, no output.
- `xcodebuild -scheme BlackjackTrainer -destination 'platform=iOS Simulator,name=iPhone 16 Pro' build test` - `** TEST SUCCEEDED **`, 335 tests in 38 suites, exit 0.
- `npm audit` - 3 moderate, one chain, exactly as P2-1 describes.
- Secret sweep (not claimed by the ledger, run for completeness): no private keys, AWS keys, GitHub or Slack tokens, or hardcoded credential assignments in the tracked tree, and `git log --all -S` finds none in history either. The only credential-shaped string in the repo is the Apple Team ID, correctly ruled a non-secret.
- Working tree after all of the above: `git status --porcelain` shows only the two pre-existing untracked directories `.agents/` and `.codex/`. No tracked file was modified by this review.

## Part 5 - What the builder must do before Stage 1 touches code

1. Fix R0-1 first, in its own commit. Until `npm run lint` exits 0 again, no later "green" claim in this run is checkable.
2. Correct the nine citations in R0-2 and the two ranges called out under I1, in the ledger, without changing any finding's substance or severity.
3. Correct the dependency sentence at `PROD-READINESS.md:62` and `:106` per R0-3.
4. Record R0-4, R0-5 and R0-6 in the ledger. R0-4 is a P1 with a permitted fix (`playwright.config.ts`); R0-5 is report-only and belongs in NEXT ROUND; R0-6 is a ruling to restate, not a fix.
5. Carry the conditions attached to W1, W2 and B1 into the work list, because each names the verification that would otherwise be skipped.
