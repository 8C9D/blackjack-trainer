import { DOCUMENT } from '@angular/common';
import { inject, Injectable, InjectionToken } from '@angular/core';

import {
  BACKUP_APP_ID,
  BACKUP_KEYS,
  BACKUP_SCHEMA_VERSION,
  backupFileName,
  parseBackup,
  type PracticeBackup,
} from '../models/backup.model';
import { PAGE_RELOAD } from './app-update.service';

// Injected so a spec can pin the export's timestamp, mirroring the `now`
// seams on PracticeHistoryService and MissTallyService.
export const NOW_SOURCE = new InjectionToken<() => Date>('NOW_SOURCE', {
  providedIn: 'root',
  factory: () => () => new Date(),
});

export type RestoreResult = { readonly ok: true } | { readonly ok: false; readonly error: string };

// Reads and writes this app's declared localStorage keys as one file.
//
// It works at the raw-string level on purpose: no store's shape is known here,
// and a value that has since changed shape is left for that store's own
// tolerant loader to reject on next load. The keys are the declared
// `BACKUP_KEYS`, never a prefix scan: the app shares its origin with other
// GitHub Pages projects, whose same-prefixed keys must survive an export and
// a restore untouched (S2).
@Injectable({ providedIn: 'root' })
export class BackupService {
  private readonly document = inject(DOCUMENT);
  private readonly reloadPage = inject(PAGE_RELOAD);
  private readonly now = inject(NOW_SOURCE);

  // Every declared key currently stored, in stable (sorted) order so two
  // exports of the same state produce the same file.
  private namespaceKeys(): string[] {
    return BACKUP_KEYS.filter((key) => localStorage.getItem(key) !== null).sort();
  }

  build(): PracticeBackup {
    const data: Record<string, string> = {};
    for (const key of this.namespaceKeys()) {
      const value = localStorage.getItem(key);
      if (value !== null) data[key] = value;
    }
    return {
      app: BACKUP_APP_ID,
      schema: BACKUP_SCHEMA_VERSION,
      exportedAt: this.now().toISOString(),
      data,
    };
  }

  // Hands the backup to the browser as a download. Returns the file name so the
  // caller can name it in its confirmation; nothing here can meaningfully fail
  // that the caller could act on.
  download(): string {
    const backup = this.build();
    const name = backupFileName(backup.exportedAt);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    try {
      const anchor = this.document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      return name;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // Replaces the namespace with the file's contents and reloads, because every
  // store reads localStorage once at construction. A reload is the honest way
  // to adopt twelve stores' state at once; anything finer would leave whichever
  // store was forgotten showing the old numbers.
  //
  // The replacement clears first: a restore is the state the backup captured,
  // not that state merged over whatever this browser had.
  restore(text: string): RestoreResult {
    const parsed = parseBackup(text);
    if (!parsed.ok) return parsed;
    let previous: Readonly<Record<string, string>>;
    try {
      previous = this.build().data;
    } catch {
      // Do not start a destructive replacement unless the current namespace
      // can first be captured in full. A privacy-mode/read failure otherwise
      // leaves nothing trustworthy to roll back to.
      return {
        ok: false,
        error: 'Browser storage could not be read; no data was changed.',
      };
    }
    try {
      this.replaceNamespace(parsed.backup.data);
    } catch {
      // localStorage has no transaction primitive. Restore the snapshot on a
      // best-effort basis so a quota/private-mode failure does not silently
      // turn a valid existing profile into a half-applied backup.
      try {
        this.replaceNamespace(previous);
      } catch {
        return {
          ok: false,
          error: 'Browser storage failed while restoring the backup and rolling back the change.',
        };
      }
      return {
        ok: false,
        error: 'Browser storage refused the backup; your existing data was kept.',
      };
    }
    try {
      this.reloadPage();
    } catch {
      return {
        ok: false,
        error: 'The backup was restored, but the page could not reload. Reload it manually.',
      };
    }
    return { ok: true };
  }

  // Writes only declared keys: a tampered or foreign file must not be able to
  // plant keys this app never wrote, least of all another app's on this origin.
  private replaceNamespace(data: Readonly<Record<string, string>>): void {
    for (const key of BACKUP_KEYS) localStorage.removeItem(key);
    for (const [key, value] of Object.entries(data)) {
      if (BACKUP_KEYS.includes(key)) localStorage.setItem(key, value);
    }
  }
}
