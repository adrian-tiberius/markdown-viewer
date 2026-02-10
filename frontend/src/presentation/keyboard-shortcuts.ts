import type { ViewerAction } from './viewer-actions';

export interface KeyboardShortcutInput {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  isEditableTarget: boolean;
}

export type KeyboardShortcutIntent = { type: 'none' } | { type: ViewerAction };

export function resolveKeyboardShortcutIntent(
  input: KeyboardShortcutInput
): KeyboardShortcutIntent {
  if (!hasPrimaryModifier(input) || input.altKey || input.isEditableTarget) {
    return { type: 'none' };
  }

  const key = normalizeKey(input.key);
  if (key === 'tab') {
    return input.shiftKey ? { type: 'activate-previous-tab' } : { type: 'activate-next-tab' };
  }

  if (input.shiftKey) {
    if (key === '[') {
      return { type: 'activate-previous-tab' };
    }
    if (key === ']') {
      return { type: 'activate-next-tab' };
    }
    if (key === '/') {
      return { type: 'show-shortcuts-help' };
    }
    return { type: 'none' };
  }

  if (key === 'f') {
    return { type: 'open-find' };
  }
  if (key === 'k') {
    return { type: 'open-command-palette' };
  }
  if (key === 'o') {
    return { type: 'open-file' };
  }
  if (key === 'r') {
    return { type: 'reload-document' };
  }
  if (key === 'p') {
    return { type: 'print-document' };
  }
  if (key === 'w') {
    return { type: 'close-active-tab' };
  }
  if (key === 'pageup') {
    return { type: 'activate-previous-tab' };
  }
  if (key === 'pagedown') {
    return { type: 'activate-next-tab' };
  }

  return { type: 'none' };
}

function normalizeKey(value: string): string {
  return value.toLowerCase();
}

function hasPrimaryModifier(input: KeyboardShortcutInput): boolean {
  return input.ctrlKey || input.metaKey;
}
