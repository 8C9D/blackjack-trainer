import { TestBed } from '@angular/core/testing';

import { BACKUP_APP_ID, BACKUP_SCHEMA_VERSION } from '../models/backup.model';
import { PAGE_RELOAD } from './app-update.service';
import { BackupService, NOW_SOURCE } from './backup.service';

const EXPORTED_AT = new Date('2026-08-03T13:45:00.000Z');

function createService(): { service: BackupService; reload: ReturnType<typeof vi.fn> } {
  const reload = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: PAGE_RELOAD, useValue: reload },
      { provide: NOW_SOURCE, useValue: () => EXPORTED_AT },
    ],
  });
  return { service: TestBed.inject(BackupService), reload };
}

describe('BackupService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('build', () => {
    it('captures every key in the app’s namespace', () => {
      localStorage.setItem('blackjack-flow-prefs', '{"dailyGoal":20}');
      localStorage.setItem('blackjack-basic-strategy-stats', '{"attempts":3}');
      const { service } = createService();

      const backup = service.build();

      expect(backup.app).toBe(BACKUP_APP_ID);
      expect(backup.schema).toBe(BACKUP_SCHEMA_VERSION);
      expect(backup.exportedAt).toBe(EXPORTED_AT.toISOString());
      expect(backup.data).toEqual({
        'blackjack-flow-prefs': '{"dailyGoal":20}',
        'blackjack-basic-strategy-stats': '{"attempts":3}',
      });
    });

    // The namespace is the definition of the backup, so a store added later is
    // captured without anyone remembering to list it — but another app sharing
    // this origin is not swept up.
    it('ignores keys outside the namespace', () => {
      localStorage.setItem('blackjack-flow-prefs', '{}');
      localStorage.setItem('some-other-app-token', 'secret');
      const { service } = createService();

      expect(Object.keys(service.build().data)).toEqual(['blackjack-flow-prefs']);
    });

    it('orders keys so the same state exports byte-for-byte the same', () => {
      localStorage.setItem('blackjack-zebra', '1');
      localStorage.setItem('blackjack-alpha', '2');
      const { service } = createService();

      expect(Object.keys(service.build().data)).toEqual(['blackjack-alpha', 'blackjack-zebra']);
    });

    it('exports an empty backup on a browser that has practised nothing', () => {
      const { service } = createService();
      expect(service.build().data).toEqual({});
    });
  });

  describe('restore', () => {
    const fileOf = (data: Record<string, string>) =>
      JSON.stringify({
        app: BACKUP_APP_ID,
        schema: BACKUP_SCHEMA_VERSION,
        exportedAt: EXPORTED_AT.toISOString(),
        data,
      });

    it('writes the backup’s keys and reloads so every store re-reads them', () => {
      const { service, reload } = createService();

      const result = service.restore(fileOf({ 'blackjack-flow-prefs': '{"dailyGoal":40}' }));

      expect(result.ok).toBe(true);
      expect(localStorage.getItem('blackjack-flow-prefs')).toBe('{"dailyGoal":40}');
      expect(reload).toHaveBeenCalledOnce();
    });

    // A restore is the state the backup captured, not that state merged over
    // whatever this browser happened to hold.
    it('clears the namespace first, so a stale key does not survive', () => {
      localStorage.setItem('blackjack-deviation-stats', '{"attempts":99}');
      const { service } = createService();

      service.restore(fileOf({ 'blackjack-flow-prefs': '{}' }));

      expect(localStorage.getItem('blackjack-deviation-stats')).toBeNull();
      expect(localStorage.getItem('blackjack-flow-prefs')).toBe('{}');
    });

    it('leaves keys belonging to other apps on this origin alone', () => {
      localStorage.setItem('some-other-app-token', 'secret');
      const { service } = createService();

      service.restore(fileOf({ 'blackjack-flow-prefs': '{}' }));

      expect(localStorage.getItem('some-other-app-token')).toBe('secret');
    });

    it('changes nothing and does not reload when the file is not a backup', () => {
      localStorage.setItem('blackjack-flow-prefs', '{"dailyGoal":20}');
      const { service, reload } = createService();

      const result = service.restore('{"app":"some-other-app"}');

      expect(result.ok).toBe(false);
      expect(localStorage.getItem('blackjack-flow-prefs')).toBe('{"dailyGoal":20}');
      expect(reload).not.toHaveBeenCalled();
    });
  });

  describe('round trip', () => {
    it('restores exactly what it exported', () => {
      localStorage.setItem('blackjack-flow-prefs', '{"dailyGoal":40,"theme":"dark"}');
      localStorage.setItem(
        'blackjack-practice-history',
        '{"days":[{"date":"2026-08-01","hands":9}]}',
      );
      const { service } = createService();
      const file = JSON.stringify(service.build());
      const before = { ...service.build().data };

      localStorage.clear();
      service.restore(file);

      expect(service.build().data).toEqual(before);
    });
  });
});
