import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { anchorsOf, checkRecords, FIGURES, recordsDocs, slug } from './check-records.mjs';

/**
 * `tools/check-records.mjs` is a release gate (it runs inside `npm run lint`),
 * and round 2's N3 is the standing reason a tool that backs a gate gets a test:
 * nothing was holding the line on `serve-dist.mjs` either until something did.
 *
 * The gate's own risk is specific and worth naming. A records checker that
 * silently stops matching - a regex that no longer sees a citation, a marker
 * that accidentally exempts everything - does not fail. It passes, on every
 * document, forever, and the round after it reports a clean sweep it never ran.
 * So the tests come in pairs. The important half of each pair is the *positive*
 * control - a document with a known defect, asserting the checker still refuses
 * it - and the other half asserts the complement, that a correct document and
 * each documented escape are accepted, which is what stops a rule from being
 * satisfied by refusing everything. Not every test is a positive control; saying
 * so here was itself a wrong claim about this suite (REVIEW-round4-stage1 F10).
 *
 * The fixtures are whole throwaway trees rather than the repository, so a test
 * cannot pass because the real records happen to be clean. Nothing here consults
 * git: rule 2 used to ask it which files had changed and pin only those, which
 * is the defect REVIEW-round4-stage1 F5 reported, so a fixture tree with no
 * history is now exactly as strict as the repository.
 */

let root;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'records-'));
  mkdirSync(join(root, 'reviews'));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

/** Write a document and run the checker over exactly the documents named. */
function check(files, { docs, tracked, figures } = {}) {
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
  return checkRecords({
    root,
    docs: docs ?? Object.keys(files).filter((f) => f.endsWith('.md')),
    tracked: tracked ?? new Set(Object.keys(files)),
    figures,
  });
}

describe('slug', () => {
  it("matches GitHub's anchor for a heading full of punctuation", () => {
    expect(slug('M2 - the E2E gate fails on one test, and it is the test that is wrong')).toBe(
      'm2---the-e2e-gate-fails-on-one-test-and-it-is-the-test-that-is-wrong',
    );
    expect(slug('N2 - `@angular/forms` is a runtime dependency nothing imports')).toBe(
      'n2---angularforms-is-a-runtime-dependency-nothing-imports',
    );
  });

  it('suffixes duplicate headings the way GitHub does', () => {
    const anchors = anchorsOf('# Gates\n\n## Gates\n\n### Gates\n');
    expect([...anchors]).toEqual(['gates', 'gates-1', 'gates-2']);
  });

  it('ignores headings inside a fenced block', () => {
    expect([...anchorsOf('# Real\n\n```sh\n# Not a heading\n```\n')]).toEqual(['real']);
  });
});

describe('rule 1: anchors', () => {
  it('refuses a link to a heading that was renamed (R3-12)', () => {
    const bad = check({
      'PROD-READINESS.md': 'See [M2](reviews/A.md#m2---the-old-title).\n',
      'reviews/A.md': '# A\n\n## M2 - the new title\n',
    });
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('no heading in reviews/A.md slugs to #m2---the-old-title');
  });

  it('accepts the link once the anchor matches', () => {
    expect(
      check({
        'PROD-READINESS.md': 'See [M2](reviews/A.md#m2---the-new-title).\n',
        'reviews/A.md': '# A\n\n## M2 - the new title\n',
      }),
    ).toEqual([]);
  });

  it('refuses a link into a file that does not exist', () => {
    const bad = check({ 'PROD-READINESS.md': 'See [x](reviews/gone.md#anything).\n' });
    expect(bad[0]).toContain('link target does not exist');
  });

  it('leaves external URLs alone', () => {
    expect(check({ 'PROD-READINESS.md': '[spec](https://example.com/a#frag)\n' })).toEqual([]);
  });
});

describe('rule 2: citations', () => {
  const source = 'a\nb\nconst PORT = 4200;\nd\n';

  it('refuses a citation that is not pinned to content', () => {
    const bad = check(
      { 'PROD-READINESS.md': 'The port is `src/thing.ts:3`.\n', 'src/thing.ts': source },
      { docs: ['PROD-READINESS.md'] },
    );
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('is not pinned to content');
  });

  it('refuses a binding whose fragment has moved off the cited line (R3-20)', () => {
    const bad = check(
      {
        'PROD-READINESS.md':
          'The port is `src/thing.ts:1`.\n<!-- cite: src/thing.ts:1 "const PORT = 4200;" -->\n',
        'src/thing.ts': source,
      },
      { docs: ['PROD-READINESS.md'] },
    );
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('no longer contains "const PORT = 4200;"');
  });

  it('accepts the citation when the fragment is there', () => {
    expect(
      check(
        {
          'PROD-READINESS.md':
            'The port is `src/thing.ts:3`.\n<!-- cite: src/thing.ts:3 "const PORT = 4200;" -->\n',
          'src/thing.ts': source,
        },
        { docs: ['PROD-READINESS.md'] },
      ),
    ).toEqual([]);
  });

  it('reads a fragment containing escaped quotes', () => {
    expect(
      check(
        {
          'PROD-READINESS.md':
            'See `src/thing.ts:1`.\n<!-- cite: src/thing.ts:1 "say \\"hi\\"" -->\n',
          'src/thing.ts': 'say "hi"\n',
        },
        { docs: ['PROD-READINESS.md'] },
      ),
    ).toEqual([]);
  });

  it('refuses a citation past the end of the file, bound or not', () => {
    const bad = check(
      { 'PROD-READINESS.md': 'See `src/thing.ts:40`.\n', 'src/thing.ts': source },
      { docs: ['PROD-READINESS.md'] },
    );
    expect(bad[0]).toContain('is past the end of src/thing.ts (4 lines)');
  });

  it('does not count a trailing newline as a line', () => {
    expect(
      check(
        {
          'PROD-READINESS.md': 'See `src/thing.ts:4`.\n<!-- cite: src/thing.ts:4 "d" -->\n',
          'src/thing.ts': source,
        },
        { docs: ['PROD-READINESS.md'] },
      ),
    ).toEqual([]);
  });

  it('sees a citation whose path starts with a dot', () => {
    const bad = check(
      {
        'PROD-READINESS.md': 'See `.github/workflows/x.yml:9`.\n',
        '.github/workflows/x.yml': 'a\n',
      },
      { docs: ['PROD-READINESS.md'] },
    );
    expect(bad[0]).toContain('is past the end');
  });

  it('honours a cite-historical marker', () => {
    expect(
      check(
        {
          'PROD-READINESS.md':
            'See `src/thing.ts:40`.\n<!-- cite-historical: src/thing.ts:40 -->\n',
          'src/thing.ts': source,
        },
        { docs: ['PROD-READINESS.md'] },
      ),
    ).toEqual([]);
  });

  it('does not demand bindings from a reviewer file, but still bounds-checks it', () => {
    const bad = check(
      {
        'reviews/REVIEW-x.md': 'See `src/thing.ts:3` and `src/thing.ts:99`.\n',
        'src/thing.ts': source,
      },
      { docs: ['reviews/REVIEW-x.md'] },
    );
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('is past the end');
  });

  it('ignores citations into generated trees', () => {
    expect(
      check(
        { 'PROD-READINESS.md': 'See `dist/blackjack-trainer/browser/ngsw-worker.js:583`.\n' },
        { docs: ['PROD-READINESS.md'] },
      ),
    ).toEqual([]);
  });
});

describe('rule 3: transcripts', () => {
  it('refuses an exit label no command in the block can print (R3-15, R3-27)', () => {
    const bad = check({
      'reviews/A.md': ['# A', '', '```console', '$ npm run lint', 'LINT_EXIT=1', '```', ''].join(
        '\n',
      ),
    });
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('cannot print it');
  });

  it('accepts the label when the echo that prints it is on the command line', () => {
    expect(
      check({
        'reviews/A.md': [
          '# A',
          '',
          '```console',
          '$ npm run lint > out.txt 2>&1; echo "LINT_EXIT=$?"',
          'LINT_EXIT=1',
          '```',
          '',
        ].join('\n'),
      }),
    ).toEqual([]);
  });

  it('accepts labels echoed into a file by earlier commands and then printed', () => {
    expect(
      check({
        'reviews/A.md': [
          '# A',
          '',
          '```console',
          '$ swiftlint lint > g8.txt 2>&1; echo "SWIFTLINT_EXIT=$?" >> labels.txt',
          '$ cat labels.txt',
          'SWIFTLINT_EXIT=0',
          '```',
          '',
        ].join('\n'),
      }),
    ).toEqual([]);
  });

  it('does not treat an environment prefix as an echo of that name', () => {
    const bad = check({
      'reviews/A.md': [
        '# A',
        '',
        '```console',
        '$ E2E_SERVER=serve npx playwright test; echo "R_EXIT=$?"',
        'E2E_SERVER=serve EXIT=0',
        '```',
        '',
      ].join('\n'),
    });
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('E2E_SERVER=');
  });

  it('follows a backslash continuation to the echo at its end', () => {
    expect(
      check({
        'reviews/A.md': [
          '# A',
          '',
          '```console',
          '$ npx playwright test \\',
          '    --repeat-each=5; echo "RUN_EXIT=$?"',
          'RUN_EXIT=0',
          '```',
          '',
        ].join('\n'),
      }),
    ).toEqual([]);
  });

  it('only inspects console fences', () => {
    expect(
      check({
        'reviews/A.md': ['# A', '', '```sh', 'LINT_EXIT=1', '```', ''].join('\n'),
      }),
    ).toEqual([]);
  });
});

describe('rule 4: figures', () => {
  const figures = {
    unitTests: 1551,
    coverage: [96.16, 93.28, 93.22, 98.0],
    m2: { failures: 33, executions: 600, rate: 5.5 },
  };

  it('refuses a stale unit-test count (R3-1, R3-11, R3-18, R3-24)', () => {
    const bad = check({ 'reviews/A.md': '# A\n\nThe suite is 1547 passed.\n' }, { figures });
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain("states 1547 where the round's unit-test count is 1551");
  });

  it('leaves the E2E suite count alone', () => {
    expect(check({ 'reviews/A.md': '# A\n\nGate 5 reports 111 passed.\n' }, { figures })).toEqual(
      [],
    );
  });

  it('refuses a stale coverage quadruple', () => {
    const bad = check(
      { 'reviews/A.md': '# A\n\nCoverage is 96.11 / 93.23 / 93.28 / 97.97 today.\n' },
      { figures },
    );
    expect(bad[0]).toContain('states 96.11 / 93.23 / 93.28 / 97.97');
  });

  it('refuses a stale pooled M2 count and a stale pooled M2 rate', () => {
    const bad = check(
      { 'reviews/A.md': '# A\n\nMeasured at 20 of 600 executions, 5.0% per execution.\n' },
      { figures },
    );
    expect(bad).toHaveLength(2);
    expect(bad.join(' ')).toContain('pooled M2 failure count');
    expect(bad.join(' ')).toContain('pooled M2 rate');
  });

  it('does not read 7600 ms as the M2 denominator', () => {
    expect(
      check({ 'reviews/A.md': '# A\n\nThe budget is 7600 ms, a margin of 2.84x.\n' }, { figures }),
    ).toEqual([]);
  });

  it('leaves a verbatim console transcript alone', () => {
    expect(
      check(
        { 'reviews/A.md': '# A\n\n```console\n$ npm test\n      Tests  1547 passed (1547)\n```\n' },
        { figures },
      ),
    ).toEqual([]);
  });

  it('refuses a stale figure inside a published diff block (R3-11)', () => {
    const bad = check(
      { 'reviews/A.md': '# A\n\n```diff\n+  // Measured at 20 of 600 unseeded runs.\n```\n' },
      { figures },
    );
    expect(bad.join(' ')).toContain('pooled M2 failure count');
  });

  it('honours a figure-historical marker on the same line', () => {
    expect(
      check(
        { 'reviews/A.md': '# A\n\nThe baseline was 1547 passed. <!-- figure-historical -->\n' },
        { figures },
      ),
    ).toEqual([]);
  });

  it('honours a historical-file marker for the whole document', () => {
    expect(
      check(
        {
          'reviews/A.md':
            '# A\n\n<!-- records: historical-file -->\n\n1547 passed, twice: 1533 passed.\n',
        },
        { figures },
      ),
    ).toEqual([]);
  });

  it('stops a section marker at the next h1', () => {
    const bad = check(
      {
        'reviews/A.md': [
          '# ROUND 3',
          '',
          '<!-- records: historical -->',
          '',
          'Round 3 measured 1547 passed.',
          '',
          '# ROUND 4',
          '',
          'Round 4 measures 1533 passed.',
          '',
        ].join('\n'),
      },
      { figures },
    );
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('states 1533');
  });
});

describe('the parts that decide what gets checked at all', () => {
  it('collects the ledger, the checklist and every review as records', () => {
    writeFileSync(join(root, 'PROD-READINESS.md'), '# L\n');
    writeFileSync(join(root, 'LAUNCH-CHECKLIST.md'), '# C\n');
    writeFileSync(join(root, 'reviews', 'b.md'), '# B\n');
    writeFileSync(join(root, 'reviews', 'a.md'), '# A\n');
    writeFileSync(join(root, 'reviews', 'notes.txt'), 'ignored');
    expect(recordsDocs(root)).toEqual([
      'PROD-READINESS.md',
      'LAUNCH-CHECKLIST.md',
      'reviews/a.md',
      'reviews/b.md',
    ]);
  });

  it('omits documents that are not there rather than throwing', () => {
    expect(recordsDocs(root)).toEqual([]);
  });

  it('pins citations with no git at all, in a tree that has no history', () => {
    // The whole of F5: this fixture is not a repository, so a rule that asked
    // git which files had changed would have nothing to enforce and would pass.
    const bad = check(
      { 'PROD-READINESS.md': 'See `src/thing.ts:1`.\n', 'src/thing.ts': 'a\n' },
      { docs: ['PROD-READINESS.md'] },
    );
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('is not pinned to content');
  });

  it('refuses a citation whose basename matches more than one tracked file', () => {
    const bad = check(
      { 'PROD-READINESS.md': 'See `page.ts:1`.\n' },
      {
        docs: ['PROD-READINESS.md'],
        tracked: new Set(['PROD-READINESS.md', 'a/page.ts', 'b/page.ts']),
      },
    );
    expect(bad[0]).toContain('names no tracked file (or names several)');
  });

  it('lifts the binding requirement for a frozen document, but not the bounds check', () => {
    expect(
      check(
        {
          'reviews/ARTIFACTS-round1.md':
            '# A\n\n<!-- records: historical-file -->\n\nSee `src/thing.ts:1`.\n',
          'src/thing.ts': 'a\nb\n',
        },
        { docs: ['reviews/ARTIFACTS-round1.md'] },
      ),
    ).toEqual([]);
    const bad = check(
      {
        'reviews/ARTIFACTS-round1.md':
          '# A\n\n<!-- records: historical-file -->\n\nSee `src/thing.ts:9`.\n',
        'src/thing.ts': 'a\nb\n',
      },
      { docs: ['reviews/ARTIFACTS-round1.md'] },
    );
    expect(bad[0]).toContain('is past the end');
  });

  it('honours a transcript-literal marker before a fence that really printed a label', () => {
    expect(
      check({
        'reviews/A.md': [
          '# A',
          '',
          '<!-- transcript-literal -->',
          '',
          '```console',
          '$ cat .env.example',
          'API_BASE=https://example.test',
          '```',
          '',
        ].join('\n'),
      }),
    ).toEqual([]);
  });

  it('applies a historical-file marker wherever it sits, even past a second h1', () => {
    expect(
      check(
        {
          'reviews/A.md': [
            '# A',
            '',
            '<!-- records: historical-file -->',
            '',
            'Round 1 measured 1526 passed.',
            '',
            '# Appendix',
            '',
            'and 1533 passed later.',
            '',
          ].join('\n'),
        },
        { figures: FIGURES },
      ),
    ).toEqual([]);
  });
});

describe('a directive counts only where a directive can be written', () => {
  const figures = FIGURES;

  it('does not honour a marker printed inside a fenced block', () => {
    // The census transcript in this round's own artifact prints the marker's
    // text as part of a `sed`/`node` command. Read as a marker, it froze three
    // quarters of the document that carried every proof in the round
    // (REVIEW-round4-stage2 F1).
    const bad = check(
      {
        'reviews/A.md': [
          '# A',
          '',
          '```console',
          '$ node -e \'s.replace(/<!-- records: historical[^>]*-->/g,"")\'',
          'STRIPPED_OK=1',
          '```',
          '',
          'And below it, 1547 passed.',
          '',
        ].join('\n'),
      },
      { figures },
    );
    // Both rules still bind below the fence: the label, and the figure.
    expect(bad).toHaveLength(2);
    expect(bad.join(' ')).toContain('cannot print it');
    expect(bad.join(' ')).toContain('states 1547');
  });

  it('still honours a marker written as a marker', () => {
    expect(
      check(
        { 'reviews/A.md': '# A\n\n<!-- records: historical-file -->\n\n1547 passed.\n' },
        { figures },
      ),
    ).toEqual([]);
  });
});

describe('rule 3 reads a command line the way a shell would', () => {
  function fence(command, label) {
    return ['# A', '', '```console', `$ ${command}`, label, '```', ''].join('\n');
  }

  it('does not let an apostrophe in a comment turn the rule off', () => {
    // An unpaired apostrophe used to read as an open quote, so every remaining
    // line of the fence became command text and no output was ever checked
    // (REVIEW-round4-stage2 F3).
    const bad = check({ 'reviews/A.md': fence("ls   # the app's own output", 'FAKE_EXIT=0') });
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('cannot print it');
  });

  it('still treats a genuinely open quote as a continuation', () => {
    expect(
      check({
        'reviews/A.md': [
          '# A',
          '',
          '```console',
          '$ python3 -c "',
          'print(1)',
          '"; echo "RUN_EXIT=$?"',
          'RUN_EXIT=0',
          '```',
          '',
        ].join('\n'),
      }),
    ).toEqual([]);
  });
});

describe('rule 4 tolerates the coverage jitter it measured', () => {
  const figures = { ...FIGURES, coverage: [96.06, 92.83, 93.43, 97.89] };

  it('accepts a quadruple one branch away from the pinned one', () => {
    // 92.87 against a pinned 92.83 is one branch of 2695. Eleven of twelve runs
    // printed 92.83 and one printed 92.87 (REVIEW-round4-stage2 F9); refusing
    // that would tell an author their own measurement was wrong.
    expect(
      check({ 'reviews/A.md': '# A\n\nCoverage is 96.06 / 92.87 / 93.43 / 97.89.\n' }, { figures }),
    ).toEqual([]);
  });

  it('still refuses the superseded quadruple', () => {
    const bad = check(
      { 'reviews/A.md': '# A\n\nCoverage is 96.16 / 93.28 / 93.22 / 98.00.\n' },
      { figures },
    );
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('coverage quadruple');
  });
});

describe('the gate as a whole', () => {
  it('reports every rule at once rather than stopping at the first', () => {
    const bad = check(
      {
        'PROD-READINESS.md': [
          '# L',
          '',
          'See [x](reviews/A.md#gone) and `src/thing.ts:99`.',
          '',
          'The suite is 1547 passed.',
          '',
          '```console',
          '$ npm run lint',
          'LINT_EXIT=1',
          '```',
          '',
        ].join('\n'),
        'reviews/A.md': '# A\n',
        'src/thing.ts': 'a\n',
      },
      { docs: ['PROD-READINESS.md'] },
    );
    expect(bad).toHaveLength(4);
  });
});
