import {
  ACTION_KEY_BINDINGS,
  ACTION_KEY_HINTS,
  actionForKey,
  handleTrainerKeydown,
  shouldIgnoreKeyboardEvent,
  type TrainerKeydownHandlers,
} from './keyboard';
import type { Action } from './models/strategy.model';

function event(init: {
  key?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  target?: EventTarget | null;
}): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', {
    key: init.key ?? '',
    ctrlKey: init.ctrlKey ?? false,
    metaKey: init.metaKey ?? false,
    altKey: init.altKey ?? false,
  });
  if (init.target !== undefined) {
    // KeyboardEvent's `target` is read-only; redefine for the test.
    Object.defineProperty(ev, 'target', { value: init.target });
  }
  return ev;
}

describe('keyboard helpers', () => {
  describe('ACTION_KEY_HINTS', () => {
    it('is the uppercase inverse of ACTION_KEY_BINDINGS', () => {
      for (const [key, action] of Object.entries(ACTION_KEY_BINDINGS)) {
        expect(ACTION_KEY_HINTS[action]).toBe(key.toUpperCase());
      }
    });

    it('covers every bound action exactly once', () => {
      const actionsFromBindings = Object.values(ACTION_KEY_BINDINGS);
      const hintActions = Object.keys(ACTION_KEY_HINTS);
      expect(hintActions.sort()).toEqual([...new Set(actionsFromBindings)].sort());
    });
  });

  describe('actionForKey', () => {
    it('maps the canonical lowercase letters to their actions', () => {
      expect(actionForKey('h')).toBe('H');
      expect(actionForKey('s')).toBe('S');
      expect(actionForKey('d')).toBe('D');
      expect(actionForKey('p')).toBe('P');
      expect(actionForKey('r')).toBe('SUR');
      expect(actionForKey('i')).toBe('INS');
    });

    it('is case-insensitive', () => {
      expect(actionForKey('H')).toBe('H');
      expect(actionForKey('R')).toBe('SUR');
    });

    it('returns undefined for unbound keys', () => {
      expect(actionForKey('x')).toBeUndefined();
      expect(actionForKey('Enter')).toBeUndefined();
      expect(actionForKey('')).toBeUndefined();
    });
  });

  describe('shouldIgnoreKeyboardEvent', () => {
    it('ignores ctrl/meta/alt-modified keystrokes', () => {
      expect(shouldIgnoreKeyboardEvent(event({ key: 'h', ctrlKey: true }))).toBe(true);
      expect(shouldIgnoreKeyboardEvent(event({ key: 'h', metaKey: true }))).toBe(true);
      expect(shouldIgnoreKeyboardEvent(event({ key: 'h', altKey: true }))).toBe(true);
    });

    it('ignores keystrokes targeted at form controls', () => {
      for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
        const target = document.createElement(tag);
        expect(shouldIgnoreKeyboardEvent(event({ key: 'h', target }))).toBe(true);
      }
    });

    it('ignores keystrokes targeted at contenteditable elements', () => {
      // jsdom does not derive isContentEditable from the contenteditable
      // attribute, so stub the IDL property directly to test the helper's
      // branch.
      const target = document.createElement('div');
      Object.defineProperty(target, 'isContentEditable', { value: true });
      expect(shouldIgnoreKeyboardEvent(event({ key: 'h', target }))).toBe(true);
    });

    it('does not ignore plain keystrokes on non-form targets', () => {
      const target = document.createElement('div');
      expect(shouldIgnoreKeyboardEvent(event({ key: 'h', target }))).toBe(false);
    });

    it('does not ignore keystrokes with no target', () => {
      expect(shouldIgnoreKeyboardEvent(event({ key: 'h', target: null }))).toBe(false);
    });
  });

  describe('handleTrainerKeydown', () => {
    interface Calls {
      actions: Action[];
      next: number;
    }

    function handlers(calls: Calls, canNext: boolean): TrainerKeydownHandlers {
      return {
        canNext: () => canNext,
        onNext: () => {
          calls.next += 1;
        },
        onAction: (action) => {
          calls.actions.push(action);
        },
      };
    }

    // Cancelable so `defaultPrevented` reflects whether the handler called
    // preventDefault (default KeyboardEvents are not cancelable).
    function keydown(key: string, init: { ctrlKey?: boolean } = {}): KeyboardEvent {
      return new KeyboardEvent('keydown', {
        key,
        cancelable: true,
        ctrlKey: init.ctrlKey ?? false,
      });
    }

    it('answers with the bound action and prevents default for an action key', () => {
      const calls: Calls = { actions: [], next: 0 };
      const ev = keydown('h');
      handleTrainerKeydown(ev, handlers(calls, false));
      expect(calls.actions).toEqual(['H']);
      expect(calls.next).toBe(0);
      expect(ev.defaultPrevented).toBe(true);
    });

    it('ignores unbound keys without preventing default', () => {
      const calls: Calls = { actions: [], next: 0 };
      const ev = keydown('x');
      handleTrainerKeydown(ev, handlers(calls, true));
      expect(calls.actions).toEqual([]);
      expect(calls.next).toBe(0);
      expect(ev.defaultPrevented).toBe(false);
    });

    it('deals the next hand on Enter when canNext is true', () => {
      const calls: Calls = { actions: [], next: 0 };
      const ev = keydown('Enter');
      handleTrainerKeydown(ev, handlers(calls, true));
      expect(calls.next).toBe(1);
      expect(calls.actions).toEqual([]);
      expect(ev.defaultPrevented).toBe(true);
    });

    it('does nothing on Enter when canNext is false', () => {
      const calls: Calls = { actions: [], next: 0 };
      const ev = keydown('Enter');
      handleTrainerKeydown(ev, handlers(calls, false));
      expect(calls.next).toBe(0);
      expect(calls.actions).toEqual([]);
      expect(ev.defaultPrevented).toBe(false);
    });

    it('never treats Enter as an action key (returns after the Enter branch)', () => {
      const calls: Calls = { actions: [], next: 0 };
      handleTrainerKeydown(keydown('Enter'), handlers(calls, false));
      expect(calls.actions).toEqual([]);
    });

    it('is a no-op for ignored events such as a modifier-held keystroke', () => {
      const calls: Calls = { actions: [], next: 0 };
      const ev = keydown('h', { ctrlKey: true });
      handleTrainerKeydown(ev, handlers(calls, true));
      expect(calls.actions).toEqual([]);
      expect(calls.next).toBe(0);
      expect(ev.defaultPrevented).toBe(false);
    });
  });
});
