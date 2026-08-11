import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { COUNTING_SYSTEMS } from '../src/app/data/counting-systems';

/**
 * The iOS parity anti-drift gate is `npm run export:fixtures` followed by
 * `git diff --exit-code -- ios/Fixtures`, and it compares the exporter against
 * **itself**: regenerate, and if the bytes match the committed copy, pass. That
 * catches an engine changing without its fixtures being regenerated, which is
 * what it was built for.
 *
 * What it cannot see is the exporter quietly emitting less. Shrink a loop's
 * domain, commit the regenerated files, and the gate compares degraded output
 * against degraded output and stays green. Nothing tested `tools/` at all (N3).
 *
 * The Swift side is **not** blind to this, contrary to what an earlier version
 * of this comment said: `BasicStrategyParityTests.swift:15`,
 * `DeviationParityTests.swift:19` and `CountingParityTests.swift:14` hard-code
 * 2720, 62560 and 58, and a degraded export fails them. What these checks add is
 * that they run in the **web** CI, which has no path filter, whereas
 * `.github/workflows/ios-ci.yml` runs only on changes under `ios/**` — plus the
 * dimensions the Swift counts do not pin at all.
 *
 * These are the checks that regenerating cannot satisfy: the fixtures have to
 * agree with their own declared counts, cover the domains their descriptions
 * claim, and — for the one case where the web app holds the source of truth in
 * a form worth comparing — agree with it.
 *
 * Plain JavaScript for the same reason as `serve-dist.spec.mjs`, which states it
 * in full: a `.spec.ts` under `tools/` is outside `tsconfig.spec.json` and so is
 * never typechecked, and bringing it inside fails for want of `@types/node`.
 */

const FIXTURES = join(process.cwd(), 'ios', 'Fixtures');

function fixture(name) {
  return JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8'));
}

/**
 * `representativeHands()` in the exporter: 10 pairs (2-10 and A), 9 soft hands
 * (A,2 through A,10) and 15 hard totals (5 through 19). Hard-coded on purpose -
 * this is a parity fixture set, so a legitimate change to the canonical domain
 * should have to say so here.
 */
const CANONICAL_HANDS = 10 + 9 + 15;

const ALL = [
  'basic-strategy-vectors',
  'charts',
  'counting-systems',
  'counting-vectors',
  'deviation-vectors',
  'play-deviation-vectors',
  'showdown-vectors',
];

describe('ios/Fixtures (produced by tools/export-parity-fixtures.ts)', () => {
  it('has every fixture the exporter claims to write, each stamped with its origin', () => {
    // Read the directory rather than counting the list above, which would be
    // comparing a literal with itself. `main()` logs "Wrote 7 parity fixtures";
    // that number means nothing until something looks at what landed. `rmSync`
    // at the top of `main()` clears the directory first, so a fixture that stops
    // being written disappears rather than going stale.
    const written = readdirSync(FIXTURES)
      .filter((f) => f.endsWith('.json'))
      .sort();
    expect(written).toEqual(ALL.map((n) => `${n}.json`).sort());

    for (const name of ALL) {
      const data = fixture(name);
      expect(data.generatedBy, `${name} is not stamped by the exporter`).toBe(
        'tools/export-parity-fixtures.ts',
      );
      expect(data.schema, `${name} has no versioned schema`).toMatch(/^[a-z-]+\/\d+$/);
      expect(String(data.description).length).toBeGreaterThan(0);
    }
  });

  it('agrees with its own declared counts', () => {
    // A truncated or short-circuited export leaves the header count and the body
    // disagreeing. Regenerating reproduces both, so the diff gate stays green.
    const cases = [
      ['basic-strategy-vectors', 'vectors'],
      ['counting-systems', 'systems'],
      ['deviation-vectors', 'rows'],
      ['play-deviation-vectors', 'deviations'],
    ];
    for (const [name, key] of cases) {
      const data = fixture(name);
      expect(data[key].length, `${name}.${key} is empty`).toBeGreaterThan(0);
      expect(data.count, `${name}.count disagrees with ${key}.length`).toBe(data[key].length);
    }
  });

  it('exports every counting system the web app defines, in the same order', () => {
    // The one place the two platforms can be compared directly against the
    // source of truth rather than against a previous export.
    const exported = fixture('counting-systems');
    expect(exported.systems.map((s) => s.id)).toEqual(COUNTING_SYSTEMS.map((s) => s.id));
    expect(exported.count).toBe(COUNTING_SYSTEMS.length);
  });

  it('covers the whole basic-strategy domain it calls exhaustive', () => {
    const { vectors } = fixture('basic-strategy-vectors');

    // The hand axis is the one that carries almost all the size, so it is the
    // one a shrunk domain hides behind: cutting `representativeHands()` to a
    // single hand takes this fixture from 2720 rows to 80 and the deviation
    // fixture from 62560 to 1840 — 97% of both — while every other property
    // here still holds. An earlier version of this spec checked the dealer and
    // rule-set axes only and passed on exactly that.
    const hands = new Set(vectors.map((v) => JSON.stringify(v.hand)));
    expect(hands.size, `only ${hands.size} canonical hands appear`).toBe(CANONICAL_HANDS);

    const dealers = new Set(vectors.map((v) => String(v.dealer)));
    // Ten upcards: 2-10 and an ace, however each is spelled.
    expect(dealers.size, `only ${dealers.size} dealer upcards appear`).toBe(10);
    expect(new Set(vectors.map((v) => v.ruleSet))).toEqual(new Set(['H17', 'S17']));

    // "Exhaustive" is a cross-product claim, so check it as one: every hand
    // against every upcard under both rule sets and both option flags.
    const das = new Set(vectors.map((v) => v.das));
    const ls = new Set(vectors.map((v) => v.ls));
    expect(das.size).toBe(2);
    expect(ls.size).toBe(2);
    expect(vectors.length, 'the exported vectors are not a complete cross-product').toBe(
      CANONICAL_HANDS * 10 * 2 * das.size * ls.size,
    );

    // Counted, then asserted once. One `expect` per row over thousands of rows
    // is slow enough to blow the 5 s per-test timeout under a parallel run, and
    // a test that fails on machine load is not a gate.
    const actionless = vectors.filter((v) => String(v.action ?? '').length === 0);
    expect(actionless.length, `${actionless.length} vectors carry no action`).toBe(0);
  });

  it('sweeps the same hand, dealer and true-count axes through the deviation fixture', () => {
    const data = fixture('deviation-vectors');
    const at = (name) => data.columns.indexOf(name);
    const hands = new Set(data.rows.map((r) => `${r[at('handCard1')]}|${r[at('handCard2')]}`));
    expect(hands.size, `only ${hands.size} canonical hands appear`).toBe(CANONICAL_HANDS);
    expect(new Set(data.rows.map((r) => String(r[at('dealer')]))).size).toBe(10);
    // The published deviation indices run to ±10, so the sweep is -10..+10 plus
    // the two out-of-range ends the engines must still answer for.
    expect(new Set(data.rows.map((r) => r[at('trueCount')])).size).toBe(23);
  });

  it('keeps every deviation row the shape its own columns declare', () => {
    // The Swift side reads these positionally, so a row that is one column short
    // is silently misread rather than rejected.
    for (const [name, key] of [
      ['deviation-vectors', 'rows'],
      ['play-deviation-vectors', 'deviations'],
    ]) {
      const data = fixture(name);
      expect(data.columns.length).toBeGreaterThan(0);
      expect(data.sources.length, `${name} cites no source rows`).toBeGreaterThan(0);
      const width = data.columns.length;
      const malformed = data[key].filter((row) => row.length !== width);
      expect(
        malformed.length,
        `${name}.${key}: ${malformed.length} rows are not ${width} columns wide`,
      ).toBe(0);
    }
  });

  it('narrows play deviations from a domain it actually examined', () => {
    const data = fixture('play-deviation-vectors');
    expect(data.examined).toBeGreaterThan(data.count);
    for (const [key, dimension] of Object.entries(data.domain)) {
      // `doubleAfterSplit` is recorded as a single boolean rather than a list of
      // values swept; the rest are the swept dimensions and none may collapse.
      if (Array.isArray(dimension)) {
        expect(dimension.length, `domain.${key} is empty`).toBeGreaterThan(0);
      } else {
        expect(dimension, `domain.${key} is unset`).toBeDefined();
      }
    }
  });

  it('leaves no case list in the counting and showdown fixtures empty', () => {
    const counting = fixture('counting-vectors');
    expect(counting.systems).toHaveLength(COUNTING_SYSTEMS.length);
    for (const system of counting.systems) {
      expect(system.sequences.length, `${system.systemId} has no sequences`).toBeGreaterThan(0);
    }
    for (const key of ['deckEstimateCases', 'keyCountCases', 'betRampCases']) {
      expect(counting[key].length, `counting-vectors.${key} is empty`).toBeGreaterThan(0);
    }

    const showdown = fixture('showdown-vectors');
    for (const key of Object.keys(showdown)) {
      if (Array.isArray(showdown[key])) {
        expect(showdown[key].length, `showdown-vectors.${key} is empty`).toBeGreaterThan(0);
      }
    }
  });

  it('exports all four charts', () => {
    const { basicStrategy, deviations } = fixture('charts');
    expect(Object.keys(basicStrategy).sort()).toEqual(['H17', 'S17']);
    expect(Object.keys(deviations).sort()).toEqual(['H17', 'S17']);
  });
});
