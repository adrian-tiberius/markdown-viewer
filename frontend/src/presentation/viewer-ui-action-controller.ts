import type { ScrollMemoryStore } from '../application/ports';
import { TocController } from './toc-controller';
import type { ViewerUi } from './ui';
import type { ViewerUiBindingHandlers } from './viewer-ui-binder';
import { DocumentWorkspaceController } from './document-workspace-controller';
import { PermissionDialogController } from './permission-dialog-controller';
import { ViewerCommandController } from './viewer-command-controller';
import { ViewerPreferencesController } from './viewer-preferences-controller';

interface ViewerUiActionControllerDeps {
  ui: Pick<ViewerUi, 'errorBanner'>;
  scrollMemoryStore: ScrollMemoryStore;
  commandController: ViewerCommandController;
  permissionDialogController: PermissionDialogController;
  preferencesController: ViewerPreferencesController;
  workspaceController: DocumentWorkspaceController;
  tocController: TocController;
}

export class ViewerUiActionController {
  private readonly deps: ViewerUiActionControllerDeps;

  constructor(deps: ViewerUiActionControllerDeps) {
    this.deps = deps;
  }

  handlers(): ViewerUiBindingHandlers {
    return {
      ...this.fileAndTabHandlers(),
      ...this.runtimeAndDialogHandlers(),
      ...this.preferenceHandlers(),
      ...this.findHandlers(),
      ...this.commandPaletteHandlers(),
      ...this.errorAndScrollHandlers(),
    };
  }

  private fileAndTabHandlers(): Pick<
    ViewerUiBindingHandlers,
    | 'onOpen'
    | 'onReload'
    | 'onToggleLeftSidebar'
    | 'onToggleRightSidebar'
    | 'onTabAction'
    | 'onPrint'
    | 'onClearRecentDocuments'
    | 'onOpenRecentDocument'
  > {
    return {
      onOpen: () => {
        void this.deps.commandController.executeAction('open-file');
      },
      onReload: () => {
        void this.deps.commandController.executeAction('reload-document');
      },
      onToggleLeftSidebar: () => {
        void this.deps.commandController.executeAction('toggle-left-sidebar');
      },
      onToggleRightSidebar: () => {
        void this.deps.commandController.executeAction('toggle-right-sidebar');
      },
      onTabAction: (action: 'activate' | 'close', encodedPath: string) => {
        const path = this.decodeUriComponent(encodedPath);
        if (action === 'activate') {
          void this.deps.workspaceController.activateTab(path);
          return;
        }
        void this.deps.workspaceController.closeTab(path);
      },
      onPrint: () => {
        void this.deps.commandController.executeAction('print-document');
      },
      onClearRecentDocuments: () => {
        this.deps.workspaceController.clearRecentDocuments();
      },
      onOpenRecentDocument: (encodedPath: string) => {
        const path = this.decodeUriComponent(encodedPath);
        void this.deps.workspaceController.openRecentDocument(path);
      },
    };
  }

  private runtimeAndDialogHandlers(): Pick<
    ViewerUiBindingHandlers,
    | 'onOpenCommandPalette'
    | 'onPermissionResolve'
    | 'onGlobalKeyDown'
    | 'onWindowResize'
    | 'onWorkspaceTransitionEnd'
    | 'onShowShortcutsHelp'
    | 'onShortcutsClose'
    | 'onShortcutsDismiss'
  > {
    return {
      onOpenCommandPalette: () => {
        this.deps.commandController.showCommandPalette();
      },
      onPermissionResolve: (allowed: boolean) => {
        this.deps.permissionDialogController.resolve(allowed);
      },
      onGlobalKeyDown: (event: KeyboardEvent) => {
        void this.deps.commandController.handleGlobalKeyDown(event);
      },
      onWindowResize: () => {
        this.deps.preferencesController.handleWindowResize();
      },
      onWorkspaceTransitionEnd: (event: TransitionEvent) => {
        this.deps.preferencesController.handleWorkspaceTransitionEnd(event);
      },
      onShowShortcutsHelp: () => {
        void this.deps.commandController.executeAction('show-shortcuts-help');
      },
      onShortcutsClose: () => {
        this.deps.commandController.closeShortcutsDialog();
      },
      onShortcutsDismiss: () => {
        this.deps.commandController.dismissShortcutsDialog();
      },
    };
  }

  private preferenceHandlers(): Pick<
    ViewerUiBindingHandlers,
    | 'onPerformanceModeChange'
    | 'onSafeModeChange'
    | 'onThemeChange'
    | 'onFontScaleChange'
    | 'onLineHeightChange'
    | 'onMeasureWidthChange'
    | 'onIncludeLinksChange'
    | 'onIncludeCodeChange'
    | 'onIncludeFrontMatterChange'
    | 'onTocAutoExpandChange'
    | 'onCollapseAllToc'
    | 'onExpandAllToc'
    | 'onClearScrollMemory'
  > {
    return {
      onPerformanceModeChange: (enabled: boolean) => {
        this.deps.preferencesController.setPerformanceMode(enabled);
        void this.deps.workspaceController.reloadCurrentDocument();
      },
      onSafeModeChange: (enabled: boolean) => {
        this.deps.preferencesController.setSafeMode(enabled);
        if (this.deps.workspaceController.hasCurrentDocument()) {
          void this.deps.workspaceController.rerenderCurrentDocument({ restoreScroll: false });
        }
      },
      onThemeChange: (theme: string) => {
        this.deps.preferencesController.setTheme(
          theme as Parameters<ViewerPreferencesController['setTheme']>[0]
        );
      },
      onFontScaleChange: (value: number) => {
        this.deps.preferencesController.setFontScale(value);
      },
      onLineHeightChange: (value: number) => {
        this.deps.preferencesController.setLineHeight(value);
      },
      onMeasureWidthChange: (value: number) => {
        this.deps.preferencesController.setMeasureWidth(value);
      },
      onIncludeLinksChange: (enabled: boolean) => {
        this.deps.preferencesController.setWordCountRule('includeLinks', enabled);
        void this.deps.workspaceController.reloadCurrentDocument();
      },
      onIncludeCodeChange: (enabled: boolean) => {
        this.deps.preferencesController.setWordCountRule('includeCode', enabled);
        void this.deps.workspaceController.reloadCurrentDocument();
      },
      onIncludeFrontMatterChange: (enabled: boolean) => {
        this.deps.preferencesController.setWordCountRule('includeFrontMatter', enabled);
        void this.deps.workspaceController.reloadCurrentDocument();
      },
      onTocAutoExpandChange: (enabled: boolean) => {
        this.deps.preferencesController.setTocAutoExpand(enabled);
      },
      onCollapseAllToc: () => {
        this.deps.preferencesController.collapseTocEntries(
          this.deps.workspaceController.currentTocEntries().map((entry) => entry.id)
        );
        this.deps.tocController.render(this.deps.workspaceController.currentTocEntries());
      },
      onExpandAllToc: () => {
        this.deps.preferencesController.expandAllTocEntries();
        this.deps.tocController.render(this.deps.workspaceController.currentTocEntries());
      },
      onClearScrollMemory: () => {
        this.deps.scrollMemoryStore.clear();
      },
    };
  }

  private findHandlers(): Pick<
    ViewerUiBindingHandlers,
    'onFindInput' | 'onFindInputKeyDown' | 'onFindStep' | 'onFindClose'
  > {
    return {
      onFindInput: (value: string) => {
        this.deps.commandController.handleFindInput(value);
      },
      onFindInputKeyDown: (event: KeyboardEvent) => {
        void this.deps.commandController.handleFindInputKeyDown(event);
      },
      onFindStep: (direction: 'previous' | 'next') => {
        void this.deps.commandController.handleFindStep(direction);
      },
      onFindClose: () => {
        this.deps.commandController.handleFindClose();
      },
    };
  }

  private commandPaletteHandlers(): Pick<
    ViewerUiBindingHandlers,
    'onCommandPaletteInput' | 'onCommandPaletteAction' | 'onCommandPaletteDismiss'
  > {
    return {
      onCommandPaletteInput: (value: string) => {
        this.deps.commandController.handleCommandPaletteInput(value);
      },
      onCommandPaletteAction: (action) => {
        void this.deps.commandController.handleCommandPaletteAction(action);
      },
      onCommandPaletteDismiss: () => {
        this.deps.commandController.dismissCommandPalette();
      },
    };
  }

  private errorAndScrollHandlers(): Pick<
    ViewerUiBindingHandlers,
    'onRecoverFromError' | 'onDismissError' | 'onViewerScroll'
  > {
    return {
      onRecoverFromError: () => {
        this.deps.preferencesController.clearSafeModeForRecovery();
        this.deps.ui.errorBanner.classList.remove('visible');
        void this.deps.workspaceController.reloadCurrentDocument();
      },
      onDismissError: () => {
        this.deps.ui.errorBanner.classList.remove('visible');
      },
      onViewerScroll: () => {
        this.deps.workspaceController.handleViewerScroll();
      },
    };
  }

  private decodeUriComponent(value: string): string {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
}
