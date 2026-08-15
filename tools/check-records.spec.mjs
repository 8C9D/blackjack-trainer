import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

/**
 * Write a document and run the checker over exactly the documents named. The
 * fixture trees have no git history, so the gate-table repository questions
 * default to the permissive answers here; tests about those questions inject
 * their own.
 */
async function check(files, { docs, tracked, figures, commitExists, previousOf } = {}) {
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
  return await checkRecords({
    root,
    docs: docs ?? Object.keys(files).filter((f) => f.endsWith('.md')),
    tracked: tracked ?? new Set(Object.keys(files)),
    figures,
    commitExists: commitExists ?? (() => true),
    previousOf: previousOf ?? (() => null),
  });
}

describe('slug', () => {
  it("matches GitHub's anchor for a heading full of punctuation", async () => {
    expect(slug('M2 - the E2E gate fails on one test, and it is the test that is wrong')).toBe(
      'm2---the-e2e-gate-fails-on-one-test-and-it-is-the-test-that-is-wrong',
    );
    expect(slug('N2 - `@angular/forms` is a runtime dependency nothing imports')).toBe(
      'n2---angularforms-is-a-runtime-dependency-nothing-imports',
    );
  });

  it('suffixes duplicate headings the way GitHub does', async () => {
    const anchors = await anchorsOf('# Gates\n\n## Gates\n\n### Gates\n');
    expect([...anchors]).toEqual(['gates', 'gates-1', 'gates-2']);
  });

  it('ignores headings inside a fenced block', async () => {
    expect([...(await anchorsOf('# Real\n\n```sh\n# Not a heading\n```\n'))]).toEqual(['real']);
  });
});

describe('rule 1: anchors', () => {
  it('refuses a link to a heading that was renamed (R3-12)', async () => {
    const bad = await check({
      'PROD-READINESS.md': 'See [M2](reviews/A.md#m2---the-old-title).\n',
      'reviews/A.md': '# A\n\n## M2 - the new title\n',
    });
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('no heading in reviews/A.md slugs to #m2---the-old-title');
  });

  it('accepts the link once the anchor matches', async () => {
    expect(
      await check({
        'PROD-READINESS.md': 'See [M2](reviews/A.md#m2---the-new-title).\n',
        'reviews/A.md': '# A\n\n## M2 - the new title\n',
      }),
    ).toEqual([]);
  });

  it('refuses a link into a file that does not exist', async () => {
    const bad = await check({ 'PROD-READINESS.md': 'See [x](reviews/gone.md#anything).\n' });
    expect(bad[0]).toContain('link target does not exist');
  });

  it('leaves external URLs alone', async () => {
    expect(await check({ 'PROD-READINESS.md': '[spec](https://example.com/a#frag)\n' })).toEqual(
      [],
    );
  });
});

describe('rule 2: citations', () => {
  const source = 'a\nb\nconst PORT = 4200;\nd\n';

  it('refuses a citation that is not pinned to content', async () => {
    const bad = await check(
      { 'PROD-READINESS.md': 'The port is `src/thing.ts:3`.\n', 'src/thing.ts': source },
      { docs: ['PROD-READINESS.md'] },
    );
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('is not pinned to content');
  });

  it('refuses a binding whose fragment has moved off the cited line (R3-20)', async () => {
    const bad = await check(
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

  it('accepts the citation when the fragment is there', async () => {
    expect(
      await check(
        {
          'PROD-READINESS.md':
            'The port is `src/thing.ts:3`.\n<!-- cite: src/thing.ts:3 "const PORT = 4200;" -->\n',
          'src/thing.ts': source,
        },
        { docs: ['PROD-READINESS.md'] },
      ),
    ).toEqual([]);
  });

  it('reads a fragment containing escaped quotes', async () => {
    expect(
      await check(
        {
          'PROD-READINESS.md':
            'See `src/thing.ts:1`.\n<!-- cite: src/thing.ts:1 "say \\"hi\\"" -->\n',
          'src/thing.ts': 'say "hi"\n',
        },
        { docs: ['PROD-READINESS.md'] },
      ),
    ).toEqual([]);
  });

  it('refuses a citation past the end of the file, bound or not', async () => {
    const bad = await check(
      { 'PROD-READINESS.md': 'See `src/thing.ts:40`.\n', 'src/thing.ts': source },
      { docs: ['PROD-READINESS.md'] },
    );
    expect(bad[0]).toContain('is past the end of src/thing.ts (4 lines)');
  });

  it('does not count a trailing newline as a line', async () => {
    expect(
      await check(
        {
          'PROD-READINESS.md': 'See `src/thing.ts:4`.\n<!-- cite: src/thing.ts:4 "d" -->\n',
          'src/thing.ts': source,
        },
        { docs: ['PROD-READINESS.md'] },
      ),
    ).toEqual([]);
  });

  it('sees a citation whose path starts with a dot', async () => {
    const bad = await check(
      {
        'PROD-READINESS.md': 'See `.github/workflows/x.yml:9`.\n',
        '.github/workflows/x.yml': 'a\n',
      },
      { docs: ['PROD-READINESS.md'] },
    );
    expect(bad[0]).toContain('is past the end');
  });

  it('honours a cite-historical marker', async () => {
    expect(
      await check(
        {
          'PROD-READINESS.md':
            'See `src/thing.ts:40`.\n<!-- cite-historical: src/thing.ts:40 -->\n',
          'src/thing.ts': source,
        },
        { docs: ['PROD-READINESS.md'] },
      ),
    ).toEqual([]);
  });

  it('does not demand bindings from a reviewer file, but still bounds-checks it', async () => {
    const bad = await check(
      {
        'reviews/REVIEW-x.md': 'See `src/thing.ts:3` and `src/thing.ts:99`.\n',
        'src/thing.ts': source,
      },
      { docs: ['reviews/REVIEW-x.md'] },
    );
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('is past the end');
  });

  it('ignores citations into generated trees', async () => {
    expect(
      await check(
        { 'PROD-READINESS.md': 'See `dist/blackjack-trainer/browser/ngsw-worker.js:583`.\n' },
        { docs: ['PROD-READINESS.md'] },
      ),
    ).toEqual([]);
  });
});

describe('rule 3: transcripts', () => {
  it('refuses an exit label no command in the block can print (R3-15, R3-27)', async () => {
    const bad = await check({
      'reviews/A.md': ['# A', '', '```console', '$ npm run lint', 'LINT_EXIT=1', '```', ''].join(
        '\n',
      ),
    });
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('cannot print it');
  });

  it('accepts the label when the echo that prints it is on the command line', async () => {
    expect(
      await check({
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

  it('accepts labels echoed into a file by earlier commands and then printed', async () => {
    expect(
      await check({
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

  it('does not treat an environment prefix as an echo of that name', async () => {
    const bad = await check({
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

  it('follows a backslash continuation to the echo at its end', async () => {
    expect(
      await check({
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

  it('only inspects console fences', async () => {
    expect(
      await check({
        'reviews/A.md': ['# A', '', '```sh', 'LINT_EXIT=1', '```', ''].join('\n'),
      }),
    ).toEqual([]);
  });
});

describe('rule 4: figures', () => {
  const figures = {
    m2: { failures: 33, executions: 600, rate: 5.5 },
  };

  it('refuses a volatile unit-test count stated in prose (K8)', async () => {
    const bad = await check({ 'reviews/A.md': '# A\n\nThe suite is 1547 passed.\n' }, { figures });
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('states 1547 in prose');
  });

  it('refuses a unit-test count even when nothing contradicts it', async () => {
    // The old rule pinned a current value and accepted prose that matched it,
    // which dragged the prose to every new tree's value (K8). There is no
    // correct value to state any more: the shape itself is refused.
    const bad = await check(
      { 'reviews/A.md': '# A\n\nAll 1620 tests pass at this tip.\n' },
      { figures },
    );
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('volatile');
  });

  it('leaves the E2E suite count alone', async () => {
    expect(
      await check({ 'reviews/A.md': '# A\n\nGate 5 reports 111 passed.\n' }, { figures }),
    ).toEqual([]);
  });

  it('refuses a coverage quadruple stated in prose', async () => {
    const bad = await check(
      { 'reviews/A.md': '# A\n\nCoverage is 96.11 / 93.23 / 93.28 / 97.97 today.\n' },
      { figures },
    );
    expect(bad[0]).toContain('states 96.11 / 93.23 / 93.28 / 97.97');
    expect(bad[0]).toContain('coverage quadruple');
  });

  it('refuses a stale pooled M2 count and a stale pooled M2 rate', async () => {
    const bad = await check(
      { 'reviews/A.md': '# A\n\nMeasured at 20 of 600 executions, 5.0% per execution.\n' },
      { figures },
    );
    expect(bad).toHaveLength(2);
    expect(bad.join(' ')).toContain('pooled M2 failure count');
    expect(bad.join(' ')).toContain('pooled M2 rate');
  });

  it('does not read 7600 ms as the M2 denominator', async () => {
    expect(
      await check(
        { 'reviews/A.md': '# A\n\nThe budget is 7600 ms, a margin of 2.84x.\n' },
        { figures },
      ),
    ).toEqual([]);
  });

  it('leaves a verbatim console transcript alone', async () => {
    expect(
      await check(
        { 'reviews/A.md': '# A\n\n```console\n$ npm test\n      Tests  1547 passed (1547)\n```\n' },
        { figures },
      ),
    ).toEqual([]);
  });

  it('refuses a stale figure inside a published diff block (R3-11)', async () => {
    const bad = await check(
      { 'reviews/A.md': '# A\n\n```diff\n+  // Measured at 20 of 600 unseeded runs.\n```\n' },
      { figures },
    );
    expect(bad.join(' ')).toContain('pooled M2 failure count');
  });

  it('sweeps a stale figure inside a fence with no language at all', async () => {
    // A bare ``` fence has no info string; it is code, it is not a transcript,
    // and rule 4 must still read it.
    const bad = await check({ 'reviews/A.md': '# A\n\n```\n1547 passed\n```\n' }, { figures });
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('states 1547');
  });

  it('does not honour a figure-historical marker printed inside a code block', async () => {
    // A diff block quoting a marked line prints the marker's text as code.
    // Honoured there, it would exempt any stale figure sharing those lines -
    // and the guard refusing that survived a mutation run with the suite green
    // (REVIEW-round4-stage6 F7), so this fixture pins it.
    const bad = await check(
      {
        'reviews/A.md':
          '# A\n\n```diff\n+ The old count was 1547 passed. <!-- figure-historical -->\n```\n',
      },
      { figures },
    );
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('states 1547');
  });

  it('honours a figure-historical marker on the same line', async () => {
    expect(
      await check(
        { 'reviews/A.md': '# A\n\nThe baseline was 1547 passed. <!-- figure-historical -->\n' },
        { figures },
      ),
    ).toEqual([]);
  });

  it('honours a historical-file marker for the whole document', async () => {
    expect(
      await check(
        {
          'reviews/A.md':
            '# A\n\n<!-- records: historical-file -->\n\n1547 passed, twice: 1533 passed.\n',
        },
        { figures },
      ),
    ).toEqual([]);
  });

  it('stops a section marker at the next h1', async () => {
    const bad = await check(
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
  it('collects the ledger, the checklist and every review as records', async () => {
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

  it('omits documents that are not there rather than throwing', async () => {
    expect(recordsDocs(root)).toEqual([]);
  });

  it('pins citations with no git at all, in a tree that has no history', async () => {
    // The whole of F5: this fixture is not a repository, so a rule that asked
    // git which files had changed would have nothing to enforce and would pass.
    const bad = await check(
      { 'PROD-READINESS.md': 'See `src/thing.ts:1`.\n', 'src/thing.ts': 'a\n' },
      { docs: ['PROD-READINESS.md'] },
    );
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('is not pinned to content');
  });

  it('refuses a citation whose basename matches more than one tracked file', async () => {
    const bad = await check(
      { 'PROD-READINESS.md': 'See `page.ts:1`.\n' },
      {
        docs: ['PROD-READINESS.md'],
        tracked: new Set(['PROD-READINESS.md', 'a/page.ts', 'b/page.ts']),
      },
    );
    expect(bad[0]).toContain('names no tracked file (or names several)');
  });

  it('lifts the binding requirement for a frozen document, but not the bounds check', async () => {
    expect(
      await check(
        {
          'reviews/ARTIFACTS-round1.md':
            '# A\n\n<!-- records: historical-file -->\n\nSee `src/thing.ts:1`.\n',
          'src/thing.ts': 'a\nb\n',
        },
        { docs: ['reviews/ARTIFACTS-round1.md'] },
      ),
    ).toEqual([]);
    const bad = await check(
      {
        'reviews/ARTIFACTS-round1.md':
          '# A\n\n<!-- records: historical-file -->\n\nSee `src/thing.ts:9`.\n',
        'src/thing.ts': 'a\nb\n',
      },
      { docs: ['reviews/ARTIFACTS-round1.md'] },
    );
    expect(bad[0]).toContain('is past the end');
  });

  it('honours a transcript-literal marker before a fence that really printed a label', async () => {
    expect(
      await check({
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

  it('applies a historical-file marker wherever it sits, even past a second h1', async () => {
    expect(
      await check(
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

  it('does not honour a marker printed inside a fenced block', async () => {
    // The census transcript in this round's own artifact prints the marker's
    // text as part of a `sed`/`node` command. Read as a marker, it froze three
    // quarters of the document that carried every proof in the round
    // (REVIEW-round4-stage2 F1).
    const bad = await check(
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

  it('still honours a marker written as a marker', async () => {
    expect(
      await check(
        { 'reviews/A.md': '# A\n\n<!-- records: historical-file -->\n\n1547 passed.\n' },
        { figures },
      ),
    ).toEqual([]);
  });
});

describe('a directive counts only where a reader sees prose', () => {
  const T = '```';
  const M = '<!-- records: historical-file -->';
  const L = '<!-- transcript-literal -->';
  const stale = 'A live figure: 1547 passed.\n';

  // Every spelling of "this is code" that six people found by reading a regex,
  // in one table. The scanner that tried to enumerate them was wrong six times
  // and twice made the gate weaker than before; `parseDoc` asks prettier's
  // markdown parser instead, and this table is what says so.
  const marker = {
    'a single-backtick span': `# A\n\nProse quoting \`${M}\` inline.\n\n${stale}`,
    'a double-backtick span': `# A\n\nProse quoting \`\` ${M} \`\` inline.\n\n${stale}`,
    'a backtick fence': `# A\n\n${T}console\n$ cat m\n${M}\n${T}\n\n${stale}`,
    'a tilde fence': `# A\n\n~~~console\n$ cat m\n${M}\n~~~\n\n${stale}`,
    'an indented block': `# A\n\n    ${M}\n\n${stale}`,
    'a blockquoted fence': `# A\n\n> ${T}\n> ${M}\n> ${T}\n\n${stale}`,
    'a fence, after a tilde output line': `# A\n\n${T}console\n$ cat m\n~~~\n${M}\n${T}\n\n${stale}`,
    'a longer fence, after a shorter delimiter': `# A\n\n\`\`\`\`console\n$ cat m\n${T}\n${M}\n\`\`\`\`\n\n${stale}`,
  };
  for (const [where, body] of Object.entries(marker)) {
    it(`does not honour a records marker written in ${where}`, async () => {
      const bad = await check({ 'reviews/A.md': body }, { figures: FIGURES });
      expect(bad).toHaveLength(1);
      expect(bad[0]).toContain('states 1547');
    });
  }

  const label = {
    'a plain fence': `# A\n\n${T}console\n$ ls\nFAKE_EXIT=0\n${T}\n`,
    'a fence after a tilde output line': `# A\n\n${T}console\n$ ls\n~~~\nFAKE_EXIT=0\n${T}\n`,
    'a fence after one with a two-word info string': `# A\n\n${T}console foo\n$ ls\n${T}\n\n${T}console\n$ ls\nFAKE_EXIT=0\n${T}\n`,
    'a command carrying an apostrophe in a comment': `# A\n\n${T}console\n$ ls   # the app's output\nFAKE_EXIT=0\n${T}\n`,
    'a fence under the escape marker named in prose': `# A\n\nThe \`${L}\` marker is named here.\n\n${T}console\n$ ls\nFAKE_EXIT=0\n${T}\n`,
    'a fence under the escape marker written in an indented block': `# A\n\n    ${L}\n\n${T}console\n$ ls\nFAKE_EXIT=0\n${T}\n`,
  };
  for (const [where, body] of Object.entries(label)) {
    it(`refuses a fabricated exit label in ${where}`, async () => {
      const bad = await check({ 'reviews/A.md': body });
      expect(bad).toHaveLength(1);
      expect(bad[0]).toContain('cannot print it');
    });
  }

  const binding = {
    'inside a fence': `# A\n\nAt \`foo.ts:1\`.\n\n${T}console\n$ echo hi\n<!-- cite: foo.ts:1 "const x = 1;" -->\n${T}\n`,
    'quoted in prose':
      '# A\n\nAt `foo.ts:1`.\n\nQuoted: `<!-- cite: foo.ts:1 "const x = 1;" -->`.\n',
  };
  for (const [where, body] of Object.entries(binding)) {
    it(`does not accept a citation pinned by a binding written ${where}`, async () => {
      const bad = await check(
        { 'reviews/ARTIFACTS-x.md': body, 'foo.ts': 'const x = 1;\n' },
        {
          docs: ['reviews/ARTIFACTS-x.md'],
          tracked: new Set(['reviews/ARTIFACTS-x.md', 'foo.ts']),
        },
      );
      expect(bad).toHaveLength(1);
      expect(bad[0]).toContain('is not pinned to content');
    });
  }

  it('does not honour a marker in an inline-code span that wraps across lines', async () => {
    // CommonMark lets a code span carry a line break: the marker below is
    // quoted inside one that opens on its own line and closes on the next,
    // and a quoted marker is prose about a directive, not a directive.
    const bad = await check(
      {
        'reviews/A.md':
          '# A\n\nQuoting `x <!-- records: historical-file -->\ny` across lines.\n\n1547 passed.\n',
      },
      { figures: FIGURES },
    );
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('states 1547');
  });

  it('does not read a citation printed inside a transcript as a citation', async () => {
    // A published error message or grep output routinely names a file and line
    // that is not a claim about the tree - it is what the command printed. Rule
    // 2 must skip it, and nothing pinned that until it was mutated away and the
    // suite stayed green (REVIEW-round4-stage5 F4).
    expect(
      await check(
        {
          'reviews/ARTIFACTS-x.md': `# A\n\n${T}console\n$ npm test\nError at \`foo.ts:999\`\n${T}\n`,
          'foo.ts': 'const x = 1;\n',
        },
        {
          docs: ['reviews/ARTIFACTS-x.md'],
          tracked: new Set(['reviews/ARTIFACTS-x.md', 'foo.ts']),
        },
      ),
    ).toEqual([]);
  });

  it('still checks a citation on an indented line', async () => {
    // Indentation makes a line code for *directives*; it must not exempt the
    // line from the rules themselves (REVIEW-round4-stage4 F7).
    const bad = await check(
      {
        'reviews/ARTIFACTS-x.md': '# A\n\n-   a list item\n\n    The code is at `foo.ts:99`.\n',
        'foo.ts': 'const x = 1;\n',
      },
      { docs: ['reviews/ARTIFACTS-x.md'], tracked: new Set(['reviews/ARTIFACTS-x.md', 'foo.ts']) },
    );
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('is past the end');
  });

  it('still honours a marker written as a marker', async () => {
    expect(
      await check({ 'reviews/A.md': `# A\n\n${M}\n\n${stale}` }, { figures: FIGURES }),
    ).toEqual([]);
  });
});

describe('rule 3 reads a command line the way a shell would', () => {
  function fence(command, label) {
    return ['# A', '', '```console', `$ ${command}`, label, '```', ''].join('\n');
  }

  it('does not let an apostrophe in a comment turn the rule off', async () => {
    // An unpaired apostrophe used to read as an open quote, so every remaining
    // line of the fence became command text and no output was ever checked
    // (REVIEW-round4-stage2 F3).
    const bad = await check({
      'reviews/A.md': fence("ls   # the app's own output", 'FAKE_EXIT=0'),
    });
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('cannot print it');
  });

  it('still treats a genuinely open quote as a continuation', async () => {
    expect(
      await check({
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

describe('a transcript is read through its container (K9)', () => {
  const T = '```';

  it('refuses a fabricated exit label in a blockquoted transcript (stage-6 F8)', async () => {
    // The block renders as a console transcript and was walked, but `> $` and
    // `> LINT_EXIT=` matched neither the prompt nor the label regex, so the
    // whole fabrication checked as nothing.
    const bad = await check({
      'reviews/A.md': [
        '# A',
        '',
        `> ${T}console`,
        '> $ npm run lint',
        '> LINT_EXIT=0',
        `> ${T}`,
        '',
      ].join('\n'),
    });
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('cannot print it');
  });

  it('accepts an honest blockquoted transcript', async () => {
    expect(
      await check({
        'reviews/A.md': [
          '# A',
          '',
          `> ${T}console`,
          '> $ npm run lint > out.txt 2>&1; echo "LINT_EXIT=$?"',
          '> LINT_EXIT=1',
          `> ${T}`,
          '',
        ].join('\n'),
      }),
    ).toEqual([]);
  });

  it('refuses a fabricated exit label behind a case-spelled Console fence (stage-6 F9)', async () => {
    const bad = await check({
      'reviews/A.md': ['# A', '', `${T}Console`, '$ ls', 'FAKE_EXIT=0', T, ''].join('\n'),
    });
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('cannot print it');
  });

  it('exempts a case-spelled Console transcript from rule 4 like any other transcript', async () => {
    // The same predicate answers both rules, so a fence rule 3 walks as a
    // transcript is also the transcript rule 4 leaves alone.
    expect(
      await check({
        'reviews/A.md': [
          '# A',
          '',
          `${T}Console`,
          '$ npm test',
          '      Tests  1547 passed (1547)',
          T,
          '',
        ].join('\n'),
      }),
    ).toEqual([]);
  });

  it('exempts only the next fence after a transcript-literal marker (stage-6 F10)', async () => {
    // One marker, two fences with only blanks between: the second is unmarked
    // to any reader of the source and must not inherit the escape.
    const bad = await check({
      'reviews/A.md': [
        '# A',
        '',
        '<!-- transcript-literal -->',
        '',
        `${T}console`,
        '$ cat .env.example',
        'API_BASE=https://example.test',
        T,
        '',
        `${T}console`,
        '$ ls',
        'FAKE_EXIT=0',
        T,
        '',
      ].join('\n'),
    });
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('FAKE_EXIT');
  });

  it('accepts an honest transcript indented in a list item (stage-6 F12)', async () => {
    // The false positive that bit the closing reviewer: the indented `$` was
    // invisible, so three honest labels were refused as printed by no command.
    expect(
      await check({
        'reviews/A.md': [
          '# A',
          '',
          '- the run, recorded in a list:',
          '',
          `  ${T}console`,
          '  $ npm run lint > o.txt 2>&1; echo "LINT_EXIT=$?"',
          '  LINT_EXIT=0',
          `  ${T}`,
          '',
        ].join('\n'),
      }),
    ).toEqual([]);
  });

  it('still refuses a fabricated label in a list-indented transcript', async () => {
    const bad = await check({
      'reviews/A.md': [
        '# A',
        '',
        '- the run, recorded in a list:',
        '',
        `  ${T}console`,
        '  $ npm run lint',
        '  LINT_EXIT=0',
        `  ${T}`,
        '',
      ].join('\n'),
    });
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('cannot print it');
  });

  it('sees a coverage quadruple containing a bare 100 (stage-6 F12)', async () => {
    // Requiring four dotted components made any quadruple with a fully covered
    // component invisible - including the checker's own per-file coverage.
    const bad = await check({
      'reviews/A.md': '# A\n\nThe checker is covered at 94.11 / 87.89 / 100 / 95.33.\n',
    });
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('coverage quadruple');
  });
});

describe('rule 4: the gate table is the one home a volatile figure has', () => {
  const marked = (commit) =>
    [
      '# A',
      '',
      `<!-- gate-table: ${commit} -->`,
      '',
      '| #   | gate       | result                        |',
      '| --- | ---------- | ----------------------------- |',
      '| 3   | unit tests | 1547 passed                   |',
      '| 4   | coverage   | 96.11 / 93.23 / 93.28 / 97.97 |',
      '',
    ].join('\n');

  it('allows volatile figures inside a marked gate table', async () => {
    expect(await check({ 'reviews/A.md': marked('abc1234') })).toEqual([]);
  });

  it('still refuses the same figures in prose next to the table', async () => {
    const bad = await check({
      'reviews/A.md': marked('abc1234') + '\nThe table above shows 1547 passed.\n',
    });
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('states 1547 in prose');
  });

  it('refuses a gate-table marker that names no commit', async () => {
    const bad = await check({
      'reviews/A.md': marked('abc1234').replace('gate-table: abc1234', 'gate-table: the tip'),
    });
    expect(bad.join(' ')).toContain('must name the commit measured');
  });

  it('refuses a marker naming a commit the repository does not have', async () => {
    const bad = await check({ 'reviews/A.md': marked('abc1234') }, { commitExists: () => false });
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('not a commit in this repository');
  });

  it('refuses a marker with no table under it', async () => {
    const bad = await check({
      'reviews/A.md': '# A\n\n<!-- gate-table: abc1234 -->\n\nProse, not a table.\n',
    });
    expect(bad.join(' ')).toContain('directly above the table');
  });

  it('refuses a gate table edited without re-naming its tree', async () => {
    // The "table false at the tree it names" defect (stage-3 F1, stage-6 F1):
    // the figures moved, the marker did not, so the table claims a measurement
    // the named commit never produced.
    const bad = await check(
      { 'reviews/A.md': marked('abc1234') },
      { previousOf: () => marked('abc1234').replace('1547 passed', '1533 passed') },
    );
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('re-names the tree it measured');
  });

  it('accepts a re-measured table once the marker moves with it', async () => {
    expect(
      await check(
        { 'reviews/A.md': marked('def5678') },
        { previousOf: () => marked('abc1234').replace('1547 passed', '1533 passed') },
      ),
    ).toEqual([]);
  });

  it('accepts an unchanged table while the document around it changes', async () => {
    expect(
      await check(
        { 'reviews/A.md': marked('abc1234') + '\nNew prose after the table.\n' },
        { previousOf: () => marked('abc1234') },
      ),
    ).toEqual([]);
  });

  it('leaves a gate table inside a historical section to its own round', async () => {
    // A closed round's table was true at its commits; the marker checks bind
    // only where rule 4 itself binds.
    expect(
      await check(
        {
          'reviews/A.md':
            '# A\n\n<!-- records: historical -->\n\n' + marked('abc1234').replace('# A\n\n', ''),
        },
        { commitExists: () => false },
      ),
    ).toEqual([]);
  });
});

describe('the moved-table check against a real repository (round5-stage1 F1)', () => {
  // These fixtures run the checker's *default* repository callbacks against a
  // real throwaway git repo. Every other gate-table test injects `previousOf`,
  // which is how the shipped walk went untested while the record described a
  // stronger one: the round-5 stage-1 review measured a moved table going
  // permanently green one covering commit after it landed, and a `git mv` plus
  // edit going green everywhere. The walk now follows the file's history.
  const gitq = (...args) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
      cwd: root,
      stdio: 'ignore',
    });
  const table = (commit, figure) =>
    [
      '# A',
      '',
      `<!-- gate-table: ${commit} -->`,
      '',
      '| #   | gate       | result       |',
      '| --- | ---------- | ------------ |',
      `| 3   | unit tests | ${figure} passed |`,
      '',
    ].join('\n');

  /** A repo whose one doc is a marked gate table naming a real commit. */
  function seedRepo() {
    gitq('init', '-q');
    writeFileSync(join(root, 'seed.txt'), 'seed\n');
    gitq('add', '.');
    gitq('commit', '-qm', 'seed');
    const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
    writeFileSync(join(root, 'reviews', 'A.md'), table(commit, 1547));
    gitq('add', '.');
    gitq('commit', '-qm', 'table');
    return commit;
  }
  const run = (doc) => checkRecords({ root, docs: [doc] });

  it('still refuses a moved table one covering commit after it lands', async () => {
    const commit = seedRepo();
    writeFileSync(join(root, 'reviews', 'A.md'), table(commit, 1533));
    gitq('commit', '-qam', 'edit the table without moving the marker');
    writeFileSync(join(root, 'other.txt'), 'x\n');
    gitq('add', '.');
    gitq('commit', '-qm', 'a covering commit');
    const bad = await run('reviews/A.md');
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('re-names the tree it measured');
  });

  it('follows a committed rename to the history the old path carries', async () => {
    const commit = seedRepo();
    gitq('mv', 'reviews/A.md', 'reviews/B.md');
    writeFileSync(join(root, 'reviews', 'B.md'), table(commit, 1200));
    gitq('commit', '-qam', 'rename and edit in one step');
    const bad = await run('reviews/B.md');
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('re-names the tree it measured');
  });

  it('sees a staged rename before it is committed', async () => {
    const commit = seedRepo();
    gitq('mv', 'reviews/A.md', 'reviews/B.md');
    writeFileSync(join(root, 'reviews', 'B.md'), table(commit, 1200));
    const bad = await run('reviews/B.md');
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('re-names the tree it measured');
  });

  it('does not refuse a clean history whose table never moved', async () => {
    seedRepo();
    appendFileSync(join(root, 'reviews', 'A.md'), '\nProse under the table, committed.\n');
    gitq('commit', '-qam', 'prose only');
    appendFileSync(join(root, 'reviews', 'A.md'), '\nMore prose, uncommitted.\n');
    expect(await run('reviews/A.md')).toEqual([]);
  });

  it('asks the real repository whether the named commit exists', async () => {
    seedRepo();
    writeFileSync(join(root, 'reviews', 'A.md'), table('deadbee', 1547));
    const bad = await run('reviews/A.md');
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('not a commit in this repository');
  });
});

describe('the gate as a whole', () => {
  it('reports every rule at once rather than stopping at the first', async () => {
    const bad = await check(
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
