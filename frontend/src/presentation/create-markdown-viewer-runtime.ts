import { AppCrashHandlerController } from './app-crash-handler-controller';
import { AppRuntimeListenerController } from './app-runtime-listener-controller';
import { CommandPaletteController } from './command-palette-controller';
import { ViewerCommandController } from './viewer-command-controller';
import { DocumentLinkController } from './document-link-controller';
import { DocumentWorkspaceController } from './document-workspace-controller';
import { createDocumentWorkspaceRuntime } from './document-workspace-runtime';
import { FindController } from './find-controller';
import { LinkPermissionController } from './link-permission-controller';
import { PermissionDialogController } from './permission-dialog-controller';
import type {
  DocumentTabSessionStore,
  ExternalUrlOpener,
  MarkdownFormattingEngine,
  MarkdownGateway,
  RecentDocumentsStore,
  ScrollMemoryStore,
  UpdateService,
  ViewerLayoutStateStore,
  ViewerSettingsStore,
} from '../application/ports';
import { buildWorkspaceQuickOpenItems } from '../application/workspace-quick-open';
import {
  createWorkspaceQuickOpenCommands,
  DEFAULT_COMMAND_PALETTE_COMMANDS,
} from './command-palette';
import { TocController } from './toc-controller';
import type { ViewerUi } from './ui';
import { ViewerPreferencesController } from './viewer-preferences-controller';
import { ViewerUiActionController } from './viewer-ui-action-controller';
import { ViewerUiBinder } from './viewer-ui-binder';

interface CreateMarkdownViewerRuntimeDeps {
  ui: ViewerUi;
  gateway: MarkdownGateway;
  formattingEngine: MarkdownFormattingEngine;
  externalUrlOpener: ExternalUrlOpener;
  updateService: UpdateService;
  settingsStore: ViewerSettingsStore;
  layoutStateStore: ViewerLayoutStateStore;
  scrollMemoryStore: ScrollMemoryStore;
  tabSessionStore: DocumentTabSessionStore;
  recentDocumentsStore: RecentDocumentsStore;
  isDisposed: () => boolean;
  isLifecycleActive: (lifecycleToken: number) => boolean;
  onErrorBanner: (message: string) => void;
  onActivateSafeMode: (reason: string, detail: string, source: string | null) => void;
}

export interface MarkdownViewerRuntime {
  commandController: ViewerCommandController;
  permissionDialogController: PermissionDialogController;
  preferencesController: ViewerPreferencesController;
  runtimeListenerController: AppRuntimeListenerController;
  workspaceController: DocumentWorkspaceController;
  crashHandlerController: AppCrashHandlerController;
  uiBinder: ViewerUiBinder;
}

export function createMarkdownViewerRuntime(
  deps: CreateMarkdownViewerRuntimeDeps
): MarkdownViewerRuntime {
  const preferencesController = new ViewerPreferencesController({
    ui: {
      workspace: deps.ui.workspace,
      toggleLeftSidebarButton: deps.ui.toggleLeftSidebarButton,
      toggleRightSidebarButton: deps.ui.toggleRightSidebarButton,
      perfToggle: deps.ui.perfToggle,
      safeToggle: deps.ui.safeToggle,
      themeSelect: deps.ui.themeSelect,
      fontScale: deps.ui.fontScale,
      lineHeight: deps.ui.lineHeight,
      measureWidth: deps.ui.measureWidth,
      includeLinks: deps.ui.includeLinks,
      includeCode: deps.ui.includeCode,
      includeFrontMatter: deps.ui.includeFrontMatter,
      tocAutoExpand: deps.ui.tocAutoExpand,
      markdownContent: deps.ui.markdownContent,
      viewerScroll: deps.ui.viewerScroll,
    },
    settingsStore: deps.settingsStore,
    layoutStateStore: deps.layoutStateStore,
  });

  const commandPaletteController = new CommandPaletteController({
    ui: {
      commandPalette: deps.ui.commandPalette,
      commandPaletteInput: deps.ui.commandPaletteInput,
      commandPaletteList: deps.ui.commandPaletteList,
    },
  });

  const findController = new FindController({
    ui: {
      findBar: deps.ui.findBar,
      findInput: deps.ui.findInput,
      findCount: deps.ui.findCount,
      markdownContent: deps.ui.markdownContent,
      safeContent: deps.ui.safeContent,
    },
    isSafeMode: () => preferencesController.isSafeModeEnabled(),
  });

  const permissionDialogController = new PermissionDialogController({
    ui: {
      permissionDialog: deps.ui.permissionDialog,
      permissionTitle: deps.ui.permissionTitle,
      permissionMessage: deps.ui.permissionMessage,
      permissionTarget: deps.ui.permissionTarget,
      permissionAllowButton: deps.ui.permissionAllowButton,
    },
  });

  const tocController = new TocController({
    ui: {
      tocList: deps.ui.tocList,
      markdownContent: deps.ui.markdownContent,
      viewerScroll: deps.ui.viewerScroll,
    },
    isAutoExpandEnabled: () => preferencesController.isTocAutoExpandEnabled(),
    isCollapsed: (id: string) => preferencesController.isTocCollapsed(id),
    setCollapsed: (id: string, collapsed: boolean) => {
      preferencesController.setTocCollapsed(id, collapsed);
    },
    persistCollapsedState: () => {
      preferencesController.persistTocCollapsedState();
    },
  });

  const linkDispatcher: {
    openExternalUrl: (url: string) => Promise<void>;
    openMarkdownFile: (path: string) => Promise<void>;
    openLocalFile: (path: string, sourceDocumentPath: string) => Promise<void>;
  } = {
    openExternalUrl: async () => {},
    openMarkdownFile: async () => {},
    openLocalFile: async () => {},
  };

  const documentLinkController = new DocumentLinkController({
    ui: {
      markdownContent: deps.ui.markdownContent,
    },
    openExternalUrl: async (url: string) => linkDispatcher.openExternalUrl(url),
    openMarkdownFile: async (path: string) => linkDispatcher.openMarkdownFile(path),
    openLocalFile: async (path: string, sourceDocumentPath: string) =>
      linkDispatcher.openLocalFile(path, sourceDocumentPath),
    onBlockedLink: deps.onErrorBanner,
  });

  const workspaceRuntime = createDocumentWorkspaceRuntime({
    ui: {
      title: deps.ui.title,
      subtitle: deps.ui.subtitle,
      path: deps.ui.path,
      stats: deps.ui.stats,
      markdownContent: deps.ui.markdownContent,
      safeContent: deps.ui.safeContent,
      viewerScroll: deps.ui.viewerScroll,
      tabList: deps.ui.tabList,
      reloadButton: deps.ui.reloadButton,
      recentDocumentsList: deps.ui.recentDocumentsList,
      errorBanner: deps.ui.errorBanner,
    },
    markdownLoader: deps.gateway,
    markdownWatch: deps.gateway,
    formattingEngine: deps.formattingEngine,
    scrollMemoryStore: deps.scrollMemoryStore,
    tabSessionStore: deps.tabSessionStore,
    recentDocumentsStore: deps.recentDocumentsStore,
    findController,
    tocController,
    documentLinkController,
    getSettings: () => preferencesController.currentSettings(),
    onErrorBanner: deps.onErrorBanner,
    onActivateSafeMode: deps.onActivateSafeMode,
  });

  const workspaceController = new DocumentWorkspaceController({
    runtime: workspaceRuntime,
    markdownFilePicker: deps.gateway,
    markdownWatch: deps.gateway,
    onErrorBanner: deps.onErrorBanner,
  });

  const linkPermissionController = new LinkPermissionController({
    permissionDialogController,
    externalUrlOpener: deps.externalUrlOpener,
    openMarkdownInNewTab: (path: string) => workspaceController.openMarkdownInNewTab(path),
    onErrorBanner: deps.onErrorBanner,
    isDisposed: deps.isDisposed,
  });

  linkDispatcher.openExternalUrl = (url: string) =>
    linkPermissionController.requestExternalUrlPermission(url);
  linkDispatcher.openMarkdownFile = (path: string) =>
    linkPermissionController.requestMarkdownLinkPermission(path);
  linkDispatcher.openLocalFile = (path: string, sourceDocumentPath: string) =>
    linkPermissionController.requestLocalFilePermission(path, sourceDocumentPath);

  const commandPaletteCommands = () => {
    const quickOpenItems = buildWorkspaceQuickOpenItems({
      tabs: workspaceController.tabStateSnapshot(),
      recentDocuments: workspaceController.recentDocumentsSnapshot(),
    });

    return [
      ...DEFAULT_COMMAND_PALETTE_COMMANDS,
      ...createWorkspaceQuickOpenCommands(quickOpenItems),
    ];
  };

  const commandController = new ViewerCommandController({
    ui: {
      shortcutsDialog: deps.ui.shortcutsDialog,
      shortcutsCloseButton: deps.ui.shortcutsCloseButton,
    },
    commandPaletteController,
    findController,
    isPermissionDialogVisible: () => permissionDialogController.isVisible(),
    dismissPermissionDialog: () => {
      permissionDialogController.resolve(false);
    },
    commandPaletteCommands,
    showMessage: deps.onErrorBanner,
    actions: {
      openFile: () => workspaceController.openPickedFile(),
      reloadDocument: () => workspaceController.reloadCurrentDocument(),
      printDocument: () => {
        window.print();
      },
      checkForUpdates: () => deps.updateService.checkForUpdates(),
      openDocumentPath: (path: string) => workspaceController.openRecentDocument(path),
      closeActiveTab: () => workspaceController.closeActiveTab(),
      activateAdjacentTab: (direction: 'next' | 'previous') =>
        workspaceController.activateAdjacentTab(direction),
      toggleSidebar: (side: 'left' | 'right') => {
        preferencesController.toggleSidebar(side);
      },
    },
  });

  const uiActionController = new ViewerUiActionController({
    ui: {
      errorBanner: deps.ui.errorBanner,
    },
    scrollMemoryStore: deps.scrollMemoryStore,
    commandController,
    permissionDialogController,
    preferencesController,
    workspaceController,
    tocController,
  });

  const uiBinder = new ViewerUiBinder({
    ui: deps.ui,
    handlers: uiActionController.handlers(),
  });

  const crashHandlerController = new AppCrashHandlerController({
    currentDocumentSource: () => workspaceController.currentDocumentSource(),
    onCrash: (reason: string, detail: string, source: string | null) => {
      deps.onActivateSafeMode(reason, detail, source);
    },
  });

  const runtimeListenerController = new AppRuntimeListenerController({
    markdownFileUpdates: deps.gateway,
    dragDropEvents: deps.gateway,
    openPathRequests: deps.gateway,
    ui: {
      dropOverlay: deps.ui.dropOverlay,
    },
    isLifecycleActive: (lifecycleToken: number) => deps.isLifecycleActive(lifecycleToken),
    onFileUpdated: (path: string) => {
      workspaceController.handleFileUpdated(path);
    },
    onDroppedMarkdownPath: (path: string) => {
      void workspaceController.openDroppedMarkdownPath(path);
    },
    onOpenPathRequested: (path: string) => {
      void workspaceController.openDroppedMarkdownPath(path);
    },
    onError: deps.onErrorBanner,
  });

  return {
    commandController,
    permissionDialogController,
    preferencesController,
    runtimeListenerController,
    workspaceController,
    crashHandlerController,
    uiBinder,
  };
}
