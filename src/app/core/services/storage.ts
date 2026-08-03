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

// Coercer for the common case: a flat record whose every field is a number.
// The keys of `fallback` define the expected shape — a payload missing any of
// them, or carrying a non-number in one, is rejected wholesale rather than
// merged field-by-field, so a half-written tally can never load as partly
// valid. Pass as `readJson(key, EMPTY, (raw) => coerceNumericRecord(raw, EMPTY))`.
// The mapped-type constraint (rather than Record<string, number>) is what lets
// declared interfaces like SessionStats satisfy it — an interface has no index
// signature, so it is not assignable to Record<string, number>.
export function coerceNumericRecord<T extends { readonly [K in keyof T]: number }>(
  parsed: unknown,
  fallback: T,
): T {
  const source = parsed as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const key of Object.keys(fallback)) {
    const value = source[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    out[key] = value;
  }
  return out as T;
}

export function writeJson(key: string, value: unknown): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage can throw on quota / private browsing; tolerate silently.
  }
}
