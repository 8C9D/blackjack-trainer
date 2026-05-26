import type { Action } from './models/strategy.model';

// Single source of truth for trainer action hotkeys. Keys are lowercase
// single-character strings so callers can look up via
// `event.key.toLowerCase()` without having to canonicalize separately.
export const ACTION_KEY_BINDINGS: Readonly<Record<string, Action>> = {
  h: 'H',
  s: 'S',
  d: 'D',
  p: 'P',
  r: 'SUR',
  i: 'INS',
};

// Inverse mapping derived from ACTION_KEY_BINDINGS. Used by the action
// buttons to render the uppercase key hint next to each button label.
export const ACTION_KEY_HINTS: Readonly<Record<Action, string>> = (() => {
  const out: Partial<Record<Action, string>> = {};
  for (const [key, action] of Object.entries(ACTION_KEY_BINDINGS)) {
    out[action] = key.toUpperCase();
  }
  return out as Readonly<Record<Action, string>>;
})();

// Resolve a KeyboardEvent's `key` (or any raw key string) to its bound
// trainer Action, or undefined when no action is bound.
export function actionForKey(key: string): Action | undefined {
  return ACTION_KEY_BINDINGS[key.toLowerCase()];
}

// True when a global keyboard shortcut should NOT fire for this event:
// either a modifier is pressed, or focus is on a form-control / editable
// element that legitimately wants the keystroke.
export function shouldIgnoreKeyboardEvent(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return true;
  const target = event.target as HTMLElement | null;
  if (!target) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}
