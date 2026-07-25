// Tolerant localStorage JSON mechanics shared by every persisted store
// (stats, flow prefs, practice history, miss tally). The mechanics are always
// the same — SSR-safe guard, parse-or-fallback on read, swallow quota errors
// on write — while each store expresses its own shape validation in `coerce`.
//
// `coerce` receives the parsed payload and must return a valid value; it may
// throw (or let a property access throw) on a malformed payload — that lands
// in the same catch as a JSON syntax error and yields the fallback.
export function readJson<T>(key: string, fallback: T, coerce: (parsed: unknown) => T): T {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return coerce(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage can throw on quota / private browsing; tolerate silently.
  }
}
