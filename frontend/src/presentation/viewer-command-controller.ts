import { resolveKeyboardShortcutIntent } from './keyboard-shortcuts';
import type { ViewerAction } from './viewer-actions';
import { CommandPaletteController } from './command-palette-controller';
import type { CommandPaletteCommand, CommandPaletteSelection } from './command-palette';
import type { UpdateCheckResult } from '../application/ports';
import type { FindController } from './find-controller';
import { errorToMessage } from './error-utils';
import type { ViewerUi } from './ui';

interface ViewerCommandControllerDeps {
  ui: Pick<ViewerUi, 'shortcutsDialog' | 'shortcutsCloseButton'>;
  commandPaletteController: CommandPaletteController;
  findController: FindController;
  isPermissionDialogVisible: () => boolean;
  dismissPermissionDialog: () => void;
  commandPaletteCommands: () => CommandPaletteCommand[];
  showMessage: (message: string) => void;
  actions: {
    openFile: () => Promise<void>;
    reloadDocument: () => Promise<void>;
    printDocument: () => void;
    exportDiagnostics: () => Promise<string>;
    checkForUpdates: () => Promise<UpdateCheckResult>;
    openDocumentPath: (path: string) => Promise<void>;
    closeActiveTab: () => Promise<void>;
    activateAdjacentTab: (direction: 'next' | 'previous') => Promise<void>;
    toggleSidebar: (side: 'left' | 'right') => void;
  };
}

export class ViewerCommandController {
  private readonly deps: ViewerCommandControllerDeps;

  constructor(deps: ViewerCommandControllerDeps) {
    this.deps = deps;
  }

  async executeAction(action: ViewerAction): Promise<void> {
    await this.runViewerAction(action);
  }

  handleCommandPaletteInput(value: string): void {
    this.deps.commandPaletteController.filter(value);
  }

  async handleCommandPaletteAction(selection: CommandPaletteSelection): Promise<void> {
    this.hideCommandPalette();
    await this.executeCommandPaletteSelection(selection);
  }

  dismissCommandPalette(): void {
    this.hideCommandPalette();
  }

  showCommandPalette(): void {
    if (this.deps.isPermissionDialogVisible()) {
      return;
    }
    this.hideShortcutsDialog();
    this.deps.commandPaletteController.setCommands(this.deps.commandPaletteCommands());
    this.deps.commandPaletteController.show();
  }

  showShortcutsHelp(): void {
    this.hideCommandPalette();
    this.showShortcutsDialog();
  }

  closeShortcutsDialog(): void {
    this.hideShortcutsDialog();
  }

  dismissShortcutsDialog(): void {
    this.hideShortcutsDialog();
  }

  handleFindInput(value: string): void {
    this.deps.findController.applyQuery(value);
  }

  async handleFindInputKeyDown(event: KeyboardEvent): Promise<void> {
    if (event.key === 'Enter') {
      event.preventDefault();
      await this.stepFindMatch(event.shiftKey ? 'previous' : 'next');
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.hideFindBar({ clearQuery: false });
    }
  }

  async handleFindStep(direction: 'previous' | 'next'): Promise<void> {
    await this.stepFindMatch(direction);
  }

  handleFindClose(): void {
    this.hideFindBar({ clearQuery: false });
  }

  async handleGlobalKeyDown(keyboardEvent: KeyboardEvent): Promise<void> {
    if (keyboardEvent.key === 'Escape' && this.deps.isPermissionDialogVisible()) {
      keyboardEvent.preventDefault();
      this.deps.dismissPermissionDialog();
      return;
    }

    if (keyboardEvent.key === 'Escape' && this.isShortcutsDialogVisible()) {
      keyboardEvent.preventDefault();
      this.hideShortcutsDialog();
      return;
    }

    if (this.isCommandPaletteVisible()) {
      const result = this.deps.commandPaletteController.handleKeyboardEvent(keyboardEvent);
      if (result.handled) {
        keyboardEvent.preventDefault();
        if (result.selection) {
          await this.executeCommandPaletteSelection(result.selection);
        }
        return;
      }
    }

    if (this.isFindBarVisible() && (keyboardEvent.key === 'F3' || keyboardEvent.key === 'Enter')) {
      if (this.isEditableKeyboardTarget(keyboardEvent.target)) {
        return;
      }
      keyboardEvent.preventDefault();
      await this.stepFindMatch(keyboardEvent.shiftKey ? 'previous' : 'next');
      return;
    }

    if (keyboardEvent.key === 'Escape' && this.isFindBarVisible()) {
      keyboardEvent.preventDefault();
      this.hideFindBar({ clearQuery: false });
      return;
    }

    const shortcutIntent = resolveKeyboardShortcutIntent({
      key: keyboardEvent.key,
      ctrlKey: keyboardEvent.ctrlKey,
      metaKey: keyboardEvent.metaKey,
      shiftKey: keyboardEvent.shiftKey,
      altKey: keyboardEvent.altKey,
      isEditableTarget: this.isEditableKeyboardTarget(keyboardEvent.target),
    });
    if (shortcutIntent.type === 'none') {
      return;
    }
    keyboardEvent.preventDefault();
    await this.handleKeyboardShortcutIntent(shortcutIntent.type);
  }

  resetForDispose(): void {
    this.hideCommandPalette();
    this.hideShortcutsDialog();
    this.deps.findController.clearHighlights();
    this.hideFindBar({ clearQuery: false });
  }

  private async handleKeyboardShortcutIntent(intent: ViewerAction): Promise<void> {
    if (this.deps.isPermissionDialogVisible()) {
      return;
    }

    if (intent === 'open-command-palette') {
      this.showCommandPalette();
      return;
    }

    if (intent === 'show-shortcuts-help') {
      this.showShortcutsDialog();
      return;
    }

    if (intent === 'open-find') {
      this.showFindBar({ selectExistingText: true });
      return;
    }

    if (intent === 'activate-next-tab' || intent === 'activate-previous-tab') {
      await this.runViewerAction(
        intent === 'activate-next-tab' ? 'activate-next-tab' : 'activate-previous-tab'
      );
      return;
    }

    if (intent === 'close-active-tab') {
      await this.runViewerAction('close-active-tab');
      return;
    }

    if (intent === 'open-file' || intent === 'reload-document' || intent === 'print-document') {
      await this.runViewerAction(intent);
    }
  }

  private isEditableKeyboardTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    const tagName = target.tagName.toLowerCase();
    if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
      return true;
    }

    return target.isContentEditable || target.closest('[contenteditable="true"]') !== null;
  }

  private showShortcutsDialog(): void {
    const { shortcutsDialog, shortcutsCloseButton } = this.deps.ui;
    this.hideCommandPalette();
    shortcutsDialog.classList.add('visible');
    shortcutsDialog.setAttribute('aria-hidden', 'false');
    shortcutsCloseButton.focus();
  }

  private hideShortcutsDialog(): void {
    const { shortcutsDialog } = this.deps.ui;
    shortcutsDialog.classList.remove('visible');
    shortcutsDialog.setAttribute('aria-hidden', 'true');
  }

  private isShortcutsDialogVisible(): boolean {
    return this.deps.ui.shortcutsDialog.classList.contains('visible');
  }

  private hideCommandPalette(): void {
    this.deps.commandPaletteController.hide();
  }

  private isCommandPaletteVisible(): boolean {
    return this.deps.commandPaletteController.isVisible();
  }

  private showFindBar(options: { selectExistingText: boolean }): void {
    if (this.deps.isPermissionDialogVisible()) {
      return;
    }

    this.hideCommandPalette();
    this.hideShortcutsDialog();
    this.deps.findController.show(options);
  }

  private hideFindBar(options: { clearQuery: boolean }): void {
    this.deps.findController.hide(options);
  }

  private isFindBarVisible(): boolean {
    return this.deps.findController.isVisible();
  }

  private async stepFindMatch(direction: 'next' | 'previous'): Promise<void> {
    if (!this.deps.findController.query()) {
      this.showFindBar({ selectExistingText: true });
      return;
    }

    this.deps.findController.step(direction);
  }

  private async executeCommandPaletteSelection(
    selection: CommandPaletteSelection
  ): Promise<void> {
    if (selection.type === 'action') {
      await this.runViewerAction(selection.action);
      return;
    }

    await this.deps.actions.openDocumentPath(selection.path);
  }

  private async runViewerAction(action: ViewerAction): Promise<void> {
    if (action === 'open-file') {
      await this.deps.actions.openFile();
      return;
    }

    if (action === 'reload-document') {
      await this.deps.actions.reloadDocument();
      return;
    }

    if (action === 'print-document') {
      this.deps.actions.printDocument();
      return;
    }

    if (action === 'export-diagnostics') {
      try {
        const fileName = await this.deps.actions.exportDiagnostics();
        this.deps.showMessage(`Diagnostics report exported: ${fileName}`);
      } catch (error) {
        this.deps.showMessage(`Diagnostics export failed: ${errorToMessage(error)}`);
      }
      return;
    }

    if (action === 'check-for-updates') {
      const outcome = await this.deps.actions.checkForUpdates();
      this.showUpdateOutcome(outcome);
      return;
    }

    if (action === 'open-find') {
      this.showFindBar({ selectExistingText: true });
      return;
    }

    if (action === 'find-next') {
      this.showFindBar({ selectExistingText: false });
      await this.stepFindMatch('next');
      return;
    }

    if (action === 'find-previous') {
      this.showFindBar({ selectExistingText: false });
      await this.stepFindMatch('previous');
      return;
    }

    if (action === 'close-active-tab') {
      await this.deps.actions.closeActiveTab();
      return;
    }

    if (action === 'activate-next-tab' || action === 'activate-previous-tab') {
      await this.deps.actions.activateAdjacentTab(
        action === 'activate-next-tab' ? 'next' : 'previous'
      );
      return;
    }

    if (action === 'toggle-left-sidebar') {
      this.deps.actions.toggleSidebar('left');
      return;
    }

    if (action === 'toggle-right-sidebar') {
      this.deps.actions.toggleSidebar('right');
      return;
    }

    if (action === 'show-shortcuts-help') {
      this.showShortcutsDialog();
    }
  }

  private showUpdateOutcome(outcome: UpdateCheckResult): void {
    if (outcome.status === 'up-to-date') {
      this.deps.showMessage('You are already on the latest version.');
      return;
    }

    if (outcome.status === 'update-installed') {
      this.deps.showMessage(
        `Update ${outcome.version} installed. Restart the app to finish applying it.`
      );
      return;
    }

    this.deps.showMessage(`Update check unavailable: ${outcome.reason}`);
  }
}
