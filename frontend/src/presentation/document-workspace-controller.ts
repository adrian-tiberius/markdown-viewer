import type { CloseTabOutcome } from '../application/document-workspace-tabs-use-case';
import type {
  MarkdownFilePicker,
  MarkdownWatchController,
} from '../application/ports';
import type { TocEntry } from '../domain';
import { errorToMessage } from './error-utils';
import type { DocumentWorkspaceRuntime } from './document-workspace-runtime';

interface DocumentWorkspaceControllerDeps {
  runtime: DocumentWorkspaceRuntime;
  markdownFilePicker: MarkdownFilePicker;
  markdownWatch: MarkdownWatchController;
  onErrorBanner: (message: string) => void;
}

export class DocumentWorkspaceController {
  private readonly deps: DocumentWorkspaceControllerDeps;

  constructor(deps: DocumentWorkspaceControllerDeps) {
    this.deps = deps;
  }

  start(initialDocumentPath?: string | null): void {
    const { runtime } = this.deps;
    runtime.state.setDisposed(false);
    runtime.renderController.renderEmptyState();
    runtime.sessionController.start();

    const normalizedInitialPath = initialDocumentPath?.trim();
    if (normalizedInitialPath) {
      void runtime.tabsUseCase.openInTab(normalizedInitialPath, {
        activateTab: true,
        restartWatch: true,
        restoreScroll: true,
      });
      return;
    }

    const restoredPath = runtime.sessionController.restorePersistedTabs();
    if (restoredPath) {
      void runtime.loadDocument(restoredPath, {
        restartWatch: true,
        restoreScroll: true,
      });
    }
  }

  async dispose(): Promise<void> {
    const { runtime } = this.deps;
    runtime.state.setDisposed(true);

    runtime.reloadController.dispose();
    runtime.scrollController.dispose();
    runtime.loadController.dispose();
    runtime.renderController.dispose();

    await this.deps.markdownWatch.stopMarkdownWatch();
    runtime.state.clearCurrentDocument();
    runtime.sessionController.clearTabs();
    runtime.renderController.renderEmptyState();
  }

  async openPickedFile(): Promise<void> {
    const path = await this.deps.markdownFilePicker.pickMarkdownFile();
    if (!path) {
      return;
    }

    await this.deps.runtime.tabsUseCase.openInTab(path, {
      activateTab: true,
      restartWatch: true,
      restoreScroll: true,
    });
  }

  async reloadCurrentDocument(): Promise<void> {
    await this.deps.runtime.reloadCurrentDocument();
  }

  async activateTab(path: string): Promise<void> {
    await this.deps.runtime.tabsUseCase.activateTab(path);
  }

  async openRecentDocument(path: string): Promise<void> {
    await this.deps.runtime.tabsUseCase.openInTab(path, {
      activateTab: true,
      restartWatch: true,
      restoreScroll: true,
    });
  }

  async openDroppedMarkdownPath(path: string): Promise<void> {
    await this.deps.runtime.tabsUseCase.openInTab(path, {
      activateTab: true,
      restartWatch: true,
      restoreScroll: true,
    });
  }

  async closeTab(path: string): Promise<void> {
    const outcome = await this.deps.runtime.tabsUseCase.closeTab(path);
    await this.handleCloseTabOutcome(outcome);
  }

  async closeActiveTab(): Promise<void> {
    const outcome = await this.deps.runtime.tabsUseCase.closeActiveTab();
    await this.handleCloseTabOutcome(outcome);
  }

  async activateAdjacentTab(direction: 'next' | 'previous'): Promise<void> {
    await this.deps.runtime.tabsUseCase.activateAdjacentTab(direction);
  }

  async openMarkdownInNewTab(path: string): Promise<void> {
    try {
      await this.deps.runtime.tabsUseCase.openInTab(path, {
        activateTab: true,
        restartWatch: true,
        restoreScroll: true,
      });
    } catch (error) {
      this.deps.onErrorBanner(`Unable to open linked markdown file: ${errorToMessage(error)}`);
    }
  }

  async rerenderCurrentDocument(options: { restoreScroll: boolean }): Promise<void> {
    const currentDocument = this.deps.runtime.state.currentDocumentValue();
    if (!currentDocument) {
      return;
    }

    await this.deps.runtime.renderController.renderDocument(currentDocument);
    if (options.restoreScroll) {
      this.deps.runtime.scrollController.restore(currentDocument.path);
    }
  }

  hasCurrentDocument(): boolean {
    return this.deps.runtime.state.currentDocumentValue() !== null;
  }

  currentDocumentSource(): string | null {
    return this.deps.runtime.state.currentDocumentSource();
  }

  currentTocEntries(): TocEntry[] {
    return this.deps.runtime.state.currentTocEntries();
  }

  clearRecentDocuments(): void {
    this.deps.runtime.sessionController.clearRecentDocuments();
  }

  handleViewerScroll(): void {
    this.deps.runtime.scrollController.schedulePersist();
  }

  handleFileUpdated(path: string): void {
    this.deps.runtime.reloadController.handleFileUpdated(path);
  }

  private async handleCloseTabOutcome(outcome: CloseTabOutcome): Promise<void> {
    if (outcome !== 'workspace-empty') {
      return;
    }

    this.deps.runtime.state.clearCurrentDocument();
    await this.deps.markdownWatch.stopMarkdownWatch();
    this.deps.runtime.renderController.renderEmptyState();
  }
}
