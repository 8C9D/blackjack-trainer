import { readFileSync } from 'node:fs';
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
 * domain, commit the regenerated files, and every run afterwards is green — the
 * gate compares degraded output against degraded output, and the Swift parity
 * tests assert against the same weakened set, so they pass too. Nothing tested
 * `tools/` at all (N3).
 *
 * These are the checks that regenerating cannot satisfy: the fixtures have to
 * agree with their own declared counts, cover the domains their descriptions
 * claim, and — for the one case where the web app holds the source of truth in
 * a form worth comparing — agree with it.
 *
 * Plain JavaScript for the same reason as `serve-dist.spec.mjs`: `@types/node`
 * is not a dependency, so a `.spec.ts` here cannot resolve `node:fs`.
 */

const FIXTURES = join(process.cwd(), 'ios', 'Fixtures');

function fixture(name) {
  return JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8'));
}

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
    // `main()` logs "Wrote 7 parity fixtures"; that number is only a log line
    // unless something checks it.
    expect(ALL).toHaveLength(7);
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
    const dealers = new Set(vectors.map((v) => String(v.dealer)));
    // Ten upcards: 2-10 and an ace, however each is spelled.
    expect(dealers.size, `only ${dealers.size} dealer upcards appear`).toBe(10);
    expect(new Set(vectors.map((v) => v.ruleSet))).toEqual(new Set(['H17', 'S17']));
    // Counted, then asserted once. One `expect` per row over thousands of rows
    // is slow enough to blow the 5 s per-test timeout under a parallel run, and
    // a test that fails on machine load is not a gate.
    const actionless = vectors.filter((v) => String(v.action ?? '').length === 0);
    expect(actionless.length, `${actionless.length} vectors carry no action`).toBe(0);
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
