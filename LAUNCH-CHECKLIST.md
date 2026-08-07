# Launch checklist - Blackjack Trainer 1.0

Target: **iOS App Store submission** of the trimmed v1 build (see `TRIM-REPORT.md`).
The Angular web app is a secondary surface and is currently deployed nowhere; see decision D3.

Every item is either **agent** work (`A*`, done by a coding agent against this repo) or **owner** work (`O*`, needs the Apple account, a device, or a legal attestation only you can make).
Decisions (`D*`) gate some of both and are listed first.

Status legend: `[ ]` not started, `[~]` in progress, `[x]` done, `[-]` cut or not applicable.

**Baseline verified 2026-08-06:** web 1516 tests green, iOS 330 tests green, production build clean, `npm audit --omit=dev` reports 0 vulnerabilities.

---

## Decisions (do these first, they change scope)

- [x] **D1. Universal or iPhone-only?** **Answered 2026-08-06: iPhone-only for 1.0.** A7 is cut, A8 needs no iPad set, and `TARGETED_DEVICE_FAMILY` drops to `'1'`.
      `ios/project.yml` sets `TARGETED_DEVICE_FAMILY: '1,2'` and enables all four iPad orientations.
      Staying universal means an iPad screenshot set is mandatory at submission and every screen has to hold up in iPad landscape.
      Dropping to `'1'` removes A7 and half of A8 and is a legitimate v1 scope cut.
- [x] **D2. Ship iCloud sync, or cut the claim?** **Answered 2026-08-06: cut the claim.** The store description omits sync; the entitlement stays declared and inert, O2/O11 leave the critical path, and provisioning later turns sync on without an app update.
      The `com.apple.developer.ubiquity-kvstore-identifier` entitlement is declared but the capability is not provisioned, so sync is inert today.
      Either do O2 and test it on two devices (O11), or strike "sync across your devices with iCloud" from the store description.
      Shipping the claim without the capability is a functional-defect rejection.
- [x] **D3. Deploy the web app publicly, or host only the two legal pages?** **Answered 2026-08-06: deploy the full web app.** A11 builds and publishes the app plus the legal pages, and A4 must be fixed properly (the shared `8C9D.github.io` origin makes the backup prefix sweep a real cross-app leak/wipe).
      App Store Connect requires a privacy policy URL and a support URL regardless.
      The repo is public, so GitHub Pages is free either way.
      Note: `8C9D.github.io` is a **shared origin** across all your Pages projects, which turns suspicion S2 (A4) from theoretical into real if the web app ships there.
- [x] **D4. Angular 22 now, or accept the dev-only advisories?** **Answered 2026-08-06: upgrade now.** Overrides the accept-for-launch recommendation recorded in `docs/security-pass-2026-08-06.md`; the upgrade happens before the remaining launch work so everything after is validated against Angular 22.
      Production dependencies are clean; the 5 remaining advisories are dev-only (`undici` under `@angular/build`, a Windows path traversal under the CLI MCP server) and npm's only fix is a major upgrade.
      Accepting is defensible for launch; record the decision either way.
- [x] **D5. Price.** **Answered 2026-08-06: Paid** (tier to be picked in App Store Connect). **This adds a submission gate:** the Agreements, Tax, and Banking section must be completed and cleared before you can submit, which can take days - start it now (it slots before O5). Free is suggested in `docs/app-store-submission.md`. Paid apps require banking and tax forms in App Store Connect, which take days to clear.

---

## Blockers

These stop a submission or produce a rejection. Everything else is quality.

| #   | Item                                                                       | Lane     |
| --- | -------------------------------------------------------------------------- | -------- |
| B1  | No `PrivacyInfo.xcprivacy` in a target that uses `UserDefaults` in 6 files | A1       |
| B2  | Screenshots predate the trim and show archived features                    | A8       |
| B3  | Store description promises unprovisioned iCloud sync                       | D2 / A9  |
| B4  | `privacy.html` and `support.html` have unfilled placeholders and no host   | A10 / O4 |
| B5  | App name not reserved                                                      | O3       |
| B6  | Hard-20 chart drill is wrong on **both** platforms                         | A2       |

---

## Agent lane

Ordered by priority. Each item states its own done-when so completion is checkable rather than asserted.

### Blocking correctness and compliance

- [x] **A1. Add the privacy manifest.**
      _Done 2026-08-06: `ios/BlackjackTrainer/PrivacyInfo.xcprivacy` added (tracking false, no collected data, UserDefaults with reason CA92.1); xcodegen 2.45.4 classifies it as a bundle resource from the existing directory glob, so no `project.yml` edit was needed; sweep of the app target for file-timestamp, disk-space, boot-time and active-keyboard APIs found none; verified present and `plutil`-clean at the built `.app` root; iOS suite green (325 tests)._
      Apple requires a `PrivacyInfo.xcprivacy` declaring "required reason" API use; `UserDefaults` is on that list.
      Without it, uploads draw the ITMS-91053 "Missing API declaration" notice and can be rejected.
      Declare `NSPrivacyTracking = false`, empty `NSPrivacyTrackingDomains`, empty `NSPrivacyCollectedDataTypes`, and one `NSPrivacyAccessedAPITypes` entry: `NSPrivacyAccessedAPICategoryUserDefaults` with reason `CA92.1`.
      Wire it into `ios/project.yml` as a bundle resource, regenerate the project, and sweep the target for the other required-reason categories (file timestamps, disk space, system boot time, active keyboard) before declaring only the one.
      **Done when:** the file is present at the root of the built `.app`, the sweep is recorded, and the iOS suite is still green.

- [x] **A2. Fix the hard-20 chart drill (finding F4), both platforms.**
      _Done 2026-08-06: reproduced first with a failing test on each platform (web `drill-hand.spec.ts` + `basic-strategy-drill-page.component.spec.ts`, iOS `DrillHandTests` + `PinnedHandTests` — all four showed the Q,Q pair, the offered Split, and the `pair-10-v-10` filing verbatim).
      Fix: hard 20 has no two-card non-pair form (any two ten-values classify as the 10,10 pair, which must stay so — the 10,10 v 4/5/6 split deviations depend on it), so a hard-20 pin now deals a **three-card** hard 20; `Scenario.player` widened from a two-card tuple to a card list on both platforms, `scenarioRefFor` files N-card hands at their total, the web grades the three-card opening through the existing `evaluatePlay`, and iOS gained the mirror `decideMultiCard` (soft/hard total row narrowed to hit or stand).
      Banner and question both read "Hard 20", only Hit/Stand offered, miss files under `hard-20-v-10` (asserted in the new tests).
      Hard 4 confirmed still unreachable: web `parseScenarioKey('hard-4-v-6')` → null (existing test), iOS chart rows start at 5 and `scenarioRefFor` classifies 2,2 as a pair, so no hard-4 ref is ever recorded — its same-value fallback in `hardTotalCards` stays defensive-only.
      Verified: web 1518 green, iOS 327 green, `export:fixtures` diff clean, prettier/eslint/swiftformat/swiftlint clean._
      `src/app/features/drill/drill-hand.ts:242` and `ios/BlackjackTrainer/Flow/DrillHand.swift:124` enumerate only `a < b` pairs, so hard 20 has no candidate and falls through to a same-value pair.
      Both charts render hard rows through 20 (`chart-page.component.ts:53`, `StrategyChart.swift:15`), so the cell drills `Q,Q`, asks "10,10 vs 10", offers Split, and files misses under `pair-10-v-10`.
      Reproduce first with a failing test on each platform, then fix.
      **Done when:** drilling hard 20 deals a non-pair hard 20, the banner and question agree, Split is not offered, the miss files under `hard-20-v-*`, the unreachable hard-4 path is confirmed still unreachable, and both suites are green.

- [x] **A3. Close suspicion S1 (timezone day keys).**
      _Killed 2026-08-06, both platforms, by executing the exact probe the suspicion asked for: the real `streak()`/`last7()`/miss-tally window under `TZ=America/Santiago` (midnight transitions: a 25-hour Apr 4 and a Sep 6 with no 00:00–00:59) and `TZ=Australia/Lord_Howe` (30-minute shift) with the clock pinned to 00:15/23:45, plus a raw walk sweep vs pure calendar arithmetic — zero divergence; Foundation's `Calendar` day-adding probed identically for the Swift store.
      Regression tests committed: `day-keys-dst.spec.ts` (web, sets `process.env.TZ` per test) and `PracticeHistoryStoreTests.dayWalkLandsOnConsecutiveCalendarDatesAcrossDSTTransitions` (iOS); outcome recorded in `review/findings.md`._
      `localDateKey` is local-time, `isLocalDateKey` validates by a UTC round trip, and `dateKeyDaysAgo` walks with `setDate`.
      Exercise `streak()`, `last7()` and the miss-tally cutoff under `TZ=America/Santiago` and `TZ=Australia/Lord_Howe` across a DST transition with the clock pinned near midnight, and check the Swift `PracticeHistory` equivalent.
      **Done when:** the suspicion is confirmed and fixed, or killed - and either way a regression test pins the behaviour, and `review/findings.md` records the outcome.

- [x] **A4. Close suspicion S2 (backup key prefix).**
      _Done 2026-08-06, after D3 chose to deploy the full web app on the shared origin (which made this real rather than theoretical).
      Reproduced first with two failing specs (a foreign `blackjack-scoreboard` key swept into the export; a restore clearing it and planting a tampered file's foreign key), then fixed: the backup is defined by a declared `BACKUP_KEYS` list; export reads and restore clears/writes only declared keys.
      The prefix's completeness guarantee moved into `backup-keys.spec.ts`, which drives every storage-backed service and fails on any undeclared stored key in either direction.
      Recorded in `review/findings.md` (suspicion 3); web suite green at 1526._
      `BACKUP_KEY_PREFIX` is `'blackjack-'`, so a web export sweeps and a restore clears every same-prefixed key on the origin.
      If D3 puts the app on `8C9D.github.io`, that origin is shared with your other Pages projects and this stops being hypothetical.
      **Done when:** export and restore touch only keys the app declares, covered by a test, or the risk is explicitly accepted in writing with D3's answer as the justification.

### Quality passes

- [x] **A5. Re-run the security pass on the post-trim tree.**
      _Done 2026-08-06: fresh report at `docs/security-pass-2026-08-06.md`, every claim executed on this tree (commands listed in the report).
      Clean on secrets, network calls, sinks, `.gitignore`, CI, and production dependencies (`npm audit --omit=dev` = 0; full audit = 5 dev-only, now 4 moderate + 1 high `undici` under `@angular/build`).
      One finding, fixed: `FlowPrefsStore`/`MissTallyStore`/`CountDriftStore` let an undecodable iCloud payload wipe valid local state to defaults/empty - reproduced with three failing tests, fixed to refuse-and-keep-local (matching the stats/history stores), four regression tests added, iOS suite green at 332.
      D4 recommendation written into the report: accept the dev-only advisories for 1.0, schedule Angular 22 post-launch._
      `docs/security-sanity-check.md` is closed and predates the trim.
      Re-verify no tracked secrets, no network calls in either target, `.gitignore` publish safety, and the iCloud KVS trust boundary (data arriving from another device is untrusted input; the trim added a test for unknown keys, extend that thinking to malformed values).
      Re-run `npm audit`, and write the D4 recommendation without acting on it.
      **Done when:** a fresh dated report exists and every claim in it was executed, not inferred.

- [x] **A6. iOS accessibility pass.**
      _Done 2026-08-06: full report with renders at `review/a6-accessibility-pass.md` (+ `review/a6-renders/`).
      Two systemic defects found and fixed: no spoken verdict anywhere (VoiceOver now hears every grade in all three drills, and the Done screen announces itself), and ~70 fixed-size fonts that ignored Dynamic Type (all moved to semantic styles).
      The clipping that scaling then exposed was fixed screen by screen (scaled goal ring, wrapping texts, stacked trainer cards, and scroll-at-accessibility-sizes on Home/Done/both drills), re-rendered at `accessibility5` to confirm.
      Labels/traits/focus order verified already-solid; Reduce Motion is honoured vacuously (zero animations in the target, verified by grep); contrast parity confirmed hex-for-hex against the web tokens the axe e2e proves.
      Remaining device-only check is the O8 step 11 VoiceOver walk; suite green at 335, lint clean._
      Only 12 files in the target reference any accessibility API and there is no automated coverage, which makes this the largest untested gap in the shipping app.
      Cover VoiceOver labels, traits, and focus order on every shipping screen; Dynamic Type up to the largest accessibility size without clipping or truncation; Reduce Motion honoured by the auto-advance and the correct-answer flash; and colour contrast parity with the web tokens.
      The web's `e2e/smoke/accessibility.e2e.ts` is the standard to match.
      There is no iOS UI-test target, so render each screen to PNG from the test target with `ImageRenderer` at the largest text size and actually look at the output.
      **Done when:** every defect found is fixed, the renders are attached to the report, and the timed drill loop is usable end to end under VoiceOver.

- [-] **A7. iPad layout pass.** _(only if D1 = universal)_
  _Cut 2026-08-06: D1 answered iPhone-only, `TARGETED_DEVICE_FAMILY` is `'1'` and the iPad orientation list is gone from `project.yml`._
  Render or screenshot every shipping screen on iPad Pro 13-inch in portrait and landscape and fix what breaks.
  Portrait-first phone layouts usually fail here in predictable ways: stretched single-column content, tap targets adrift, and the chart grid over-wide.
  **Done when:** every screen holds up in both orientations at both iPad sizes available in the simulator.

- [x] **A8. Re-take App Store screenshots.**
      _Done 2026-08-06, iPhone 6.9-inch set only (D1 cut the iPad set).
      All six shots in `ios/AppStore/screenshots-6.9/` replaced with post-trim captures at exactly 1320x2868, same tellingly-named sequence as before: `1-daily-loop` (12/20 ring, 3-day streak, accuracy chips), `2-instant-feedback` (a graded miss with the rule spelled out and the correct/your-pick button states), `3-basic-strategy` (Soft 18 vs 3), `4-card-counting` (mid-stream), `5-deviations` (Hard 16 vs 10 · TC +4), `6-settings` (table rules and counting system).
      Every shot shows only shipping surfaces; each state was posed through the drill models via new documented render seams (`init(model:onExit:)` on the three drill views, the pattern the showdown screen used pre-trim) and captured from the test target hosted in the app through the real render server (`drawHierarchy` on a scene-attached window), which draws the navigation bars and controls at full fidelity.
      Deviation from the item's letter, recorded: the capture host is the app built for testing rather than a driven Release build - there is no UI-test target to drive one, and SwiftUI layout is configuration-independent.
      Suite green at 335 after removing the throwaway probe; the seams stay._
      The existing `ios/AppStore/screenshots-6.9/` set is from 2026-07-24, twelve days before the trim, and shows features the app no longer has - a Guideline 2.3.3 rejection.
      The 6.9-inch device type is installable locally (`xcrun simctl create` against `com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro-Max`), and iPad Pro 13-inch (M5) is already available.
      Capture from a Release build driven to each state, at 1320x2868 for iPhone and the 13-inch iPad size if D1 = universal.
      **Done when:** every shot shows only shipping surfaces, the old set is replaced, and the file names say what each shot demonstrates.

- [x] **A9. Rewrite the store metadata against the app that exists.**
      _Done 2026-08-06: `docs/app-store-submission.md` rewritten for the trimmed app and the answered decisions.
      The description ships in two variants - A without the iCloud claim (use for 1.0, per D2) and B with it, ready for the release after O2/O11 - so O5 is a copy-paste either way; the promo text dropped its sync claim; the identity table now says iPhone-only (D1) and Paid with the banking/tax gate called out (D5).
      The review notes lead with the bolded no-wagering paragraph (no real or virtual currency, no chips, no bankroll, no bets, no payouts, no hand played to an outcome) before anything else.
      The age-rating section still refuses to pre-answer Simulated Gambling and still forbids carrying the old answer forward; the stale human checklist now defers to the owner lane here instead of duplicating it.
      No sentence describes an archived feature (checked against `TRIM-REPORT.md`'s cut list)._
      Update `docs/app-store-submission.md`: description, keywords, promotional text, and review notes.
      Supply the description in two variants, with and without the iCloud claim, so O5 becomes a copy-paste once D2 is answered.
      The review notes matter more than usual here - card-counting instruction gets read closely, so "no wagering, no real or virtual currency, no chips, no hand ever plays out to a win or lose outcome" must be impossible to miss.
      **Done when:** no sentence in the metadata describes an archived feature, and the age-rating section still refuses to pre-answer Simulated Gambling on the owner's behalf.

- [x] **A10. Finish the privacy and support pages.**
      _Done 2026-08-06: both pages now match the shipped app - no-sync wording per D2 (the privacy page describes iCloud only as a possible future update through the user's own account; the support FAQ's sync answer became a reset-practice-data answer), a no-permissions line, an updated effective date, and the support page's privacy link filled with the real Pages URL (`https://8c9d.github.io/blackjack-trainer/privacy.html`, from the `8C9D/blackjack-trainer` remote + the A11 workflow layout).
      Exactly one placeholder remains per page: `CONTACT_EMAIL_HERE` (the support email is O4's to choose).
      Both pages are self-contained single files with responsive, dark-mode-aware styling._
      `ios/AppStore/privacy.html` and `support.html` still carry `CONTACT_EMAIL_HERE` and `PRIVACY_URL_HERE`.
      Bring both in line with the shipped app (no data collected, no accounts, no permissions of any kind, stats on-device and optionally in the user's own iCloud) and reduce the unknowns to exactly one clearly marked placeholder per page for the owner to fill.
      **Done when:** both pages are accurate, self-contained, readable on a phone, and each has at most one placeholder left.

- [x] **A11. Add the Pages deploy workflow.** _(shape depends on D3)_
      _Done 2026-08-06, full-app shape per D3: `.github/workflows/pages.yml` builds the Angular app with `--base-href /blackjack-trainer/`, lays the two legal pages and a `404.html` SPA fallback beside it, and deploys with the standard `upload-pages-artifact`/`deploy-pages` pair on every push to `main` (plus manual dispatch).
      The build and assemble steps were run locally exactly as written and pass; the deploy step itself can only run on GitHub once O4 flips Settings > Pages > Source to "GitHub Actions".
      **The URLs for App Store Connect (O4 hands these to O5):**
      privacy policy `https://8c9d.github.io/blackjack-trainer/privacy.html` · support `https://8c9d.github.io/blackjack-trainer/support.html` · web app `https://8c9d.github.io/blackjack-trainer/`._
      A GitHub Actions workflow publishing at minimum the two legal pages, and the built web app too if D3 says so.
      The owner flips Settings > Pages > Source to GitHub Actions (O4); do not attempt that from the repo.
      **Done when:** the workflow is committed and its build step passes locally, with the exact URLs the owner will paste into App Store Connect written into this checklist.

- [x] **A12. Adversarial re-review of the shipping iOS surface.**
      _Done 2026-08-06: recorded in `review/findings.md` under "Launch re-review of the shipping iOS surface", same confirmed/killed structure, every confirmed entry reproduced by executing it.
      Four confirmed, all fixed the same day: L1 undecodable iCloud payloads wiping prefs/tally/drift (fixed under A5), L2 a stored card pace near `Int.max` trapping the counting stream's nanosecond multiply (probe run crashed the test runner; now `Duration`-based), L3 a typed count wider than `Int` trapping in true-count grading and again in `CountFormat` (probe hit the fatal conversion error; now clamped/`Int(exactly:)`), L4 day keys following the device calendar identifier (executed: Buddhist device writes `2569-08-11`; now a pinned gregorian `dayKeyCalendar`).
      Four candidates killed (reset-resurrection via cloud, phantom hotkeys, stream-vs-backgrounding, data-reachable preconditions), with the backgrounding kill flagged for the A15 device-condition walk.
      iOS suite green at 335 after the fixes._
      `review/findings.md` was written against the pre-trim app, and most of what it examined is now archived.
      Review what actually ships, on the same standard: reproduce every candidate by executing it, and kill what does not survive.
      **Done when:** findings are recorded with the same confirmed / killed / suspicion structure, and each confirmed one is either fixed or explicitly deferred here.

### Release engineering

- [x] **A13. Version and release hygiene.**
      _Done 2026-08-06 (tag applied at A16): the versioning story is one marketing version across both platforms - web `package.json` 0.0.0 → 1.0.0 (lockfile regenerated), iOS already `MARKETING_VERSION 1.0` + build 1 as the upload counter; future releases bump the marketing version together and the iOS build number per upload.
      1.0 release notes drafted in `docs/app-store-submission.md` ("What's New"), ready for O5.
      The owner approved a local `v1.0.0` tag, created on the final commit once A16's gate is green; pushing it stays with the owner._
      `package.json` is still `0.0.0` while the iOS build is 1.0 (1).
      Pick a versioning story across the two platforms, apply it, and draft 1.0 release notes.
      **Done when:** versions agree with what is being submitted and the release commit is tagged locally (pushing stays with the owner).

- [x] **A14. Repo and doc hygiene.**
      _Done 2026-08-06, with one part left to the owner question batch.
      Closed with the house banner: `docs/ios-app-roadmap.md` and `ios-app-roadmap-progress.md` (complete; superseded by this checklist; describe pre-trim features), `docs/e2e-testing-plan.md` (executed; figures long stale), and `docs/repo-current-state.md` (the 2026-06-01 snapshot, closed as instructed rather than patched - note it is gitignored, so the banner is local-only).
      `docs/manual-testing-guide.md` got a scope note (web-only; its iOS mirror claims predate the trim) rather than a close, since the web app it documents is unchanged.
      `README.md` verified accurate post-trim (its showdown/backup mentions describe the web, and the iOS section states the trim); `docs/codebase-docs-sync.md` is a dated record asserting nothing current; `docs/app-store-submission.md` is A9's rewrite, not touched here.
      Prettier clean across `docs/` and `README.md`.
      Owner decision still open (asked in the batch): whether `FEATURE-AUDIT.md` and `docs/launch-agent-prompt.md` should be tracked; note `review/` and `LAUNCH-CHECKLIST.md` are now tracked because A3/A12 record their outcomes there - shout if you want them untracked instead._
      `FEATURE-AUDIT.md` and `review/` are untracked; decide with the owner whether they belong in the repo.
      `docs/repo-current-state.md` is from 2026-06-01 and describes a four-route app with 390 tests and no CI - close it the way the other stale reports were closed rather than patching it.
      `docs/manual-testing-guide.md` is web-scoped and predates the trim.
      **Done when:** no doc in `docs/` asserts something about the app that stopped being true.

- [x] **A15. Cold-install and first-run verification.**
      _Done 2026-08-06, on the erased iPhone 16 Pro simulator with a Release build, plus a rendered walk of every shipping screen; nothing looked wrong, so there are no defect screenshots to hand over.
      Verified by executing: first launch lands on Home with clean empty states (0/20 ring, "No streak yet", empty dots); a container seeded with pre-trim data before first launch merges the valid prefs (goal ring reads 0/30), degrades the archived `bet-spread` mode, ignores `playHandsOut`/`betRamp`, and leaves the archived showdown keys byte-identical on disk; wrong-typed leftover values are also ignored without a crash; backgrounding (via launching Settings) and returning restores the app intact.
      Screen renders from the test target (window + `layer.render`, since `ImageRenderer` cannot draw List-backed screens): Home, all three chart tabs, Progress empty / with data / after reset, Settings, Licenses, both hand drills (including the three-card hard-20 pin, which fits the 402 pt width), the counting flow, and the Done screen - all correct; reset visibly returns Progress to empty.
      Two findings that are behavior, not defects: the iCloud KVS daemon container survives an app uninstall on device, so a reinstall re-adopts prior stats (last-writer-wins by design), and a fresh install shows "Continue - Basic Strategy" because the default last-trainer is Basic Strategy.
      Not device-verifiable here: backgrounding mid-drill (no UI-test target to start a drill); the stream loop's suspend/resume semantics are argued in A12's review and the real-device check is O8 step 8.
      Suite still green at 335 after removing the throwaway render probe._
      Erase the simulator, install a Release build, and walk a first launch: empty states, every drill end to end, the chart, Progress, Settings, reset practice data, and backgrounding mid-drill.
      Confirm leftover keys from archived features are ignored rather than surfacing.
      **Done when:** the walk is clean from a genuinely empty container, with screenshots of anything that looked wrong.

- [ ] **A16. Final gate.**
      Full local CI on both platforms, this checklist updated to reflect reality, and a written handoff of exactly what is left for the owner.
      **Done when:** web and iOS suites are green on the commit that will be archived, and nothing in the agent lane is silently skipped.

---

## Owner lane

These need the Apple account, a physical device, or an attestation an agent must not make for you.

### O1. Answer D1 to D5

Take five minutes on the decisions above before the agent starts; two of them change how much work there is.

### O2. Provision the iCloud capability _(only if D2 = ship iCloud)_

Easiest path is through Xcode, which registers the App ID for you.

1. Open `ios/BlackjackTrainer.xcodeproj` in Xcode.
2. Xcode > Settings > Accounts, and confirm your Apple ID with team `C3W798H8U8` is signed in.
3. Select the `BlackjackTrainer` target > Signing & Capabilities.
4. Confirm "Automatically manage signing" is on and the team is `C3W798H8U8`.
5. Click `+ Capability` and add **iCloud**, then tick **Key-value storage** only.
   You do not need a CloudKit container; the entitlement resolves from your team prefix and the bundle ID.
6. Let Xcode create the App ID and profile. If it offers to register the bundle ID `com.arthurzhang.blackjacktrainer.app`, accept.
7. Build to a real device once to confirm signing succeeds.

If you would rather do it by hand: developer.apple.com/account > Certificates, Identifiers & Profiles > Identifiers > `+` > App IDs > App > explicit bundle ID `com.arthurzhang.blackjacktrainer.app` > enable iCloud > save.

### O3. Reserve the name and create the App Store Connect record

Do this early and independently of everything else. App Store names are unique across the whole store, "Blackjack Trainer" is generic, and you cannot find out it is taken at submission time without redoing your metadata.

1. Go to appstoreconnect.apple.com > Apps > `+` > New App.
2. Platform: iOS. Name: your first choice. Primary language: English (U.S.).
3. Bundle ID: pick `com.arthurzhang.blackjacktrainer.app` from the dropdown (it appears only after O2 or the manual registration).
4. SKU: `blackjack-trainer-ios`. It is an internal identifier only and never shown to users.
5. User Access: Full Access.
6. If the name is rejected as taken, try a differentiated one ("Blackjack Trainer: Count & Strategy") and tell the agent so the metadata matches.

The record can sit unsubmitted indefinitely. Creating it holds the name for you.

### O4. Host the legal pages and hand back the URLs

1. Wait for A10 and A11.
2. In the GitHub repo: Settings > Pages > Build and deployment > Source: **GitHub Actions**.
3. Push the branch with the workflow and let it run once.
4. Confirm both pages load over HTTPS in a browser.
5. Give the agent: the **privacy policy URL**, the **support URL**, and the **support email address** you want on the support page.

Both URLs are required fields in App Store Connect. A page stating you collect nothing satisfies the privacy requirement, but the URL itself is not optional.

### O5. Enter metadata and answer App Privacy

1. In App Store Connect, open the app record > the 1.0 version page.
2. Paste name, subtitle, description, keywords, promotional text, and categories from `docs/app-store-submission.md` (using the D2-correct description variant).
3. Enter the privacy policy URL and the support URL from O4.
4. Go to App Privacy > Get Started and answer **"No, we do not collect data from this app"**.
   This is true: no analytics, no accounts, no third-party SDKs, and iCloud sync goes to the user's own iCloud, not to you.
5. Publish the privacy answers.

### O6. Answer the age rating questionnaire

Only you can answer this, and it is an attestation, so answer it fresh rather than copying the pre-trim answer forward.

1. App record > Age Rating > Edit.
2. Every content category except one is **None**: no violence, no mature or suggestive themes, no profanity, no horror, no contests, no unrestricted web access, no user-generated content.
3. **Simulated Gambling** is the judgment call. The facts, from `TRIM-REPORT.md`: the app has no chips, no bankroll, no bets, no payouts, and no hand is ever played out to a win or lose outcome; it does depict casino blackjack with real card faces and teaches card counting for play at a real table.
   Answer that honestly against Apple's current wording.
4. Accept whatever rating the honest answers produce. If it lands mature, that is fine.
5. Check the territory list afterwards: some regions restrict gambling-themed content even without wagering.

### O7. Upload screenshots

1. Wait for A8.
2. In the 1.0 version page, drag the iPhone 6.9-inch set into the iPhone slot in order.
3. If D1 = universal, do the same for the iPad 13-inch slot. App Store Connect will not let you submit a universal app without it.
4. Add captions only if you want them; they are optional.

### O8. Real-device pass

Everything so far has run in a simulator. Do this on your own iPhone before you archive.

1. Connect the phone, select it as the run destination in Xcode, and run.
2. Home screen: app icon renders at the right size and is not a placeholder; the name is not truncated.
3. Launch: the launch screen appears and hands off cleanly, with no flash of the wrong theme.
4. Walk all three drills to a completed session, including a wrong answer and the feedback beat.
5. Chart: open all three tabs and drill into a cell from each.
6. Progress and Settings: change the daily goal, change the counting system, toggle a table rule, then confirm the drills honour it.
7. Reset practice data, then confirm the app is genuinely empty afterwards.
8. Background the app mid-drill, wait a minute, and return.
9. Airplane mode on: everything must still work, since the app makes no network calls.
10. Rotate, if D1 = universal, on an iPad.
11. Turn on VoiceOver (triple-click side button, if configured) and get through one full drill using only VoiceOver.
12. Settings > Accessibility > Display & Text Size > Larger Text at maximum, then re-open every screen.
13. Note anything that looks wrong and hand it back to the agent rather than fixing it yourself.

### O9. Archive and upload the build

1. In Xcode, set the destination to **Any iOS Device (arm64)**. Archive is unavailable while a simulator is selected.
2. Product > Archive, and wait for the Organizer window.
3. Select the archive > Distribute App > App Store Connect > Upload.
4. Accept the default signing options and let Xcode manage the profile.
5. Wait for the processing email. First uploads often draw automated warnings by mail; read them rather than deleting them, since ITMS-91053 is exactly the class of thing A1 exists to prevent.

### O10. TestFlight

1. App Store Connect > your app > TestFlight; the processed build appears there.
2. Add yourself as an Internal Tester and install through the TestFlight app on your phone.
3. Run the O8 walk again against the TestFlight build, since that is the artifact users get.
4. External testing requires a Beta App Review, which takes a day or so. Worth it if you want anyone else to try it before launch.

### O11. Two-device iCloud test _(only if D2 = ship iCloud)_

1. Install on two devices signed into the same Apple ID.
2. Complete a drill on device A, wait, then open device B and confirm the stats appear.
3. Practise on both while one is offline, then reconcile. Last writer wins by design; confirm nothing is corrupted, only superseded.

### O12. Submit for review

1. On the 1.0 version page, confirm metadata, screenshots, privacy, age rating, and the build are all attached.
2. Paste the review notes from `docs/app-store-submission.md` into App Review Information.
3. Provide contact details. No demo account is needed; say so in the notes.
4. Choose **Manually release this version** for a first launch, so nothing goes live while you are asleep.
5. Consider Phased Release for automatic updates; it does not apply to the initial release but is worth turning on for 1.0.1 onward.
6. Submit, then budget one rejection round on the gambling and age-rating angle. If rejected, answer in Resolution Center with the review notes; most first-round rejections are a conversation, not a verdict.

### O13. Before you call it launched

1. Decide who reads App Store reviews and how often.
2. Bookmark Xcode > Organizer > Crashes. It is your only crash visibility, since the app ships no analytics by design, and it is free and requires no SDK.
3. Rehearse the hotfix path once: know how long "bug reported" to "build uploaded" takes you before you need it.
4. Push the local commits when you are ready. `main` is currently ahead of `origin/main`, and the agent will not push for you.

---

## Not doing (recorded so it stays a decision, not an oversight)

- No analytics, no crash SDK, no accounts. This keeps App Privacy honest at "Data Not Collected" and is the reason Organizer crash reports matter.
- No localisation beyond English.
- The nine archived features stay archived; `archived/RESTORE.md` and the `pre-trim-full-featureset` tag are the way back.
