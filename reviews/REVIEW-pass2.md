# REVIEW-pass2 - Pass 2 (correctness), finding B1

Independent adversarial review of `1413989fc9f13beb326cdd47dce74e150fa26355..7377dca17f65cd95088e782a54ce51d424b4637f`.
Subject: the single commit `7377dca`, "stop a malformed request URL from killing the dist server", which the frozen work list assigns to B1 with a terminal state target of RESOLVED (`PROD-READINESS.md:177`).

- Reviewed at `7377dca17f65cd95088e782a54ce51d424b4637f`, branch `prod-readiness/2026-08-10`.
- Stage diff: one file, `tools/serve-dist.mjs`, +20/-4 (`git diff --stat 1413989..7377dca`).
- Everything below was re-run or re-read by this reviewer.
  No claim from the builder is taken on trust, and the commit message is treated as a claim, not as evidence.

## VERDICT: PASS-WITH-FINDINGS

The code change is real, minimal, correctly scoped, and it does what the work list asked.
I reproduced the crash on the parent commit and the fix on this one, then tried to break the fixed server and could not.
Every gate in `reviews/BASELINE.md` was re-run and every one matches baseline exactly, on both platforms.
No feature was smuggled in, no prohibited action was taken, and the fix does not relocate the bug or hide any error.

It is not a clean pass for three reasons, all P2, none of them a product regression.
B1 is closed in code but is still `pending` in the ledger with no artifact anywhere in the tree, which is the one thing Review 0 explicitly conditioned this fix on.
The comment the fix installs asserts an E2E outage that `reviews/BASELINE.md` itself contradicts.
And no gate in this repository exercises the changed path, so the green E2E run the stage can point at is evidence that the fix broke nothing, not evidence that it works.

Why not REJECT: the substance survives every check I could put it through, and the three findings are recorded-evidence and coverage gaps rather than defects in the shipped behaviour.
Why not a clean PASS: a fix whose only verification is an unrecorded manual test is, by this run's own definition at `PROD-READINESS.md:190`, not RESOLVED.

---

## Part 1 - The fix, verified against the parent commit

I extracted both versions of the file and ran each as a real server against the real bundle, in a mirrored directory layout so the module-relative `ROOT` resolved to `dist/blackjack-trainer/browser`.

Parent commit `1413989`, `tools/serve-dist.mjs`:

```
/                                  -> 200
/manifest.webmanifest              -> 200
/%.js                              -> 000
/manifest.webmanifest              -> 000
PROCESS ALIVE?: NO-DEAD

URIError: URI malformed
    at decodeURIComponent (<anonymous>)
    at Server.<anonymous> (.../tools/before.mjs:32:26)
Node.js v24.15.0
```

This commit `7377dca`, same probes, same bundle:

```
/                                  -> 200
/%.js                              -> 404
/manifest.webmanifest              -> 200
/%zz.js                            -> 404
/%E0%A4%A.js                       -> 404
/%FF.js                            -> 404
/a%.css                            -> 404
/%00.js                            -> 404
/%2e%2e/%2e%2e/%2e%2e/package.json -> 404
/manifest.webmanifest              -> 200
PROCESS ALIVE?: YES
```

The finding is genuinely removed, not relocated.
The process survives, the response is a clean 404, and the server log after all of it contains nothing but its own startup banner.

I then tried to find a second way to kill it, since a narrow fix that leaves a sibling trigger reachable would close B1 on paper only.

- 200 consecutive `/%.js` requests: all 404, server alive (`curl / -> 200` afterwards).
- 60 requests aborted mid-flight by destroying the socket while the server was awaiting `readFile` on a 74 kB chunk: server alive, no error output.
  This matters because Playwright cancels in-flight requests routinely, so it is the abort path an E2E run actually walks.
- Non-origin-form request targets sent over a raw socket, which is the one shape that would defeat the `normalize()` containment comment at `tools/serve-dist.mjs:40`.
  `new URL('a:b/../../../../package.json', base).pathname` is **relative**, `normalize` does not collapse a leading `../` on a relative path, and `join(ROOT, ...)` then resolves to `/Users/arthurzhang/dev/blackjack-trainer/package.json`.
  That is a real escape at the parsing layer, so I sent it over the wire, and Node's HTTP parser answers `400 Bad Request` before the handler ever runs.
  Same for `foo:../../../../../../package.json` and `mailto:../../package.json`.
  Absolute-form targets with a special scheme (`http://evil.com/index.html`) are accepted but always yield an absolute pathname, so they cannot escape either.
  **No finding.** Review 0's NOT-DEFECT ruling on the traversal comment holds, now for a stronger reason than the curl probes it rested on.

Condition-by-condition against the constraints Review 0 attached to this fix at `reviews/REVIEW-0.md:77-78`:

- "Catch only the parse/decode": met.
  The `try` at `tools/serve-dist.mjs:38-50` spans exactly one statement, and the two things that statement can throw (`new URL` on an unparseable target, `decodeURIComponent` on a bad escape) both mean the same thing, that the client sent something unparseable.
- "Do not wrap the whole request handler in one `try`": met.
  Lines 51-57 (`extname`, the extensionless shell branch) sit outside any `try`, so a fault there still fails loudly.
- "The 404 path already in place stays a separate catch": met.
  The `readFile` catch at lines 62-64 is still its own catch; it now calls the shared `notFound` helper rather than inlining the same two lines.
  The refactor is behaviour-preserving, verified over the wire: status `404`, body `not found`, `content-type: text/plain; charset=utf-8`, byte-identical to the parent commit's response.
  Extracting the helper is the minimum needed to emit the same 404 from a second site, so it is a refactor that closes a specific finding rather than cleanup.
- "The reproduction command is the artifact": **not met.** See F2-1.

Scope: no endpoint, screen, command, flag, table, column or config key is added.
No user-visible capability changes, because this server is not part of either shipped artifact.
Nothing prohibited was done: only `tools/serve-dist.mjs` is touched (`git diff --name-status 1413989..7377dca`), no workflow or deploy file is in the diff, no dependency moved, no file was deleted, the branch has no upstream and `origin/main` is untouched at `796a4e4`, and the reflog shows six plain commits with no rebase, amend or force update.

---

## Part 2 - Findings

### F2-1 - B1 is closed in code but not in the ledger, and no artifact exists

**P2 | evidence: `git diff --stat 1413989..7377dca` shows `tools/serve-dist.mjs` as the only changed file; `PROD-READINESS.md:194` still reads `| B1 | pending |`; `PROD-READINESS.md:190` defines the terminal state as "RESOLVED (with artifact evidence)"; `PROD-READINESS.md:177` sets B1's target for this pass to RESOLVED; `reviews/REVIEW-0.md:78` requires that "the reproduction command above must be re-run as the artifact" | why the builder missed it: the code edit was treated as the deliverable and the ledger as bookkeeping to batch later, so the stage's own definition of done was never applied to the stage itself.**

Nothing in the tree at this commit records that the fix was tested.
There is no reproduction output, no updated status row, and no note under the B1 row.
A reader of the committed artifacts alone learns only that a file changed and that a commit message asserts a reason, which is precisely the class of claim this review contract says to discard.

I do not rate this P1.
It causes no product defect, and the fix is in fact correct, which I established by doing the verification myself.
But it is the only condition Review 0 attached to this finding that the stage did not satisfy, and under `PROD-READINESS.md:190` the run cannot call B1 RESOLVED until the artifact exists.

This is **this stage's own gap, not a pre-existing finding**, so it belongs inside this stage rather than in NEXT ROUND.
It is closed by a commit that records the before/after reproduction and flips `PROD-READINESS.md:194` to RESOLVED, not by any further code change.

### F2-2 - the installed comment asserts an incident that BASELINE contradicts

**P2 | evidence: `tools/serve-dist.mjs:44-45` states "one such request took the whole E2E server down and every test after it failed as a connection error"; `reviews/BASELINE.md:160` records `111 passed` for `E2E_SERVER=dist npm run e2e` at the pre-fix commit; `reviews/REVIEW-0.md:255` records an independent green re-run of the same suite, also pre-fix; `PROD-READINESS.md:98` gives B1's actual evidence as a `curl http://127.0.0.1:4321/%.js` reproduction | why the builder missed it: the comment was written as a narrative justification for the fix rather than transcribed from the recorded evidence, and no gate in this repository checks prose.**

The E2E suite passed 111/111 twice against the crashing server.
It could not have done that if any test had triggered the crash, and no test can: every `page.goto` in `e2e/` uses a clean path, and the suite's one malformed-input navigation is `?seed=not-a-number` (`e2e/smoke/seeded.e2e.ts:85`), a query parameter with no percent-escape in it.

The rest of the comment is accurate and worth keeping.
The handler is `async`, an escaping throw is an unhandled rejection, and Node ends the process on those, which my parent-commit reproduction confirms verbatim.
The stated reason for scoping the `catch` narrowly is correct and is the right thing to leave behind for the next maintainer.
Only the sentence claiming a past E2E outage is unsupported, and it is the sentence a future reader is most likely to treat as the reason the code looks the way it does.

The accurate replacement is the thing that did happen: a `curl` to `/%.js` kills the server, and because this process is the Playwright `webServer`, a crash would present as a mass of unrelated connection failures.
That states the risk without asserting an event.

Introduced by this stage's own change, so it is a regression in the ledger's sense and belongs inside this stage.

### F2-3 - no gate exercises the changed path, so the stage's green run proves nothing about the fix

**P2 | evidence: `grep -rn "tools/" e2e/ src/` returns only `e2e/README.md:24`, a prose mention; `tsconfig.spec.json:9` includes only `src/**/*.d.ts` and `src/**/*.spec.ts`, so `ng test` cannot see anything under `tools/`; E2E reported `111 passed` before the change (`reviews/BASELINE.md:160`) and `111 passed` after it (my run, Part 4), i.e. the suite returns an identical result against a server that crashes and one that does not | why the builder missed it: a green E2E run after the change looks like verification of the change, when it is only evidence that the change broke nothing.**

Every automated signal this repository can produce is identical on both sides of this commit.
A future edit that reintroduces the crash would pass build, lint, unit tests, coverage, E2E, the parity gate and both iOS gates.

I am deliberately not calling for a unit test here, because adding one is not as cheap as it looks: `tsconfig.spec.json:9` scopes the spec include to `src`, so a spec under `tools/` requires widening that glob, which is new test scaffolding rather than a fix to something that exists.
The proportionate remedy in this run is the artifact Review 0 already required and F2-1 already tracks.
The harness gap itself is not a regression from this stage's changes, so it goes to NEXT ROUND, recorded below.

### For NEXT ROUND, not this run's work list

**N3 | P2 | `tsconfig.spec.json:9` and `angular.json` (`@angular/build:unit-test` with `vitest.config.ts`) confine unit testing to `src`, and nothing anywhere covers `tools/`.**
Two files live there, `serve-dist.mjs` and `export-parity-fixtures.ts`, and the second one feeds the parity anti-drift gate that CI runs.
Neither has a single test.
This is pre-existing, it is not a regression from this run's changes, and closing it means adding a test harness path, so it is explicitly **not** for the frozen work list.

---

## Part 3 - The explicit checks this review was required to make

- **Fabricated or unreproducible findings:** none in the ledger this stage touched.
  B1 reproduces exactly as written, on the parent commit, with the same error and the same `000` follow-up responses.
  One fabricated-adjacent claim exists in the stage's own code comment, raised as F2-2.
- **Evidence citations that do not say what they are claimed to say:** one, F2-2.
  I re-derived every line number I cite in this review against the files at this commit rather than reusing any from the ledger or Review 0.
- **Severity inflation:** none.
  The stage asserts no severities.
  My own three findings are each P2, and where P1 was arguable (F2-1, since the run's own rule makes an unverified fix non-RESOLVED) I took the lower grade and said why: the fix is correct in fact, and the gap is in the record rather than in the behaviour.
- **Severity deflation:** none found.
  B1 stays P1 as a dev/CI-only crash, which my traversal and abort probes did not change.
  Nothing here reaches P0: no data is lost, nothing is exposed, no failure is silent, and neither shipped artifact contains this file.
- **Features smuggled in under the no-features rule:** none.
  The diff adds one private helper function and one `try`/`catch` in a dev-only tool.
  No endpoint, screen, command, flag, table, column or config key.
- **Prohibited actions taken:** none.
  Verified: no push (`origin/main` still `796a4e4`, branch has no upstream), no rebase, amend, force update or tag change (reflog shows six plain commits after one checkout), no workflow or deploy file in the diff, no dependency change, no file deleted, no credential touched, no non-local resource contacted.
  Every probe I ran was against `127.0.0.1`.
- **Fixes that relocated a bug rather than removed it:** no.
  The throw is handled at the only place it can arise, the catch neither rethrows nor defers, and I confirmed by execution that the process survives the trigger, 200 repeats of it, and 60 mid-flight aborts.
- **Error handling that hides errors:** no.
  The `catch` is scoped to a single statement whose only two throw sources both mean "unparseable request", and the handler's other failure modes remain uncaught and still fail loudly.
  Wrapping the whole handler, the failure mode Review 0 warned about, did not happen.
  Worth noting without raising it: a malformed request is answered `404` rather than `400`, which blurs "you sent garbage" into "that asset is missing", and neither 404 site logs anything.
  In a dev-only static server with no log sink that matches the existing style and costs nothing, so it is an observation, not a finding.
- **Verification that does not actually exercise the changed path:** yes, F2-3.
  This is the third instance of the pattern in this run, after R0-1 and R0-4, and it is the one the reviewer had to close by hand.
- **Anything marked resolved without an artifact:** nothing is marked resolved at all, which is F2-1.
  The status table at `PROD-READINESS.md:192-199` still carries four `pending` and two `DEFERRED`.

---

## Part 4 - Gates re-run by this reviewer at `7377dca`

Every command was run with the tool sandbox disabled, as `reviews/BASELINE.md:14-20` requires, and `xcodebuild`'s status is read from the `** TEST SUCCEEDED **` marker per `reviews/BASELINE.md:223-227`.

| Gate               | Result at `7377dca`                                                       | vs BASELINE |
| ------------------ | ------------------------------------------------------------------------- | ----------- |
| `npm run lint`     | exit 0                                                                    | same        |
| `npm run build`    | exit 0, one budget warning on `chart-page.component.scss`, 368 bytes over | same        |
| `npm test`         | 65 files, 1526 tests, all passed                                          | same        |
| `test:coverage`    | 96.1 / 93.22 / 93.27 / 97.96, all four floors met                         | identical   |
| E2E (`dist`)       | 111 passed, port 4200 confirmed free beforehand                           | same        |
| Parity anti-drift  | `EXPORT_EXIT=0`, `FIXTURE_DIFF_EXIT=0`                                    | no drift    |
| `swiftformat`      | exit 0, 0/105 files require formatting                                    | same        |
| `swiftlint`        | exit 0, no output                                                         | same        |
| `xcodebuild` tests | `** TEST SUCCEEDED **`, 335 tests in 38 suites                            | same        |

Nothing is worse than baseline on either platform.
The iOS gates cannot be affected by a change to a `.mjs` file, but they were run rather than assumed.

Port 4200 was checked with `lsof -nP -iTCP:4200 -sTCP:LISTEN` immediately before the E2E run and was free, so R0-4's silent-server-reuse hazard did not apply and the suite genuinely ran against `tools/serve-dist.mjs`.
That precondition still has to be checked by hand on every run, which is R0-4's point and is scheduled for pass 7.

Working tree after all of the above: `git status --porcelain` shows only the two pre-existing untracked directories `.agents/` and `.codex/`.
No tracked file was modified by this review, and nothing was committed.
All probe servers, scripts and file copies were written under the scratchpad directory outside the repository.

---

## Part 5 - What must happen before this stage can be called closed

1. Record the artifact and flip the status row.
   The reproduction is two commands against the parent and this commit; it is the evidence `PROD-READINESS.md:190` requires and `reviews/REVIEW-0.md:78` asked for by name.
   Until it exists, B1 is `pending` by the run's own rules, whatever the code does.
2. Correct or drop the sentence at `tools/serve-dist.mjs:44-45`.
   The suite it names passed 111/111 against the crashing server, twice.
3. Add N3 to NEXT ROUND.
   Do not add it to the frozen work list, and do not widen `tsconfig.spec.json` in this run to fix F2-3.
4. Nothing in the code needs to change.
   The fix itself is correct, and I could not break it.
