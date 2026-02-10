import { DocumentWorkspaceSessionService } from '../application/document-workspace-session-service';
import type {
  CloseDocumentTabResult,
  DocumentTabState,
} from '../application/document-tabs';
import type {
  DocumentTabSessionStore,
  RecentDocumentsStore,
} from '../application/ports';
import { DocumentWorkspaceSessionView } from './document-workspace-session-view';
import type { ViewerUi } from './ui';

interface DocumentWorkspaceSessionControllerDeps {
  ui: Pick<ViewerUi, 'tabList' | 'reloadButton' | 'recentDocumentsList'>;
  tabSessionStore: DocumentTabSessionStore;
  recentDocumentsStore: RecentDocumentsStore;
}

export class DocumentWorkspaceSessionController {
  private readonly service: DocumentWorkspaceSessionService;
  private readonly view: DocumentWorkspaceSessionView;

  constructor(deps: DocumentWorkspaceSessionControllerDeps) {
    this.service = new DocumentWorkspaceSessionService({
      tabSessionStore: deps.tabSessionStore,
      recentDocumentsStore: deps.recentDocumentsStore,
    });
    this.view = new DocumentWorkspaceSessionView({
      ui: deps.ui,
    });
  }

  start(): void {
    this.renderAll();
  }

  restorePersistedTabs(): string | null {
    const restoredPath = this.service.restorePersistedTabs();
    this.renderTabs();
    return restoredPath;
  }

  tabStateSnapshot(): DocumentTabState {
    return this.service.tabStateSnapshot();
  }

  replaceTabState(state: DocumentTabState): void {
    this.service.replaceTabState(state);
    this.renderTabs();
  }

  clearTabs(): void {
    this.service.clearTabs();
    this.renderTabs();
  }

  openTab(path: string, options: { activate: boolean }): void {
    this.service.openTab(path, options);
    this.renderTabs();
  }

  applyLoadedDocument(path: string, resolvedPath: string, title: string): void {
    this.service.applyLoadedDocument(path, resolvedPath, title);
    this.renderTabs();
  }

  closeTab(path: string): CloseDocumentTabResult {
    const closed = this.service.closeTab(path);
    if (closed.removed) {
      this.renderTabs();
    }
    return closed;
  }

  hasTabs(): boolean {
    return this.service.hasTabs();
  }

  activePath(): string | null {
    return this.service.activePath();
  }

  adjacentPath(direction: 'next' | 'previous'): string | null {
    return this.service.adjacentPath(direction);
  }

  rememberRecentDocument(path: string): void {
    this.service.rememberRecentDocument(path);
    this.renderRecentDocuments();
  }

  clearRecentDocuments(): void {
    this.service.clearRecentDocuments();
    this.renderRecentDocuments();
  }

  private renderAll(): void {
    this.renderTabs();
    this.renderRecentDocuments();
  }

  private renderTabs(): void {
    this.view.renderTabs(this.service.tabStateSnapshot());
  }

  private renderRecentDocuments(): void {
    this.view.renderRecentDocuments(this.service.recentDocumentsSnapshot());
  }
}
