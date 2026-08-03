import { COUNTING_SYSTEMS, countingSystemById } from '../../data/counting-systems';
import { DEVIATION_INDEX_SYSTEM_ID, deviationIndexNote } from './deviation.model';

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
