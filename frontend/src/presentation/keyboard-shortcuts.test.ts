import { describe, expect, it } from 'vitest';

import { resolveKeyboardShortcutIntent } from './keyboard-shortcuts';

const baseInput = {
  key: 'x',
  ctrlKey: true,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  isEditableTarget: false,
};

describe('keyboard-shortcuts (presentation)', () => {
  it('maps primary open/reload/print/close shortcuts', () => {
    expect(resolveKeyboardShortcutIntent({ ...baseInput, key: 'f' })).toEqual({
      type: 'open-find',
    });
    expect(resolveKeyboardShortcutIntent({ ...baseInput, key: 'k' })).toEqual({
      type: 'open-command-palette',
    });
    expect(resolveKeyboardShortcutIntent({ ...baseInput, key: 'o' })).toEqual({
      type: 'open-file',
    });
    expect(resolveKeyboardShortcutIntent({ ...baseInput, key: 'r' })).toEqual({
      type: 'reload-document',
    });
    expect(resolveKeyboardShortcutIntent({ ...baseInput, key: 'p' })).toEqual({
      type: 'print-document',
    });
    expect(resolveKeyboardShortcutIntent({ ...baseInput, key: 'w' })).toEqual({
      type: 'close-active-tab',
    });
  });

  it('maps shortcut help command', () => {
    expect(
      resolveKeyboardShortcutIntent({
        ...baseInput,
        key: '/',
        shiftKey: true,
      })
    ).toEqual({
      type: 'show-shortcuts-help',
    });
  });

  it('maps tab traversal shortcuts', () => {
    expect(resolveKeyboardShortcutIntent({ ...baseInput, key: 'Tab' })).toEqual({
      type: 'activate-next-tab',
    });
    expect(
      resolveKeyboardShortcutIntent({
        ...baseInput,
        key: 'Tab',
        shiftKey: true,
      })
    ).toEqual({
      type: 'activate-previous-tab',
    });
    expect(
      resolveKeyboardShortcutIntent({
        ...baseInput,
        key: '[',
        shiftKey: true,
      })
    ).toEqual({
      type: 'activate-previous-tab',
    });
    expect(
      resolveKeyboardShortcutIntent({
        ...baseInput,
        key: ']',
        shiftKey: true,
      })
    ).toEqual({
      type: 'activate-next-tab',
    });
    expect(resolveKeyboardShortcutIntent({ ...baseInput, key: 'PageDown' })).toEqual({
      type: 'activate-next-tab',
    });
    expect(resolveKeyboardShortcutIntent({ ...baseInput, key: 'PageUp' })).toEqual({
      type: 'activate-previous-tab',
    });
  });

  it('ignores shortcuts inside editable targets', () => {
    expect(
      resolveKeyboardShortcutIntent({
        ...baseInput,
        key: 'o',
        isEditableTarget: true,
      })
    ).toEqual({
      type: 'none',
    });
  });

  it('ignores unsupported combinations', () => {
    expect(
      resolveKeyboardShortcutIntent({
        ...baseInput,
        ctrlKey: false,
        metaKey: false,
        key: 'o',
      })
    ).toEqual({
      type: 'none',
    });
    expect(
      resolveKeyboardShortcutIntent({
        ...baseInput,
        key: 'o',
        altKey: true,
      })
    ).toEqual({
      type: 'none',
    });
    expect(
      resolveKeyboardShortcutIntent({
        ...baseInput,
        key: 'x',
      })
    ).toEqual({
      type: 'none',
    });
  });
});
