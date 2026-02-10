import type { WorkspaceQuickOpenItem } from '../application/workspace-quick-open';
import type { ViewerAction } from './viewer-actions';

export type CommandPaletteSelection =
  | { type: 'action'; action: ViewerAction }
  | { type: 'open-document'; path: string };

export interface CommandPaletteCommand {
  action?: ViewerAction;
  openDocumentPath?: string;
  title: string;
  description: string;
  shortcut: string;
  searchTerms: string[];
}

function actionCommand(
  action: ViewerAction,
  title: string,
  description: string,
  shortcut: string,
  searchTerms: string[]
): CommandPaletteCommand {
  return {
    action,
    title,
    description,
    shortcut,
    searchTerms,
  };
}

export const DEFAULT_COMMAND_PALETTE_COMMANDS: CommandPaletteCommand[] = [
  actionCommand(
    'open-file',
    'Open Markdown File',
    'Pick and open a markdown file',
    'Ctrl/Cmd+O',
    ['open', 'file', 'markdown']
  ),
  actionCommand(
    'reload-document',
    'Reload Current Document',
    'Reload from disk and refresh rendered output.',
    'Ctrl/Cmd+R',
    ['reload', 'refresh']
  ),
  actionCommand(
    'print-document',
    'Print or Export PDF',
    'Open print dialog for the current file',
    'Ctrl/Cmd+P',
    ['print', 'pdf', 'export']
  ),
  actionCommand(
    'check-for-updates',
    'Check For Updates',
    'Check for newer versions and install updates.',
    '',
    ['update', 'upgrade', 'version']
  ),
  actionCommand(
    'open-find',
    'Find In Document',
    'Search and navigate text matches in the current file',
    'Ctrl/Cmd+F',
    ['find', 'search', 'match']
  ),
  actionCommand(
    'find-next',
    'Find Next Match',
    'Move to the next search match.',
    'Enter / F3',
    ['find', 'next', 'search']
  ),
  actionCommand(
    'find-previous',
    'Find Previous Match',
    'Move to the previous search match.',
    'Shift+Enter / Shift+F3',
    ['find', 'previous', 'search']
  ),
  actionCommand(
    'close-active-tab',
    'Close Active Tab',
    'Close the current tab and activate a neighbor.',
    'Ctrl/Cmd+W',
    ['close', 'tab']
  ),
  actionCommand(
    'activate-next-tab',
    'Switch To Next Tab',
    'Move to the next open document tab.',
    'Ctrl/Cmd+Tab',
    ['next', 'tab', 'switch']
  ),
  actionCommand(
    'activate-previous-tab',
    'Switch To Previous Tab',
    'Move to the previous open document tab.',
    'Ctrl/Cmd+Shift+Tab',
    ['previous', 'tab', 'switch']
  ),
  actionCommand(
    'toggle-left-sidebar',
    'Toggle Outline Sidebar',
    'Show or hide the left outline panel.',
    '',
    ['outline', 'sidebar', 'left', 'toc']
  ),
  actionCommand(
    'toggle-right-sidebar',
    'Toggle Reading Sidebar',
    'Show or hide the right reading controls panel.',
    '',
    ['reading', 'sidebar', 'right', 'settings']
  ),
  actionCommand(
    'show-shortcuts-help',
    'Show Keyboard Instructions',
    'Open the keyboard and command guide.',
    'Ctrl/Cmd+Shift+/',
    ['instructions', 'help', 'shortcuts', 'command palette']
  ),
];

export function createWorkspaceQuickOpenCommands(
  items: WorkspaceQuickOpenItem[]
): CommandPaletteCommand[] {
  return items.map((item) => {
    const sourceLabel = item.source === 'tab' ? 'tab' : 'recent document';
    const activeLabel = item.isActive ? ' (active)' : '';
    return {
      openDocumentPath: item.path,
      title: item.title,
      description: `Open ${sourceLabel}${activeLabel}`,
      shortcut: '',
      searchTerms: [item.path, item.title, item.source, 'open', 'document', 'tab', 'recent'],
    };
  });
}

export function selectionFromCommand(command: CommandPaletteCommand): CommandPaletteSelection | null {
  if (command.action) {
    return {
      type: 'action',
      action: command.action,
    };
  }

  if (command.openDocumentPath) {
    return {
      type: 'open-document',
      path: command.openDocumentPath,
    };
  }

  return null;
}

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
