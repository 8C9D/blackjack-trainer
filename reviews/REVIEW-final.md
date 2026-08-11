# REVIEW-final - the whole run

Independent adversarial review of the complete run, `fc7d0c32de8e89f41fd3457a1e5bd014b40e43d5..071b7d022902b812c0e3eb3c95296e51311d5eb1`, plus the full review trail in `reviews/`.

- Reviewed at `071b7d022902b812c0e3eb3c95296e51311d5eb1`, branch `prod-readiness/2026-08-10`.
- Run diff: 17 files, +2505/-31. Six of them are the run's own records; five are source, config or test files; one is a test README; one is the ledger.
- Nothing in `PROD-READINESS.md`, `reviews/ARTIFACTS.md` or any prior review was accepted as evidence.
  Every load-bearing transcript was reproduced from scratch, in both directions where a before/after was claimed, and all nine BASELINE gates were re-run on both platforms.
- Sandbox disabled for every gate, per `reviews/BASELINE.md:14-20`.
  `xcodebuild` status read from the `** TEST SUCCEEDED **` marker, per `reviews/BASELINE.md:223-227`.

## VERDICT: PASS-WITH-FINDINGS

The run did what it said it did.
All four actionable frozen findings are genuinely closed: I reproduced each defect on its parent commit and its absence at HEAD, using the browser for the two browser claims and a real damaged service worker for the one that needed one.
Both deferrals are correct and their reasoning survives scrutiny.
No feature was smuggled in, no prohibited action was taken anywhere in the run's history, no fix relocated its bug, no error handling was widened to hide errors, and nothing is marked RESOLVED without an artifact that reproduces.
The scope trend across the run is the opposite of drift: the code touched per pass shrank from 20 lines to 2 to one boolean expression, and after pass 4 no remediation commit touched shipped source at all.

It is not a clean pass for five reasons, all P2, none of them a defect in shipped behaviour.
The largest is structural rather than technical: twelve of the run's eighteen commits fall outside every reviewer's diff range, and one of them changes production source in `src/app/`.
That commit is sound - I mutation-tested it and it holds - but the review structure guaranteed that nobody except this final review would look at it.
The remaining four are record-accuracy defects, three of them in the closing commit that no reviewer saw, plus one genuinely unasserted pair of template branches this run created.

Why not REJECT: every substantive claim reproduces, every prior reviewer condition was met, and the severities are defensible and disclosed where they are arguable.
Why not a clean PASS: a run whose central discipline is "verify the changed path" left a shipped-source commit outside every review boundary, and left two of its own new template expressions unpinned by any test.

---

## Part 1 - The four RESOLVED findings, re-verified from scratch

### B1 - `tools/serve-dist.mjs` exits the process on a malformed request URL

Reproduced on the parent commit, from `git show 1413989:tools/serve-dist.mjs` run out of a scratch mirror so its module-relative `ROOT` resolved to the real bundle:

```
/index.html -> 200
/%.js       -> 000
/index.html -> 000
PROCESS: DEAD

URIError: URI malformed
    at decodeURIComponent (<anonymous>)
    at Server.<anonymous> (.../scratchpad/mirror/tools/serve-dist.mjs:32:26)
Node.js v24.15.0
```

At HEAD, the same server on port 4411, thirteen probes including six distinct malformed escapes:

```
/index.html                  -> 200      /%2e%2e/%2e%2e/package.json -> 404
/%.js                        -> 404      /manifest.webmanifest       -> 200
/index.html                  -> 200      /drill/basic-strategy       -> 200
/%zz.css                     -> 404      /nope.js                    -> 404
/%E0%A4%A.js                 -> 404      /../../package.json (--path-as-is) -> 404
/%FF%FE.js                   -> 404
/a%.css                      -> 404      PROCESS: ALIVE
/%00.js                      -> 404      stderr: only the startup banner
```

The bug is removed, not relocated, and the behaviours around it are unmoved: the SPA fallback still serves the shell on an extensionless path, a genuinely missing asset still 404s rather than falling back to the shell, both traversal probes still 404, and valid assets still serve.
Review 0's condition that the `catch` cover only the parse is met: `tools/serve-dist.mjs:38-51` spans one statement, and the `readFile` catch at `:59-65` is still its own.

### R0-4 - the `dist` E2E lane could pass green without running the production bundle

Staged with a server of my own answering `200` on `127.0.0.1:4200` and serving a page that is demonstrably not the bundle:

```
$ curl -s http://127.0.0.1:4200/
<html><body>FOREIGN SERVER - not the dist bundle</body></html>

$ E2E_SERVER=dist npx playwright test e2e/smoke/navigation.e2e.ts
Error: http://127.0.0.1:4200 is already used, make sure that nothing is running on the
port/url or set reuseExistingServer:true in config.webServer.
DIST_EXIT=1
```

The lane refuses rather than borrows, and the message names the port.
The `serve` lane still attaches to whatever holds the port, which is the deliberate trade recorded as N8.
Independently and by accident, I also confirmed the IPv6 case pass 7 raised: a foreign `ng serve` from another project appeared on `[::1]:4200` during this review while `127.0.0.1:4200` stayed free, and the dist lane started its own server and passed.

### W1 - the PWA manifest sent every installed copy to the wrong site

Built exactly as `.github/workflows/pages.yml:37` builds it, then interrogated with Chrome's own `Page.getAppManifest` over CDP, entirely on 127.0.0.1.

```
=== the build ===
<base href="/blackjack-trainer/"          index.html rewritten
<link rel="manifest" href="manifest.webmanifest">   relative, resolves against <base>
manifest vs public/: BYTE-IDENTICAL       the build does not rewrite it
ngsw.json index: /blackjack-trainer/index.html      the worker is not anchored to the root

=== BEFORE (manifest from 5c9ca36) ===        === AFTER (HEAD) ===
rawStartUrl      "/"                          rawStartUrl      "./"
browserStartUrl  http://127.0.0.1:4416/       browserStartUrl  http://127.0.0.1:4414/blackjack-trainer/
browserScope     http://127.0.0.1:4416/       browserScope     http://127.0.0.1:4414/blackjack-trainer/
browserId        http://127.0.0.1:4416/       browserId        http://127.0.0.1:4414/blackjack-trainer/
errors           []                           errors           []
```

Installed from a deep route (`/blackjack-trainer/drill/basic-strategy`) rather than the app root, the resolved start URL is still `http://127.0.0.1:4415/blackjack-trainer/`.
That was the most plausible way for a relative `start_url` to be subtly wrong and it is not.
The `browserId` movement is real, which independently confirms N6.

The permanent gate is not vacuous.
With only the manifest inside the gitignored `dist/` swapped for the parent commit's:

```
Expected: "./"
Received: "/"
  > 126 |     expect(manifest.start_url).toBe('./');
1 failed, 12 passed
```

Restored byte-identically afterwards (md5 `b139d1dbcc0e05f6454cf25d9d48dae1` before and after).

### W2 - an unrecoverable service worker was never surfaced

`dist/blackjack-trainer/browser/ngsw-worker.js:583` throws `SwUnrecoverableStateError` on exactly one condition, and `:2153-2163` posts `UNRECOVERABLE_STATE` to clients.
I induced it against the production bundle with nothing but Node and this repository's Playwright, on 127.0.0.1:

```
controlled: true
cache victim: {"cacheName":"ngsw:/:6a8ba9a3...:assets:app:cache","entries":25,
               "target":"/chunk--v5M_Gm0.js","deleted":true}
page fetch of victim: 404
BANNER: {
 "aria": "App needs reloading",
 "copyRole": "alert",
 "copyLive": "assertive",
 "text": "Reload to repair this app Some of its stored files are missing, so parts of it will
          not work. Reloading fetches a fresh copy. Your practice is saved separately and is
          not affected. Reload",
 "buttons": ["Reload"],
 "hasLater": false
}
AFTER RELOAD:            {"hasBanner":false,"body":"Blackjack Trainer MONDAY EVENING 0/20 hands..."}
LAZY ROUTE AFTER RELOAD: {"hasBanner":false,"body":"Basic Strategy 0/20 esc DEALER SHOWS ..."}
```

The banner's one promise is kept: the reload repairs the app, the banner goes, and a lazy route - the class of file that broke - loads again.
No reload loop, no blank page.
The screen-reader semantics that the unreviewed remediation commit added are confirmed on the real rendered element, not only in the test bed.

**The trap I went looking for and did not find.** An undismissable banner that covers the drill's controls (N4) would be a new user-facing trap if it could fire while the trainee is merely offline, because then the only offered action could not repair anything.
It cannot. The throw is guarded by `!response.ok && response.status === 404`, and `safeFetch` (`ngsw-worker.js:655-663`) converts a network failure into a synthetic `504`, not a `404`.
The state is reachable only when the origin actively answers 404 for a hashed asset, which is the redeploy case where reload does repair.
This is a negative result and it is recorded because nobody in the trail asked the question.

---

## Part 2 - The two DEFERRED findings

Both deferrals are correct and both reproduce.

**D1.** `ios/AppStore/privacy.html:65` and `ios/AppStore/support.html:55` both still carry `mailto:CONTACT_EMAIL_HERE`, `pages.yml:42` still copies both into the site, and `LAUNCH-CHECKLIST.md:59` and `:165` say what they are quoted as saying.
Inventing an address on a published privacy policy would be strictly worse than a visible placeholder.

**I1.** `CloudKeyValueStore.swift:63` is `cloud.synchronize()` and `:70` is the `pushToCloud()` in the nil branch; `StatsStore.swift:74-80` is `adoptFromCloud` with the wholesale `stats = value` at `:78`; `AppModel.swift:49` constructs the store and the nine-store wiring ends at `:78`.
Every citation Review 0 asked to be corrected is now correct.
The deferral reasoning - that the narrow fix relocates the race to the first recorded rep rather than removing it - is the right call under this run's rules, and the ledger's addition that provisioning turns this into a P0 with no code change is the single most valuable sentence the run wrote for its successor.

---

## Part 3 - Every prior reviewer finding, dispositioned

I checked each one against the tree rather than against the builder's account of it.
All 24 are dispositioned; the ones marked **verified by execution** I confirmed by running something, not by reading.

| finding    | required disposition                              | actual                                                                                                                    |
| ---------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| R0-1       | fix the lint gate first, in its own commit        | `45f41bc`, landed before the review doc and before any code commit. **Verified by execution:** `npm run lint` exits 0.    |
| R0-2       | correct nine citations plus two ranges            | corrected. **Verified:** I re-derived ~45 citations against the files; one residual off-by-one, FF-5.                     |
| R0-3       | correct the dependency sentence                   | `PROD-READINESS.md:62` and P2-1 now name `zod` and `@standard-schema/spec` explicitly.                                    |
| R0-4       | record it, then fix it                            | frozen as P1, RESOLVED. **Verified by execution** (Part 1).                                                               |
| R0-5       | report only, to NEXT ROUND                        | N1.                                                                                                                       |
| R0-6       | restate the W2 / P2-3 scope ruling                | both rows restated; P2-3's reason is now "adds a static element no existing surface owns".                                |
| F2-1       | write the artifact, flip the status row           | `reviews/ARTIFACTS.md` B1 entry; status RESOLVED.                                                                         |
| F2-2       | correct the false E2E-outage claim in the comment | corrected at `tools/serve-dist.mjs:42-48`; the surviving claim ("one curl used to kill this server") is one I reproduced. |
| F2-3       | to NEXT ROUND                                     | N3.                                                                                                                       |
| F4-1       | strike the false "cannot be induced" limitation   | struck in both places. **Verified by execution:** I induced it (Part 1).                                                  |
| F4-2       | record the cost of dropping "Later"               | recorded as a trade in `ARTIFACTS.md`; pre-existing half to N4.                                                           |
| F4-3       | assert the line or drop it                        | dropped, and pinned. **Verified by mutation B:** re-adding it fails 1 test.                                               |
| F4-4       | correct the false coverage claim                  | corrected, and made true. **Verified by mutation C:** the new shell test really does assert `.update__copy`.              |
| F4-5       | `role="alert"` or record why not                  | `role="alert"` / `aria-live="assertive"`. **Verified by mutation C** and on the real rendered element.                    |
| F4-6       | record that the frozen list was rewritten         | `PROD-READINESS.md:184-190`. I re-checked the substance: no row, severity or target moved.                                |
| F6-1       | record the identity consequence                   | recorded; N6. **Verified by execution:** `browserId` moves (Part 1).                                                      |
| F6-2       | claim nine gates or say which were skipped        | W1 entry now claims all nine.                                                                                             |
| F6-3       | soften the "someone else's site" sentence         | softened to "another project's page if one is published at the root, a 404 if not".                                       |
| F6-4       | to NEXT ROUND                                     | N5.                                                                                                                       |
| F7-1       | to NEXT ROUND, do not fix here                    | N7 at P1; `e2e/smoke/offline.e2e.ts` untouched by the run diff. **Verified by execution** (Part 4).                       |
| F7-2       | claim nine gates                                  | R0-4 entry now lists all nine.                                                                                            |
| F7-3       | document the refusal where a developer meets it   | `e2e/README.md:22-41`. **Verified:** the quoted error text matches the message I got, character for character.            |
| F7-4, F7-5 | to NEXT ROUND                                     | N8.                                                                                                                       |

Every condition any reviewer attached to a fix was met.
No finding was closed by assertion alone.

---

## Part 4 - The checks only a final review can make

### Defects introduced across pass boundaries

I mutation-tested the shipped source at HEAD, because the only way a cross-boundary defect survives is if no test pins the behaviour.

| mutation                                                                       | result                     | reading                                 |
| ------------------------------------------------------------------------------ | -------------------------- | --------------------------------------- |
| A: delete `swUpdate.unrecoverable.subscribe(...)`                              | 4 failed / 1529 passed     | W2's behaviour is pinned at both layers |
| B: re-add `updateFailed.set(false)` inside the handler (the line F4-3 removed) | 1 failed / 1532 passed     | the F4-3 remediation is pinned          |
| C: revert `role`/`aria-live` to the old static values                          | 1 failed / 1532 passed     | the F4-5 remediation is pinned          |
| D: corrupt the **update-ready** branch of `aria-label` and `aria-live`         | **0 failed / 1533 passed** | not pinned by anything - see FF-2       |

Mutation A now fails four tests where `reviews/ARTIFACTS.md:130-138` records three; the artifact discloses this itself and explains why (the counts predate the seventh test).
That is honest bookkeeping, not drift.

### Stage 0 assumptions against later evidence

All six hold.
Assumption 1 (`.agents/` and `.codex/` untracked, no `git add -A`) is confirmed by `git diff --name-status fc7d0c3..071b7d0`, which names 17 files and neither directory.
Assumption 6 (the manifest is an application asset, not deploy configuration) is confirmed by execution: the file is copied byte-identically into a `--base-href` build and served to the browser, and `pages.yml` is untouched by the run.
Assumption 5 (iCloud unprovisioned) remains the one load-bearing out-of-repo fact, and the ledger flags it as such in both the places that depend on it.
No later evidence contradicted any of them.

### Work that expanded past the frozen work list

None.
The list froze at six findings in `1413989` and the six that reached a terminal state are the same six, with the same severities and the same pass assignments.
The one edit to the frozen document (`ac6a523`) was caught by pass 4 as F4-6, its substance was checked, and it is recorded in the ledger.
`e2e/smoke/offline.e2e.ts`, the subject of the sharpest post-freeze finding (N7, P1), is not in the run diff, so the strongest temptation to expand was declined.

### Prohibited actions, over the whole history

None, and the checks are exhaustive rather than sampled.

- **No push.** `origin/main` is `796a4e4`, unchanged. The run branch has no upstream. Local `main` is still `fc7d0c3` and its "ahead 24" predates the run.
- **No history rewriting.** Every reflog entry from `fc7d0c3` forward is a plain `commit:`. The only `commit (amend)` and `reset` entries are dated 2026-08-06.
- **No tag deletion.** `pre-trim-full-featureset` and `v1.0.0` both present.
- **No CI/CD, deploy or infrastructure change.** `git diff --stat fc7d0c3..071b7d0 -- .github/ package.json package-lock.json ios/ angular.json vitest.config.ts tsconfig*.json ngsw-config.json .prettierignore` is empty.
- **No deletions or renames.** `git log --diff-filter=DR --name-status fc7d0c3..071b7d0` is empty.
- **No dependency change**, no credential touched, and every host contacted by the run's artifacts and by this review is `127.0.0.1` or `[::1]`.

### Fixes drifting toward scope expansion over time

The opposite.
Pass 2 changed 20 lines in one dev-only file; pass 4 changed two source files and two specs; pass 6 changed two values and added two assertions; pass 7 changed one boolean expression.
The remediation commits follow the same curve: `84dcd4f` corrected a comment, `f08c131` made three small source edits each closing a named reviewer finding, and `8c9d5e0`, `ca17a2e` and `071b7d0` touched no source at all.
Nothing was reformatted, reorganised or upgraded as a side effect.

### The one P1 in NEXT ROUND, reproduced

N7 is the sharpest thing the run found and may not fix, so I confirmed it is real rather than leaving the next run to chase it.
With `ngsw-worker.js` removed from the gitignored bundle and the release gate run exactly as `.github/workflows/ci.yml:48-50` runs it:

```
$ E2E_SERVER=dist npm run e2e
  2 skipped
  109 passed (28.1s)
FULL_SUITE_BROKEN_SW_EXIT=0
```

Exit 0, on a production bundle whose service worker never registered.
Restored (md5 `84f509c7ab1bf74fe8cd95f1b2551768` before and after) and re-verified: `e2e/smoke/offline.e2e.ts` passes 2/2.
N7 is correctly severitied at P1 and correctly routed to NEXT ROUND.

---

## Part 5 - This reviewer's findings

All five are P2.
I found no P0 and no P1.
Severity is held down deliberately and for stated reasons: nothing here loses data, exposes anything, fails silently to a user, or blocks a deploy, and none of it changes shipped behaviour.
Per the run's termination rules these go to NEXT ROUND, and P2 findings are documented rather than fixed in any case.

### FF-1 - twelve of eighteen commits fall outside every reviewer's diff range, and one of them changes shipped source

**P2 | evidence: the five review ranges declared at `reviews/REVIEW-0.md:3`, `reviews/REVIEW-pass2.md:3`, `reviews/REVIEW-pass4.md:3`, `reviews/REVIEW-pass6.md:3` and `reviews/REVIEW-pass7.md:3`, against `git log --oneline fc7d0c3..071b7d0` | why the builder missed it: each pass was reviewed at the commit that carried its fix, and the remediation commit answering that review is by construction authored after the range closes, so no pass could review its own remediation.**

The five ranges cover exactly six commits: `62a34aa`, `438349b`, `7377dca`, `ac6a523`, `6131b07`, `3417bfb`.
The other twelve were reviewed by nobody until now.
Most are records, and that is unremarkable.
Three are not:

- **`f08c131`** changes `src/app/app.ts` (+9/-2) and `src/app/core/services/app-update.service.ts` (+9/-4), both of which ship. It converts two static ARIA attributes into expressions, deletes a line from the `unrecoverable` handler, and adds a test. Pass 4's range ends at `ac6a523`; pass 6's begins at `5c9ca36`. The commit sits between them.
- **`ca17a2e`** rewrites `e2e/README.md:22-41`, the repository's only how-to-run-E2E document, including the error text a developer is told not to act on.
- **`84dcd4f`** rewrites the comment at `tools/serve-dist.mjs:42-48`. Pass 4 spot-checked this one in passing, which is the exception that shows the rule.

I have now reviewed all three.
`f08c131` is sound: mutations B and C show both of its behavioural edits are pinned by tests, and the induced-worker run in Part 1 confirms the rendered result.
`ca17a2e` is accurate: the error text it quotes matches the message I got character for character, and the advice not to set `reuseExistingServer` is correct.
`84dcd4f`'s surviving claim is one I reproduced.

The finding is not that these commits are wrong.
It is that a run built on "the reviewer re-runs verification itself" left its only production-source remediation structurally unreviewable, and got away with it on the merits rather than by design.
The cheap fix for a future run is to end each pass's review range at the remediation commit rather than at the fix commit.

### FF-2 - the update-ready branch of two new template bindings is asserted by nothing

**P2 | introduced by this run's own change | evidence: mutation D - with `src/app/app.ts:35` changed to `: 'MUTATED-LABEL'` and `:44` to `: 'MUTATED-LIVE'`, `npm test` reports `Test Files 65 passed (65)`, `Tests 1533 passed (1533)`, exit 0 | why the builder missed it: `src/app/app.spec.ts:63` pins `role="status"` for the update-ready state, which makes the ternary look covered, and the remediation that closed the identical finding for the service (F4-3) created the same shape in the template in the same commit.**

Before this run, `aria-label="App update available"` and `aria-live="polite"` were static attributes on the update banner and could not be wrong.
The run turned both into `recoveryNeeded() ? ... : ...` expressions.
The recovery branch of each is asserted (`app.spec.ts:83`, `:86`); the update-ready branch of each is asserted by nothing, in either the unit suite or the E2E suite - `grep -rn "aria-label\|aria-live" src/app/app.spec.ts e2e/` returns no assertion on either value for that state.

Nothing is broken today: both values are correct.
What the run gave up is that a future edit to the banner can silently strip the accessible name from the pre-existing update prompt, and every gate stays green.
That is precisely the class of gap this run has been closing since Review 0, applied to the run's own change, and it is the only technical finding I have against the shipped code.
P2 rather than P1 because no user is affected now and the exposure is a regression risk rather than a defect.

### FF-3 - the closing section, in the one commit no reviewer saw, miscounts the run twice

**P2 | evidence: `PROD-READINESS.md:222` reads "Four source files, plus one documentation file" above a table with six rows, five of which are source, asset or config files (`tools/serve-dist.mjs`, `src/app/core/services/app-update.service.ts`, `src/app/app.ts`, `public/manifest.webmanifest`, `playwright.config.ts`); `PROD-READINESS.md:178-179` reads "Six findings, under the 15 cap" and then "All four are P1", when all six frozen findings are P1 | why the builder missed it: the closing summary was written last, in a commit whose diff is the summary itself, and the run's own citation-checking discipline from R0-2 was never turned on the paragraphs describing the run.**

Neither error is load-bearing and both are self-evident from the table immediately below them.
I raise them because this ledger is the artifact the next run inherits, R0-2 established that this run's numbers need re-deriving rather than remembering, and this is the one commit where no one applied that rule.

### FF-4 - the ledger's regression table records one of the run's self-inflicted regressions

**P2 | evidence: `PROD-READINESS.md:103-107`, "Regression introduced and fixed inside this run", contains exactly one row, R0-1 | why the builder missed it: regressions were written up where they were fixed - inside the relevant `reviews/ARTIFACTS.md` entry - rather than into the table the ledger defines for them, so the table never grew after Stage 0.**

At least one further defect was introduced by this run's own changes and fixed inside the stage that caused it: `updateFailed.set(false)` in the `unrecoverable` handler (introduced in `ac6a523`, removed in `f08c131`), which would have cleared "Could not reload. Please try again." off a banner whose only button had just failed.
Two false statements were also installed in committed records and later corrected: the E2E-outage claim in `tools/serve-dist.mjs` (F2-2) and the "cannot be induced" limitation in `reviews/ARTIFACTS.md` and the W2 status row (F4-1).

None of this is hidden - all three are described in full in `reviews/ARTIFACTS.md` and the pass reviews, which are committed and linked from the ledger.
The defect is that a reader of `PROD-READINESS.md` alone concludes the run injected exactly one regression, a markdown formatting break, when it also injected and repaired one behavioural one.
P2 because the information exists in the tree, one link away.

### FF-5 - one residual citation of the R0-2 class

**P2 | evidence: `PROD-READINESS.md:156` cites `src/app/core/services/backup.service.ts:70-74` for "`URL.revokeObjectURL` immediately after `anchor.click()`"; `anchor.click()` is at line 69, outside the cited range, which runs `return name` (70) through the closing brace (74) | why the builder missed it: the R0-2 sweep corrected the nine citations Review 0 listed and did not re-derive the ones it had not flagged.**

This is my weakest finding and I record it for calibration rather than for action.
I re-derived roughly forty-five citations across `PROD-READINESS.md` - every `tsconfig`, `package.json`, workflow, iOS, store-page, checklist, drill-timer, storage, backup and E2E reference I could check - and this is the only one that does not land where it claims.
The R0-2 remediation was real and it worked.

---

## Part 6 - The explicit checks this review was required to make

**Fabricated or unreproducible findings.** None, in the ledger or in any review.
Every load-bearing transcript I tested reproduced: B1 in both directions, R0-4 in both directions, W1 in both directions with a real browser under the real base href, W2's induction and its mutation evidence, W1's gate non-vacuity, and N7.
The two places where the run recorded something false about itself - F2-2 and F4-1 - were both caught by its own reviewers and both corrected before the run closed.

**Evidence citations that do not say what they are claimed to say.** One, FF-5, out of roughly forty-five checked.

**Severity inflation.** None found.
The one rating worth naming is B1 at P1: `tools/serve-dist.mjs` is in neither shipped artifact, so the letter of the severity rule points at P2.
The ledger's reasoning - an undiagnosable release gate whose crash presents as unrelated E2E failures - is stated openly, two reviewers upheld it, and the practical effect was to fix a real crash rather than to inflate a report.
I do not overturn it, and I record the argument so the next run can weigh it.

**Severity deflation.** Two, both disclosed by the run rather than hidden, both correctly resolved downward under the run's own ambiguity rule.
I1 is data loss held at P1 because the capability is unprovisioned, with an explicit written warning that it becomes P0 the day a portal switch is flipped and no code change triggers a re-review.
W2 sits near P0 "silent failure" and stays P1 because the user does see a broken app.
Both are right, and I confirmed W2's characterisation directly: before the fix the app was visibly degraded, not silently wrong, and `localStorage` was never at risk.

**Features smuggled in under the no-features rule.** None.
Across the whole run: no new route, screen, endpoint, command, flag, table, column, config key, persisted key, injectable, component, file under `src`, environment variable or dependency.
The one user-visible addition, the recovery copy, was ruled in scope by Review 0 with five named conditions, and I checked all five again at HEAD: banner reused, reload user-initiated, no new injectable or persisted key, no new component or config key, and a unit test that pushes a real `UnrecoverableStateEvent`.
The one condition the fix departed from - dropping "Later" in the recovery state - was raised by pass 4, accepted on its merits, and recorded as a trade with a measured cost.

**Prohibited actions taken.** None, anywhere in the run's history. Enumerated in Part 4.

**Fixes that relocated a bug rather than removed it.** None.
B1's throw is handled at the only place it can arise and I could not find a second way to kill the server.
W2's remedy was verified to repair the app rather than defer the failure, and I specifically checked the two relocations it could have made: a reload loop (it does not loop) and a new trap reachable while merely offline (unreachable, per the `504` vs `404` analysis in Part 1).
W1 is correct in the Pages configuration, unchanged in the root configuration, and stable across install entry points.
R0-4 removed the silent reuse for the dist lane with no fallback and no retry; the serve lane keeps its own reuse, which is pre-existing and recorded as N8.
I1's deferral exists precisely because the available narrow fix would have relocated the race, which is the right instinct and the clearest sign the run understood this rule.

**Error handling that hides errors.** None.
`tools/serve-dist.mjs:38-51` catches one statement whose only two throw sources both mean "unparseable request"; `extname`, the shell branch and the `readFile` catch all remain separate, so any other fault still fails loudly.
The run added no other `catch`, and R0-4's change converts a silent success into a hard error rather than the reverse.
The one line that arguably hid a signal - `updateFailed.set(false)` on an incoming fault - was found by pass 4 and removed.

**Verification that does not actually exercise the changed path.** One instance survives, FF-2, and it is on two ARIA branches rather than on any logic.
The four fixes themselves are all exercised: B1 by a recorded manual reproduction (no gate can reach it, which is N3), W2 by seven unit tests plus a real damaged worker, W1 by an E2E assertion proven to fail on the old value, R0-4 by its own three code branches.
The wider version of the question is what N5, N7 and N8 exist to record, and the run was right to route all three forward rather than widen its own scope.

**Anything marked resolved without an artifact.** Nothing.
Four RESOLVED rows, four artifact sections in `reviews/ARTIFACTS.md`, and all four reproduce.
Two DEFERRED rows with reasons that survive checking.

---

## Part 7 - Gates re-run by this reviewer at `071b7d0`

Sandbox disabled for all of them.
`lsof -nP -iTCP:4200 -sTCP:LISTEN` was empty immediately before and after the full E2E run.

| Gate                        | Result at `071b7d0`                                                  | BASELINE                 | Verdict           |
| --------------------------- | -------------------------------------------------------------------- | ------------------------ | ----------------- |
| Web lint                    | exit 0, "All matched files use Prettier code style!"                 | 0                        | same              |
| Web build                   | exit 0, one budget warning on `chart-page.component.scss`, 368 bytes | 0, same single warning   | same              |
| Web unit tests              | 65 files, 1533 passed                                                | 1526 passed              | better (+7)       |
| Web coverage gate           | exit 0, 96.11 / 93.23 / 93.28 / 97.97                                | floors 94 / 92 / 90 / 96 | above every floor |
| Web E2E (`E2E_SERVER=dist`) | exit 0, 111 passed (42.8s)                                           | 111 passed               | same              |
| Parity fixture anti-drift   | `EXPORT_EXIT=0`, `FIXTURE_DIFF_EXIT=0`                               | 0 / 0                    | no drift          |
| iOS format lint             | exit 0, 0/105 files require formatting                               | 0/105                    | same              |
| iOS lint                    | exit 0, no output                                                    | no violations            | same              |
| iOS build + test            | `** TEST SUCCEEDED **`, 335 tests in 38 suites                       | 335 tests                | same              |

Nothing is worse than baseline on either platform, and the coverage figures match the ledger's closing table to the last digit.
`git diff fc7d0c3..071b7d0 -- ios/` is empty for the whole run, so the three iOS gates could not have moved; I ran them anyway rather than assert it.

---

## Part 8 - Experiments and their restoration, disclosed in full

- Two tracked source files were mutated four times for Part 4 and restored from byte copies each time: `src/app/app.ts` (md5 `fffc66db40373936493a86e5b12c095e` before and after) and `src/app/core/services/app-update.service.ts` (md5 `12154a54160f568b5cf568d518ce4b82` before and after). `git diff --exit-code` on both is clean.
- Two files inside the gitignored `dist/` tree were swapped and restored byte-identically: `manifest.webmanifest` (md5 `b139d1dbcc0e05f6454cf25d9d48dae1`) and `ngsw-worker.js` (md5 `84f509c7ab1bf74fe8cd95f1b2551768`).
- One `--base-href /blackjack-trainer/` build, one mirrored copy of the parent commit's `serve-dist.mjs`, four probe scripts and all logs live in the scratchpad outside the repository.
- Servers started and stopped by me: `tools/serve-dist.mjs` twice (ports 4411, 4412), five throwaway static servers (4413-4417), and no `ng serve`. All are stopped.
- A foreign `ng serve` belonging to another project appeared on `[::1]:4200` late in this review. It is not mine and I did not stop it. It does not hold `127.0.0.1:4200`, which the E2E lane binds, and it appeared after the full-suite run reported above.
- Working tree at the end: `git status --short` shows only the untracked `.agents/` and `.codex/` that were there at BASELINE, plus this file. `git diff` and `git diff --cached` are both empty. Nothing was committed.

## Part 9 - For NEXT ROUND

FF-1 through FF-5 above, none of which needs a code change except FF-2, and all of which are P2.
They should be read after N7, which is the one P1 waiting and which I confirmed by execution.
