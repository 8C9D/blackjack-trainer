import { COUNTING_SYSTEMS, countingSystemById } from '../../data/counting-systems';
import {
  DEVIATION_INDEX_SYSTEM_ID,
  describeDeviationThreshold,
  deviationIndexNote,
  type DeviationDirection,
  type DeviationRule,
} from './deviation.model';

function rule(direction: DeviationDirection, index: number): DeviationRule {
  return {
    ruleSet: 'S17',
    category: 'hard',
    playerHand: '16',
    playerHandLabel: 'Hard 16',
    dealerUpcard: '10',
    index,
    direction,
    basicAction: 'H',
    deviationAction: 'S',
    source: 'spec fixture',
  };
}

describe('deviationIndexNote', () => {
  it('says nothing when the trainee counts the system the indices are written for', () => {
    expect(deviationIndexNote(countingSystemById(DEVIATION_INDEX_SYSTEM_ID))).toBeNull();
  });

  it('warns every other system, naming it', () => {
    const others = COUNTING_SYSTEMS.filter((s) => s.id !== DEVIATION_INDEX_SYSTEM_ID);
    // The registry ships a dozen-plus systems; every one of them is a mismatch.
    expect(others.length).toBeGreaterThan(0);
    for (const system of others) {
      const note = deviationIndexNote(system);
      expect(note, system.id).not.toBeNull();
      expect(note!).toContain('Hi-Lo');
      expect(note!).toContain(system.name);
    }
  });

  // The two mismatches are not the same mistake: a balanced system has a true
  // count that simply reads differently, an unbalanced one has none at all.
  it('tells a balanced system its true count reads differently', () => {
    const note = deviationIndexNote(countingSystemById('omega-ii'))!;
    expect(note).toContain('different true count');
    expect(note).not.toContain('unbalanced');
  });

  it('tells an unbalanced system it has no true count to compare', () => {
    const note = deviationIndexNote(countingSystemById('ko'))!;
    expect(note).toContain('unbalanced');
    expect(note).toContain('no true count');
  });
});

describe('describeDeviationThreshold', () => {
  it('describes an inclusive positive lower bound', () => {
    expect(describeDeviationThreshold(rule('at-or-above', 3))).toBe('at true count +3 or higher');
  });

  it('describes an inclusive negative upper bound', () => {
    expect(describeDeviationThreshold(rule('at-or-below', -1))).toBe('at true count -1 or lower');
  });

  it("keeps the chart's exclusive positive-zero wording unambiguous", () => {
    expect(describeDeviationThreshold(rule('positive', 0))).toBe('at any positive true count');
  });

  it("keeps the chart's exclusive negative-zero wording unambiguous", () => {
    expect(describeDeviationThreshold(rule('negative', 0))).toBe('at any negative true count');
  });
});
