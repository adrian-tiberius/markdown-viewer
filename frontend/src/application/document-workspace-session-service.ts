import {
  adjacentDocumentTabPath,
  applyLoadedDocumentToTabs,
  closeDocumentTab,
  createEmptyDocumentTabState,
  openDocumentTab,
  restoreDocumentTabState,
  toDocumentTabSession,
  type CloseDocumentTabResult,
  type DocumentTabState,
} from './document-tabs';
import {
  addRecentDocument,
  createEmptyRecentDocumentsState,
  type RecentDocumentsState,
} from './recent-documents';
import type {
  DocumentTabSessionStore,
  RecentDocumentsStore,
} from './ports';

interface DocumentWorkspaceSessionServiceDeps {
  tabSessionStore: DocumentTabSessionStore;
  recentDocumentsStore: RecentDocumentsStore;
}

export class DocumentWorkspaceSessionService {
  private readonly deps: DocumentWorkspaceSessionServiceDeps;
  private tabState: DocumentTabState = createEmptyDocumentTabState();
  private recentDocuments: RecentDocumentsState;

  constructor(deps: DocumentWorkspaceSessionServiceDeps) {
    this.deps = deps;
    this.recentDocuments = this.deps.recentDocumentsStore.load() ?? createEmptyRecentDocumentsState();
  }

  restorePersistedTabs(): string | null {
    const restoredTabState = restoreDocumentTabState(this.deps.tabSessionStore.load());
    if (restoredTabState.tabs.length === 0 || !restoredTabState.activePath) {
      return null;
    }

    this.tabState = restoredTabState;
    this.persistTabSession();
    return restoredTabState.activePath;
  }

  replaceTabState(state: DocumentTabState): void {
    this.tabState = {
      tabs: state.tabs.map((tab) => ({ ...tab })),
      activePath: state.activePath,
    };
    this.persistTabSession();
  }

  clearTabs(): void {
    this.tabState = createEmptyDocumentTabState();
    this.persistTabSession();
  }

  resetRuntimeTabs(): void {
    this.tabState = createEmptyDocumentTabState();
  }

  openTab(path: string, options: { activate: boolean }): void {
    this.tabState = openDocumentTab(this.tabState, path, {
      activate: options.activate,
    });
    this.persistTabSession();
  }

  applyLoadedDocument(path: string, resolvedPath: string, title: string): void {
    this.tabState = applyLoadedDocumentToTabs(this.tabState, path, resolvedPath, title);
    this.persistTabSession();
  }

  closeTab(path: string): CloseDocumentTabResult {
    const closed = closeDocumentTab(this.tabState, path);
    if (!closed.removed) {
      return closed;
    }

    this.tabState = closed.state;
    this.persistTabSession();
    return closed;
  }

  hasTabs(): boolean {
    return this.tabState.tabs.length > 0;
  }

  activePath(): string | null {
    return this.tabState.activePath;
  }

  adjacentPath(direction: 'next' | 'previous'): string | null {
    return adjacentDocumentTabPath(this.tabState, direction);
  }

  rememberRecentDocument(path: string): void {
    this.recentDocuments = addRecentDocument(this.recentDocuments, path);
    this.persistRecentDocuments();
  }

  clearRecentDocuments(): void {
    this.recentDocuments = createEmptyRecentDocumentsState();
    this.persistRecentDocuments();
  }

  tabStateSnapshot(): DocumentTabState {
    return {
      tabs: this.tabState.tabs.map((tab) => ({ ...tab })),
      activePath: this.tabState.activePath,
    };
  }

  recentDocumentsSnapshot(): RecentDocumentsState {
    return {
      entries: this.recentDocuments.entries.map((entry) => ({ ...entry })),
    };
  }

  private persistTabSession(): void {
    this.deps.tabSessionStore.save(toDocumentTabSession(this.tabState));
  }

  private persistRecentDocuments(): void {
    this.deps.recentDocumentsStore.save(this.recentDocuments);
  }
}
