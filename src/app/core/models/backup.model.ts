// A portable copy of everything this app has stored about a trainee.
//
// The web build's only persistence is localStorage, which the browser is free
// to clear and which does not follow anyone to a second device — the iOS app
// has iCloud sync, the web has this. A backup is therefore the whole namespace,
// settings included: restoring onto a fresh browser should give you the app you
// left, not a scoreboard with the table rules reset.
//
// Every key this app writes is prefixed, so the backup is defined by the prefix
// rather than by a list of stores. A list would silently omit whatever store is
// added next; the prefix cannot.
export const BACKUP_KEY_PREFIX = 'blackjack-';

export const BACKUP_APP_ID = 'blackjack-trainer';

// Bumped only when a payload written by an older build can no longer be
// restored as-is. Individual stores already coerce their own values on load, so
// a value whose shape changed degrades to that store's fallback rather than
// needing a schema bump.
export const BACKUP_SCHEMA_VERSION = 1;

export interface PracticeBackup {
  readonly app: typeof BACKUP_APP_ID;
  readonly schema: number;
  // ISO instant, for the file name and the restore confirmation.
  readonly exportedAt: string;
  // Raw stored strings, keyed exactly as localStorage holds them. Kept as
  // strings rather than re-parsed JSON so a backup round-trips byte-for-byte
  // and this layer never has to know any store's shape.
  readonly data: Readonly<Record<string, string>>;
}

export type BackupParse =
  | { readonly ok: true; readonly backup: PracticeBackup }
  | { readonly ok: false; readonly error: string };

export function backupFileName(exportedAt: string): string {
  // The date alone: a second backup on the same day is the same day's backup,
  // and the browser will suffix a duplicate name anyway.
  const day = exportedAt.slice(0, 10);
  return `${BACKUP_APP_ID}-backup-${day}.json`;
}

// Parse an untrusted file. Anything that is not recognisably one of this app's
// backups is rejected with a sentence the Settings screen can show, rather than
// half-applied — a restore replaces the whole namespace, so a partial one would
// leave the trainee worse off than not restoring at all.
export function parseBackup(text: string): BackupParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not JSON.' };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'That file is not a backup.' };
  }
  const candidate = raw as Partial<PracticeBackup>;
  if (candidate.app !== BACKUP_APP_ID) {
    return { ok: false, error: 'That backup was not written by this app.' };
  }
  if (candidate.schema !== BACKUP_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `That backup is version ${String(candidate.schema)}; this build reads version ${BACKUP_SCHEMA_VERSION}.`,
    };
  }
  const data = candidate.data;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, error: 'That backup has no data in it.' };
  }
  const entries = Object.entries(data as Record<string, unknown>);
  // The file is user-supplied, so it does not get to name the keys it writes:
  // anything outside this app's namespace, or any non-string value, is a
  // malformed or hostile file rather than a backup to merge.
  for (const [key, value] of entries) {
    if (!key.startsWith(BACKUP_KEY_PREFIX) || typeof value !== 'string') {
      return { ok: false, error: 'That backup contains entries this app did not write.' };
    }
  }
  if (entries.length === 0) {
    return { ok: false, error: 'That backup has no data in it.' };
  }
  return {
    ok: true,
    backup: {
      app: BACKUP_APP_ID,
      schema: BACKUP_SCHEMA_VERSION,
      exportedAt: typeof candidate.exportedAt === 'string' ? candidate.exportedAt : '',
      data: Object.fromEntries(entries) as Record<string, string>,
    },
  };
}
