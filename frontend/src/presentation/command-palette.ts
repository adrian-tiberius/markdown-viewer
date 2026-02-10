import type { ViewerAction } from './viewer-actions';

export interface CommandPaletteCommand {
  action: ViewerAction;
  title: string;
  description: string;
  shortcut: string;
  searchTerms: string[];
}

export const DEFAULT_COMMAND_PALETTE_COMMANDS: CommandPaletteCommand[] = [
  {
    action: 'open-file',
    title: 'Open Markdown File',
    description: 'Pick and open a markdown file',
    shortcut: 'Ctrl/Cmd+O',
    searchTerms: ['open', 'file', 'markdown'],
  },
  {
    action: 'reload-document',
    title: 'Reload Current Document',
    description: 'Reload from disk and refresh rendered output.',
    shortcut: 'Ctrl/Cmd+R',
    searchTerms: ['reload', 'refresh'],
  },
  {
    action: 'print-document',
    title: 'Print or Export PDF',
    description: 'Open print dialog for the current file',
    shortcut: 'Ctrl/Cmd+P',
    searchTerms: ['print', 'pdf', 'export'],
  },
  {
    action: 'open-find',
    title: 'Find In Document',
    description: 'Search and navigate text matches in the current file',
    shortcut: 'Ctrl/Cmd+F',
    searchTerms: ['find', 'search', 'match'],
  },
  {
    action: 'find-next',
    title: 'Find Next Match',
    description: 'Move to the next search match.',
    shortcut: 'Enter / F3',
    searchTerms: ['find', 'next', 'search'],
  },
  {
    action: 'find-previous',
    title: 'Find Previous Match',
    description: 'Move to the previous search match.',
    shortcut: 'Shift+Enter / Shift+F3',
    searchTerms: ['find', 'previous', 'search'],
  },
  {
    action: 'close-active-tab',
    title: 'Close Active Tab',
    description: 'Close the current tab and activate a neighbor.',
    shortcut: 'Ctrl/Cmd+W',
    searchTerms: ['close', 'tab'],
  },
  {
    action: 'activate-next-tab',
    title: 'Switch To Next Tab',
    description: 'Move to the next open document tab.',
    shortcut: 'Ctrl/Cmd+Tab',
    searchTerms: ['next', 'tab', 'switch'],
  },
  {
    action: 'activate-previous-tab',
    title: 'Switch To Previous Tab',
    description: 'Move to the previous open document tab.',
    shortcut: 'Ctrl/Cmd+Shift+Tab',
    searchTerms: ['previous', 'tab', 'switch'],
  },
  {
    action: 'toggle-left-sidebar',
    title: 'Toggle Outline Sidebar',
    description: 'Show or hide the left outline panel.',
    shortcut: '',
    searchTerms: ['outline', 'sidebar', 'left', 'toc'],
  },
  {
    action: 'toggle-right-sidebar',
    title: 'Toggle Reading Sidebar',
    description: 'Show or hide the right reading controls panel.',
    shortcut: '',
    searchTerms: ['reading', 'sidebar', 'right', 'settings'],
  },
  {
    action: 'show-shortcuts-help',
    title: 'Show Keyboard Instructions',
    description: 'Open the keyboard and command guide.',
    shortcut: 'Ctrl/Cmd+Shift+/',
    searchTerms: ['instructions', 'help', 'shortcuts', 'command palette'],
  },
];

export function filterCommandPaletteCommands(
  commands: CommandPaletteCommand[],
  rawQuery: string
): CommandPaletteCommand[] {
  const normalized = normalize(rawQuery);
  if (!normalized) {
    return [...commands];
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);
  return commands.filter((command) => {
    const haystack = searchableText(command);
    return tokens.every((token) => haystack.includes(token));
  });
}

function searchableText(command: CommandPaletteCommand): string {
  return normalize(
    [command.title, command.description, command.shortcut, ...command.searchTerms].join(' ')
  );
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}
