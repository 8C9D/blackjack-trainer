# iOS App Roadmap Progress

_Maintained by the `ios-app-roadmap-autopilot` skill. The cursor below is the
source of truth for what runs next. Manual edits are fine if you keep the
format._

**Roadmap:** [docs/ios-app-roadmap.md](ios-app-roadmap.md)
**iOS project location:** `./ios` (monorepo, D1 default)
**Toolchain:** `xcodebuild` 16.4 (Build 16F6) ✓ · `swift` 6.1.2 ✓ · `swiftformat`
**absent** · `swiftlint` **absent** · macOS 15.6.1 host. Swift build/test gates
run locally; SwiftFormat/SwiftLint will be installed (Homebrew) at Slice 0.3 if
available, else those lint gates run in CI only and are noted as a local gap.
**Apple Developer account:** not available on this machine → account/device/App
Store-gated steps are prepared and handed off (see _Pending human actions_).
**Current phase:** 0
**Next slice:** 0.2

## Decisions applied

| ID | Decision | Value | Source |
|----|----------|-------|--------|
| D1 | Repo layout | **Monorepo `./ios`** alongside `src/` | default (roadmap §Cross-cutting decisions) — applied in 0.1 |
| D2 | Chart/counting data → Swift | Bundle exported JSON, decode at launch | default — to apply in 0.2 / 1.2 |
| D3 | Minimum iOS version | iOS 17 | default — to apply in 0.3 |
| D4 | Local persistence | Codable → `UserDefaults` | default — to apply in 2.1 |
| D5 | iCloud sync transport | `NSUbiquitousKeyValueStore` (KVS) | default — to apply in 4.2 |
| D6 | Test framework | Swift Testing (fallback XCTest) | default — to apply in 0.3 |
| D7 | App Store positioning | Educational strategy trainer, no wagering | default — to apply in 5.1 |

## Pending human actions (handoffs)

These require a human and/or an Apple Developer account; the autopilot prepares
everything automatable around them and does **not** mark them Done.

- [ ] **Enroll in the Apple Developer Program** ($99/yr). Gates signing,
      entitlement provisioning, TestFlight, and App Store Connect. _(Slice 0.1;
      unblocks Phases 4–5.)_
- [ ] **Reserve the bundle ID and create the App Store Connect app record.**
      Needs the account. _(Slice 0.1.)_
- [ ] **Provision the iCloud KVS capability** and run the two-device iCloud sync
      verification. _(Slice 4.2.)_
- [ ] **Provision the App Group** shared container and verify the widget on a
      real Home Screen. _(Slice 4.3.)_
- [ ] **Verify notification permission + on-schedule delivery on device.**
      _(Slice 4.4.)_
- [ ] **Device pass:** icon/launch screen on hardware + Accessibility Inspector
      audit. _(Slice 4.1.)_
- [ ] **App Store Connect:** metadata entry, screenshots from a near-final
      build, privacy nutrition labels, age-rating questionnaire,
      export-compliance flag. _(Slice 5.1.)_
- [ ] **TestFlight:** archive upload + internal/external testing on a device
      matrix. _(Slice 5.2.)_
- [ ] **Submit for review and release.** _(Slice 5.3.)_

## Execution log

| Phase | Slice | Title | Status | Commit | Validated | Date | Notes |
|------:|------:|-------|--------|--------|-----------|------|-------|
| pre | — | Lockfile engines sync | Done | 341088f | tracked tree clean | 2026-06-07 | Pre-flight: committed unrelated `package-lock.json` change so the autopilot could start on a clean tracked tree (user-approved). |
| 0 | 0.1 | Repo layout decision + Apple prereqs | Done | pending | n/a (process) | 2026-06-07 | D1 = monorepo `./ios` (default). Apple enrollment + bundle ID + ASC record recorded as pending human actions; per roadmap they gate signing/submission, not dev, so we proceed to 0.2. |
</content>
