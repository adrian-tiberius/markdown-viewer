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
import { createMarkdownViewerRuntime } from './create-markdown-viewer-runtime';
import type { ViewerUi } from './ui';

interface MarkdownViewerAppDeps {
  ui: ViewerUi;
  gateway: MarkdownGateway;
  formattingEngine: MarkdownFormattingEngine;
  externalUrlOpener: ExternalUrlOpener;
  updateService: UpdateService;
  initialDocumentPath?: string | null;
  settingsStore: ViewerSettingsStore;
  layoutStateStore: ViewerLayoutStateStore;
  scrollMemoryStore: ScrollMemoryStore;
  tabSessionStore: DocumentTabSessionStore;
  recentDocumentsStore: RecentDocumentsStore;
}

export class MarkdownViewerApp {
  private readonly deps: MarkdownViewerAppDeps;
  private readonly runtime: ReturnType<typeof createMarkdownViewerRuntime>;

  private cleanupRegistered = false;
  private beforeUnloadHandler: ((event: BeforeUnloadEvent) => void) | null = null;
  private disposed = false;
  private started = false;
  private lifecycleToken = 0;

  constructor(deps: MarkdownViewerAppDeps) {
    this.deps = deps;
    this.runtime = createMarkdownViewerRuntime({
      ui: this.deps.ui,
      gateway: this.deps.gateway,
      formattingEngine: this.deps.formattingEngine,
      externalUrlOpener: this.deps.externalUrlOpener,
      updateService: this.deps.updateService,
      settingsStore: this.deps.settingsStore,
      layoutStateStore: this.deps.layoutStateStore,
      scrollMemoryStore: this.deps.scrollMemoryStore,
      tabSessionStore: this.deps.tabSessionStore,
      recentDocumentsStore: this.deps.recentDocumentsStore,
      isDisposed: () => this.disposed,
      isLifecycleActive: (lifecycleToken: number) => this.isLifecycleActive(lifecycleToken),
      onErrorBanner: (message: string) => {
        this.showErrorBanner(message);
      },
      onActivateSafeMode: (reason: string, detail: string, source: string | null) => {
        this.activateSafeMode(reason, detail, source);
      },
    });
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.disposed = false;

    const lifecycleToken = ++this.lifecycleToken;
    this.runtime.uiBinder.bind();
    this.runtime.preferencesController.start();
    this.runtime.crashHandlerController.install();
    void this.runtime.runtimeListenerController.register(lifecycleToken);
    this.runtime.workspaceController.start(this.deps.initialDocumentPath?.trim() ?? null);

    if (!this.cleanupRegistered) {
      this.cleanupRegistered = true;
      this.beforeUnloadHandler = () => {
        void this.dispose();
      };
      window.addEventListener('beforeunload', this.beforeUnloadHandler);
    }
  }

  async dispose(): Promise<void> {
    this.started = false;
    this.disposed = true;
    this.lifecycleToken += 1;

    this.runtime.uiBinder.dispose();
    this.runtime.runtimeListenerController.dispose();

    this.runtime.permissionDialogController.resolve(false);
    this.runtime.commandController.resetForDispose();

    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
      this.beforeUnloadHandler = null;
      this.cleanupRegistered = false;
    }
    this.runtime.crashHandlerController.dispose();

    await this.runtime.workspaceController.dispose();
  }

  private isLifecycleActive(lifecycleToken: number): boolean {
    return this.started && !this.disposed && lifecycleToken === this.lifecycleToken;
  }

  private activateSafeMode(reason: string, detail: string, source: string | null): void {
    if (this.disposed) {
      return;
    }

    this.runtime.preferencesController.activateSafeMode();
    this.showErrorBanner(`${reason}: ${detail}`);
    if (source) {
      this.deps.ui.markdownContent.hidden = true;
      this.deps.ui.safeContent.hidden = false;
      this.deps.ui.safeContent.textContent = source;
    }
  }

  private showErrorBanner(message: string): void {
    this.deps.ui.errorText.textContent = message;
    this.deps.ui.errorBanner.classList.add('visible');
  }
}
