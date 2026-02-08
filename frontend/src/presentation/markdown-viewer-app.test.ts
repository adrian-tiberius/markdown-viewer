// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  DragDropEventPayload,
  FileUpdatedEvent,
  MarkdownFormattingEngine,
  MarkdownGateway,
  ScrollMemoryStore,
  ViewerSettingsStore,
} from './ports';
import { DEFAULT_SETTINGS, type ViewerSettings } from '../application/settings';
import {
  type MarkdownDocument,
  type RenderPreferences,
} from '../domain';
import { appShell } from './app-shell';
import { MarkdownViewerApp } from './markdown-viewer-app';
import { createViewerUi, mountShell } from './ui';

class FakeGateway implements MarkdownGateway {
  pickResult: string | null = '/tmp/spec.md';
  nextDocument: MarkdownDocument = {
    path: '/tmp/spec.md',
    title: 'Spec',
    source: '# Spec',
    html: '<p>Hello world</p>',
    toc: [],
    wordCount: 2,
    readingTimeMinutes: 1,
  };

  loadCalls: Array<{ path: string; preferences: RenderPreferences }> = [];
  startWatchCalls: string[] = [];
  stopWatchCalls = 0;
  protected fileUpdatedHandler: ((event: FileUpdatedEvent) => void) | null = null;
  protected dragDropHandler: ((event: DragDropEventPayload) => void) | null = null;

  async pickMarkdownFile(): Promise<string | null> {
    return this.pickResult;
  }

  async loadMarkdownFile(
    path: string,
    preferences: RenderPreferences
  ): Promise<MarkdownDocument> {
    this.loadCalls.push({ path, preferences });
    return {
      ...this.nextDocument,
      path,
    };
  }

  async startMarkdownWatch(path: string): Promise<void> {
    this.startWatchCalls.push(path);
  }

  async stopMarkdownWatch(): Promise<void> {
    this.stopWatchCalls += 1;
  }

  async onMarkdownFileUpdated(handler: (event: FileUpdatedEvent) => void): Promise<() => void> {
    this.fileUpdatedHandler = handler;
    return () => {
      if (this.fileUpdatedHandler === handler) {
        this.fileUpdatedHandler = null;
      }
    };
  }

  async onDragDrop(handler: (event: DragDropEventPayload) => void): Promise<() => void> {
    this.dragDropHandler = handler;
    return () => {
      if (this.dragDropHandler === handler) {
        this.dragDropHandler = null;
      }
    };
  }

  emitFileUpdated(path: string): void {
    this.fileUpdatedHandler?.({ path });
  }

  emitDrop(paths: string[]): void {
    this.dragDropHandler?.({ type: 'drop', paths });
  }
}

class MemorySettingsStore implements ViewerSettingsStore {
  private settings: ViewerSettings;

  constructor(settings: ViewerSettings = { ...DEFAULT_SETTINGS }) {
    this.settings = settings;
  }

  load(): ViewerSettings {
    return {
      ...this.settings,
      wordCountRules: { ...this.settings.wordCountRules },
      tocCollapsed: { ...this.settings.tocCollapsed },
    };
  }

  save(next: ViewerSettings): void {
    this.settings = {
      ...next,
      wordCountRules: { ...next.wordCountRules },
      tocCollapsed: { ...next.tocCollapsed },
    };
  }
}

class MemoryScrollStore implements ScrollMemoryStore {
  clearCalls = 0;
  private memory: Record<string, number> = {};

  load(): Record<string, number> {
    return { ...this.memory };
  }

  save(next: Record<string, number>): void {
    this.memory = { ...next };
  }

  clear(): void {
    this.clearCalls += 1;
    this.memory = {};
  }
}

class FakeFormattingEngine implements MarkdownFormattingEngine {
  async renderMath(): Promise<void> {}

  async highlightCodeElement(): Promise<void> {}
}

interface SetupOptions {
  gateway?: FakeGateway;
  formattingEngine?: MarkdownFormattingEngine;
  settingsStore?: MemorySettingsStore;
  scrollStore?: MemoryScrollStore;
}

function setupApp(options: SetupOptions = {}) {
  document.body.innerHTML = '<div id="app"></div>';
  mountShell('#app', appShell());

  const ui = createViewerUi();
  const gateway = options.gateway ?? new FakeGateway();
  const formattingEngine = options.formattingEngine ?? new FakeFormattingEngine();
  const settingsStore = options.settingsStore ?? new MemorySettingsStore();
  const scrollStore = options.scrollStore ?? new MemoryScrollStore();
  const app = new MarkdownViewerApp({
    ui,
    gateway,
    formattingEngine,
    settingsStore,
    scrollMemoryStore: scrollStore,
  });
  app.start();

  return {
    app,
    gateway,
    scrollStore,
    ui,
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

class DeferredLoadGateway extends FakeGateway {
  private loadCount = 0;
  private readonly firstLoad = deferred<MarkdownDocument>();

  override async loadMarkdownFile(
    path: string,
    preferences: RenderPreferences
  ): Promise<MarkdownDocument> {
    this.loadCalls.push({ path, preferences });
    this.loadCount += 1;
    if (this.loadCount === 1) {
      return this.firstLoad.promise;
    }
    return {
      ...this.nextDocument,
      path,
      title: 'Fresh Spec',
    };
  }

  rejectFirstLoad(reason: unknown): void {
    this.firstLoad.reject(reason);
  }
}

class DelayedRegistrationGateway extends FakeGateway {
  fileUpdatedUnlistenCalls = 0;
  dragDropUnlistenCalls = 0;
  private fileUpdatedRegistrationResolvers: Array<(value: () => void) => void> = [];
  private dragDropRegistrationResolvers: Array<(value: () => void) => void> = [];

  override async onMarkdownFileUpdated(
    handler: (event: FileUpdatedEvent) => void
  ): Promise<() => void> {
    this.fileUpdatedHandler = handler;
    return new Promise<() => void>((resolve) => {
      this.fileUpdatedRegistrationResolvers.push(resolve);
    });
  }

  override async onDragDrop(handler: (event: DragDropEventPayload) => void): Promise<() => void> {
    this.dragDropHandler = handler;
    return new Promise<() => void>((resolve) => {
      this.dragDropRegistrationResolvers.push(resolve);
    });
  }

  resolveNextFileUpdatedRegistration(): void {
    const resolve = this.fileUpdatedRegistrationResolvers.shift();
    if (!resolve) {
      return;
    }
    const handler = this.fileUpdatedHandler;
    resolve(() => {
      this.fileUpdatedUnlistenCalls += 1;
      if (this.fileUpdatedHandler === handler) {
        this.fileUpdatedHandler = null;
      }
    });
  }

  resolveNextDragDropRegistration(): void {
    const resolve = this.dragDropRegistrationResolvers.shift();
    if (!resolve) {
      return;
    }
    const handler = this.dragDropHandler;
    resolve(() => {
      this.dragDropUnlistenCalls += 1;
      if (this.dragDropHandler === handler) {
        this.dragDropHandler = null;
      }
    });
  }
}

describe('MarkdownViewerApp', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(async () => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('loads the picked file and starts watching it', async () => {
    const context = setupApp();

    await flushMicrotasks();
    context.ui.openButton.click();
    await vi.waitFor(() => {
      expect(context.gateway.loadCalls).toHaveLength(1);
      expect(context.gateway.startWatchCalls).toEqual(['/tmp/spec.md']);
    });

    expect(context.gateway.loadCalls[0]?.path).toBe('/tmp/spec.md');
    expect(context.ui.title.textContent).toBe('Spec');
    expect(context.ui.path.textContent).toBe('/tmp/spec.md');

    await context.app.dispose();
  });

  it('reloads on watcher event only for the current document path', async () => {
    vi.useFakeTimers();
    const context = setupApp();

    await flushMicrotasks();
    context.ui.openButton.click();
    await flushMicrotasks();

    expect(context.gateway.loadCalls).toHaveLength(1);

    context.gateway.emitFileUpdated('/tmp/another.md');
    vi.advanceTimersByTime(400);
    await flushMicrotasks();
    expect(context.gateway.loadCalls).toHaveLength(1);

    context.gateway.emitFileUpdated('/TMP/SPEC.MD');
    vi.advanceTimersByTime(400);
    await flushMicrotasks();
    expect(context.gateway.loadCalls).toHaveLength(1);

    context.gateway.emitFileUpdated('/tmp/spec.md');
    vi.advanceTimersByTime(400);
    await flushMicrotasks();
    expect(context.gateway.loadCalls).toHaveLength(2);

    await context.app.dispose();
  });

  it('clears persisted scroll memory from the settings action', async () => {
    const context = setupApp();

    context.ui.clearScrollMemory.click();
    expect(context.scrollStore.clearCalls).toBe(1);

    await context.app.dispose();
  });

  it('cancels pending reload timer on dispose', async () => {
    vi.useFakeTimers();
    const context = setupApp();

    await flushMicrotasks();
    context.ui.openButton.click();
    await flushMicrotasks();

    expect(context.gateway.loadCalls).toHaveLength(1);

    context.gateway.emitFileUpdated('/tmp/spec.md');
    await context.app.dispose();

    vi.advanceTimersByTime(400);
    await flushMicrotasks();

    expect(context.gateway.loadCalls).toHaveLength(1);
  });

  it('removes global crash handlers on dispose', async () => {
    const context = setupApp();

    expect(context.ui.safeToggle.checked).toBe(false);
    await context.app.dispose();

    window.dispatchEvent(new ErrorEvent('error', { message: 'boom' }));
    expect(context.ui.safeToggle.checked).toBe(false);
  });

  it('ignores stale failures from superseded load requests', async () => {
    const gateway = new DeferredLoadGateway();
    const context = setupApp({ gateway });

    await flushMicrotasks();
    context.ui.openButton.click();
    await flushMicrotasks();
    context.ui.openButton.click();

    await vi.waitFor(() => {
      expect(gateway.loadCalls).toHaveLength(2);
      expect(context.ui.title.textContent).toBe('Fresh Spec');
      expect(context.ui.subtitle.textContent).toBe('Ready');
    });

    gateway.rejectFirstLoad(new Error('stale failure'));
    await flushMicrotasks();

    expect(context.ui.errorBanner.classList.contains('visible')).toBe(false);
    expect(context.ui.subtitle.textContent).toBe('Ready');

    await context.app.dispose();
  });

  it('cleans up listeners that register after dispose', async () => {
    const gateway = new DelayedRegistrationGateway();
    const context = setupApp({ gateway });

    await context.app.dispose();

    gateway.resolveNextFileUpdatedRegistration();
    await flushMicrotasks();

    expect(gateway.fileUpdatedUnlistenCalls).toBe(1);
  });

  it('ignores late listener registration from a previous lifecycle', async () => {
    const gateway = new DelayedRegistrationGateway();
    const context = setupApp({ gateway });

    await context.app.dispose();
    context.app.start();
    await flushMicrotasks();

    gateway.resolveNextFileUpdatedRegistration();
    await flushMicrotasks();
    expect(gateway.fileUpdatedUnlistenCalls).toBe(1);

    gateway.resolveNextFileUpdatedRegistration();
    await flushMicrotasks();
    gateway.resolveNextDragDropRegistration();
    await flushMicrotasks();

    await context.app.dispose();
    expect(gateway.fileUpdatedUnlistenCalls).toBe(2);
    expect(gateway.dragDropUnlistenCalls).toBe(1);
  });

  it('does not duplicate UI listeners when start is called more than once', async () => {
    const context = setupApp();
    context.app.start();

    await flushMicrotasks();
    context.ui.openButton.click();
    await flushMicrotasks();

    expect(context.gateway.loadCalls).toHaveLength(1);

    await context.app.dispose();
  });

  it('removes UI listeners during dispose', async () => {
    const context = setupApp();

    await context.app.dispose();
    context.ui.openButton.click();
    await flushMicrotasks();

    expect(context.gateway.loadCalls).toHaveLength(0);
  });
});
