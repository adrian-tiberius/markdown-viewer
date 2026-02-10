import type { MarkdownDocument } from '../domain';
import type {
  MarkdownFileLoader,
  MarkdownWatchController,
} from './ports';
import type { ViewerSettings } from './settings';
import { renderPreferencesFromSettings } from './use-cases';

interface DocumentLoadOptions {
  restartWatch: boolean;
}

export type DocumentLoadResult = 'success' | 'failed-before-load' | 'failed-after-load' | 'stale';

interface DocumentLoadOutputPort {
  didStartLoading: () => void;
  didCompleteLoading: () => void;
  didFailLoading: () => void;
  showError: (message: string) => void;
  clearError: () => void;
  didLoadDocument: (requestedPath: string, document: MarkdownDocument) => void;
  renderDocument: (document: MarkdownDocument) => Promise<void>;
}

interface DocumentLoadUseCaseDeps {
  markdownLoader: MarkdownFileLoader;
  markdownWatch: MarkdownWatchController;
  getSettings: () => ViewerSettings;
  isDisposed: () => boolean;
  output: DocumentLoadOutputPort;
}

export class DocumentLoadUseCase {
  private readonly deps: DocumentLoadUseCaseDeps;
  private currentLoadNonce = 0;

  constructor(deps: DocumentLoadUseCaseDeps) {
    this.deps = deps;
  }

  dispose(): void {
    this.currentLoadNonce += 1;
  }

  async load(path: string, options: DocumentLoadOptions): Promise<DocumentLoadResult> {
    if (this.deps.isDisposed()) {
      return 'stale';
    }

    const nonce = ++this.currentLoadNonce;
    this.deps.output.didStartLoading();
    let loadedDocument = false;

    try {
      const loadedMarkdown = await this.deps.markdownLoader.loadMarkdownFile(
        path,
        renderPreferencesFromSettings(this.deps.getSettings())
      );

      if (this.isStale(nonce)) {
        return 'stale';
      }

      loadedDocument = true;
      this.deps.output.didLoadDocument(path, loadedMarkdown);
      this.deps.output.clearError();

      await this.deps.output.renderDocument(loadedMarkdown);
      if (this.isStale(nonce)) {
        return 'stale';
      }

      if (options.restartWatch) {
        await this.deps.markdownWatch.stopMarkdownWatch();
        if (this.isStale(nonce)) {
          return 'stale';
        }

        await this.deps.markdownWatch.startMarkdownWatch(loadedMarkdown.path);
        if (this.isStale(nonce)) {
          return 'stale';
        }
      }

      this.deps.output.didCompleteLoading();
      return 'success';
    } catch (error) {
      if (this.isStale(nonce)) {
        return 'stale';
      }

      const message = typeof error === 'string' ? error : error instanceof Error ? error.message : 'Unknown error';
      this.deps.output.showError(message);
      this.deps.output.didFailLoading();
      return loadedDocument ? 'failed-after-load' : 'failed-before-load';
    }
  }

  private isStale(nonce: number): boolean {
    return nonce !== this.currentLoadNonce || this.deps.isDisposed();
  }
}
