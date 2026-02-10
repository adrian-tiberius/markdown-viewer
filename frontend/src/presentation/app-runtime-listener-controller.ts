import { isMarkdownPath } from '../application/path-utils';
import type {
  DragDropEvents,
  MarkdownFileUpdateEvents,
} from '../application/ports';
import { errorToMessage } from './error-utils';
import type { ViewerUi } from './ui';

interface AppRuntimeListenerControllerDeps {
  markdownFileUpdates: MarkdownFileUpdateEvents;
  dragDropEvents: DragDropEvents;
  ui: Pick<ViewerUi, 'dropOverlay'>;
  isLifecycleActive: (lifecycleToken: number) => boolean;
  onFileUpdated: (path: string) => void;
  onDroppedMarkdownPath: (path: string) => void;
  onError: (message: string) => void;
}

export class AppRuntimeListenerController {
  private readonly deps: AppRuntimeListenerControllerDeps;
  private fileUpdateUnlisten: (() => void) | null = null;
  private dragDropUnlisten: (() => void) | null = null;

  constructor(deps: AppRuntimeListenerControllerDeps) {
    this.deps = deps;
  }

  async register(lifecycleToken: number): Promise<void> {
    try {
      const fileUpdateUnlisten = await this.deps.markdownFileUpdates.onMarkdownFileUpdated((event) => {
        if (!this.deps.isLifecycleActive(lifecycleToken)) {
          return;
        }
        this.deps.onFileUpdated(event.path);
      });

      if (!this.deps.isLifecycleActive(lifecycleToken)) {
        fileUpdateUnlisten();
        return;
      }
      this.fileUpdateUnlisten = fileUpdateUnlisten;

      const dragDropUnlisten = await this.deps.dragDropEvents.onDragDrop((event) => {
        if (!this.deps.isLifecycleActive(lifecycleToken)) {
          return;
        }
        if (event.type === 'enter') {
          this.deps.ui.dropOverlay.classList.add('visible');
          return;
        }
        if (event.type === 'leave') {
          this.deps.ui.dropOverlay.classList.remove('visible');
          return;
        }
        if (event.type === 'over') {
          return;
        }

        this.deps.ui.dropOverlay.classList.remove('visible');
        const path = event.paths.find((candidate) => isMarkdownPath(candidate));
        if (path) {
          this.deps.onDroppedMarkdownPath(path);
        }
      });

      if (!this.deps.isLifecycleActive(lifecycleToken)) {
        dragDropUnlisten();
        return;
      }
      this.dragDropUnlisten = dragDropUnlisten;
    } catch (error) {
      this.deps.onError(errorToMessage(error));
    }
  }

  dispose(): void {
    this.fileUpdateUnlisten?.();
    this.fileUpdateUnlisten = null;

    this.dragDropUnlisten?.();
    this.dragDropUnlisten = null;

    this.deps.ui.dropOverlay.classList.remove('visible');
  }
}
