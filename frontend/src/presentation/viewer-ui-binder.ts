import type { ViewerAction } from './viewer-actions';
import type { ViewerUi } from './ui';

interface ViewerUiBinderDeps {
  ui: ViewerUi;
  handlers: ViewerUiBindingHandlers;
}

export interface ViewerUiBindingHandlers {
  onOpen: () => void;
  onReload: () => void;
  onToggleLeftSidebar: () => void;
  onToggleRightSidebar: () => void;
  onTabAction: (action: 'activate' | 'close', encodedPath: string) => void;
  onPrint: () => void;
  onOpenCommandPalette: () => void;
  onPermissionResolve: (allowed: boolean) => void;
  onGlobalKeyDown: (event: KeyboardEvent) => void;
  onWindowResize: () => void;
  onWorkspaceTransitionEnd: (event: TransitionEvent) => void;
  onPerformanceModeChange: (enabled: boolean) => void;
  onSafeModeChange: (enabled: boolean) => void;
  onThemeChange: (theme: string) => void;
  onFontScaleChange: (value: number) => void;
  onLineHeightChange: (value: number) => void;
  onMeasureWidthChange: (value: number) => void;
  onIncludeLinksChange: (enabled: boolean) => void;
  onIncludeCodeChange: (enabled: boolean) => void;
  onIncludeFrontMatterChange: (enabled: boolean) => void;
  onTocAutoExpandChange: (enabled: boolean) => void;
  onCollapseAllToc: () => void;
  onExpandAllToc: () => void;
  onClearScrollMemory: () => void;
  onFindInput: (value: string) => void;
  onFindInputKeyDown: (event: KeyboardEvent) => void;
  onFindStep: (direction: 'previous' | 'next') => void;
  onFindClose: () => void;
  onClearRecentDocuments: () => void;
  onOpenRecentDocument: (encodedPath: string) => void;
  onCommandPaletteInput: (value: string) => void;
  onCommandPaletteAction: (action: ViewerAction) => void;
  onCommandPaletteDismiss: () => void;
  onShowShortcutsHelp: () => void;
  onShortcutsClose: () => void;
  onShortcutsDismiss: () => void;
  onRecoverFromError: () => void;
  onDismissError: () => void;
  onViewerScroll: () => void;
}

export class ViewerUiBinder {
  private readonly deps: ViewerUiBinderDeps;
  private disposers: Array<() => void> = [];

  constructor(deps: ViewerUiBinderDeps) {
    this.deps = deps;
  }

  bind(): void {
    const { ui, handlers } = this.deps;
    this.dispose();

    this.bindListener(ui.openButton, 'click', handlers.onOpen);
    this.bindListener(ui.reloadButton, 'click', handlers.onReload);
    this.bindListener(ui.toggleLeftSidebarButton, 'click', handlers.onToggleLeftSidebar);
    this.bindListener(ui.toggleRightSidebarButton, 'click', handlers.onToggleRightSidebar);
    this.bindListener(ui.tabList, 'click', (event: Event) => {
      const target = event.target as HTMLElement | null;
      const actionElement = target?.closest<HTMLButtonElement>('button[data-tab-action]');
      if (!actionElement) {
        return;
      }

      const action = actionElement.dataset.tabAction;
      const encodedPath = actionElement.dataset.path;
      if ((action !== 'activate' && action !== 'close') || !encodedPath) {
        return;
      }
      handlers.onTabAction(action, encodedPath);
    });
    this.bindListener(ui.printButton, 'click', handlers.onPrint);
    this.bindListener(ui.openCommandPaletteButton, 'click', handlers.onOpenCommandPalette);
    this.bindListener(ui.permissionAllowButton, 'click', () => {
      handlers.onPermissionResolve(true);
    });
    this.bindListener(ui.permissionCancelButton, 'click', () => {
      handlers.onPermissionResolve(false);
    });
    this.bindListener(ui.permissionDialog, 'click', (event: Event) => {
      if (event.target === ui.permissionDialog) {
        handlers.onPermissionResolve(false);
      }
    });
    this.bindListener(window, 'keydown', (event: Event) => {
      handlers.onGlobalKeyDown(event as KeyboardEvent);
    });
    this.bindListener(window, 'resize', handlers.onWindowResize);
    this.bindListener(ui.workspace, 'transitionend', (event: Event) => {
      handlers.onWorkspaceTransitionEnd(event as TransitionEvent);
    });
    this.bindListener(ui.perfToggle, 'change', () => {
      handlers.onPerformanceModeChange(ui.perfToggle.checked);
    });
    this.bindListener(ui.safeToggle, 'change', () => {
      handlers.onSafeModeChange(ui.safeToggle.checked);
    });
    this.bindListener(ui.themeSelect, 'change', () => {
      handlers.onThemeChange(ui.themeSelect.value);
    });
    this.bindListener(ui.fontScale, 'input', () => {
      handlers.onFontScaleChange(Number(ui.fontScale.value));
    });
    this.bindListener(ui.lineHeight, 'input', () => {
      handlers.onLineHeightChange(Number(ui.lineHeight.value));
    });
    this.bindListener(ui.measureWidth, 'input', () => {
      handlers.onMeasureWidthChange(Number(ui.measureWidth.value));
    });
    this.bindListener(ui.includeLinks, 'change', () => {
      handlers.onIncludeLinksChange(ui.includeLinks.checked);
    });
    this.bindListener(ui.includeCode, 'change', () => {
      handlers.onIncludeCodeChange(ui.includeCode.checked);
    });
    this.bindListener(ui.includeFrontMatter, 'change', () => {
      handlers.onIncludeFrontMatterChange(ui.includeFrontMatter.checked);
    });
    this.bindListener(ui.tocAutoExpand, 'change', () => {
      handlers.onTocAutoExpandChange(ui.tocAutoExpand.checked);
    });
    this.bindListener(ui.collapseAllToc, 'click', handlers.onCollapseAllToc);
    this.bindListener(ui.expandAllToc, 'click', handlers.onExpandAllToc);
    this.bindListener(ui.clearScrollMemory, 'click', handlers.onClearScrollMemory);
    this.bindListener(ui.findInput, 'input', () => {
      handlers.onFindInput(ui.findInput.value);
    });
    this.bindListener(ui.findInput, 'keydown', (event: Event) => {
      handlers.onFindInputKeyDown(event as KeyboardEvent);
    });
    this.bindListener(ui.findPrev, 'click', () => {
      handlers.onFindStep('previous');
    });
    this.bindListener(ui.findNext, 'click', () => {
      handlers.onFindStep('next');
    });
    this.bindListener(ui.findClose, 'click', handlers.onFindClose);
    this.bindListener(ui.clearRecentDocuments, 'click', handlers.onClearRecentDocuments);
    this.bindListener(ui.recentDocumentsList, 'click', (event: Event) => {
      const target = event.target as HTMLElement | null;
      const actionElement = target?.closest<HTMLButtonElement>('button[data-recent-open]');
      if (!actionElement) {
        return;
      }

      const encodedPath = actionElement.dataset.path;
      if (!encodedPath) {
        return;
      }
      handlers.onOpenRecentDocument(encodedPath);
    });
    this.bindListener(ui.commandPaletteInput, 'input', () => {
      handlers.onCommandPaletteInput(ui.commandPaletteInput.value);
    });
    this.bindListener(ui.commandPaletteList, 'click', (event: Event) => {
      const target = event.target as HTMLElement | null;
      const actionElement = target?.closest<HTMLButtonElement>('button[data-command-action]');
      if (!actionElement) {
        return;
      }
      const action = actionElement.dataset.commandAction as ViewerAction | undefined;
      if (!action) {
        return;
      }
      handlers.onCommandPaletteAction(action);
    });
    this.bindListener(ui.commandPalette, 'click', (event: Event) => {
      if (event.target === ui.commandPalette) {
        handlers.onCommandPaletteDismiss();
      }
    });
    this.bindListener(ui.showShortcutsHelpButton, 'click', handlers.onShowShortcutsHelp);
    this.bindListener(ui.shortcutsCloseButton, 'click', handlers.onShortcutsClose);
    this.bindListener(ui.shortcutsDialog, 'click', (event: Event) => {
      if (event.target === ui.shortcutsDialog) {
        handlers.onShortcutsDismiss();
      }
    });
    this.bindListener(ui.recoverButton, 'click', handlers.onRecoverFromError);
    this.bindListener(ui.dismissErrorButton, 'click', handlers.onDismissError);
    this.bindListener(
      ui.viewerScroll,
      'scroll',
      () => {
        handlers.onViewerScroll();
      },
      { passive: true }
    );
  }

  dispose(): void {
    const disposers = this.disposers.splice(0);
    for (const dispose of disposers) {
      dispose();
    }
  }

  private bindListener(
    target: EventTarget & {
      addEventListener: (
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: AddEventListenerOptions | boolean
      ) => void;
      removeEventListener: (
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: AddEventListenerOptions | boolean
      ) => void;
    },
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean
  ): void {
    target.addEventListener(type, listener, options);
    this.disposers.push(() => {
      target.removeEventListener(type, listener, options);
    });
  }
}
