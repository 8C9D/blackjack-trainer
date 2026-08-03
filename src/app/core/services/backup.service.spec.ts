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

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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

  describe('download', () => {
    it('downloads the JSON with a dated name and releases the object URL', () => {
      localStorage.setItem('blackjack-flow-prefs', '{"dailyGoal":20}');
      const createObjectURL = vi.fn().mockReturnValue('blob:backup');
      const revokeObjectURL = vi.fn();
      vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      const { service } = createService();

      const name = service.download();

      expect(name).toBe('blackjack-trainer-backup-2026-08-03.json');
      expect(createObjectURL).toHaveBeenCalledOnce();
      const blob = createObjectURL.mock.calls[0][0] as Blob;
      expect(blob.type).toBe('application/json');
      expect(blob.size).toBeGreaterThan(0);
      expect(click).toHaveBeenCalledOnce();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:backup');
    });

    it('still releases the object URL when the browser refuses the click', () => {
      const revokeObjectURL = vi.fn();
      vi.stubGlobal('URL', {
        createObjectURL: vi.fn().mockReturnValue('blob:backup'),
        revokeObjectURL,
      });
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
        throw new Error('download refused');
      });
      const { service } = createService();

      expect(() => service.download()).toThrow('download refused');
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:backup');
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

    it('does not start a restore when the existing namespace cannot be snapshotted', () => {
      localStorage.setItem('blackjack-flow-prefs', 'old');
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('storage unavailable');
      });
      const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
      const { service, reload } = createService();

      const result = service.restore(fileOf({ 'blackjack-flow-prefs': 'new' }));

      expect(result).toEqual({
        ok: false,
        error: 'Browser storage could not be read; no data was changed.',
      });
      expect(removeItem).not.toHaveBeenCalled();
      expect(reload).not.toHaveBeenCalled();
    });

    it('restores an empty backup by clearing the app namespace', () => {
      localStorage.setItem('blackjack-flow-prefs', '{"dailyGoal":20}');
      localStorage.setItem('blackjack-basic-strategy-stats', '{"attempts":3}');
      localStorage.setItem('another-app', 'kept');
      const { service, reload } = createService();

      const result = service.restore(fileOf({}));

      expect(result).toEqual({ ok: true });
      expect(service.build().data).toEqual({});
      expect(localStorage.getItem('another-app')).toBe('kept');
      expect(reload).toHaveBeenCalledOnce();
    });

    it('rolls back the existing namespace when a backup write fails', () => {
      localStorage.setItem('blackjack-flow-prefs', 'old');
      const original = Storage.prototype.setItem;
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
        this: Storage,
        key: string,
        value: string,
      ) {
        if (value === 'new') throw new Error('quota');
        return original.call(this, key, value);
      });
      const { service, reload } = createService();

      const result = service.restore(fileOf({ 'blackjack-flow-prefs': 'new' }));

      expect(result).toEqual({
        ok: false,
        error: 'Browser storage refused the backup; your existing data was kept.',
      });
      expect(setItem).toHaveBeenCalled();
      expect(localStorage.getItem('blackjack-flow-prefs')).toBe('old');
      expect(reload).not.toHaveBeenCalled();
    });

    it('reports when storage also refuses the rollback', () => {
      localStorage.setItem('blackjack-flow-prefs', 'old');
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('storage unavailable');
      });
      const { service, reload } = createService();

      const result = service.restore(fileOf({ 'blackjack-flow-prefs': 'new' }));

      expect(result).toEqual({
        ok: false,
        error: 'Browser storage failed while restoring the backup and rolling back the change.',
      });
      expect(reload).not.toHaveBeenCalled();
    });

    it('reports a reload failure after preserving the restored data', () => {
      const { service, reload } = createService();
      reload.mockImplementation(() => {
        throw new Error('reload refused');
      });

      const result = service.restore(fileOf({ 'blackjack-flow-prefs': 'new' }));

      expect(result).toEqual({
        ok: false,
        error: 'The backup was restored, but the page could not reload. Reload it manually.',
      });
      expect(localStorage.getItem('blackjack-flow-prefs')).toBe('new');
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
