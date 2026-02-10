import { describe, expect, it } from 'vitest';

import {
  DEFAULT_COMMAND_PALETTE_COMMANDS,
  createWorkspaceQuickOpenCommands,
  filterCommandPaletteCommands,
  selectionFromCommand,
} from './command-palette';

describe('command-palette (presentation)', () => {
  it('returns all commands when query is empty', () => {
    const filtered = filterCommandPaletteCommands(DEFAULT_COMMAND_PALETTE_COMMANDS, '   ');
    expect(filtered).toHaveLength(DEFAULT_COMMAND_PALETTE_COMMANDS.length);
  });

  it('filters commands by title and keywords', () => {
    const filtered = filterCommandPaletteCommands(DEFAULT_COMMAND_PALETTE_COMMANDS, 'find next');
    expect(filtered.map((command) => command.action)).toEqual(['find-next']);
  });

  it('supports multi-term matching across metadata', () => {
    const filtered = filterCommandPaletteCommands(DEFAULT_COMMAND_PALETTE_COMMANDS, 'keyboard guide');
    expect(filtered.map((command) => command.action)).toEqual(['show-shortcuts-help']);
  });

  it('creates quick-open commands from workspace entries', () => {
    const commands = createWorkspaceQuickOpenCommands([
      {
        path: '/docs/spec.md',
        title: 'Spec',
        source: 'tab',
        isActive: true,
      },
    ]);

    expect(commands).toEqual([
      {
        openDocumentPath: '/docs/spec.md',
        title: 'Spec',
        description: 'Open tab (active)',
        shortcut: '',
        searchTerms: ['/docs/spec.md', 'Spec', 'tab', 'open', 'document', 'tab', 'recent'],
      },
    ]);
  });

  it('derives action and open-document selections from commands', () => {
    expect(
      selectionFromCommand({
        action: 'reload-document',
        title: 'Reload',
        description: 'Reload current document',
        shortcut: '',
        searchTerms: ['reload'],
      })
    ).toEqual({
      type: 'action',
      action: 'reload-document',
    });

    expect(
      selectionFromCommand({
        openDocumentPath: '/docs/spec.md',
        title: 'Spec',
        description: 'Open recent document',
        shortcut: '',
        searchTerms: ['spec'],
      })
    ).toEqual({
      type: 'open-document',
      path: '/docs/spec.md',
    });
  });
});
