# Findings

Every "Confirmed" entry below was reproduced by executing the code — a throwaway
spec driven through `ng test`, deleted afterwards. The observed values are
quoted verbatim.

---

## Confirmed

### F1. The showdown grades keystrokes for actions the table never offered

**Status: fixed on `main`.** Line references below are to the code as reviewed,
before the fix.

`src/app/features/card-counting/showdown.component.ts:1389-1400` ·
`:791-800` · `:805-834` · `:872-899`

**Trigger.** In the showdown, during `player-turn`, press `I`, `R`, or `D` when
that action is not in `playerActions()` — insurance is decided in its own phase,
surrender is off unless Late Surrender is enabled, and doubling lapses after the
first hit.

**Observed** (hard 16 vs 10, Late Surrender off):

| key                  | play stats              | round misplay list                    | felt                       |
| -------------------- | ----------------------- | ------------------------------------- | -------------------------- |
| `I`                  | `attempts 1, correct 0` | `"Hard 16 vs 10: Hit, not Insurance"` | unchanged (2 cards)        |
| `R`                  | `attempts 1, correct 0` | `"Hard 16 vs 10: Hit, not Surrender"` | unchanged                  |
| `D` on a 3-card hand | `attempts 2, correct 1` | `"Hard 12 vs 10: Hit, not Double"`    | unchanged, `doubled:false` |

(The `D` row needed a legitimate hit first to reach three cards, which is
attempt 1; the phantom is attempt 2.)

It also persists. After a single `I` keypress, `localStorage['blackjack-miss-tally']`
holds

```json
{"basic-strategy":{"hard-16-v-10":{"ref":{...},"days":[{"date":"2026-08-04","attempts":1,"misses":1}],"streak":0,"missedCounts":[]}}}
```

so the phantom miss survives the session, seeds the next round's opening hand,
and marks the cell on the chart.

**Why the code permits it.** `playerActions()` is the legality gate, and it
lives only in the template's `@for`. The keyboard path goes
`onKeyDown → handleTrainerKeydown → onAction(action)` and `onAction` grades
first (`gradePlay(action)`) and dispatches second, where `surrender()` /
`double()` re-check `canSurrender()` / `canDouble()` and quietly return. So the
grade lands and the action does not.

Both drill pages guard the same path — `basic-strategy-drill-page.component.ts:526`
and `deviations-drill-page.component.ts:639`, commented _"Poka-yoke: hotkeys for
illegal actions are dead, not wrong"_ — and the iOS showdown attaches
`.keyboardShortcut` to the rendered buttons only
(`ios/.../ActionButtonsView.swift:43`), so it cannot reach an unoffered action.
The web showdown is the one surface out of step.

---

### F2. A multi-box round is dealt for more chips than the bankroll holds, and the second loss is silently discarded

**Status: fixed on `main`, both platforms** — the round is now refused before it
is dealt, which makes `BankrollService.record`'s guard (and the missing Swift
one) unreachable from live play again. Line references below are to the code as
reviewed, before the fix.

`src/app/features/card-counting/showdown.component.ts:752-754` (`clampedBet`) ·
`:278-280` (the Deal control) · `:771-783` (`dealAfterBet`) ·
`src/app/core/services/bankroll.service.ts:59-70`

**Trigger.** Bet sizing on, 2 or 3 boxes, bankroll anywhere in `[1, spots)` —
e.g. 1 chip across 2 boxes, or 2.5 chips across 3. `bustedOut` is
`bankroll < 1`, so the table does not stop.

**Observed** (bankroll 1, `spots` 2, both boxes dealt 10,6 against a dealer 20):

```
options            [1, 2, 4, 8, 12]
affordable         [false, false, false, false, false]
bet                1
Deal button        disabled: false
note               "Total at risk this round: 2"
→ after both hands stand and lose:
roundNet shown     -2
bankroll           1 → 0
bankroll state     {"bankroll":0,"wagered":500,"net":-500}
```

**Wrong behavior.** The screen says the round lost 2 chips; 1 chip actually
left the bankroll. The second hand's stake is missing from `wagered` too (500,
not 501), so the "risked X, up/down Y" figures the bet-sizing drill is judged on
are both wrong. The hand tally (`ShowdownStatsService`) _did_ record both
losses, so the win/loss record and the chip record now disagree permanently —
both are persisted.

**Why the code permits it.** Two independent gaps that meet:

1. `clampedBet` = `clampBet(value, bankroll / spots)`, and `clampBet`
   (`bankroll.model.ts:33-37`) floors at `MIN_BET`: `Math.max(MIN_BET, Math.floor(bankroll))`.
   With `bankroll/spots < 1` it therefore returns 1, not 0. Nothing downstream
   re-checks — `betAffordable()` only disables the _rungs_; the Deal button
   carries no `[disabled]`, and `dealAfterBet`/`dealHand` never consult the
   bankroll.
2. `BankrollService.record` rejects the whole update when the resulting
   `bankroll < 0` and returns with no signal. That guard is right for a corrupt
   stored payload and wrong for a live settlement: the hand has already been
   marked settled, `roundNet` has already been advanced, and there is no
   `storageWriteRefused`-style flag to say a write was refused.

The iOS port has the identical over-commit (`ShowdownModel.swift:181-183`
`clampedBet`, `ShowdownModel+Betting.swift:74-76` `betAffordable`), but
`BankrollState.recording` (`StatsModels.swift:79-81`) has no guard at all, so
the same trigger drives the bankroll _negative_ and `BankrollStore.persist`
writes it. `BankrollState.isValid` then rejects it at the next launch
(`bankroll >= 0`, `StatsModels.swift:70-77`) and `StatsPersistence.load` returns
`.empty` — a free reset to 500 chips. Same trigger, two different wrong
answers, neither of which the user is told about.

---

### F3. Deviation-only mode deals hands whose index can never fire, and then says it fires at a different count

`src/app/features/drill/scenario-generators.ts:35-43` ·
`src/app/core/services/deviation-engine.service.ts:127-137` ·
`src/app/core/services/deviation-evaluator.service.ts:191-194`

**Trigger.** Settings → Deviations → _Deviation-only_, with **Late Surrender
on**. The generator picks a hard-category rule for one of: S17 16 v 9, 16 v 10,
15 v 10; H17 adds 16 v A.

**Observed**, through `DeviationEvaluatorService.evaluate` — the path the drill
uses — for 16 v 9 (`stand at ≥ +4`), dealt as 9,7:

```
TC +4 (threshold met)     → expected SUR
  "No deviation at TC +4; basic strategy plays Surrender.
   (A deviation for this hand exists but only fires at a different count.)"
TC +3 (threshold not met) → expected SUR
  "No deviation at TC +3; basic strategy plays Surrender.
   (A deviation for this hand exists but only fires at a different count.)"
```

15 v 10 behaves the same; 16 v 10 gives `expected SUR` with _"No deviation for
this hand"_ on both sides of its index.

**Wrong behavior.** The mode's contract is "every hand has an encoded deviation
rule" and `pickTrueCountForDeviationRule` deliberately lands 50/50 either side
of the threshold so the trainee must decide whether the index applies. On these
hands the answer is Surrender at every count, so the question is unanswerable as
posed — and the hint is a false statement: the deviation does not fire at a
different count, it never fires.

**Why the code permits it.** `resolveDeviationDecision` returns early when the
live basic action is already `SUR`, so a natural-category index cannot downgrade
a chart surrender (deliberate, and correct as _play_). `pickDeviationRule` knows
about only the mirror case: with LS **off** it filters `category === 'surrender'`
rules, because the overlay cannot fire. Nothing filters hard rules that the
chart's own `SUR_*` cell dominates when LS is **on** — the same class of hand,
the other rule set. `explainPlaying`'s "a deviation for this hand exists but
only fires at a different count" branch is reached whenever `matchedRule` is set
and unapplied, and cannot distinguish "not yet" from "never".

---

### F4. The chart's hard-20 "drill this cell" link deals a pair, asks a different question, and files the miss under a different key

`src/app/features/drill/drill-hand.ts:242-255` (`hardTotalCards`) ·
`:157` (`HARD_TOTALS`) · `src/app/features/chart/chart-page.component.ts:682`
(`drill`) · `:53` (`HARD_KEYS` includes 20)

**Trigger.** Chart → Hard totals → the `20` row → drill a cell. This navigates
to `/drill/basic-strategy?hand=hard-20-v-10`.

**Observed:**

```
parseScenarioKey('hard-20-v-10') → {kind:'hard', hand:'20', dealer:'10'}
scenarioFromRef(...)             → ['Q','Q']
handQuestion(...)                → {prefix:'', value:'10,10', dealer:'10'}
legalActionsFor(...)             → ['H','S','D','P']
scenarioRefFor(dealt)            → {kind:'pair', hand:'10', dealer:'10'}
```

**Wrong behavior.** The banner reads _"Drilling 20 vs 10 — every hand this
round"_; the question line reads _"10,10 vs 10"_; Split appears as a legal
answer; and every miss is filed under `pair-10-v-10`. The hard-20 chart cell can
therefore never show its "missed n of m" marker no matter how often it is
missed, and the pinned round can never clear the spot it claims to be drilling.

**Why the code permits it.** `hardTotalCards` enumerates only `a < b` pairs
summing to the total, so hard 20 has no candidate (10+10 is excluded) and falls
to the same-value fallback — a pair, which `classifyAsPair` then routes through
the pair row. `parseScenarioKey` accepts hard totals up to 20 and the chart
offers a drill link on every cell of every row, including the one row whose only
two-card form is a pair. The comment on `hardHandFor`
(`chart-page.component.ts:795-797`) reasons about the _chart cell_, where the
pair fall-through is harmless; nothing covers the drill pin.

Round-tripping is otherwise clean: soft 13–21 and every pair rank re-classify to
the ref they came from (verified over 33 cases). Hard 4 has the same defect but
is unreachable — `parseScenarioKey` rejects it and `scenarioRefFor` never emits it.

---

### F5. iOS accepts a manual true count the app declares impossible; the validator that would reject it has no production caller

**Status: fixed on `main`.** The range moved into a shared
`validManualTrueCount`, which the loader now calls and `parseManualTrueCount`
delegates to — so the bound has one home and the orphaned validator has a
production caller. Line references below are to the code as reviewed, before
the fix.

`ios/BlackjackTrainer/Stores/FlowPrefs+Persistence.swift:80` ·
`ios/BlackjackTrainer/Engine/DeviationTrainer.swift:27` ·
`src/app/core/services/flow-prefs.service.ts:264-269` (the web's clamp)

**Trigger.** Restore a backup file whose `blackjack-flow-prefs` payload carries
`"deviations": {"manualTrueCount": 5000, "trueCountSource": "manual"}`.
`BackupStore.restore` writes the bytes verbatim
(`BackupStore.swift:79-86`) and `FlowPrefs.merged` reads them back.

**Wrong behavior.** The web loader clamps to ±20 and falls back to 0. The Swift
loader is `intValue(raw["manualTrueCount"]) ?? defaults.manualTrueCount` — any
integer passes. `DeviationsDrillModel.pickTrueCount` (`:415`) then returns it
unmodified, so the trainer runs at TC 5000, where every `at-or-above` index
fires and no `at-or-below` one can. The same file therefore behaves differently
on the two platforms, which is the one thing a shared-format backup must not do.
Every other field in `mergedCounting` _is_ bounded (`clampGoal`, `clampSpots`,
deck/penetration presets, ramp normalisation) — this is the single gap.

**The validator exists and is dead.** `parseManualTrueCount`
(`DeviationTrainer.swift:27`) enforces exactly ±20 and is referenced by nothing
in `ios/BlackjackTrainer/` — its only callers are eight `#expect`s in
`DeviationFeedbackTests.swift:110-117`. The tests would pass unchanged if the
function were deleted, because nothing in the app calls it.

---

## Killed

Roughly half of what Phase 2 produced did not survive re-reading. Each of these
was a live hypothesis; each died for a specific reason.

- **Parity gate misses `settle()`'s `playerNatural` argument.**
  `tools/export-parity-fixtures.ts:759-769` really does call `settle(player,
dealer)` with the default third argument only, so no `settleCases` row covers
  the split-hand rule. **Killed as a defect**: both platforms test it
  independently — `showdown.model.spec.ts:145`, `showdown.component.spec.ts:343`,
  and `ShowdownModelTests.swift:215`. A drift here would be caught, just not by
  the gate. Kept as a blind spot below.

- **Hole-card accounting drifts from the cards handed back.** Executed: leaving
  during the insurance offer gives `cardsSeen 3` and a running count of −1 for
  9/A/7 with the 5 in the hole, excluded from both. The subtraction in
  `drawHole` and the filter in `seenCards` agree on every path, and
  `pendingHoleIndex` is cleared by `resolveRound` before any subsequent deal.

- **Insurance-category rules can't fire in deviation-only mode.** My probe said
  they never deviate — the probe was wrong: it called `resolveDeviationDecision`,
  which has no insurance path. The drill uses `DeviationEvaluatorService.evaluate`,
  which consults the insurance overlay on a dealer ace. Probe artifact.

- **KO's key-count schedule has deck counts it does not cover.** `KO.keyCounts.irc`
  is keyed `{1, 2, 6, 8}`, exactly `SHOE_DECK_OPTIONS`. `resolveKeyCounts` can
  never return null for a selectable shoe, so `evaluateKeyCount`'s throw and the
  "settings need attention" dead end are unreachable.

- **Two advance timers can be live at once in a drill page.** `answer()` is the
  only unguarded `setTimeout` assignment, and it requires `phase === 'question'`;
  every timer callback nulls `advanceTimer` before doing anything that could set
  another. `holdThenFinish` only runs from inside a fired callback.

- **Swift `Shoe.init` traps on a NaN penetration; `buildShoeCards` traps on a
  negative deck count.** Both conversions are unguarded where the web returns
  `[]`/clamps — but JSON cannot carry NaN, and `mergedCounting` admits only
  values from `penetrationPresets` / `deckOptions`. No caller can reach either.

- **A hard-4 pin re-deals as a pair.** True of `hardTotalCards`, unreachable:
  `HARD_TOTALS.min` is 5, so `parseScenarioKey` rejects `hard-4-v-*`, and
  `scenarioRefFor` classifies 2,2 as a pair, so no hard-4 ref is ever recorded.

- **`BackupService.restore` can destroy the profile on a failed rollback.** The
  clear-then-write is real and `localStorage` has no transaction, but the code
  snapshots first, refuses to start if the snapshot cannot be taken
  (`:88-99`), and each error string matches what actually happened, including
  the "failed while restoring _and_ rolling back" case. Best-effort and honest.

- **The shoe rebuild and the carried running count can fall out of step.**
  `ensureShoeForRound` recomputes staleness, cut card, and remaining-cards on
  every round and resets the count in the same branch that replaces the shoe;
  `exitShowdown` folds the showdown's dealt cards into the carried count before
  the next round reads it. No path leaves one updated without the other.

- **Bet grading silently drops the reps that matter most.** Three `return`s in
  `gradeBet`, but each is defensible: no true count (nothing to grade), a bet
  that is not on a rung (the player could not have chosen it), and a called bet
  the bankroll cannot cover (the rung is offered disabled). Documented at the
  call site.

- **iCloud adopt-at-launch loses offline practice.** `StatsCloudSync` adopts
  whenever the cloud holds any value for a key. That is last-writer-wins as the
  roadmap specifies (D5), not a defect.

---

## Suspicions

Each needs something I could not do from here.

1. **Day keys drift by one around DST.** **Killed 2026-08-06 (launch pass),
   both platforms.** Executed exactly the probe this entry asked for:
   `streak()`, `last7()` and the miss-tally window driven through the real
   services under `TZ=America/Santiago` (transitions at midnight: 2026-04-05
   fall-back gives Apr 4 a 25th hour, 2026-09-06 spring-forward deletes
   00:00–00:59) and `TZ=Australia/Lord_Howe` (30-minute shift), with `now`
   pinned to 00:15 and 23:45 across the transition dates, plus a raw
   `setDate`-walk sweep (±3 days, six wall times, back 0–10) compared against
   pure `Date.UTC` calendar arithmetic — zero divergence. V8 maps a
   nonexistent wall time forward within the same calendar day and `setDate`
   preserves the wall clock, so the walk is calendar arithmetic, not 24-hour
   arithmetic. Foundation's `Calendar.date(byAdding: .day, ...)` behaves the
   same (probed in the two zones over the same grid). Pinned by
   `src/app/core/services/day-keys-dst.spec.ts` (drives the real services
   per-zone) and
   `PracticeHistoryStoreTests.dayWalkLandsOnConsecutiveCalendarDatesAcrossDSTTransitions`.
   Original text: `localDateKey` is local-time, `isLocalDateKey` validates by
   a UTC round-trip (calendar validity only — confirmed harmless), and
   `dateKeyDaysAgo` walks with `setDate`.

2. **The widget shows dots on the wrong days after a multi-day gap.**
   `WidgetSnapshot.forDay` (`ios/Shared/WidgetSnapshot.swift:54-60`) shifts the
   dot strip by exactly one day however stale the snapshot is, and the app is
   its only writer. _Confirm or kill by:_ saving a snapshot with
   `dayKey = today − 3`, then rendering the widget timeline with `.now` three
   days on, and comparing the strip against `PracticeHistoryStore.last7`.

3. **The backup prefix captures more than this app's keys.**
   `BACKUP_KEY_PREFIX` is `'blackjack-'` (`backup.model.ts:12`), so an export
   sweeps — and a restore clears — every `localStorage` key on the origin with
   that prefix, not just this app's. Harmless on a dedicated origin.
   _Confirm or kill by:_ checking whether the deployment shares an origin with
   any other `blackjack-*` app; if it does, the export leaks that app's data
   into a file the user may share, and a restore wipes it.

---

## Blind spots

- **I could not execute any Swift.** Every iOS claim (F2's mirror, F5) is from
  reading. More would come from `xcodebuild test` on the iPhone 16 Pro
  simulator, and specifically from a `FlowPrefsStoreTests` case that merges an
  out-of-range `manualTrueCount`.
- **The parity gate's real coverage.** I read the exporter and spot-checked the
  Swift tests it feeds, but I did not enumerate which engine branches have _no_
  vector behind them. `settle`'s `playerNatural` is one; `mergePrefs`/
  `FlowPrefs.merged` is another (no fixture exists for prefs coercion at all,
  which is exactly where F5 lives). A branch-coverage run of the Swift target
  restricted to the parity tests would map this.
- **The rendered UI.** I asserted on component state and a few DOM queries under
  jsdom, never on a real browser. F2's "every rung disabled, Deal live" is from
  `disabled` attributes, not from looking at the screen.
- **The 58-system registry.** I treated the card values and published
  correlations as data, not code, and checked neither against their sources.
- **Long-running and cross-day behavior.** Everything I ran was a single
  synchronous session. Retention pruning, streak walks, and the 7-day miss
  window were read, not exercised over simulated time.

---

## Kill rate

16 candidates entered Phase 3. **5 confirmed, 8 killed, 3 demoted to
Suspicions — a 50% kill rate.** The two probes that produced the most confident
Phase 2 findings (T12b insurance rules, T2 parity gap) were also the two that
died hardest: one was a probe that called the wrong code path, and one was a
real gap in the gate whose behavior turned out to be covered elsewhere.
