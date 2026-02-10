import { escapeHtml } from './document-view-utils';
import {
  DEFAULT_COMMAND_PALETTE_COMMANDS,
  filterCommandPaletteCommands,
  type CommandPaletteCommand,
} from './command-palette';
import type { ViewerUi } from './ui';
import type { ViewerAction } from './viewer-actions';

interface CommandPaletteControllerDeps {
  ui: Pick<ViewerUi, 'commandPalette' | 'commandPaletteInput' | 'commandPaletteList'>;
  commands?: CommandPaletteCommand[];
}

export interface CommandPaletteKeyboardResult {
  handled: boolean;
  action: ViewerAction | null;
}

export class CommandPaletteController {
  private readonly deps: CommandPaletteControllerDeps;
  private readonly commands: CommandPaletteCommand[];
  private readonly actions: Set<ViewerAction>;
  private filteredCommands: CommandPaletteCommand[] = [];
  private selectionIndex = 0;

  constructor(deps: CommandPaletteControllerDeps) {
    this.deps = deps;
    this.commands = deps.commands ?? [...DEFAULT_COMMAND_PALETTE_COMMANDS];
    this.actions = new Set(this.commands.map((command) => command.action));
    this.filter('');
  }

  show(): void {
    const { ui } = this.deps;
    this.filter('');
    ui.commandPaletteInput.value = '';
    ui.commandPalette.classList.add('visible');
    ui.commandPalette.setAttribute('aria-hidden', 'false');
    ui.commandPaletteInput.focus();
  }

  hide(): void {
    const { ui } = this.deps;
    ui.commandPalette.classList.remove('visible');
    ui.commandPalette.setAttribute('aria-hidden', 'true');
  }

  isVisible(): boolean {
    return this.deps.ui.commandPalette.classList.contains('visible');
  }

  filter(rawQuery: string): void {
    this.filteredCommands = filterCommandPaletteCommands(this.commands, rawQuery);
    this.selectionIndex = 0;
    this.render();
  }

  actionFromListEventTarget(target: EventTarget | null): ViewerAction | null {
    if (!(target instanceof HTMLElement)) {
      return null;
    }

    const actionElement = target.closest<HTMLButtonElement>('button[data-command-action]');
    if (!actionElement) {
      return null;
    }

    const action = actionElement.dataset.commandAction;
    if (!action || !this.isViewerAction(action)) {
      return null;
    }

    return action;
  }

  handleKeyboardEvent(event: KeyboardEvent): CommandPaletteKeyboardResult {
    if (!this.isVisible()) {
      return {
        handled: false,
        action: null,
      };
    }

    if (event.key === 'Escape') {
      this.hide();
      return {
        handled: true,
        action: null,
      };
    }

    if (event.key === 'ArrowDown') {
      if (this.filteredCommands.length > 0) {
        this.selectionIndex = (this.selectionIndex + 1) % this.filteredCommands.length;
        this.render();
      }
      return {
        handled: true,
        action: null,
      };
    }

    if (event.key === 'ArrowUp') {
      if (this.filteredCommands.length > 0) {
        this.selectionIndex =
          (this.selectionIndex - 1 + this.filteredCommands.length) % this.filteredCommands.length;
        this.render();
      }
      return {
        handled: true,
        action: null,
      };
    }

    if (event.key === 'Enter') {
      const selected = this.filteredCommands[this.selectionIndex];
      if (!selected) {
        return {
          handled: true,
          action: null,
        };
      }

      this.hide();
      return {
        handled: true,
        action: selected.action,
      };
    }

    return {
      handled: false,
      action: null,
    };
  }

  private render(): void {
    const { commandPaletteList } = this.deps.ui;
    if (this.filteredCommands.length === 0) {
      commandPaletteList.innerHTML = '<li class="command-palette-empty">No commands found</li>';
      return;
    }

    if (this.selectionIndex >= this.filteredCommands.length) {
      this.selectionIndex = 0;
    }

    commandPaletteList.innerHTML = this.filteredCommands
      .map((command, index) => {
        const isActive = index === this.selectionIndex;
        const activeClass = isActive ? ' active' : '';
        const shortcut = command.shortcut
          ? `<span class="command-palette-shortcut">${escapeHtml(command.shortcut)}</span>`
          : '';
        return `<li class="command-palette-item${activeClass}">
    <button type="button" class="command-palette-button" data-command-action="${escapeHtml(command.action)}">
      <span>
        <span class="command-palette-title">${escapeHtml(command.title)}</span>
        <span class="command-palette-description">${escapeHtml(command.description)}</span>
      </span>
      ${shortcut}
    </button>
  </li>`;
      })
      .join('');

    const activeElement = commandPaletteList.querySelector<HTMLElement>(
      '.command-palette-item.active .command-palette-button'
    );
    if (activeElement && typeof activeElement.scrollIntoView === 'function') {
      activeElement.scrollIntoView({ block: 'nearest' });
    }
  }

  private isViewerAction(value: string): value is ViewerAction {
    return this.actions.has(value as ViewerAction);
  }
}
