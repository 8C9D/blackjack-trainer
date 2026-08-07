# Security pass - post-trim tree, 2026-08-06

Launch-checklist item A5: a re-run of the security sanity check against the trimmed v1 tree (576 tracked files), superseding the closed 2026-06-08 report in `docs/security-sanity-check.md`.
Every claim below was produced by executing the named check on this tree today, not carried forward.

## Scope

Tracked secrets, publish safety, network surface, unsafe sinks, dependency hygiene, CI config, and the iCloud KVS trust boundary.
Local-only inspection; the only external contact was `npm audit`'s advisory lookup.

## Results

### No tracked secrets

- `git ls-files` counts 576 tracked files; none match `.env*`, key, cert, keystore, database, or provisioning-profile extensions.
- A keyword scan (`API_KEY|SECRET|PASSWORD|PRIVATE_KEY|DATABASE_URL|-----BEGIN`, plus a case-insensitive `token` sweep excluding design-token styling) over `src`, `ios`, and `tools` produced no credential matches.
- `ios/BlackjackTrainer/BlackjackTrainer.entitlements` declares only the iCloud KVS identifier built from Xcode variables (`$(TeamIdentifierPrefix)$(CFBundleIdentifier)`); no literal team ID or credential.
- The new `PrivacyInfo.xcprivacy` (A1) contains declarations only.

### No network calls in either target

- Web: zero matches for `HttpClient`, `fetch(`, `XMLHttpRequest`, `WebSocket`, `EventSource`, or `sendBeacon` under `src`.
  The Angular service worker (`@angular/service-worker`, `ngsw-config.json`) remains the one network-adjacent component; it serves cached static assets and checks for updates against the app's own origin only.
- iOS: zero matches for `URLSession`, `URLRequest`, `Network.`, `NWConnection`, or `CFSocket` under `ios/BlackjackTrainer` and the test target.
- No App Transport Security keys anywhere under `ios/` (nothing to relax; the app makes no requests).

### No unsafe sinks

- Web: zero occurrences of `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval(`, `new Function`, `bypassSecurityTrust*`, or `DomSanitizer`.
- iOS: zero occurrences of `WKWebView`, `UIWebView`, `loadHTMLString`, `Process(`, or `NSTask`.
  (A raw `system\(` grep matches only SwiftUI's `Font.system(size:)` API; verified false positives.)

### `.gitignore` publish safety

- `git check-ignore` confirms `.env`, `.env.local`, `dist`, `ios/build`, and `.claude/settings.local.json` are ignored; the `.env*` block with the `!.env.example` negation is intact.
- `git status --ignored=matching` shows the ignored set is build output, caches, `.claude/` scratch dirs, `xcuserdata`, `.DS_Store`, and three intentionally-untracked stale docs (`docs/repo-current-state.md`, `docs/manual-testing-guide.md`, `docs/codebase-docs-sync.md` - see A14).
- Nothing sensitive sits untracked-but-on-disk except those docs, which contain no secrets.

### iCloud KVS trust boundary - one finding, fixed

Data arriving through iCloud KVS is another device's write and must be treated as untrusted input.
The trim added a test pinning that unknown (archived-feature) cloud keys are ignored; this pass extended that thinking to malformed values for known keys, as the checklist asked.

- Already safe: `SessionStatsStore` and `PracticeHistoryStore` refuse an undecodable or invalid cloud payload and keep local state (pinned by `corruptCloudStatsDoNotReplaceValidLocalState` and a new test).
- **Finding (fixed 2026-08-06):** `FlowPrefsStore.adoptFromCloud` reset prefs to defaults, and `MissTallyStore` / `CountDriftStore` wiped their local state to empty, when the cloud payload for their key did not decode - the one place where corrupt cloud data could destroy valid local data.
  Reproduced first with three failing tests, then fixed: all three stores now refuse an undecodable payload and keep local state, while decodable payloads keep their existing field-by-field / entry-by-entry tolerance.
  Regression tests: `undecodableCloudPrefsDoNotReplaceValidLocalPrefs`, `undecodableCloudMissTallyDoesNotWipeTheLocalTally`, `undecodableCloudDriftsDoNotWipeTheLocalHistory`, `undecodableCloudHistoryDoesNotWipeLocalDays` in `CloudSyncTests`.
- Bounded values inside decodable payloads were already enforced (`clampGoal`, deck/penetration presets, the F5 `validManualTrueCount` clamp, miss-count sanitization); spot-verified in `FlowPrefs+Persistence.swift` and `MissTally.swift`.

### Dependency hygiene

- `npm audit --omit=dev`: **0 vulnerabilities** - production dependencies (Angular framework packages, `rxjs`, `tslib`) are clean.
- `npm audit` (full): **5 advisories, all dev-only** - `undici` (high, under `@angular/build`; response-desync and cross-user disclosure in the dev tooling's HTTP client), and the `@angular/cli → @modelcontextprotocol/sdk → @hono/node-server` chain (moderate; a Windows path traversal in `serve-static`).
  None ships in the built bundle or the iOS app; npm's only offered fix is Angular 22, a major upgrade.
- `package.json` has no `preinstall`/`postinstall`/`prepare` lifecycle scripts.

### CI

- `.github/workflows/ci.yml` and `ios-ci.yml` reference no secrets, tokens, or deploy credentials (grep verified).

## D4 recommendation (not acted on)

**Accept the five dev-only advisories for the 1.0 launch and record the acceptance; schedule the Angular 22 upgrade as post-launch work.**
Reasoning: the production audit is clean, all five advisories sit in build/CLI tooling that never ships to users, the `undici` high applies to the dev server's own HTTP client, and a major framework upgrade days before a submission adds real risk for zero user-facing gain.
Re-run `npm audit` before starting the 22 upgrade, since the advisory set moves.

**Outcome (added later the same day):** the owner answered D4 the other way and the upgrade was done immediately - Angular 21.2.19 → 22.1.0 (CLI 22.1.3, TypeScript 6.0.3) via `ng update`, plus `npm audit fix` for `undici`.
Validated after the upgrade: typecheck, lint, 1522 unit tests, production build, parity-fixture diff clean, and the full 111-test Playwright suite against the built bundle.
`npm audit --omit=dev` remains **0**; the full audit is down to **3 moderate**, all in the `@angular/cli → @modelcontextprotocol/sdk → @hono/node-server` chain (a Windows path traversal in the CLI's optional MCP dev server), which has no fix on 22 either - accepted, dev-only.

## Commands run

`git ls-files | wc -l`; `git grep -nIE` for the secret, network, and sink patterns above over `src`, `ios`, `tools`; `git check-ignore -v` on the five guard paths; `git status --porcelain --ignored=matching`; `npm audit`, `npm audit --json`, `npm audit --omit=dev`; `python3` over `package.json` for scripts and dependencies; `cat` of both workflow files and the entitlements; the iOS suite (`xcodebuild test`, 332 tests green) for the trust-boundary fix.
