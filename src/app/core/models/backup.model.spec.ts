import { BACKUP_APP_ID, BACKUP_SCHEMA_VERSION, backupFileName, parseBackup } from './backup.model';

const valid = {
  app: BACKUP_APP_ID,
  schema: BACKUP_SCHEMA_VERSION,
  exportedAt: '2026-08-03T13:45:00.000Z',
  data: { 'blackjack-flow-prefs': '{"dailyGoal":20}' },
};

const text = (payload: unknown) => JSON.stringify(payload);

describe('backupFileName', () => {
  it('names the file for the day it was exported', () => {
    expect(backupFileName('2026-08-03T13:45:00.000Z')).toBe(
      'blackjack-trainer-backup-2026-08-03.json',
    );
  });
});

describe('parseBackup', () => {
  it('accepts a backup this build wrote', () => {
    const result = parseBackup(text(valid));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.backup.data['blackjack-flow-prefs']).toBe('{"dailyGoal":20}');
    expect(result.backup.exportedAt).toBe('2026-08-03T13:45:00.000Z');
  });

  it('tolerates a missing exportedAt, which is only cosmetic', () => {
    const result = parseBackup(text({ ...valid, exportedAt: undefined }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.backup.exportedAt).toBe('');
  });

  // A restore replaces the whole namespace, so anything unrecognisable is
  // refused outright rather than half-applied.
  it.each([
    ['not JSON at all', 'this is not json', 'not JSON'],
    ['a JSON array', text([1, 2, 3]), 'not a backup'],
    ['a JSON scalar', text(42), 'not a backup'],
    ['another app’s file', text({ ...valid, app: 'some-other-app' }), 'not written by this app'],
    ['a future schema', text({ ...valid, schema: 99 }), 'version 99'],
    ['a missing data map', text({ ...valid, data: undefined }), 'no data in it'],
  ])('rejects %s', (_label, payload, expected) => {
    const result = parseBackup(payload);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a rejection');
    expect(result.error).toContain(expected);
  });

  it('accepts an empty backup produced before any preference or practice data was stored', () => {
    const result = parseBackup(text({ ...valid, data: {} }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.backup.data).toEqual({});
  });

  // The file is user-supplied: it does not get to name the keys it writes.
  it('refuses a file carrying keys outside this app’s namespace', () => {
    const result = parseBackup(
      text({ ...valid, data: { ...valid.data, 'someone-elses-token': 'value' } }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a rejection');
    expect(result.error).toContain('this app did not write');
  });

  it('refuses a non-string value, which no store could have written', () => {
    const result = parseBackup(text({ ...valid, data: { 'blackjack-flow-prefs': { a: 1 } } }));
    expect(result.ok).toBe(false);
  });
});
