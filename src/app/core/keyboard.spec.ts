import {
  ACTION_KEY_BINDINGS,
  ACTION_KEY_HINTS,
  actionForKey,
  shouldIgnoreKeyboardEvent,
} from './keyboard';

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
});
