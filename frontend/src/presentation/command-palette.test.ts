import { describe, expect, it } from 'vitest';

import {
  DEFAULT_COMMAND_PALETTE_COMMANDS,
  filterCommandPaletteCommands,
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
});
