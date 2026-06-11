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

// Callbacks a trainer page supplies to `handleTrainerKeydown`.
export interface TrainerKeydownHandlers {
  // Whether dealing the next hand is currently allowed (e.g. the current hand
  // has been graded and any page-specific gating is satisfied).
  canNext: () => boolean;
  // Deal the next hand. Only invoked when `canNext()` is true.
  onNext: () => void;
  // Answer the current hand with the given action.
  onAction: (action: Action) => void;
}

// Shared global-keydown orchestration for the trainer pages (Basic Strategy and
// Deviations), so the Enter-to-deal / letter-to-answer wiring lives in one
// place. Each page keeps its own `@HostListener('window:keydown')` and delegates
// the body here. Behavior:
//   - ignored events (modifier held / form control focused) are a no-op;
//   - Enter deals the next hand when `canNext()` is true, preventing the
//     default only when a deal actually happens;
//   - a bound action letter answers with that action.
export function handleTrainerKeydown(event: KeyboardEvent, handlers: TrainerKeydownHandlers): void {
  if (shouldIgnoreKeyboardEvent(event)) return;
  if (event.key === 'Enter') {
    if (handlers.canNext()) {
      event.preventDefault();
      handlers.onNext();
    }
    return;
  }
  const action = actionForKey(event.key);
  if (action) {
    event.preventDefault();
    handlers.onAction(action);
  }
}
