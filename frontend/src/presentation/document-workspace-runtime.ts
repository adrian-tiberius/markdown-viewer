import {
  DocumentLoadUseCase,
  type DocumentLoadResult,
} from '../application/document-load-use-case';
import { DocumentWorkspaceTabsUseCase } from '../application/document-workspace-tabs-use-case';
import type {
  DocumentTabSessionStore,
  MarkdownFileLoader,
  MarkdownFormattingEngine,
  MarkdownWatchController,
  RecentDocumentsStore,
  ScrollMemoryStore,
} from '../application/ports';
import type { ViewerSettings } from '../application/settings';
import type { MarkdownDocument } from '../domain';
import { DocumentReloadController } from './document-reload-controller';
import { DocumentRenderController } from './document-render-controller';
import { DocumentScrollController } from './document-scroll-controller';
import type { DocumentLinkController } from './document-link-controller';
import type { FindController } from './find-controller';
import { DocumentWorkspaceSessionController } from './document-workspace-session-controller';
import { DocumentWorkspaceState } from './document-workspace-state';
import type { TocController } from './toc-controller';
import type { ViewerUi } from './ui';

export interface WorkspaceLoadOptions {
  restartWatch: boolean;
  restoreScroll: boolean;
}

export interface DocumentWorkspaceRuntime {
  state: DocumentWorkspaceState;
  sessionController: DocumentWorkspaceSessionController;
  renderController: DocumentRenderController;
  scrollController: DocumentScrollController;
  loadController: DocumentLoadUseCase;
  reloadController: DocumentReloadController;
  tabsUseCase: DocumentWorkspaceTabsUseCase;
  loadDocument: (path: string, options: WorkspaceLoadOptions) => Promise<DocumentLoadResult>;
  reloadCurrentDocument: () => Promise<void>;
}

interface CreateDocumentWorkspaceRuntimeDeps {
  ui: Pick<
    ViewerUi,
    | 'title'
    | 'subtitle'
    | 'path'
    | 'stats'
    | 'markdownContent'
    | 'safeContent'
    | 'viewerScroll'
    | 'tabList'
    | 'reloadButton'
    | 'recentDocumentsList'
    | 'errorBanner'
  >;
  markdownLoader: MarkdownFileLoader;
  markdownWatch: MarkdownWatchController;
  formattingEngine: MarkdownFormattingEngine;
  scrollMemoryStore: ScrollMemoryStore;
  tabSessionStore: DocumentTabSessionStore;
  recentDocumentsStore: RecentDocumentsStore;
  findController: FindController;
  tocController: TocController;
  documentLinkController: DocumentLinkController;
  getSettings: () => ViewerSettings;
  onErrorBanner: (message: string) => void;
  onActivateSafeMode: (reason: string, detail: string, source: string | null) => void;
}

export function createDocumentWorkspaceRuntime(
  deps: CreateDocumentWorkspaceRuntimeDeps
): DocumentWorkspaceRuntime {
  const state = new DocumentWorkspaceState();

  const sessionController = new DocumentWorkspaceSessionController({
    ui: {
      tabList: deps.ui.tabList,
      reloadButton: deps.ui.reloadButton,
      recentDocumentsList: deps.ui.recentDocumentsList,
    },
    tabSessionStore: deps.tabSessionStore,
    recentDocumentsStore: deps.recentDocumentsStore,
  });

  const renderController = new DocumentRenderController({
    ui: {
      title: deps.ui.title,
      subtitle: deps.ui.subtitle,
      path: deps.ui.path,
      stats: deps.ui.stats,
      markdownContent: deps.ui.markdownContent,
      safeContent: deps.ui.safeContent,
      viewerScroll: deps.ui.viewerScroll,
    },
    formattingEngine: deps.formattingEngine,
    findController: deps.findController,
    tocController: deps.tocController,
    documentLinkController: deps.documentLinkController,
    getSettings: deps.getSettings,
    isDisposed: () => state.isDisposed(),
    onActivateSafeMode: deps.onActivateSafeMode,
  });

  const scrollController = new DocumentScrollController({
    ui: {
      viewerScroll: deps.ui.viewerScroll,
    },
    scrollMemoryStore: deps.scrollMemoryStore,
    currentDocumentPath: () => state.currentDocumentPath(),
  });

  const loadController = new DocumentLoadUseCase({
    markdownLoader: deps.markdownLoader,
    markdownWatch: deps.markdownWatch,
    getSettings: deps.getSettings,
    isDisposed: () => state.isDisposed(),
    output: {
      didStartLoading: () => {
        deps.ui.subtitle.textContent = 'Loading markdown...';
      },
      didCompleteLoading: () => {
        deps.ui.subtitle.textContent = 'Ready';
      },
      didFailLoading: () => {
        deps.ui.subtitle.textContent = 'Failed to load';
      },
      showError: (message: string) => {
        deps.onErrorBanner(message);
      },
      clearError: () => {
        deps.ui.errorBanner.classList.remove('visible');
      },
      didLoadDocument: (requestedPath: string, document: MarkdownDocument) => {
        sessionController.applyLoadedDocument(requestedPath, document.path, document.title);
        state.setCurrentDocument(document);
        sessionController.rememberRecentDocument(document.path);
      },
      renderDocument: (document: MarkdownDocument) => renderController.renderDocument(document),
    },
  });

  const loadDocument = async (
    path: string,
    options: WorkspaceLoadOptions
  ): Promise<DocumentLoadResult> => {
    const result = await loadController.load(path, {
      restartWatch: options.restartWatch,
    });

    if (result === 'success' && options.restoreScroll) {
      const currentPath = state.currentDocumentPath();
      if (currentPath) {
        scrollController.restore(currentPath);
      }
    }

    return result;
  };

  const reloadCurrentDocument = async (): Promise<void> => {
    const path = state.currentDocumentPath() ?? sessionController.activePath();
    if (!path) {
      return;
    }

    await loadDocument(path, {
      restartWatch: false,
      restoreScroll: true,
    });
  };

  const reloadController = new DocumentReloadController({
    currentDocumentPath: () => state.currentDocumentPath(),
    reloadCurrentDocument,
    isDisposed: () => state.isDisposed(),
  });

  const tabsUseCase = new DocumentWorkspaceTabsUseCase({
    session: sessionController,
    loadDocument,
    currentDocumentPath: () => state.currentDocumentPath(),
    persistScroll: () => {
      scrollController.persist();
    },
  });

  return {
    state,
    sessionController,
    renderController,
    scrollController,
    loadController,
    reloadController,
    tabsUseCase,
    loadDocument,
    reloadCurrentDocument,
  };
}
