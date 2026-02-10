import { shouldReloadForFileUpdate } from '../application/use-cases';

interface DocumentReloadControllerDeps {
  currentDocumentPath: () => string | null;
  reloadCurrentDocument: () => Promise<void>;
  isDisposed: () => boolean;
}

export class DocumentReloadController {
  private readonly deps: DocumentReloadControllerDeps;
  private reloadTimer: number | null = null;

  constructor(deps: DocumentReloadControllerDeps) {
    this.deps = deps;
  }

  dispose(): void {
    if (this.reloadTimer !== null) {
      window.clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }
  }

  handleFileUpdated(path: string): void {
    const currentPath = this.deps.currentDocumentPath();
    if (!shouldReloadForFileUpdate(currentPath, path)) {
      return;
    }

    this.scheduleReload();
  }

  private scheduleReload(): void {
    if (this.reloadTimer !== null) {
      window.clearTimeout(this.reloadTimer);
    }

    this.reloadTimer = window.setTimeout(() => {
      if (this.deps.isDisposed()) {
        return;
      }
      void this.deps.reloadCurrentDocument();
    }, 350);
  }
}
