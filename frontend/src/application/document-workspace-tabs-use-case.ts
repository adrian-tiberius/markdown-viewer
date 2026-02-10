import type {
  CloseDocumentTabResult,
  DocumentTabState,
} from './document-tabs';
import type { DocumentLoadResult } from './document-load-use-case';

interface LoadOptions {
  restartWatch: boolean;
  restoreScroll: boolean;
}

interface OpenInTabOptions {
  activateTab: boolean;
  restartWatch: boolean;
  restoreScroll: boolean;
}

interface WorkspaceSessionPort {
  tabStateSnapshot(): DocumentTabState;
  replaceTabState(state: DocumentTabState): void;
  openTab(path: string, options: { activate: boolean }): void;
  closeTab(path: string): CloseDocumentTabResult;
  hasTabs(): boolean;
  activePath(): string | null;
  adjacentPath(direction: 'next' | 'previous'): string | null;
}

export type CloseTabOutcome = 'unchanged' | 'workspace-empty' | 'activated-next';

interface DocumentWorkspaceTabsUseCaseDeps {
  session: WorkspaceSessionPort;
  loadDocument: (path: string, options: LoadOptions) => Promise<DocumentLoadResult>;
  currentDocumentPath: () => string | null;
  persistScroll: () => void;
}

export class DocumentWorkspaceTabsUseCase {
  private readonly deps: DocumentWorkspaceTabsUseCaseDeps;

  constructor(deps: DocumentWorkspaceTabsUseCaseDeps) {
    this.deps = deps;
  }

  async activateTab(path: string): Promise<void> {
    if (path === this.deps.currentDocumentPath()) {
      return;
    }

    await this.openInTab(path, {
      activateTab: true,
      restartWatch: true,
      restoreScroll: true,
    });
  }

  async openInTab(path: string, options: OpenInTabOptions): Promise<void> {
    const normalizedPath = path.trim();
    if (!normalizedPath) {
      return;
    }

    this.deps.persistScroll();
    const previousTabState = this.deps.session.tabStateSnapshot();
    this.deps.session.openTab(normalizedPath, {
      activate: options.activateTab,
    });

    const result = await this.deps.loadDocument(normalizedPath, {
      restartWatch: options.restartWatch,
      restoreScroll: options.restoreScroll,
    });

    if (result === 'failed-before-load') {
      this.deps.session.replaceTabState(previousTabState);
    }
  }

  async closeTab(path: string): Promise<CloseTabOutcome> {
    const previousTabState = this.deps.session.tabStateSnapshot();
    const closed = this.deps.session.closeTab(path);
    if (!closed.removed || !closed.closedActive) {
      return 'unchanged';
    }

    this.deps.persistScroll();
    if (!this.deps.session.hasTabs()) {
      return 'workspace-empty';
    }

    const nextPath = closed.nextActivePath;
    if (!nextPath) {
      return 'unchanged';
    }

    const result = await this.deps.loadDocument(nextPath, {
      restartWatch: true,
      restoreScroll: true,
    });

    if (result === 'failed-before-load') {
      this.deps.session.replaceTabState(previousTabState);
      return 'unchanged';
    }

    return 'activated-next';
  }

  async closeActiveTab(): Promise<CloseTabOutcome> {
    const activePath = this.deps.session.activePath() ?? this.deps.currentDocumentPath();
    if (!activePath) {
      return 'unchanged';
    }

    return this.closeTab(activePath);
  }

  async activateAdjacentTab(direction: 'next' | 'previous'): Promise<void> {
    const targetPath = this.deps.session.adjacentPath(direction);
    if (!targetPath || targetPath === this.deps.currentDocumentPath()) {
      return;
    }

    await this.openInTab(targetPath, {
      activateTab: true,
      restartWatch: true,
      restoreScroll: true,
    });
  }
}
