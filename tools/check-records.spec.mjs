import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  anchorsOf,
  changedOnBranch,
  checkRecords,
  FIGURES,
  recordsDocs,
  slug,
} from './check-records.mjs';

/**
 * `tools/check-records.mjs` is a release gate (it runs inside `npm run lint`),
 * and round 2's N3 is the standing reason a tool that backs a gate gets a test:
 * nothing was holding the line on `serve-dist.mjs` either until something did.
 *
 * The gate's own risk is specific and worth naming. A records checker that
 * silently stops matching - a regex that no longer sees a citation, a marker
 * that accidentally exempts everything - does not fail. It passes, on every
 * document, forever, and the round after it reports a clean sweep it never ran.
 * Every test here is therefore a *positive* control: it builds a document with a
 * known defect and asserts the checker still refuses it.
 *
 * The fixtures are whole throwaway trees rather than the repository, so a test
 * cannot pass because the real records happen to be clean, and `changed` is
 * injected rather than read from git, because a fixture tree has no history.
 */

let root;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'records-'));
  mkdirSync(join(root, 'reviews'));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

/** Write a document and run the checker over exactly the documents named. */
function check(files, { docs, changed = new Set(), tracked, figures } = {}) {
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
  return checkRecords({
    root,
    docs: docs ?? Object.keys(files).filter((f) => f.endsWith('.md')),
    tracked: tracked ?? new Set(Object.keys(files)),
    changed,
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
  const changed = new Set(['src/thing.ts']);
  const source = 'a\nb\nconst PORT = 4200;\nd\n';

  it('refuses a citation into a changed file that is not bound to content', () => {
    const bad = check(
      { 'PROD-READINESS.md': 'The port is `src/thing.ts:3`.\n', 'src/thing.ts': source },
      { docs: ['PROD-READINESS.md'], changed },
    );
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('cites a file this branch changed');
  });

  it('refuses a binding whose fragment has moved off the cited line (R3-20)', () => {
    const bad = check(
      {
        'PROD-READINESS.md':
          'The port is `src/thing.ts:1`.\n<!-- cite: src/thing.ts:1 "const PORT = 4200;" -->\n',
        'src/thing.ts': source,
      },
      { docs: ['PROD-READINESS.md'], changed },
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
        { docs: ['PROD-READINESS.md'], changed },
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
        { docs: ['PROD-READINESS.md'], changed },
      ),
    ).toEqual([]);
  });

  it('refuses a citation past the end of the file, bound or not', () => {
    const bad = check(
      { 'PROD-READINESS.md': 'See `src/thing.ts:40`.\n', 'src/thing.ts': source },
      { docs: ['PROD-READINESS.md'], changed: new Set() },
    );
    expect(bad[0]).toContain('is past the end of src/thing.ts (4 lines)');
  });

  it('does not count a trailing newline as a line', () => {
    expect(
      check(
        { 'PROD-READINESS.md': 'See `src/thing.ts:4`.\n', 'src/thing.ts': source },
        { docs: ['PROD-READINESS.md'], changed: new Set() },
      ),
    ).toEqual([]);
  });

  it('sees a citation whose path starts with a dot', () => {
    const bad = check(
      {
        'PROD-READINESS.md': 'See `.github/workflows/x.yml:9`.\n',
        '.github/workflows/x.yml': 'a\n',
      },
      { docs: ['PROD-READINESS.md'], changed: new Set() },
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
        { docs: ['PROD-READINESS.md'], changed },
      ),
    ).toEqual([]);
  });

  it('does not demand bindings from a reviewer file, but still bounds-checks it', () => {
    const bad = check(
      {
        'reviews/REVIEW-x.md': 'See `src/thing.ts:3` and `src/thing.ts:99`.\n',
        'src/thing.ts': source,
      },
      { docs: ['reviews/REVIEW-x.md'], changed },
    );
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('is past the end');
  });

  it('ignores citations into generated trees', () => {
    expect(
      check(
        { 'PROD-READINESS.md': 'See `dist/blackjack-trainer/browser/ngsw-worker.js:583`.\n' },
        { docs: ['PROD-READINESS.md'], changed },
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

  it('reports no changed set rather than silently enforcing nothing', () => {
    // A tree with no git history: `git diff` fails, and the honest answer is to
    // say the at-risk set is unknown, not to pass every citation.
    expect(changedOnBranch(root)).toBeNull();
    const bad = checkRecords({ root, docs: [], tracked: new Set(), figures: FIGURES });
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('could not compute the set of files this branch changed');
  });

  it('reads the branch diff when there is one', () => {
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 'r@example.com'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'R'], { cwd: root });
    writeFileSync(join(root, 'a.txt'), 'one\n');
    execFileSync('git', ['add', 'a.txt'], { cwd: root });
    execFileSync('git', ['commit', '-qm', 'base'], { cwd: root });
    execFileSync('git', ['checkout', '-qb', 'work'], { cwd: root });
    writeFileSync(join(root, 'a.txt'), 'two\n');
    execFileSync('git', ['commit', '-qam', 'change'], { cwd: root });
    expect(changedOnBranch(root)).toEqual(new Set(['a.txt']));
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
    const changed = new Set(['src/thing.ts']);
    expect(
      check(
        {
          'reviews/ARTIFACTS-round1.md':
            '# A\n\n<!-- records: historical-file -->\n\nSee `src/thing.ts:1`.\n',
          'src/thing.ts': 'a\nb\n',
        },
        { docs: ['reviews/ARTIFACTS-round1.md'], changed },
      ),
    ).toEqual([]);
    const bad = check(
      {
        'reviews/ARTIFACTS-round1.md':
          '# A\n\n<!-- records: historical-file -->\n\nSee `src/thing.ts:9`.\n',
        'src/thing.ts': 'a\nb\n',
      },
      { docs: ['reviews/ARTIFACTS-round1.md'], changed },
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
      { docs: ['PROD-READINESS.md'], changed: new Set(['src/thing.ts']) },
    );
    expect(bad).toHaveLength(4);
  });
});
