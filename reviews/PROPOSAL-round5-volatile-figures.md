# Proposal for round 5: volatile figures live in one table, and the gate enforces it

Written by the stage-6 remediation pass against finding K8, for the round-5 brief. This is a design,
not a change: implementing it edits the gate's semantics, which under round 4's rules needs a fresh
review, and round 4 closed on its sixth. Nothing here is implemented.

## The problem, from the record

Rule 4 pins the current value of figures that move whenever a test lands - the unit-test count and
the coverage quadruple - and refuses any prose that states a different value. That mechanism ended
round 3's "corrected everywhere" defects, and then produced round 4's dominant regression class from
the other direction: every time the suite grew, the pinned value moved, the gate refused every prose
statement of the old value, and the author was dragged into editing historical measurements to
satisfy it - or into missing one, which a reviewer then found. Round 4 hit this six times across
stages 1 to 3 (K8's row lists them), twice more in the stage-4 and stage-5 cycles, and three more
times in stage 6: the closing table false at the tree it named (F1), a suite size wrong for a fifth
time (F3), and a per-file quadruple that reproduced at no commit (F5). Rule 4 cannot see inside
`console` fences, so transcripts quoting these figures also go stale silently while the gate stays
green.

The root cause is a category error the round only named at its end: **a measurement is a historical
fact about a named tree, but rule 4 treats every prose statement of it as a claim about the current
tree.** Where the two meanings collide, the gate drags the record instead of protecting it.

## The design

1. **One gate table per round, and it names its tree.** Each round's closing section carries exactly
   one table of gate measurements, opened by a machine-readable marker naming the commit measured,
   for example `<!-- gate-table: 6dbd932 -->` on the line above the table. The gate refuses a gate
   table with no such marker, and refuses a marker with no commit-ish in it. This mechanizes the rule
   round 4 learned by hand: a table of measurements has to name the tree it measured.

2. **Volatile figures may appear only there and in transcripts.** Rule 4's sweeps invert: outside the
   marked gate-table block and outside `console` fences, _any_ match of a volatile pattern - the
   unit-test count shape, the coverage-quadruple shape - is refused, including a value that happens
   to be correct today, because it will not stay correct. Prose that needs the number points at the
   table ("the gate table names the tree and the count") or at the artifact's transcript, exactly as
   round 4's records already do for the checker's own suite size. `figure-historical` keeps its
   meaning for closed rounds' sections.

3. **`FIGURES` shrinks to closed measurements.** The unit-test count and the coverage quadruple leave
   `FIGURES`: with no prose allowed to state them, there is no current value to chase, and the
   coverage tolerance goes with it. What stays pinned are figures that are historical by nature and
   have exactly one true value forever - the pooled M2 sample and its rate - where rule 4's original
   design is correct as built.

4. **The gate table itself is checked against its named tree, on demand.** The gate does not try to
   re-derive old measurements (that is K4's lesson: reconstructing evidence manufactures it). What it
   can check mechanically: the marker's commit exists in the repository, and the table changed in the
   same commit range that moved the marker - a table edited without re-naming its tree is refused.
   Re-measurement stays a human act, recorded by moving the marker.

## What this buys and what it costs

It removes the whole "drag the prose to the new value" class: adding a test then touches exactly two
places, the gate table (with its marker) and the transcript being quoted, and the gate refuses any
third place from existing. It costs a migration sweep - every stray volatile figure in live prose
must become a pointer at the table - and it makes rule 4 stricter in a way that will refuse some
honest sentences until they are rewritten as pointers. The migration is bounded: rule 4's current
sweeps already enumerate every live statement of these figures, so running the inverted rule once
lists the full work.

## Why this was not implemented in round 4

The change is small in code but not in meaning: it flips rule 4's contract from "prose must agree
with the pin" to "prose must not state the figure", and every regression in round 4's table says
gate-semantics changes need a fresh reviewer more than they need speed. Round 4's remediation
practiced the discipline by hand instead - its closing table names `6dbd932`, its prose points at the
table, and the suite size lives in one transcript - so round 5 inherits both the design and a
worked example of the target state.
