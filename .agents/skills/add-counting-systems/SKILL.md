---
name: add-counting-systems
description: Add the card counting systems from the Blackjack Review "Card Counting System Comparisons" page (https://www.blackjackreview.com/wp/encyclopedia/card-counting-system-comparisons/) to the trainer. The full 61-system source table is captured in-repo at reference-systems.md and is the source of truth. Counting systems are pure data, so this adds them in a few coherent commits — a one-time color-aware model extension (Phase 0), then batches of systems (standard, color-dependent, optional novelty) — NOT one commit per system. Correctness is guaranteed by a data-driven golden spec that checks every registered system against reference-systems.md and the balanced deck-sum invariant. Target scope is every system on the page except the no-data CAC2. Never writes a per-rank tag it has not reconciled against reference-systems.md. Use only when the user explicitly asks to add counting systems.
disable-model-invocation: true
---

# Add Counting Systems Skill

Add the card counting systems covered by the Blackjack Review **Card Counting
System Comparisons** page to the trainer:

> https://www.blackjackreview.com/wp/encyclopedia/card-counting-system-comparisons/

The page's full table (61 systems, with exact per-rank tags, BC/PE/IC figures,
and a deck-sum/balance column) is captured in-repo at
[`reference-systems.md`](reference-systems.md) — **that file is the source of
truth.** The live page could not be fetched; do not depend on fetching it.

A counting system in this app is **pure data**: a `CountingSystem` descriptor in
[`src/app/data/counting-systems.ts`](../../../src/app/data/counting-systems.ts)
registered in the `COUNTING_SYSTEMS` array. The engine, settings dropdown, and
trainer page all read systems off that registry — adding a correct descriptor is
*almost* all it takes.

## Add in batches, not one system per commit

These systems are **rows in a data file**, not features. Adding one changes no
behavior — the engine/UI just discover it. So do **not** make one commit per
system (that would be ~56 noisy commits, each a full re-validation). Add them in a
few coherent commits:

1. **Phase 0 — color-aware model extension** (its own commit; the only real code
   change). Needed before color-dependent systems.
2. **Standard batch** — all rank-keyed systems, one commit.
3. **Color batch** — the color-dependent systems, one commit (requires Phase 0).
4. **Novelty batch** — computer-only + inverted systems, one optional commit
   (only with `--include-novelty`).

Correctness does not come from commit granularity; it comes from the **data-driven
golden spec** (below), which checks every registered system against
`reference-systems.md` and the deck-sum invariant. That holds whether you add 1
system or 56, so batching is safe.

## Target scope

Add **every system in `reference-systems.md` except `CAC2`** (all `?` — no data).
That spans the standard counts, the historical/obscure ones, the color-dependent
ones (after Phase 0), and — only with `--include-novelty` — the computer-only and
inverted novelties. See *Categories*.

## The contract

1. Determine which batches the invocation covers (see *Inputs*).
2. **Phase 0** first if any color-dependent system is in scope and the model is
   not yet color-aware — its own commit.
3. For each batch in scope, in one commit: add its descriptors to the registry,
   extend the golden spec's `EXPECTED` table, update the README, `npm run format`,
   validate, and commit (explicit-path staging only).
4. Stop and report. Do **not** push unless the user passed `--push`.

Each batch is **idempotent**: only add the in-scope systems not already
registered; if a batch is fully present, skip it.

## Inputs

Parse the argument leniently. Batches/selectors:

- **(no argument)** or **`all`** → Phase 0 (if needed) + **standard** + **color**.
  Excludes novelty. Typically 3 commits.
- **`all --include-novelty`** → also the **novelty** batch.
- **`model-extension`** → only Phase 0, then stop.
- **`standard`** → only the rank-keyed standard batch.
- **`color`** → only the color-dependent batch (Phase 0 first if needed).
- **`novelty`** → only the computer-only/inverted batch.
- **A system name / id** (`zen`, `"Zen Count"`, `hi-opt-ii`, `red-seven`) → add
  just that one system in its own commit (Phase 0 first if it is color-dependent).
- **`--push`** → also `git push origin main` after the commits (default: don't).

If a named system is not in `reference-systems.md`, stop and report — do not guess.

## Non-negotiable safety rules

- **Never invent or approximate a per-rank tag.** Only write values reconciled
  against the row in `reference-systems.md` **and** confirmed by the deck-sum
  check. If a system's real per-card rule cannot be expressed (see *Categories →
  color-dependent / fractional tens*), research it or **skip and report it** —
  wrong tags in a counting trainer are actively harmful.
- Work directly on `main`. Do not create, switch, or rename branches.
- One commit per phase/batch (or per single named system). Phase 0 is always its
  own commit; never fold it into a data batch.
- **Stage by explicit path only.** Never `git add -A` / `git add .` /
  `git add -u`. This repo intentionally keeps `docs/repo-current-state.md`
  **untracked** — never stage or commit it. After staging, confirm it is still
  `??` in `git status --short`.
- Do not force push, amend, squash, or rebase. Do not delete user work.
- Do not start if there are unrelated uncommitted changes to **tracked** files.
  Untracked files are fine and expected.
- Keep the default system `HI_LO` and preserve the behavior of systems already
  present. Validate every batch before committing it.

## The data model (what you are writing)

`CountingSystem` (`src/app/core/models/counting-system.model.ts`):

```ts
export type CountValue = number; // integer or fractional (e.g. ±0.5, ±1.5)

export interface CountingSystem {
  readonly id: string;        // kebab-case, unique: 'hi-opt-ii'
  readonly name: string;      // display name: 'Hi-Opt II'
  readonly description: string;
  readonly values: Readonly<Record<Rank, CountValue>>; // keyed by RANK only
  readonly colorValues?: Readonly<Partial<Record<Rank, ColorCountValue>>>; // added in Phase 0
  readonly balanced: boolean; // true ⟺ full 52-card deck sums to 0
}
```

`Rank` is `'2'..'9' | '10' | 'J' | 'Q' | 'K' | 'A'`. The base `values` map is keyed
by **rank only**; `colorValues` (Phase 0) is the escape hatch for color-dependent
systems. Derived automatically — do **not** touch: `balanced` gates true-count
training; `engine.isFractionalSystem` switches the answer form to decimal input;
"level" (max abs tag) is prose only, not a field.

## The deck-sum check (your correctness gate)

`reference-systems.md`'s `Deck Sum` column is `(A+2+…+9)×4 + (T×16)` — **the exact
formula this app's `fullDeckSum` helper uses**. So `Deck Sum = 0 ⟹ balanced: true`;
`Deck Sum ≠ 0 ⟹ balanced: false` (e.g. KO: +4). For every system, recompute the
sum from the tags you write and confirm it equals the file's `Deck Sum`. The
golden spec re-checks this for the whole registry automatically.

## Categories (which batch each row of `reference-systems.md` belongs to)

- **Already registered** — Hi-Lo, KO, Omega II, Wong Halves. Never re-add.
- **Standard batch** (the large majority) — integer or genuinely-fractional tags
  keyed by rank. Hi-Opt I/II, Zen, Uston APC ("Uston Adv Point"), Revere Point
  Count, Canfield Expert, Mentor, Silver Fox, Griffin (+3/4/5), Victor, the
  BRH/EBJ families, etc. (Inverted-but-ordinary systems go in *novelty*.)
- **Color batch** — **Red Seven** (red 7 = +1, black 7 = 0) and **KISS 1/2/3**
  (red vs black 2). `reference-systems.md` shows these with an *averaged* tag
  (e.g. 7 = +0.5) — right for the deck sum, wrong for the per-card count. Require
  Phase 0, then add with a `colorValues` override. KISS also has a fractional
  **tens** tag (e.g. KISS 1 `T = -0.75`): that is **not** a color split — the four
  ten-ranks (`10 J Q K`, already distinct ranks) carry different integer values;
  research the real rule and set the four ten-rank `values` individually. If you
  cannot determine it, skip and report.
- **Novelty batch** (`--include-novelty` only) — computer-only counts with huge
  tags (`Griffin Ultimate` −60…+70, `Thorp Ultimate`, `Graham 7`, `Griffin 7`)
  and inverted "opposite of traditional" counts (`Tek's`, `Wilson APC`).
  Representable and the engine handles them, but unsuitable for normal training;
  note the reason in each description.
- **No data** — `CAC2` (all `?`). **Never add.**

## Phase 0 — color-aware model extension (one commit)

Minimal and backward-compatible: every existing system and its spec stay
unchanged. Four files.

1. **`src/app/core/models/card.model.ts`** — add a suit→color helper:

   ```ts
   export type CardColor = 'red' | 'black';
   export function suitColor(suit: Suit): CardColor {
     return suit === 'hearts' || suit === 'diamonds' ? 'red' : 'black';
   }
   ```

2. **`src/app/core/models/counting-system.model.ts`** — add the optional override,
   a pure resolver, and `colorValues?` on the interface:

   ```ts
   // Per-color tags for color-dependent systems (Red Seven, KISS). When a rank
   // appears here the count uses the red or black tag by the card's suit color;
   // ranks absent from colorValues use the scalar `values` entry.
   // INVARIANT: for every rank in colorValues, values[rank] === (red + black) / 2,
   // so the balanced deck-sum check (which reads `values`) stays correct — each
   // rank is two red + two black suits per deck.
   export interface ColorCountValue {
     readonly red: CountValue;   // hearts, diamonds
     readonly black: CountValue; // spades, clubs
   }

   // Per-card count contribution, honoring any color override.
   export function cardCountValue(system: CountingSystem, card: Card): number {
     const override = system.colorValues?.[card.rank];
     return override ? override[suitColor(card.suit)] : system.values[card.rank];
   }
   ```

3. **`src/app/core/services/counting-engine.service.ts`** — two edits:
   - In `runningCount`, use `total += cardCountValue(system, card)`.
   - In `isFractionalSystem`, judge by the **tags actually counted** (red/black
     pairs plus the `values` of non-overridden ranks), so an integer color system
     like Red Seven stays integer-input:

     ```ts
     isFractionalSystem(system: CountingSystem): boolean {
       const overridden = new Set(Object.keys(system.colorValues ?? {}));
       const effective = [
         ...ALL_RANKS.filter((r) => !overridden.has(r)).map((r) => system.values[r]),
         ...Object.values(system.colorValues ?? {}).flatMap((c) => [c.red, c.black]),
       ];
       return effective.some((v) => !Number.isInteger(v));
     }
     ```

4. **`src/app/features/card-counting/count-feedback-panel.component.ts`** — use
   `cardCountValue(sys, card)` for the per-card breakdown delta.

**Leave the spec's `fullDeckSum` unchanged** — the `values[rank] === (red+black)/2`
invariant keeps `values[rank] × 4` equal to the true `2·red + 2·black` deck
contribution, so the balance gate still holds.

**Phase 0 tests:** `suitColor` maps the four suits; `cardCountValue` returns the
color tag for an overridden rank and the scalar otherwise; `runningCount` over a
hand-built red/black sequence; `isFractionalSystem` stays `false` for an integer
color system and `true` for a genuinely fractional one.

Commit Phase 0 alone:

```text
feat: make counting model color-aware for color-dependent systems

Co-Authored-By: Codex Opus 4.8 <noreply@anthropic.com>
```

## Adding a batch of systems

### 1. Registry — `src/app/data/counting-systems.ts`

The original four keep their exported consts and fuller comments (the page
component imports `HI_LO` as the default). **New systems do not need individual
exports** — they are discovered via the array and verified by id in the golden
spec. Add each batch as a grouped sub-array of inline descriptors, then spread it
into `COUNTING_SYSTEMS`:

```ts
// --- Standard systems (Blackjack Review comparison; tags in reference-systems.md) ---
const STANDARD_SYSTEMS: readonly CountingSystem[] = [
  {
    id: 'hi-opt-ii',
    name: 'Hi-Opt II',
    // 2/3/6/7=+1, 4/5=+2, tens=-2; 8,9,A=0. Balanced (deck sum 0). Ace side count
    // not modeled. Source: reference-systems.md.
    description:
      'Balanced level-2 system (Hi-Opt II). 2/3/6/7 = +1, 4/5 = +2, tens = −2; 8, 9 and aces are neutral. Full play adds an ace side count, not drilled here.',
    balanced: true,
    values: { '2': 1, '3': 1, '4': 2, '5': 2, '6': 1, '7': 1, '8': 0, '9': 0, '10': -2, J: -2, Q: -2, K: -2, A: 0 },
  },
  // …rest of the standard batch…
];

export const COUNTING_SYSTEMS: readonly CountingSystem[] = [
  HI_LO, KO, OMEGA_II, WONG_HALVES,
  ...STANDARD_SYSTEMS,
  // ...COLOR_SYSTEMS,   (color batch)
  // ...NOVELTY_SYSTEMS, (novelty batch, opt-in)
] as const;
```

Keep comments concise (one line: tags + balance + source) — the canonical tags
live in `reference-systems.md` and the golden spec, not in 56 paragraphs. For
**ace-side-count** systems say the side count is not modeled; for **inverted** and
**computer-only** systems say so. Color descriptors carry a `colorValues` override
(see Phase 0's Red Seven shape: `values['7'] = 0.5`, `colorValues: { '7': { red: 1, black: 0 } }`).

### 2. Golden spec — `src/app/data/counting-systems.spec.ts` (the correctness engine)

Replace the old `registers …(and nothing else)` block (its `toEqual([4 ids])` will
fail as the registry grows) with a **data-driven golden spec**. Keep the existing
`fullDeckSum` helper; the original four per-system `describe` blocks may stay as
readable examples or be dropped (the golden spec subsumes them).

Add an `EXPECTED` table transcribed **independently from `reference-systems.md`**
(this is the golden source — its independence is what catches descriptor typos),
then loop the registry:

```ts
interface ExpectedSystem {
  values: Record<Rank, number>;
  colorValues?: Partial<Record<Rank, { red: number; black: number }>>;
  deckSum: number; // reference-systems.md "Deck Sum"
}

// `values` holds each per-rank tag — the (red+black)/2 average for color ranks.
const EXPECTED: Record<string, ExpectedSystem> = {
  'hi-lo': { deckSum: 0, values: { '2': 1, '3': 1, '4': 1, '5': 1, '6': 1, '7': 0, '8': 0, '9': 0, '10': -1, J: -1, Q: -1, K: -1, A: -1 } },
  // …every in-scope system, including color ones, e.g.:
  // 'red-seven': { deckSum: 2, colorValues: { '7': { red: 1, black: 0 } },
  //   values: { …, '7': 0.5, … } },
};

describe('counting systems registry (data-driven golden)', () => {
  it('registry ids exactly match the expected set', () => {
    expect(COUNTING_SYSTEMS.map((s) => s.id).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it('every system matches its golden tags, deck sum, and balance flag', () => {
    for (const s of COUNTING_SYSTEMS) {
      const exp = EXPECTED[s.id];
      expect(exp, `no golden entry for ${s.id}`).toBeDefined();
      for (const r of ALL_RANKS) expect(s.values[r], `${s.id} ${r}`).toBe(exp.values[r]);
      expect(fullDeckSum(s), `${s.id} deck sum`).toBe(exp.deckSum);
      expect(s.balanced, `${s.id} balanced`).toBe(exp.deckSum === 0);
    }
  });

  it('color systems honor their overrides and the (red+black)/2 invariant', () => {
    for (const s of COUNTING_SYSTEMS) {
      const exp = EXPECTED[s.id];
      if (!exp.colorValues) {
        expect(s.colorValues ?? {}).toEqual({});
        continue;
      }
      expect(s.colorValues).toEqual(exp.colorValues);
      for (const [r, cv] of Object.entries(exp.colorValues)) {
        expect(s.values[r as Rank]).toBe((cv.red + cv.black) / 2);
      }
    }
  });
});
```

When adding a batch, extend `EXPECTED` with that batch's systems (transcribed from
`reference-systems.md`). The id-set test then enforces that the registry and
`EXPECTED` stay in lockstep — neither can drift.

### 3. README — `README.md`

- Keep the **Counting systems** table to a curated highlight set (notable counts),
  not all 61 — a 61-row table is noise. Add a sentence like "N systems in total;
  see the in-app picker for the full list."
- Update every "four counting systems (Hi-Lo, KO, …)" mention and count:
  `grep -n "counting systems\|Hi-Lo, KO" README.md`.

## Validation phase (once per batch)

```bash
npm run format        # Prettier — lint includes format:check, so format first
npm run typecheck
CI=true npm test
npm run build
npm run lint          # = typecheck + format:check
```

Run the counting specs first for a fast signal, then the full baseline. The golden
spec pinpoints any wrong tag/sum/flag by system id. Fix within the batch's scope;
if you cannot validate, **revert the uncommitted batch** and stop.

## Commit phase (once per batch)

```bash
git branch --show-current   # must be exactly: main
git diff --check            # no whitespace / conflict markers
git add src/app/data/counting-systems.ts src/app/data/counting-systems.spec.ts README.md
git status --short          # docs/repo-current-state.md must remain "??", NOT staged
```

Never `git add -A` / `.` / `-u`. Suggested messages:

- Phase 0: `feat: make counting model color-aware for color-dependent systems`
- Standard: `feat: add standard card counting systems from Blackjack Review`
- Color: `feat: add color-dependent counting systems (Red Seven, KISS)`
- Novelty: `feat: add novelty and computer-only counting systems`
- Single named system: `feat: add <System Name> counting system`

End every message with:

```text
Co-Authored-By: Codex Opus 4.8 <noreply@anthropic.com>
```

Push only with `--push`. Never force push. If a push is rejected because the
remote moved, stop and report — do not rebase or force.

## Idempotency & stop conditions

- Before a batch, read `counting-systems.ts`; add only the in-scope systems whose
  ids are not already in `COUNTING_SYSTEMS`. If a batch is fully present, skip and
  report. Detect Phase 0 by the presence of `colorValues`/`cardCountValue`.
- Stop and report if: the branch is not `main`; tracked files had unrelated
  changes at startup; a system cannot be reconciled against `reference-systems.md`
  or fails the deck-sum check; a color/ten rule cannot be determined; validation
  fails and cannot be fixed in scope; or a push is rejected.
- When stopping mid-batch, revert that batch's (or Phase 0's) uncommitted edits so
  the tree is clean.

## Final report

For each phase/batch committed, report: which systems were added (and any
`colorValues`), the deck sums / balance flags, validation result, and the commit
hash (or why skipped/stopped). End with the remaining batches (and whether
`--include-novelty` was set) and whether commits were pushed. Remind the user the
work is split into a few batches; re-invoke (or pass `all`) to continue.
