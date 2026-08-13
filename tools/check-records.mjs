#!/usr/bin/env node
/**
 * The records gate.
 *
 * Rounds 1-3 shipped code that survived adversarial review and records that did
 * not: round 3 logged 31 regressions in its own output and every one of them was
 * a record, not a defect in `src/`. Four shapes recurred, and this file refuses
 * all four mechanically so that no later round has to notice them by reading:
 *
 *   1. anchors    - a ledger link died when the heading it pointed at was renamed
 *                   (R3-12), and the round's opening P1 pointed at nothing.
 *   2. citations  - `awk 'NR==42' pages.yml` printed line 53 because a patch
 *                   earlier in the same round pushed the file down eleven lines
 *                   (R3-20). A citation is a claim about content, so it has to
 *                   be pinned to content.
 *   3. transcripts- exit labels were published as the output of scripts that
 *                   cannot print them (R3-15, R3-27): two commands presented as
 *                   one execution.
 *   4. figures    - one rate was "corrected everywhere" four times and was wrong
 *                   each time (R3-1, R3-11, R3-18, R3-24).
 *
 * Scope, stated because a checker's blind spots matter more than its rules:
 *
 * - Rules 1 and 3 run over every records document, including a reviewer's.
 * - Rule 2 resolves and bounds-checks citations everywhere, and additionally
 *   demands a content binding in the ledger and the artifact files - every
 *   citation in them, unconditionally. It used to ask git which files the branch
 *   had changed and pin only those; that set empties on merge, which turned the
 *   rule off silently (REVIEW-round4-stage1 F5).
 * - Rule 4 runs over records that are not marked historical. A closed round's
 *   figures were true at its commits, and this round does not rewrite them;
 *   marking them is the explicit escape rather than a silent exemption.
 * - Verbatim run transcripts (```console fences) are exempt from rule 4. A
 *   transcript records what a run printed. Editing one to agree with a current
 *   figure would be falsifying the evidence, which is the opposite of the point.
 *
 * Markers, all of them HTML comments so they render as nothing:
 *
 *   <!-- records: historical-file -->            whole file exempt from rule 4
 *   <!-- records: historical -->                 exempt from here to the next h1
 *   <!-- cite: <path>:<range> "<fragment>" -->   binds a citation to content
 *   <!-- cite-historical: <path>:<range> -->     citation is a record of where
 *                                                something was, not where it is
 *   <!-- figure-historical -->                   this line states a superseded
 *                                                figure on purpose
 *   <!-- transcript-literal -->                  the next fence really did print
 *                                                a NAME= line
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The round's figures. Changing one of these is a deliberate act: the gate then
 * refuses every document that still states the old value, which is the whole
 * mechanism round 3 lacked when it corrected one rate four times.
 */
export const FIGURES = {
  // The count at the round's tip, not at its baseline. `reviews/BASELINE-round4.md`
  // states the baseline's 1551 on purpose and marks those two lines as such.
  unitTests: 1599,
  coverage: [96.1, 93.07, 93.44, 97.9],
  m2: { failures: 33, executions: 600, rate: 5.5 },
};

/**
 * How far a stated coverage figure may sit from the pinned one before the gate
 * refuses it.
 *
 * Not a fudge factor: the branch percentage genuinely is not deterministic here.
 * Measured over twelve consecutive `npm run test:coverage` runs at one commit,
 * eleven printed 92.83% and one printed 92.87% - one branch out of 2695, which
 * is 0.037 points (REVIEW-round4-stage2 F9). Pinning to two decimals would
 * therefore refuse a record stating a figure its author had just measured, about
 * one time in twelve, and tell them their true number was wrong. This tolerance
 * absorbs that jitter and still refuses the round-3 baseline quadruple, whose
 * nearest component differs by 0.10.
 */
const COVERAGE_TOLERANCE = 0.05;

/** Documents whose citations must be pinned to content, not only resolved. */
const BINDING_DOCS = /^(PROD-READINESS\.md|reviews\/ARTIFACTS.*\.md)$/;

// A leading dot is allowed: `.github/workflows/pages.yml:37` is a citation, and
// leaving it out of this pattern is how three stale ones survived three rounds.
const CITATION =
  /`([A-Za-z0-9_.][A-Za-z0-9_./-]*\.(?:ts|tsx|scss|html|yml|yaml|json|mjs|js|swift|md))(:\d+(?:-\d+)?)`/g;
// Every markdown link target, with or without an `#anchor`. Requiring the `#`
// meant a link to a file that does not exist was never looked at, and one such
// link was live in the records (REVIEW-round4-stage1 F12).
const LINK = /\]\(([^)\s]+)\)/g;
const EXIT_LABEL = /^\s*([A-Z][A-Z0-9_]*)=/;

/** GitHub's heading slug: lowercase, drop punctuation, spaces to hyphens. */
export function slug(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\- ]+/g, '')
    .replace(/ +/g, '-');
}

/** Every heading anchor a markdown file offers, duplicates suffixed as GitHub does. */
export function anchorsOf(markdown) {
  const seen = new Map();
  const anchors = new Set();
  for (const { text, fenced } of lines(markdown)) {
    if (fenced) continue;
    const m = /^#{1,6} +(.*)$/.exec(text);
    if (!m) continue;
    const base = slug(m[1]);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    anchors.add(n === 0 ? base : `${base}-${n}`);
  }
  return anchors;
}

/**
 * Walk a document once, tagging each line with the fence it sits in. Every rule
 * needs this and none of them may disagree about where a code block starts.
 */
function lines(markdown) {
  let fence = null;
  return markdown.split('\n').map((text, i) => {
    const open = /^\s*```+ *([A-Za-z0-9_-]*)/.exec(text);
    if (open && fence === null) {
      fence = open[1] || 'plain';
      return { text, no: i + 1, fenced: true, info: fence, isFenceMarker: true };
    }
    if (open && fence !== null) {
      const info = fence;
      fence = null;
      return { text, no: i + 1, fenced: true, info, isFenceMarker: true };
    }
    return { text, no: i + 1, fenced: fence !== null, info: fence, isFenceMarker: false };
  });
}

/**
 * Two different exemptions, because they answer two different questions.
 *
 * `historical-file` says the whole document is frozen: a closed round's artifact
 * or a reviewer's report, whose figures and transcripts were true when it was
 * written and which this round does not rewrite. It lifts rules 2-binding, 3
 * and 4.
 *
 * `historical` says this *section* states a closed round's figures. It lifts
 * rules 3 and 4 only. The ledger is one document that is read continuously, so
 * its citations must point at real content today no matter which round's section
 * they sit in.
 */
function exemptions(doc) {
  let wholeFile = false;
  const marked = new Set();
  let active = false;
  for (const { text, no, fenced } of lines(doc)) {
    const live = markersIn(text, fenced);
    if (!fenced && /^# /.test(text)) active = false;
    if (live.includes('historical-file')) wholeFile = true;
    if (live.includes('historical')) active = true;
    if (active) marked.add(no);
  }
  return {
    frozen: wholeFile,
    stale: (no) => wholeFile || marked.has(no),
  };
}

/**
 * The `records:` markers a line actually applies, ignoring any it merely talks
 * about.
 *
 * A directive counts only where a directive can be written. Two places it cannot
 * be: inside an inline-code span (documentation naming the marker, a review
 * quoting it) and inside a fenced block (a transcript of a command whose text
 * contains it). Honouring the first froze the document carrying this round's
 * evidence (REVIEW-round4-stage1 F1); the fix for that was written against
 * inline code alone, so a strip regex printed inside a `console` fence froze
 * three quarters of the same document one commit later (REVIEW-round4-stage2
 * F1). This is the rule stated as a class rather than patched per instance.
 */
function markersIn(text, fenced) {
  if (fenced) return [];
  return [...applied(text).matchAll(/<!-- records: (historical-file|historical)\b/g)].map(
    (m) => m[1],
  );
}

/** The part of a line that can carry a directive: everything outside inline code. */
function applied(text) {
  return text.replace(/`[^`]*`/g, '');
}

function readDoc(root, rel) {
  return readFileSync(join(root, rel), 'utf8');
}

/** Records documents: the ledger, the checklist, and everything under reviews/. */
export function recordsDocs(root) {
  const docs = ['PROD-READINESS.md', 'LAUNCH-CHECKLIST.md'].filter((d) =>
    existsSync(join(root, d)),
  );
  const reviewsDir = join(root, 'reviews');
  if (existsSync(reviewsDir) && statSync(reviewsDir).isDirectory()) {
    for (const f of readdirSync(reviewsDir).sort()) {
      if (f.endsWith('.md')) docs.push(`reviews/${f}`);
    }
  }
  return docs;
}

/**
 * Rule 2 used to demand a binding only for files `git diff main...HEAD` reported
 * as changed, on the reasoning that only those can have moved. That set is empty
 * the moment the branch is merged, and absent entirely in a checkout with no
 * `main` ref, so the rule would have reported success while checking nothing —
 * the exact "a checker that stops matching does not fail, it passes forever"
 * failure this file's header names (REVIEW-round4-stage1 F5). There is no git
 * here any more: every citation in the ledger and the artifacts is pinned, or
 * marked historical, unconditionally.
 */

// --- rule 1: every anchor a record links to is a heading that exists ---------

function checkAnchors(root, docs) {
  const bad = [];
  const anchorCache = new Map();
  const anchorsFor = (rel) => {
    if (!anchorCache.has(rel)) {
      anchorCache.set(rel, existsSync(join(root, rel)) ? anchorsOf(readDoc(root, rel)) : null);
    }
    return anchorCache.get(rel);
  };
  for (const doc of docs) {
    const dir = dirname(doc);
    for (const { text, no, fenced } of lines(readDoc(root, doc))) {
      if (fenced) continue;
      for (const m of text.matchAll(LINK)) {
        const [file, anchor] = m[1].split('#');
        if (/^[a-z]+:/.test(m[1])) continue; // external URL
        const target = file === '' ? doc : join(dir, file).replace(/\\/g, '/');
        if (!target.endsWith('.md')) continue;
        const anchors = anchorsFor(target);
        if (anchors === null) {
          bad.push(`${doc}:${no}: link target does not exist: ${target}`);
        } else if (anchor !== undefined && !anchors.has(anchor)) {
          bad.push(`${doc}:${no}: no heading in ${target} slugs to #${anchor}`);
        }
      }
    }
  }
  return bad;
}

// --- rule 2: a citation resolves, is in bounds, and is pinned if it can move --

/** Roots whose contents are generated or vendored: cited, but never tracked. */
const UNTRACKED_ROOTS =
  /^(dist|node_modules|coverage|site|playwright-report|test-results|\.angular)\//;

function resolvePath(root, tracked, cited) {
  if (tracked.has(cited)) return cited;
  const matches = [...tracked].filter((p) => p === cited || p.endsWith(`/${cited}`));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) return null;
  // A bare basename that matches nothing tracked is a citation into something
  // outside the repository's source — a built worker, a `.d.ts` under
  // node_modules. There is nothing here to resolve it against, and guessing
  // would report a defect that is not one.
  return !cited.includes('/') ? 'external' : null;
}

function checkCitations(root, docs, tracked) {
  const bad = [];
  const fileLines = new Map();
  const linesOf = (rel) => {
    if (!fileLines.has(rel)) {
      const content = readFileSync(join(root, rel), 'utf8').split('\n');
      // A trailing newline ends the last line; it does not begin another one.
      if (content.at(-1) === '') content.pop();
      fileLines.set(rel, content);
    }
    return fileLines.get(rel);
  };
  for (const doc of docs) {
    const body = readDoc(root, doc);
    const bindings = new Map();
    const historical = new Set();
    // The fragment is double-quoted and may contain escaped quotes, because the
    // content worth pinning is often JSON.
    for (const m of body.matchAll(/<!-- cite: (\S+):(\d+(?:-\d+)?) "((?:[^"\\]|\\.)*)" -->/g)) {
      bindings.set(`${m[1]}:${m[2]}`, m[3].replace(/\\(.)/g, '$1'));
    }
    for (const m of body.matchAll(/<!-- cite-historical: ([^\s]+):(\d+(?:-\d+)?)/g)) {
      historical.add(`${m[1]}:${m[2]}`);
    }
    const needsBinding = BINDING_DOCS.test(doc) && !exemptions(body).frozen;
    for (const { text, no, fenced } of lines(body)) {
      if (fenced) continue;
      for (const m of text.matchAll(CITATION)) {
        const cited = m[1];
        const range = m[2].slice(1);
        const key = `${cited}:${range}`;
        if (historical.has(key)) continue;
        if (UNTRACKED_ROOTS.test(cited)) continue;
        const [start, end] = range.split('-').map(Number);
        const hi = end ?? start;
        const rel = resolvePath(root, tracked, cited);
        if (rel === 'external') continue;
        if (!rel) {
          bad.push(`${doc}:${no}: citation \`${key}\` names no tracked file (or names several)`);
          continue;
        }
        const content = linesOf(rel);
        if (hi > content.length) {
          bad.push(`${doc}:${no}: \`${key}\` is past the end of ${rel} (${content.length} lines)`);
          continue;
        }
        if (!needsBinding) continue;
        const fragment = bindings.get(key);
        if (fragment === undefined) {
          bad.push(
            `${doc}:${no}: \`${key}\` is not pinned to content: add ` +
              `<!-- cite: ${cited}:${range} "<fragment>" --> or a cite-historical marker`,
          );
          continue;
        }
        const cited_text = content.slice(start - 1, hi).join('\n');
        if (!cited_text.includes(fragment)) {
          bad.push(`${doc}:${no}: ${rel}:${range} no longer contains ${JSON.stringify(fragment)}`);
        }
      }
    }
  }
  return bad;
}

// --- rule 3: a transcript is one execution -----------------------------------

/**
 * Whether a shell command continues onto the next line: a trailing backslash, or
 * an unclosed double quote. The quote half matters because the ordinary way to
 * write a multi-line command in these records is `python3 -c "` with no
 * backslash anywhere, and reading its remaining lines as *output* made every
 * echo on them invisible to this rule (REVIEW-round4-stage1 F6).
 */
function continues(commandText) {
  if (/\\$/.test(commandText.trim())) return true;
  // A real scan rather than counting quotes, so an apostrophe inside a
  // double-quoted argument (`echo "I'm done"`) does not read as an open quote -
  // and so an apostrophe in a trailing `# comment` does not either. The second
  // case is the more common one and the more damaging: read as an open quote, it
  // swallows the rest of the fence as command text and no output line in it is
  // ever checked again (REVIEW-round4-stage2 F3).
  let single = false;
  let double = false;
  for (let i = 0; i < commandText.length; i++) {
    const c = commandText[i];
    if (c === '\\' && !single) {
      i++;
      continue;
    }
    if (c === "'" && !double) single = !single;
    else if (c === '"' && !single) double = !double;
    else if (c === '#' && !single && !double && (i === 0 || /\s/.test(commandText[i - 1]))) break;
  }
  return single || double;
}

/**
 * Record every `NAME=` an `echo` in this command line can produce. Only what
 * follows an `echo` counts: `E2E_SERVER=dist cmd; echo "X_EXIT=$?"` produces
 * `X_EXIT=`, not `E2E_SERVER=`, and treating the environment prefix as printable
 * is how a composed transcript would slip through.
 */
function noteEchoes(commandText, into) {
  // `console.log` counts as well as `echo`: a `node -e` one-liner that prints
  // `FILE_COUNT=75` is a command that really does produce the label, and
  // refusing it would push honest transcripts onto the escape hatch.
  for (const segment of commandText.split(/\becho\b|console\.log/).slice(1)) {
    const upTo = segment.split(/[;|]|&&/)[0];
    for (const m of upTo.matchAll(/([A-Z][A-Z0-9_]*)=/g)) into.add(m[1]);
  }
}

function checkTranscripts(root, docs) {
  const bad = [];
  for (const doc of docs) {
    const body = readDoc(root, doc);
    const { stale } = exemptions(body);
    const all = lines(body);
    let inConsole = false;
    let command = null;
    let exempt = false;
    let previous = '';
    // Every echo the fence shows, whichever command line it sits on. The label
    // has to be traceable to an echo the reader can see; requiring it on the
    // owning line alone would refuse the honest two-step form, where the labels
    // are echoed into a file by the commands above and the file is then printed.
    let echoed = new Set();
    for (const line of all) {
      const { text, no, info, isFenceMarker } = line;
      if (stale(no)) continue;
      if (isFenceMarker) {
        if (!inConsole && info === 'console') {
          inConsole = true;
          exempt = previous.includes('<!-- transcript-literal -->');
          command = null;
          echoed = new Set();
        } else if (inConsole) {
          inConsole = false;
        }
        continue;
      }
      if (!inConsole) {
        if (text.trim() !== '') previous = text;
        continue;
      }
      if (/^\$ /.test(text)) {
        command = { text: text.slice(2), line: no, open: continues(text) };
        noteEchoes(command.text, echoed);
        continue;
      }
      if (command?.open) {
        command.text += `\n${text}`;
        command.open = continues(command.text);
        noteEchoes(text, echoed);
        continue;
      }
      const label = EXIT_LABEL.exec(text);
      if (!label || exempt) continue;
      const name = label[1];
      const printed = echoed.has(name);
      if (!printed) {
        bad.push(
          `${doc}:${no}: a \`\`\`console block prints \`${name}=\` as output of ` +
            (command
              ? `\`${command.text.split('\n')[0].trim()}\` (line ${command.line})`
              : 'no command') +
            `, which cannot print it: an exit label belongs to the echo that prints it, on the same command line`,
        );
      }
    }
  }
  return bad;
}

// --- rule 4: one value per figure, everywhere the round states it ------------

function checkFigures(root, docs, figures) {
  const bad = [];
  const [cs, cb, cf, cl] = figures.coverage;
  const sweeps = [
    {
      name: 'unit-test count',
      // Four digits and up: the E2E suite's own `111 passed` is a different
      // figure and is not this sweep's business.
      re: /\b(\d{4,5}) (?:unit )?(?:tests?|passed)\b/g,
      ok: (m) => Number(m[1]) === figures.unitTests,
      say: (m) => `states ${m[1]} where the round's unit-test count is ${figures.unitTests}`,
    },
    {
      name: 'coverage quadruple',
      re: /\b(\d{2}\.\d{1,2}) ?\/ ?(\d{2}\.\d{1,2}) ?\/ ?(\d{2}\.\d{1,2}) ?\/ ?(\d{2}\.\d{1,2})\b/g,
      ok: (m) =>
        [cs, cb, cf, cl].every(
          (want, i) => Math.abs(Number(m[i + 1]) - want) <= COVERAGE_TOLERANCE,
        ),
      say: (m) =>
        `states ${m[1]} / ${m[2]} / ${m[3]} / ${m[4]} where the round's coverage is ` +
        `${cs} / ${cb} / ${cf} / ${cl}`,
    },
    {
      name: 'pooled M2 failure count',
      re: new RegExp(
        `\\b(\\d+)\\s*(?:\\/|of|in|failures in)\\s*(?<![\\d.])${figures.m2.executions}\\b`,
        'g',
      ),
      ok: (m) => Number(m[1]) === figures.m2.failures,
      say: (m) =>
        `states ${m[1]} of ${figures.m2.executions} where the pooled M2 sample is ` +
        `${figures.m2.failures} of ${figures.m2.executions}`,
    },
    {
      name: 'pooled M2 rate',
      re: /\b(\d+(?:\.\d+)?)%/g,
      only: new RegExp(`(?<![\\d.])${figures.m2.executions}\\b`),
      ok: (m) => Number(m[1]) === figures.m2.rate,
      say: (m) =>
        `states ${m[1]}% on a line about the pooled M2 sample, whose rate is ${figures.m2.rate}%`,
    },
  ];
  for (const doc of docs) {
    const body = readDoc(root, doc);
    const { stale } = exemptions(body);
    const all = lines(body);
    all.forEach(({ text, no, fenced, info }, i) => {
      if (stale(no)) return;
      if (fenced && info === 'console') return;
      // The marked line and nothing else. Reaching to the *next* line as well
      // was undocumented and untested, and it had already turned rule 4 off on
      // the baseline's coverage row purely because of its neighbour
      // (REVIEW-round4-stage1 F4). A figure wrapped away from its marker now
      // has to carry its own.
      if (!fenced && applied(text).includes('<!-- figure-historical -->')) return;
      for (const sweep of sweeps) {
        if (sweep.only && !sweep.only.test(text)) continue;
        for (const m of text.matchAll(sweep.re)) {
          if (sweep.ok(m)) continue;
          bad.push(`${doc}:${no}: ${sweep.name} ${sweep.say(m)}`);
        }
      }
    });
  }
  return bad;
}

// --- driver ------------------------------------------------------------------

export function checkRecords({ root, docs, tracked, figures = FIGURES } = {}) {
  const documents = docs ?? recordsDocs(root);
  const files =
    tracked ??
    new Set(
      execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
        .trim()
        .split('\n')
        .filter(Boolean),
    );
  const failures = [];
  failures.push(
    ...checkAnchors(root, documents),
    ...checkCitations(root, documents, files),
    ...checkTranscripts(root, documents),
    ...checkFigures(root, documents, figures),
  );
  return failures;
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const failures = checkRecords({ root });
  if (failures.length === 0) {
    console.log(`records: ${recordsDocs(root).length} documents checked, no defects`);
    process.exit(0);
  }
  console.error(`records: ${failures.length} defect(s)`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
