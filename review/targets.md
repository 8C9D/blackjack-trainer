# Phase 0 — Orientation

**Stack.** Two implementations of one blackjack-training domain.

- **Web** (source of truth): Angular 21 standalone components, zoneless signals,
  TypeScript 5.9, Vitest + jsdom, Playwright E2E. No server, no network, no auth:
  the only persistence is `localStorage`, wrapped by `core/services/storage.ts`
  (`readJson`/`writeJson`). Runtime model is single-threaded, event-driven
  (DOM events, `setTimeout` advance timers, signal graph recomputation).
  Routing is lazy per feature.
- **iOS**: SwiftUI + `@Observable` models, `@MainActor`-isolated, persistence in
  `UserDefaults` under the _same_ key names as the web's localStorage, mirrored
  to `NSUbiquitousKeyValueStore` (last-writer-wins) and to an App Group
  `UserDefaults` for the widget.
- **The seam between them**: `tools/export-parity-fixtures.ts` runs the TS
  engines and writes 7 JSON files into `ios/Fixtures/`; Swift tests replay them.
  CI (`.github/workflows/ci.yml`) regenerates and `git diff --exit-code`s them.
  Anything not enumerated by the exporter is unchecked by the gate.

**Transport / persistence layers.** None (no server). "Transport" here is
(a) the fixture JSON between TS and Swift, (b) the backup JSON file the user
exports/imports, (c) iCloud KVS between devices, (d) the App Group plist between
app and widget, (e) `?seed=`/`?hand=`/`?review=` query params into the drills.

**What "atomicity" means here.** There are no DB transactions. The analogues
are: `BackupService.restore` (clear-then-write the whole namespace with a
hand-rolled rollback), one graded rep writing to 3–5 independent stores
(stats + history + miss tally + drift) with no unit of work around them, and the
showdown's `bankroll.record()` calls interleaved with in-memory hand state.

**Category instantiation.** Auth/tenancy does not apply — single local user, no
accounts, no server. Retry/idempotency applies only in the narrow senses of
double-submit (keyboard + click racing an advance timer) and re-entrant grading.
Everything else instantiates.

---

# Phase 1 — Targets

Ranked by (blast radius × fragility). "Fragility" = churn, caller count, and
whether the invariant is enforced anywhere mechanical.

## T1. Showdown keyboard bypasses the action-legality gate

- **Invariant**: a decision is only graded when the table actually offered that
  action — the drills state this as "hotkeys for illegal actions are dead, not
  wrong" (`deviations-drill-page.component.ts:638`).
- **Sides**: `showdown.component.ts:1389-1400` (`handleTrainerKeydown` →
  `onAction`) vs `showdown.component.ts:647-653` (`playerActions()`, which the
  buttons render) and `core/keyboard.ts:63-77`.
- **Fragile because**: the gate lives in the _template_ (`@for playerActions()`),
  not in `onAction`; the keyboard path calls `onAction` directly. Both drill
  pages guard; the showdown is the only trainer that does not. 27 commits of
  churn on this file.
- **Blast radius**: silently records wrong attempts against
  `ShowdownPlayStatsService`, the weak-spot tally, and the round's misplay list
  for plays the felt never allowed.

## T2. `settle()`'s split-hand natural flag is unpinned by the parity gate

- **Invariant**: a 21 made after a split is not a natural (pays even money) —
  encoded as `settle(player, dealer, playerNatural)` in
  `showdown.model.ts:137-160` and mirrored in `Showdown.settle` (Swift).
- **Sides**: `tools/export-parity-fixtures.ts:759-769` calls `settle(sc.player,
sc.dealer)` with the default third argument only; every `settleCases` row
  therefore exercises `playerNatural = isBlackjack(player)`.
- **Fragile because**: the CI anti-drift gate is the _only_ mechanical check
  that the Swift port agrees, and this parameter is invisible to it.
- **Blast radius**: a Swift regression paying 3:2 on a split 21 would ship green.

## T3. `BankrollService.record` swallows a settlement it judges impossible

- **Invariant**: every settled hand moves the bankroll exactly once.
- **Sides**: `bankroll.service.ts:54-78` (guards `bankroll < 0` → silent
  `return`) vs the showdown's callers (`showdown.component.ts:1092-1096`,
  `1113-1117`, `971-985`), which have already mutated hand state and `roundNet`.
- **Fragile because**: the reservation invariant (`committed()` covers all
  outstanding exposure) is enforced in four separate `canX()` computeds, and the
  insurance path debits the bankroll _before_ the hands settle.
- **Blast radius**: on-screen `roundNet`/payout disagrees with the persisted
  bankroll; the error is invisible (no log, no flag), unlike storage failures
  which set `storageWriteRefused`.

## T4. Insurance offered/graded on a count the player was never asked for

- **Invariant**: insurance is graded on the visible count and only for systems
  whose count the app can grade (`countBasisFor`, `showdown.model.ts:65-95`).
- **Sides**: `showdown.component.ts:1045-1068` (`gradeInsurance`) vs
  `deviation-evaluator.service.ts:68,184` which hard-code "+3" in the
  explanation, vs `data/{h17,s17}-deviations.ts` which own the actual index.
- **Fragile because**: two renderings of one threshold, one derived and one
  literal.
- **Blast radius**: a corrected chart leaves the trainer telling the user the
  wrong number.

## T5. Deck-estimate / true-count divisor disagreement across the round boundary

- **Invariant**: the true count graded is (carried running count) ÷ (decks
  remaining _at the moment the round was dealt_).
- **Sides**: `card-counting-page.component.ts:505-511` (sets
  `actualDecksRemaining` post-deal), `:680-704` (`answerLiveShoe`), `:642-674`
  (`onBet`), and the showdown, which depletes the same `Shoe` in between
  (`:740-747` `exitShowdown`).
- **Fragile because**: `Shoe` is mutated in place and read through a signal
  mirror (`remaining`) plus non-reactive method reads (`showdownAvailable()`).
- **Blast radius**: a rep graded against a divisor the player could not have
  read; carried count and decks-remaining drifting apart.

## T6. `visibleRunningCount` vs the cards handed back on exit

- **Invariant**: what leaves the table (`seenCards`) and what the table counted
  (`visibleRunningCount`) describe the same set of cards.
- **Sides**: `showdown.component.ts:1247-1275` (`draw`/`drawHole`/
  `countVisible`/`uncountVisible`), `:1305-1308` (`seenCards`), and the
  consumer `card-counting-page.component.ts:740-747`.
- **Fragile because**: the hole card is tracked by _index into a mutating array_
  and excluded in two places by two different mechanisms (a subtraction and a
  filter). Multi-round sessions push several hole cards through one index slot.
- **Blast radius**: the next drill round's count is wrong by one card; the
  trainee is marked wrong for counting correctly.

## T7. Prefs coercion: web clamps a field the Swift port does not

- **Invariant**: "the loader must enforce the same invariants for stale or
  hand-edited payloads" (`flow-prefs.service.ts:219-223`).
- **Sides**: `flow-prefs.service.ts:264-269` (`manualTrueCount` clamped to
  ±20) vs `ios/.../FlowPrefs+Persistence.swift:80` (`intValue(...) ?? default`,
  unclamped).
- **Fragile because**: the two mergers are hand-mirrored, field by field, with
  no shared fixture. `mergePrefs` is not in the parity exporter at all.
- **Blast radius**: an imported backup can put the iOS Deviations trainer at a
  true count no chart is written for.

## T8. Restore is a clear-then-write with a hand-rolled rollback

- **Invariant**: after `restore()` the namespace is either wholly the backup or
  wholly the previous state.
- **Sides**: `backup.service.ts:85-133` vs every store's constructor-time load
  (`storage.ts:11-20`), plus `PAGE_RELOAD`.
- **Fragile because**: `localStorage` has no transaction; the rollback re-runs
  the same operation that just failed; success is signalled by a reload that may
  not happen.
- **Blast radius**: half-applied profile, or a restored profile the running app
  still shows the old numbers for.

## T9. Backup namespace prefix is broader than the app's own keys

- **Invariant**: `BACKUP_KEY_PREFIX` selects exactly this app's keys.
- **Sides**: `backup.model.ts:12` (`'blackjack-'`) vs `stats-store.ts:9`
  (legacy key `'blackjack-trainer:stats:v1'`) and every `*_KEY` constant.
- **Fragile because**: prefix-as-schema; any other app on the same origin, and
  any legacy key, is inside the blast radius of both export and restore-clear.

## T10. Miss-tally is keyed by a string that must agree with its own payload

- **Invariant**: `key === scenarioKey(tally.ref)` (enforced on load,
  `miss-tally.service.ts:262`) and refs are re-derivable to a dealable hand.
- **Sides**: `miss-tally.service.ts:74-102` (`scenarioRefFor`/`scenarioKey`),
  `drill-hand.ts:166-179` (`parseScenarioKey` for `?hand=`),
  `chart-page.component.ts:853` (`deviationScenarioRef`), and
  `drill-hand.ts:212-255` (`scenarioFromRef`, which must produce a hand that
  _re-classifies_ to the same ref).
- **Fragile because**: four independent encoders/decoders of one identity, with
  differing ranges (`isScenarioRef` accepts hard 4–20; `parseScenarioKey`
  accepts hard 5–20; soft 13–21 vs 13–20).
- **Blast radius**: a weak spot that can never be re-dealt, cleared, or drilled;
  a pinned round that silently falls back.

## T11. Weak-spot re-deal must ask the same question that was missed

- **Invariant**: re-dealing a ref reproduces the classification it was filed
  under; for Deviations, at a count it was actually missed at.
- **Sides**: `drill-hand.ts:242-255` (`hardTotalCards` may fall back to a
  same-value _pair_), `deviations-drill-page.component.ts:593-600`
  (`trueCountForWeakSpot`), `miss-tally.service.ts:311-319`.
- **Fragile because**: a hard ref rendered as a pair routes through pair lookup
  and is graded as a different scenario, then filed under a _different_ key.
- **Blast radius**: an unclearable weak spot; misleading "3 of 7 this week".

## T12. Deviation-only generation must produce a hand whose index can fire

- **Invariant**: "every hand has an encoded deviation rule"
  (`scenario-generators.ts:30-43`).
- **Sides**: `pickDeviationRule` (filters surrender when LS off),
  `makePlayerCardsForDeviationRule`, `deviationPlay`
  (`deviation-engine.service.ts:284-299`, which nulls D/P/SUR the table does not
  offer), and `resolveDeviationDecision` (which gates `surrender` on
  `options.lateSurrender` but _not_ on the pair/soft/hard rules' actions).
- **Fragile because**: two different "can this rule fire" predicates (one in the
  generator, one in the engine) that must agree. Recent churn: two commits.
- **Blast radius**: a drill promising an index hand and delivering one that
  cannot deviate.

## T13. Counting-drill mode ↔ system compatibility

- **Invariant**: true-count/bet-spread modes require a balanced system;
  key-count requires a schedule (`modeAllowedFor`,
  `counting-system.model.ts:201-206`).
- **Sides**: `settings-page.component.ts:459-468` (coerces on system change),
  `flow-prefs.service.ts:223` (coerces on load),
  `card-counting-page.component.ts:320-384` (`liveShoeTrueCount`,
  `betSpreadDrill`, `isValid`), and `counting-engine.service.ts:210-273`
  (`validateSettings`, which cannot see the system at all).
- **Fragile because**: the settings shape deliberately omits the system, so the
  invariant is enforced in three places outside the validator.
- **Blast radius**: a drill grading a true count for a system that has none.

## T14. Shoe rebuild vs. carried running count

- **Invariant**: the carried count and the shoe it describes are replaced
  together (`ensureShoeForRound`, `card-counting-page.component.ts:517-542`).
- **Fragile because**: five conditions decide "fresh", one of which (config
  staleness) deliberately suppresses the user-visible notice while still
  resetting the count; the showdown can deplete the shoe between rounds.
- **Blast radius**: silent count reset with no notice, or a notice with no
  reset.

## T15. Timer/lifecycle ownership in the drill pages

- **Invariant**: at most one pending advance timer per page, cancelled on
  destroy and on every path that starts a new question.
- **Sides**: `deviations-drill-page.component.ts:295-448` (`advanceTimer`,
  `holdThenFinish`, `clearAdvance` only on destroy),
  `basic-strategy-drill-page.component.ts` (same shape),
  `card-counting-page.component.ts:749-770` (`scheduleAdvance` chain).
- **Fragile because**: `answer()` sets a timer; `continueFromMiss`, the host
  click handler, and the keyboard handler can all advance; only `DestroyRef`
  clears.
- **Blast radius**: a queued advance firing into the next hand — double-grading
  or skipping a question.

## T16. Storage write failure is reported once, globally, and never for reads

- **Invariant**: "stop the app pretending it happened" (`storage.ts:44-71`).
- **Sides**: `writeJson` (sets a sticky signal) vs `readJson` (silent fallback)
  vs `StatsPersistence.save` on iOS (silent, no flag at all).
- **Blast radius**: iOS has no equivalent notice; a corrupt read on either
  platform silently resets a store to empty with no user-visible trace.

## T17. Practice-history day keys are local-time strings compared as strings

- **Invariant**: `'YYYY-MM-DD'` compares chronologically and identifies the
  user's day (`practice-history.service.ts:72-76, 229-233`).
- **Sides**: `localDateKey` (local), `isLocalDateKey` (validates via **UTC**
  round-trip, `:349-353`), `cutoffDate`/`dateKeyDaysAgo` (`setDate` arithmetic
  across DST), and the Swift `WidgetSnapshot.dayKey`.
- **Blast radius**: pruning or streak-walking off by a day around DST; a stored
  key rejected by its own validator.

## T18. Widget snapshot staleness shifts exactly one day

- **Invariant**: `forDay` renders a stale snapshot as it should read today
  (`ios/Shared/WidgetSnapshot.swift:54-60`).
- **Fragile because**: the dot strip is shifted by one regardless of how stale
  the snapshot is; the app is the only writer and may not run for days.
- **Blast radius**: widget shows dots attributed to the wrong days.

## T19. iCloud adopt-at-launch is unconditional last-writer-wins

- **Invariant**: D5 last-writer-wins.
- **Sides**: `CloudKeyValueStore.swift:53-73` (adopt if the cloud has _any_
  value) vs each store's local state, vs `BackupStore` restore
  (which must `pushAll` or be overwritten).
- **Blast radius**: a device that practised offline loses the session to an
  older cloud value at next launch.

## T20. Swift numeric conversions with no finite/range guard

- **Invariant**: the web guards `Number.isFinite`/`Number.isSafeInteger` before
  every conversion; Swift traps instead of coercing.
- **Sides**: `Shoe.init` (`Int((Double(count) * penetration).rounded(.down))`),
  `buildShoeCards` (`for _ in 0 ..< numberOfDecks`), `ShoeFactory.shuffle`
  (`Int(random() * Double(index + 1))`), vs `shoe.model.ts:21-38, 51-61` which
  return `[]`/clamp.
- **Blast radius**: a crash rather than a degraded value, if any caller can
  reach a NaN/negative.

## T21. `?seed=` determinism depends on push-based wiring

- **Invariant**: everything a user sees dealt comes from one random source
  (`random-source.ts:14-20`).
- **Sides**: `app.config.ts:25-30` (`provideAppInitializer` pushes into
  `CardGeneratorService`/`ShoeService` **only when the seed is present**) vs the
  two services' own `Math.random` defaults.
- **Blast radius**: E2E tests that assert exact outcomes; a service constructed
  before the initializer runs would keep `Math.random`.

## T22. Bet grading is skipped by three independent conditions

- **Invariant**: a bet is graded iff the player could have placed the called
  bet (`showdown.component.ts:1009-1035`).
- **Fragile because**: three `return`s (no true count, bet not on a rung,
  bankroll cannot cover the call) each silently drop the rep — and the third
  compares `called * spots` against the bankroll while the placed bet was
  clamped against `bankroll / spots`.
- **Blast radius**: bet-spread accuracy that quietly omits the reps that matter
  most (a big call on a short stack).

---

## Excluded, and why

- **Auth / tenancy / multi-user** — no accounts, no server, no shared state.
- **Concurrency proper** — the web is single-threaded and zoneless with no
  `async` domain code; the iOS models are `@MainActor`-isolated. The only real
  ordering hazards are timers and re-entrant event handlers (T15).
- **SQL/ORM/migration seams** — none exist; `BACKUP_SCHEMA_VERSION` is the only
  versioned payload (covered by T8).
- **Pure presentation/SCSS**, icons, `public/cards` assets — no invariants
  crossing a boundary.
- **The 58-system registry's transcribed metrics** — verifying published
  correlations against a source is a data-provenance question, not a code
  invariant; the repo already has a spec asserting tag vectors and deck sums.
- **`docs/`** — stale by the maintainer's own note; not executable.
