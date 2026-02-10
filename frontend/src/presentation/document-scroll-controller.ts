import type { ScrollMemoryStore } from '../application/ports';
import type { ViewerUi } from './ui';

interface DocumentScrollControllerDeps {
  ui: Pick<ViewerUi, 'viewerScroll'>;
  scrollMemoryStore: ScrollMemoryStore;
  currentDocumentPath: () => string | null;
}

export class DocumentScrollController {
  private readonly deps: DocumentScrollControllerDeps;
  private scrollSaveTimer: number | null = null;

  constructor(deps: DocumentScrollControllerDeps) {
    this.deps = deps;
  }

  dispose(): void {
    if (this.scrollSaveTimer !== null) {
      window.clearTimeout(this.scrollSaveTimer);
      this.scrollSaveTimer = null;
    }
  }

  schedulePersist(): void {
    if (this.scrollSaveTimer !== null) {
      window.clearTimeout(this.scrollSaveTimer);
    }

    this.scrollSaveTimer = window.setTimeout(() => {
      this.persist();
    }, 140);
  }

  persist(): void {
    const path = this.deps.currentDocumentPath();
    if (!path) {
      return;
    }

    const all = this.deps.scrollMemoryStore.load();
    all[path] = this.deps.ui.viewerScroll.scrollTop;
    this.deps.scrollMemoryStore.save(all);
  }

  restore(path: string): void {
    const all = this.deps.scrollMemoryStore.load();
    const scrollTop = all[path];
    this.deps.ui.viewerScroll.scrollTop = typeof scrollTop === 'number' ? scrollTop : 0;
  }
}
