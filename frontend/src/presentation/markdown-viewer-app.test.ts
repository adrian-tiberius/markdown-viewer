// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixtureMainMarkdown from '../../../test-fixtures/link-behavior/main.md?raw';

import type {
  DocumentTabSessionStore,
  DragDropEventPayload,
  ExternalUrlOpener,
  FileUpdatedEvent,
  MarkdownFormattingEngine,
  MarkdownGateway,
  RecentDocumentsStore,
  ScrollMemoryStore,
  UpdateService,
  ViewerLayoutStateStore,
  ViewerSettingsStore,
} from '../application/ports';
import {
  DEFAULT_SETTINGS,
  type ViewerSettings,
} from '../application/settings';
import { MEASURE_WIDTH_MIN } from '../application/reader-layout';
import {
  type MarkdownDocument,
  type RenderPreferences,
} from '../domain';
import { appShell } from './app-shell';
import { MarkdownViewerApp } from './markdown-viewer-app';
import { createViewerUi, mountShell } from './ui';

interface FixtureLink {
  label: string;
  href: string;
}

function extractFixtureLinks(markdown: string): FixtureLink[] {
  const links: FixtureLink[] = [];
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match = regex.exec(markdown);
  while (match) {
    links.push({
      label: match[1].trim(),
      href: match[2].trim(),
    });
    match = regex.exec(markdown);
  }
  return links;
}

const FIXTURE_MAIN_FILE_URL = new URL('../../../test-fixtures/link-behavior/main.md', import.meta.url);
const FIXTURE_MAIN_PATH = normalizeFixturePath(FIXTURE_MAIN_FILE_URL.pathname);
const FIXTURE_LINKS = extractFixtureLinks(fixtureMainMarkdown);

function normalizeFixturePath(pathname: string): string {
  const decoded = decodeURIComponent(pathname);
  return decoded.startsWith('/@fs/') ? decoded.slice('/@fs'.length) : decoded;
}

function fixtureLink(href: string): FixtureLink {
  const entry = FIXTURE_LINKS.find((candidate) => candidate.href === href);
  if (!entry) {
    throw new Error(`Fixture link not found for href: ${href}`);
  }
  return entry;
}

function fixtureLinkTargetPath(href: string): string {
  return normalizeFixturePath(new URL(href, FIXTURE_MAIN_FILE_URL).pathname);
}

function findLinkByLabel(container: HTMLElement, label: string): HTMLAnchorElement | null {
  const links = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href]'));
  return links.find((link) => (link.textContent ?? '').trim() === label) ?? null;
}

function findTabButtonByPath(container: HTMLElement, path: string): HTMLButtonElement | null {
  const encoded = encodeURIComponent(path);
  const buttons = Array.from(
    container.querySelectorAll<HTMLButtonElement>('button[data-tab-action="activate"]')
  );
  return buttons.find((button) => button.dataset.path === encoded) ?? null;
}

function findTabCloseButtonByPath(container: HTMLElement, path: string): HTMLButtonElement | null {
  const encoded = encodeURIComponent(path);
  const buttons = Array.from(
    container.querySelectorAll<HTMLButtonElement>('button[data-tab-action="close"]')
  );
  return buttons.find((button) => button.dataset.path === encoded) ?? null;
}

function findRecentDocumentButtonByPath(
  container: HTMLElement,
  path: string
): HTMLButtonElement | null {
  const encoded = encodeURIComponent(path);
  const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button[data-recent-open]'));
  return buttons.find((button) => button.dataset.path === encoded) ?? null;
}

function activeCommandAction(container: HTMLElement): string | null {
  const activeButton = container.querySelector<HTMLButtonElement>(
    '.command-palette-item.active button[data-command-action]'
  );
  return activeButton?.dataset.commandAction ?? null;
}

async function allowPermission(ui: ReturnType<typeof createViewerUi>): Promise<void> {
  ui.permissionAllowButton.click();
  await flushMicrotasks();
}

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
  launchPath: string | null = null;
  protected fileUpdatedHandler: ((event: FileUpdatedEvent) => void) | null = null;
  protected dragDropHandler: ((event: DragDropEventPayload) => void) | null = null;
  protected openPathHandler: ((path: string) => void) | null = null;

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

  async consumeLaunchOpenPath(): Promise<string | null> {
    const path = this.launchPath;
    this.launchPath = null;
    return path;
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

  async onOpenPathRequested(handler: (path: string) => void): Promise<() => void> {
    this.openPathHandler = handler;
    return () => {
      if (this.openPathHandler === handler) {
        this.openPathHandler = null;
      }
    };
  }

  emitFileUpdated(path: string): void {
    this.fileUpdatedHandler?.({ path });
  }

  emitDrop(paths: string[]): void {
    this.dragDropHandler?.({ type: 'drop', paths });
  }

  emitOpenPath(path: string): void {
    this.openPathHandler?.(path);
  }
}

class PathSelectiveFailureGateway extends FakeGateway {
  failingPaths = new Set<string>();

  override async loadMarkdownFile(
    path: string,
    preferences: RenderPreferences
  ): Promise<MarkdownDocument> {
    this.loadCalls.push({ path, preferences });
    if (this.failingPaths.has(path)) {
      throw new Error(`load failed for ${path}`);
    }
    return {
      ...this.nextDocument,
      path,
    };
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

  snapshot(): ViewerSettings {
    return this.load();
  }
}

class MemoryLayoutStateStore implements ViewerLayoutStateStore {
  private state = {
    leftSidebarCollapsed: false,
    rightSidebarCollapsed: false,
  };

  constructor(
    initial: { leftSidebarCollapsed: boolean; rightSidebarCollapsed: boolean } = {
      leftSidebarCollapsed: false,
      rightSidebarCollapsed: false,
    }
  ) {
    this.state = { ...initial };
  }

  load() {
    return { ...this.state };
  }

  save(next: { leftSidebarCollapsed: boolean; rightSidebarCollapsed: boolean }): void {
    this.state = { ...next };
  }

  snapshot() {
    return this.load();
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

class MemoryTabSessionStore implements DocumentTabSessionStore {
  private session = {
    tabPaths: [] as string[],
    activePath: null as string | null,
  };

  constructor(
    initial: { tabPaths: string[]; activePath: string | null } = {
      tabPaths: [],
      activePath: null,
    }
  ) {
    this.session = {
      tabPaths: [...initial.tabPaths],
      activePath: initial.activePath,
    };
  }

  load() {
    return this.snapshot();
  }

  save(next: { tabPaths: string[]; activePath: string | null }): void {
    this.session = {
      tabPaths: [...next.tabPaths],
      activePath: next.activePath,
    };
  }

  snapshot() {
    return {
      tabPaths: [...this.session.tabPaths],
      activePath: this.session.activePath,
    };
  }
}

class MemoryRecentDocumentsStore implements RecentDocumentsStore {
  private state = {
    entries: [] as Array<{ path: string; title: string }>,
  };

  constructor(
    initial: {
      entries: Array<{ path: string; title: string }>;
    } = {
      entries: [],
    }
  ) {
    this.state = {
      entries: initial.entries.map((entry) => ({ ...entry })),
    };
  }

  load() {
    return this.snapshot();
  }

  save(next: { entries: Array<{ path: string; title: string }> }): void {
    this.state = {
      entries: next.entries.map((entry) => ({ ...entry })),
    };
  }

  snapshot() {
    return {
      entries: this.state.entries.map((entry) => ({ ...entry })),
    };
  }
}

class FakeFormattingEngine implements MarkdownFormattingEngine {
  async renderMathToHtml(): Promise<string> {
    return '';
  }

  async highlightCodeToHtml(): Promise<string> {
    return '';
  }
}

class FakeExternalUrlOpener implements ExternalUrlOpener {
  openUrlCalls: string[] = [];
  openPathCalls: Array<{ path: string; sourceDocumentPath: string }> = [];
  openPathError: Error | null = null;

  async openExternalUrl(url: string): Promise<void> {
    this.openUrlCalls.push(url);
  }

  async openExternalPath(path: string, sourceDocumentPath: string): Promise<void> {
    this.openPathCalls.push({ path, sourceDocumentPath });
    if (this.openPathError) {
      throw this.openPathError;
    }
  }
}

class FakeUpdaterService implements UpdateService {
  async checkForUpdates() {
    return { status: 'up-to-date' } as const;
  }
}

interface SetupOptions {
  gateway?: FakeGateway;
  formattingEngine?: MarkdownFormattingEngine;
  externalUrlOpener?: ExternalUrlOpener;
  updateService?: UpdateService;
  initialDocumentPath?: string | null;
  settingsStore?: MemorySettingsStore;
  layoutStore?: MemoryLayoutStateStore;
  scrollStore?: MemoryScrollStore;
  tabSessionStore?: MemoryTabSessionStore;
  recentDocumentsStore?: MemoryRecentDocumentsStore;
}

function setupApp(options: SetupOptions = {}) {
  document.body.innerHTML = '<div id="app"></div>';
  mountShell('#app', appShell());

  const ui = createViewerUi();
  const gateway = options.gateway ?? new FakeGateway();
  const formattingEngine = options.formattingEngine ?? new FakeFormattingEngine();
  const externalUrlOpener = options.externalUrlOpener ?? new FakeExternalUrlOpener();
  const updateService = options.updateService ?? new FakeUpdaterService();
  const settingsStore = options.settingsStore ?? new MemorySettingsStore();
  const layoutStore = options.layoutStore ?? new MemoryLayoutStateStore();
  const scrollStore = options.scrollStore ?? new MemoryScrollStore();
  const tabSessionStore = options.tabSessionStore ?? new MemoryTabSessionStore();
  const recentDocumentsStore = options.recentDocumentsStore ?? new MemoryRecentDocumentsStore();
  const app = new MarkdownViewerApp({
    ui,
    gateway,
    formattingEngine,
    externalUrlOpener,
    updateService,
    initialDocumentPath: options.initialDocumentPath,
    settingsStore,
    layoutStateStore: layoutStore,
    scrollMemoryStore: scrollStore,
    tabSessionStore,
    recentDocumentsStore,
  });
  app.start();

  return {
    app,
    gateway,
    externalUrlOpener,
    settingsStore,
    layoutStore,
    scrollStore,
    tabSessionStore,
    recentDocumentsStore,
    ui,
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function dispatchShortcut(
  target: EventTarget,
  options: {
    key: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
  }
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: options.key,
    ctrlKey: options.ctrlKey ?? false,
    metaKey: options.metaKey ?? false,
    shiftKey: options.shiftKey ?? false,
    altKey: options.altKey ?? false,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
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

class RenderRaceGateway extends FakeGateway {
  private loadCount = 0;

  override async loadMarkdownFile(
    path: string,
    preferences: RenderPreferences
  ): Promise<MarkdownDocument> {
    this.loadCalls.push({ path, preferences });
    this.loadCount += 1;

    if (this.loadCount === 1) {
      return {
        path: '/tmp/old/doc.md',
        title: 'Old Spec',
        source: '# Old Spec',
        html: Array.from({ length: 120 }, (_, index) => `<p>Old line ${index}</p>`).join(''),
        toc: [],
        wordCount: 120,
        readingTimeMinutes: 1,
      };
    }

    return {
      path: '/tmp/new/doc.md',
      title: 'New Spec',
      source: '# New Spec',
      html: '<p><a href="child.md">Child</a></p>',
      toc: [],
      wordCount: 2,
      readingTimeMinutes: 1,
    };
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

  it('loads startup markdown path from launch arguments', async () => {
    const gateway = new FakeGateway();
    gateway.launchPath = '/tmp/startup.md';
    const context = setupApp({ gateway });

    await vi.waitFor(() => {
      expect(context.gateway.loadCalls).toHaveLength(1);
      expect(context.gateway.loadCalls[0]?.path).toBe('/tmp/startup.md');
    });

    await context.app.dispose();
  });

  it('opens markdown paths from runtime open-path requests and ignores non-markdown paths', async () => {
    const context = setupApp();

    await flushMicrotasks();
    context.gateway.emitOpenPath('/tmp/notes.txt');
    await flushMicrotasks();
    expect(context.gateway.loadCalls).toHaveLength(0);

    context.gateway.emitOpenPath('/tmp/manual-open.md');
    await vi.waitFor(() => {
      expect(context.gateway.loadCalls).toHaveLength(1);
      expect(context.gateway.loadCalls[0]?.path).toBe('/tmp/manual-open.md');
    });

    await context.app.dispose();
  });

  it('opens multiple markdown files as tabs and switches active tab on click', async () => {
    const context = setupApp();

    await flushMicrotasks();
    context.ui.openButton.click();
    await flushMicrotasks();

    context.gateway.pickResult = '/tmp/notes.md';
    context.ui.openButton.click();
    await flushMicrotasks();

    expect(context.gateway.loadCalls.map((call) => call.path)).toEqual([
      '/tmp/spec.md',
      '/tmp/notes.md',
    ]);
    expect(context.ui.tabList.querySelectorAll('.doc-tab-item')).toHaveLength(2);
    expect(context.ui.path.textContent).toBe('/tmp/notes.md');

    const firstTabButton = findTabButtonByPath(context.ui.tabList, '/tmp/spec.md');
    expect(firstTabButton).toBeTruthy();
    firstTabButton!.click();
    await flushMicrotasks();

    expect(context.gateway.loadCalls).toHaveLength(3);
    expect(context.gateway.loadCalls[2]?.path).toBe('/tmp/spec.md');
    expect(context.ui.path.textContent).toBe('/tmp/spec.md');
    expect(
      context.ui.tabList.querySelector<HTMLButtonElement>('.doc-tab-item.active .doc-tab-button')
        ?.dataset.path
    ).toBe(encodeURIComponent('/tmp/spec.md'));

    await context.app.dispose();
  });

  it('restores previous tab state when opening a new tab fails to load', async () => {
    const gateway = new PathSelectiveFailureGateway();
    const tabSessionStore = new MemoryTabSessionStore();
    const context = setupApp({ gateway, tabSessionStore });
    try {
      await flushMicrotasks();
      context.ui.openButton.click();
      await flushMicrotasks();

      gateway.pickResult = '/tmp/broken.md';
      gateway.failingPaths.add('/tmp/broken.md');
      context.ui.openButton.click();

      await vi.waitFor(() => {
        expect(context.gateway.loadCalls.map((call) => call.path)).toEqual([
          '/tmp/spec.md',
          '/tmp/broken.md',
        ]);
      });
      await vi.waitFor(() => {
        expect(context.ui.tabList.querySelectorAll('.doc-tab-item')).toHaveLength(1);
      });
      expect(
        context.ui.tabList.querySelector<HTMLButtonElement>('.doc-tab-item.active .doc-tab-button')
          ?.dataset.path
      ).toBe(encodeURIComponent('/tmp/spec.md'));
      expect(context.ui.path.textContent).toBe('/tmp/spec.md');
      expect(context.tabSessionStore.snapshot()).toEqual({
        tabPaths: ['/tmp/spec.md'],
        activePath: '/tmp/spec.md',
      });
    } finally {
      await context.app.dispose();
    }
  });

  it('persists tab workspace session when tabs open and active tab changes', async () => {
    const tabSessionStore = new MemoryTabSessionStore();
    const context = setupApp({ tabSessionStore });

    await flushMicrotasks();
    context.ui.openButton.click();
    await flushMicrotasks();

    context.gateway.pickResult = '/tmp/notes.md';
    context.ui.openButton.click();
    await flushMicrotasks();

    expect(context.tabSessionStore.snapshot()).toEqual({
      tabPaths: ['/tmp/spec.md', '/tmp/notes.md'],
      activePath: '/tmp/notes.md',
    });

    const firstTabButton = findTabButtonByPath(context.ui.tabList, '/tmp/spec.md');
    expect(firstTabButton).toBeTruthy();
    firstTabButton!.click();
    await flushMicrotasks();

    expect(context.tabSessionStore.snapshot()).toEqual({
      tabPaths: ['/tmp/spec.md', '/tmp/notes.md'],
      activePath: '/tmp/spec.md',
    });

    await context.app.dispose();
  });

  it('restores persisted tabs and active tab on startup', async () => {
    const tabSessionStore = new MemoryTabSessionStore({
      tabPaths: ['/tmp/spec.md', '/tmp/notes.md'],
      activePath: '/tmp/notes.md',
    });
    const context = setupApp({ tabSessionStore });

    await vi.waitFor(() => {
      expect(context.gateway.loadCalls).toHaveLength(1);
    });

    expect(context.gateway.loadCalls[0]?.path).toBe('/tmp/notes.md');
    expect(context.ui.tabList.querySelectorAll('.doc-tab-item')).toHaveLength(2);
    expect(
      context.ui.tabList.querySelector<HTMLButtonElement>('.doc-tab-item.active .doc-tab-button')
        ?.dataset.path
    ).toBe(encodeURIComponent('/tmp/notes.md'));
    expect(context.ui.path.textContent).toBe('/tmp/notes.md');

    await context.app.dispose();
  });

  it('uses the initial document path instead of persisted tabs when one is provided', async () => {
    const tabSessionStore = new MemoryTabSessionStore({
      tabPaths: ['/tmp/spec.md', '/tmp/notes.md'],
      activePath: '/tmp/notes.md',
    });
    const context = setupApp({
      initialDocumentPath: '/tmp/from-query.md',
      tabSessionStore,
    });

    await vi.waitFor(() => {
      expect(context.gateway.loadCalls).toHaveLength(1);
    });

    expect(context.gateway.loadCalls[0]?.path).toBe('/tmp/from-query.md');
    expect(context.ui.tabList.querySelectorAll('.doc-tab-item')).toHaveLength(1);
    expect(context.ui.path.textContent).toBe('/tmp/from-query.md');
    expect(context.tabSessionStore.snapshot()).toEqual({
      tabPaths: ['/tmp/from-query.md'],
      activePath: '/tmp/from-query.md',
    });

    await context.app.dispose();
  });

  it('preserves persisted tab workspace session across dispose', async () => {
    const tabSessionStore = new MemoryTabSessionStore();
    const context = setupApp({ tabSessionStore });

    await flushMicrotasks();
    context.ui.openButton.click();
    await flushMicrotasks();

    expect(context.tabSessionStore.snapshot()).toEqual({
      tabPaths: ['/tmp/spec.md'],
      activePath: '/tmp/spec.md',
    });

    await context.app.dispose();

    expect(context.tabSessionStore.snapshot()).toEqual({
      tabPaths: ['/tmp/spec.md'],
      activePath: '/tmp/spec.md',
    });
  });

  it('renders persisted recent documents and opens selected entries', async () => {
    const recentDocumentsStore = new MemoryRecentDocumentsStore({
      entries: [
        { path: '/tmp/guide.md', title: 'guide.md' },
        { path: '/tmp/spec.md', title: 'spec.md' },
      ],
    });
    const context = setupApp({ recentDocumentsStore });

    expect(context.ui.recentDocumentsList.querySelectorAll('button[data-recent-open]')).toHaveLength(2);
    const recentButton = findRecentDocumentButtonByPath(context.ui.recentDocumentsList, '/tmp/guide.md');
    expect(recentButton).toBeTruthy();

    recentButton!.click();
    await vi.waitFor(() => {
      expect(context.gateway.loadCalls).toHaveLength(1);
    });
    expect(context.gateway.loadCalls[0]?.path).toBe('/tmp/guide.md');
    expect(context.ui.path.textContent).toBe('/tmp/guide.md');

    await context.app.dispose();
  });

  it('updates and clears recent documents from viewer actions', async () => {
    const recentDocumentsStore = new MemoryRecentDocumentsStore();
    const context = setupApp({ recentDocumentsStore });

    await flushMicrotasks();
    context.ui.openButton.click();
    await vi.waitFor(() => {
      expect(context.gateway.loadCalls).toHaveLength(1);
    });

    context.gateway.pickResult = '/tmp/notes.md';
    context.ui.openButton.click();
    await vi.waitFor(() => {
      expect(context.gateway.loadCalls).toHaveLength(2);
    });

    expect(context.recentDocumentsStore.snapshot().entries).toEqual([
      { path: '/tmp/notes.md', title: 'notes.md' },
      { path: '/tmp/spec.md', title: 'spec.md' },
    ]);
    expect(context.ui.recentDocumentsList.querySelectorAll('button[data-recent-open]')).toHaveLength(2);

    context.ui.clearRecentDocuments.click();
    expect(context.recentDocumentsStore.snapshot().entries).toEqual([]);
    expect(context.ui.recentDocumentsList.textContent).toContain('No recent documents');

    await context.app.dispose();
  });

  it('opens command palette, runs find command, and navigates matches', async () => {
    const gateway = new FakeGateway();
    gateway.nextDocument = {
      ...gateway.nextDocument,
      html: '<p>alpha beta alpha gamma alpha</p>',
    };
    const context = setupApp({ gateway });

    await flushMicrotasks();
    context.ui.openButton.click();
    await vi.waitFor(() => {
      expect(context.gateway.loadCalls).toHaveLength(1);
    });

    dispatchShortcut(window, { key: 'k', ctrlKey: true });
    expect(context.ui.commandPalette.classList.contains('visible')).toBe(true);

    context.ui.commandPaletteInput.value = 'find in document';
    context.ui.commandPaletteInput.dispatchEvent(new Event('input', { bubbles: true }));
    const findCommand = context.ui.commandPaletteList.querySelector<HTMLButtonElement>(
      'button[data-command-action="open-find"]'
    );
    expect(findCommand).toBeTruthy();
    findCommand!.click();

    expect(context.ui.findBar.classList.contains('visible')).toBe(true);
    context.ui.findInput.value = 'alpha';
    context.ui.findInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(context.ui.findCount.textContent).toBe('1 / 3');
    expect(context.ui.markdownContent.querySelectorAll('mark.mdv-find-match')).toHaveLength(3);

    context.ui.findNext.click();
    await flushMicrotasks();
    expect(context.ui.findCount.textContent).toBe('2 / 3');

    context.ui.findPrev.click();
    await flushMicrotasks();
    expect(context.ui.findCount.textContent).toBe('1 / 3');

    await context.app.dispose();
  });

  it('shows instructions dialog from command palette and closes it with escape', async () => {
    const context = setupApp();

    dispatchShortcut(window, { key: 'k', ctrlKey: true });
    expect(context.ui.commandPalette.classList.contains('visible')).toBe(true);

    context.ui.showShortcutsHelpButton.click();
    expect(context.ui.commandPalette.classList.contains('visible')).toBe(false);
    expect(context.ui.shortcutsDialog.classList.contains('visible')).toBe(true);

    const escapeEvent = dispatchShortcut(window, { key: 'Escape' });
    expect(escapeEvent.defaultPrevented).toBe(true);
    expect(context.ui.shortcutsDialog.classList.contains('visible')).toBe(false);

    await context.app.dispose();
  });

  it('navigates command palette results with keyboard arrows and executes selection on enter', async () => {
    const context = setupApp();

    dispatchShortcut(window, { key: 'k', ctrlKey: true });
    expect(context.ui.commandPalette.classList.contains('visible')).toBe(true);
    expect(activeCommandAction(context.ui.commandPaletteList)).toBe('open-file');

    const downEvent = dispatchShortcut(window, { key: 'ArrowDown' });
    expect(downEvent.defaultPrevented).toBe(true);
    expect(activeCommandAction(context.ui.commandPaletteList)).toBe('reload-document');

    const upEvent = dispatchShortcut(window, { key: 'ArrowUp' });
    expect(upEvent.defaultPrevented).toBe(true);
    expect(activeCommandAction(context.ui.commandPaletteList)).toBe('open-file');

    const wrapUpEvent = dispatchShortcut(window, { key: 'ArrowUp' });
    expect(wrapUpEvent.defaultPrevented).toBe(true);
    expect(activeCommandAction(context.ui.commandPaletteList)).toBe('show-shortcuts-help');

    const enterEvent = dispatchShortcut(window, { key: 'Enter' });
    expect(enterEvent.defaultPrevented).toBe(true);
    expect(context.ui.commandPalette.classList.contains('visible')).toBe(false);
    expect(context.ui.shortcutsDialog.classList.contains('visible')).toBe(true);

    await context.app.dispose();
  });

  it('handles command palette keyboard input when no commands match', async () => {
    const context = setupApp();

    dispatchShortcut(window, { key: 'k', ctrlKey: true });
    context.ui.commandPaletteInput.value = 'zzz no such command';
    context.ui.commandPaletteInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(context.ui.commandPaletteList.textContent).toContain('No commands found');

    const downEvent = dispatchShortcut(window, { key: 'ArrowDown' });
    expect(downEvent.defaultPrevented).toBe(true);
    expect(context.ui.commandPalette.classList.contains('visible')).toBe(true);

    const enterEvent = dispatchShortcut(window, { key: 'Enter' });
    expect(enterEvent.defaultPrevented).toBe(true);
    expect(context.ui.commandPalette.classList.contains('visible')).toBe(true);

    await context.app.dispose();
  });

  it('opens find bar with keyboard shortcut and closes it with escape', async () => {
    const context = setupApp();

    dispatchShortcut(window, { key: 'f', ctrlKey: true });
    expect(context.ui.findBar.classList.contains('visible')).toBe(true);

    const escapeEvent = dispatchShortcut(window, { key: 'Escape' });
    expect(escapeEvent.defaultPrevented).toBe(true);
    expect(context.ui.findBar.classList.contains('visible')).toBe(false);

    await context.app.dispose();
  });

  it('handles keyboard shortcuts for file actions and tab traversal', async () => {
    const context = setupApp();
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

    dispatchShortcut(window, { key: 'o', ctrlKey: true });
    await vi.waitFor(() => {
      expect(context.gateway.loadCalls).toHaveLength(1);
    });
    expect(context.gateway.loadCalls[0]?.path).toBe('/tmp/spec.md');

    dispatchShortcut(window, { key: 'r', ctrlKey: true });
    await vi.waitFor(() => {
      expect(context.gateway.loadCalls).toHaveLength(2);
    });
    expect(context.gateway.loadCalls[1]?.path).toBe('/tmp/spec.md');

    context.gateway.pickResult = '/tmp/notes.md';
    dispatchShortcut(window, { key: 'o', ctrlKey: true });
    await vi.waitFor(() => {
      expect(context.gateway.loadCalls).toHaveLength(3);
    });
    expect(context.gateway.loadCalls[2]?.path).toBe('/tmp/notes.md');

    dispatchShortcut(window, { key: 'Tab', ctrlKey: true });
    await vi.waitFor(() => {
      expect(context.gateway.loadCalls).toHaveLength(4);
    });
    expect(context.gateway.loadCalls[3]?.path).toBe('/tmp/spec.md');

    dispatchShortcut(window, { key: 'Tab', ctrlKey: true, shiftKey: true });
    await vi.waitFor(() => {
      expect(context.gateway.loadCalls).toHaveLength(5);
    });
    expect(context.gateway.loadCalls[4]?.path).toBe('/tmp/notes.md');

    dispatchShortcut(window, { key: 'w', ctrlKey: true });
    await vi.waitFor(() => {
      expect(context.gateway.loadCalls).toHaveLength(6);
    });
    expect(context.gateway.loadCalls[5]?.path).toBe('/tmp/spec.md');
    expect(context.ui.tabList.querySelectorAll('.doc-tab-item')).toHaveLength(1);

    dispatchShortcut(window, { key: 'p', ctrlKey: true });
    expect(printSpy).toHaveBeenCalledTimes(1);

    await context.app.dispose();
  });

  it('ignores global shortcuts when the keyboard target is editable', async () => {
    const context = setupApp();

    dispatchShortcut(context.ui.measureWidth, { key: 'o', ctrlKey: true });
    await flushMicrotasks();

    expect(context.gateway.loadCalls).toHaveLength(0);
    await context.app.dispose();
  });

  it('closes the active tab and activates a remaining tab', async () => {
    const context = setupApp();

    await flushMicrotasks();
    context.ui.openButton.click();
    await flushMicrotasks();

    context.gateway.pickResult = '/tmp/notes.md';
    context.ui.openButton.click();
    await flushMicrotasks();

    const closeButton = findTabCloseButtonByPath(context.ui.tabList, '/tmp/notes.md');
    expect(closeButton).toBeTruthy();
    closeButton!.click();
    await flushMicrotasks();

    expect(context.gateway.loadCalls).toHaveLength(3);
    expect(context.gateway.loadCalls[2]?.path).toBe('/tmp/spec.md');
    expect(context.ui.path.textContent).toBe('/tmp/spec.md');
    expect(context.ui.tabList.querySelectorAll('.doc-tab-item')).toHaveLength(1);

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

  it('keeps link resolution bound to the latest document after interleaved renders', async () => {
    const queuedFrames: FrameRequestCallback[] = [];
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback): number => {
        queuedFrames.push(callback);
        return queuedFrames.length;
      });

    const gateway = new RenderRaceGateway();
    const settingsStore = new MemorySettingsStore({
      ...DEFAULT_SETTINGS,
      performanceMode: true,
    });
    const context = setupApp({
      gateway,
      settingsStore,
    });

    const flushQueuedFrames = async (): Promise<void> => {
      let processed = 0;
      while (queuedFrames.length > 0) {
        const frame = queuedFrames.shift();
        if (!frame) {
          break;
        }
        frame(performance.now());
        await flushMicrotasks();
        processed += 1;
        if (processed > 400) {
          throw new Error('requestAnimationFrame queue did not settle');
        }
      }
    };

    try {
      await flushMicrotasks();

      context.ui.openButton.click();
      await flushMicrotasks();

      context.gateway.pickResult = '/tmp/other.md';
      context.ui.openButton.click();
      await flushMicrotasks();

      await flushQueuedFrames();
      await vi.waitFor(() => {
        expect(context.gateway.loadCalls).toHaveLength(2);
      });

      const link = findLinkByLabel(context.ui.markdownContent, 'Child');
      expect(link).toBeTruthy();
      link!.click();
      await allowPermission(context.ui);

      await vi.waitFor(() => {
        expect(context.gateway.loadCalls).toHaveLength(3);
      });
      expect(context.gateway.loadCalls[2]?.path).toBe('/tmp/new/child.md');
    } finally {
      requestAnimationFrameSpy.mockRestore();
      await context.app.dispose();
    }
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

  it('toggles sidebars and persists collapse preferences', async () => {
    const context = setupApp();

    expect(context.ui.workspace.classList.contains('left-collapsed')).toBe(false);
    expect(context.ui.workspace.classList.contains('right-collapsed')).toBe(false);
    expect(context.ui.toggleLeftSidebarButton.textContent).toBe('Hide Outline');
    expect(context.ui.toggleRightSidebarButton.textContent).toBe('Hide Reading');

    context.ui.toggleLeftSidebarButton.click();
    expect(context.ui.workspace.classList.contains('left-collapsed')).toBe(true);
    expect(context.ui.toggleLeftSidebarButton.textContent).toBe('Show Outline');
    expect(context.layoutStore.snapshot().leftSidebarCollapsed).toBe(true);

    context.ui.toggleRightSidebarButton.click();
    expect(context.ui.workspace.classList.contains('right-collapsed')).toBe(true);
    expect(context.ui.toggleRightSidebarButton.textContent).toBe('Show Reading');
    expect(context.layoutStore.snapshot().rightSidebarCollapsed).toBe(true);

    await context.app.dispose();
  });

  it('applies persisted sidebar collapse state on startup', async () => {
    const context = setupApp({
      layoutStore: new MemoryLayoutStateStore({
        leftSidebarCollapsed: true,
        rightSidebarCollapsed: true,
      }),
    });

    expect(context.ui.workspace.classList.contains('left-collapsed')).toBe(true);
    expect(context.ui.workspace.classList.contains('right-collapsed')).toBe(true);
    expect(context.ui.toggleLeftSidebarButton.textContent).toBe('Show Outline');
    expect(context.ui.toggleRightSidebarButton.textContent).toBe('Show Reading');

    await context.app.dispose();
  });

  it('uses full available viewer width when measure width is set to the current slider maximum', async () => {
    const context = setupApp();

    const dynamicMax = Number(context.ui.measureWidth.max);
    context.ui.measureWidth.value = dynamicMax.toString();
    context.ui.measureWidth.dispatchEvent(new Event('input', { bubbles: true }));

    expect(document.documentElement.style.getPropertyValue('--reader-measure-width')).toBe('100%');
    expect(context.settingsStore.snapshot().measureWidth).toBe(dynamicMax);

    await context.app.dispose();
  });

  it('recalculates measure width max on resize and keeps max selection pinned', async () => {
    const context = setupApp();
    const viewerScroll = context.ui.viewerScroll;

    Object.defineProperty(viewerScroll, 'clientWidth', {
      configurable: true,
      value: 1000,
    });
    window.dispatchEvent(new Event('resize'));

    const firstMax = Number(context.ui.measureWidth.max);
    expect(firstMax).toBeGreaterThanOrEqual(MEASURE_WIDTH_MIN);

    context.ui.measureWidth.value = firstMax.toString();
    context.ui.measureWidth.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.documentElement.style.getPropertyValue('--reader-measure-width')).toBe('100%');

    Object.defineProperty(viewerScroll, 'clientWidth', {
      configurable: true,
      value: 1400,
    });
    window.dispatchEvent(new Event('resize'));

    const secondMax = Number(context.ui.measureWidth.max);
    expect(secondMax).toBeGreaterThanOrEqual(firstMax);
    expect(Number(context.ui.measureWidth.value)).toBe(secondMax);
    expect(context.settingsStore.snapshot().measureWidth).toBe(secondMax);
    expect(document.documentElement.style.getPropertyValue('--reader-measure-width')).toBe('100%');

    await context.app.dispose();
  });

  it('journey: open document, navigate anchor, open linked markdown in tab, switch and close tab', async () => {
    const markdownFileLink = fixtureLink('./secondary.md');
    const legacyAnchorLink = fixtureLink('#html');
    const gateway = new FakeGateway();
    gateway.pickResult = FIXTURE_MAIN_PATH;
    gateway.nextDocument = {
      ...gateway.nextDocument,
      path: FIXTURE_MAIN_PATH,
      html: `<h2><a id="mdv-inline-html" aria-hidden="true"></a>Inline HTML</h2><p><a href="${legacyAnchorLink.href}">${legacyAnchorLink.label}</a></p><p><a href="${markdownFileLink.href}">${markdownFileLink.label}</a></p>`,
    };
    const context = setupApp({ gateway });

    await flushMicrotasks();
    context.ui.openButton.click();
    await flushMicrotasks();
    expect(context.gateway.loadCalls).toHaveLength(1);
    expect(context.ui.path.textContent).toBe(FIXTURE_MAIN_PATH);

    const heading = context.ui.markdownContent.querySelector<HTMLElement>('h2');
    expect(heading).toBeTruthy();
    const scrollIntoViewMock = vi.fn();
    Object.defineProperty(heading!, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock,
    });

    const anchorLink = findLinkByLabel(context.ui.markdownContent, legacyAnchorLink.label);
    expect(anchorLink).toBeTruthy();
    const anchorClick = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchorLink!.dispatchEvent(anchorClick);
    expect(anchorClick.defaultPrevented).toBe(true);
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);

    const markdownLink = findLinkByLabel(context.ui.markdownContent, markdownFileLink.label);
    expect(markdownLink).toBeTruthy();
    const markdownClick = new MouseEvent('click', { bubbles: true, cancelable: true });
    markdownLink!.dispatchEvent(markdownClick);
    await flushMicrotasks();

    expect(markdownClick.defaultPrevented).toBe(true);
    expect(context.ui.permissionDialog.classList.contains('visible')).toBe(true);
    await allowPermission(context.ui);
    expect(context.gateway.loadCalls).toHaveLength(2);
    expect(context.ui.tabList.querySelectorAll('.doc-tab-item')).toHaveLength(2);

    const firstTab = findTabButtonByPath(context.ui.tabList, FIXTURE_MAIN_PATH);
    expect(firstTab).toBeTruthy();
    firstTab!.click();
    await flushMicrotasks();
    expect(context.ui.path.textContent).toBe(FIXTURE_MAIN_PATH);

    const secondClose = findTabCloseButtonByPath(
      context.ui.tabList,
      fixtureLinkTargetPath(markdownFileLink.href)
    );
    expect(secondClose).toBeTruthy();
    secondClose!.click();
    await flushMicrotasks();
    expect(context.ui.tabList.querySelectorAll('.doc-tab-item')).toHaveLength(1);

    await context.app.dispose();
  });

  it('journey: request external link permission, then collapse sidebars and expand reader width', async () => {
    const externalLink = fixtureLink('https://example.com');
    const gateway = new FakeGateway();
    gateway.pickResult = FIXTURE_MAIN_PATH;
    gateway.nextDocument = {
      ...gateway.nextDocument,
      path: FIXTURE_MAIN_PATH,
      html: `<p><a href="${externalLink.href}">${externalLink.label}</a></p>`,
    };
    const externalUrlOpener = new FakeExternalUrlOpener();
    const context = setupApp({ gateway, externalUrlOpener });

    await flushMicrotasks();
    context.ui.openButton.click();
    await flushMicrotasks();

    const link = findLinkByLabel(context.ui.markdownContent, externalLink.label);
    expect(link).toBeTruthy();
    const firstClick = new MouseEvent('click', { bubbles: true, cancelable: true });
    link!.dispatchEvent(firstClick);
    expect(firstClick.defaultPrevented).toBe(true);
    expect(context.ui.permissionDialog.classList.contains('visible')).toBe(true);
    context.ui.permissionCancelButton.click();
    await flushMicrotasks();
    expect(externalUrlOpener.openUrlCalls).toEqual([]);

    const secondClick = new MouseEvent('click', { bubbles: true, cancelable: true });
    link!.dispatchEvent(secondClick);
    expect(secondClick.defaultPrevented).toBe(true);
    await allowPermission(context.ui);
    expect(externalUrlOpener.openUrlCalls).toEqual([new URL(externalLink.href).toString()]);

    context.ui.toggleLeftSidebarButton.click();
    context.ui.toggleRightSidebarButton.click();
    expect(context.ui.workspace.classList.contains('left-collapsed')).toBe(true);
    expect(context.ui.workspace.classList.contains('right-collapsed')).toBe(true);

    const dynamicMax = Number(context.ui.measureWidth.max);
    context.ui.measureWidth.value = dynamicMax.toString();
    context.ui.measureWidth.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.documentElement.style.getPropertyValue('--reader-measure-width')).toBe('100%');

    await context.app.dispose();
  });

  it('resolves in-document anchors by link text when the fragment is legacy-style', async () => {
    const legacyAnchorLink = fixtureLink('#html');
    const gateway = new FakeGateway();
    gateway.pickResult = FIXTURE_MAIN_PATH;
    gateway.nextDocument = {
      ...gateway.nextDocument,
      path: FIXTURE_MAIN_PATH,
      html: `<h2><a id="mdv-inline-html" aria-hidden="true"></a>Inline HTML</h2><p><a href="${legacyAnchorLink.href}">${legacyAnchorLink.label}</a></p>`,
    };
    const context = setupApp({ gateway });

    await flushMicrotasks();
    context.ui.openButton.click();
    await flushMicrotasks();

    const heading = context.ui.markdownContent.querySelector<HTMLElement>('h2');
    expect(heading).toBeTruthy();
    const scrollIntoViewMock = vi.fn();
    Object.defineProperty(heading!, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock,
    });

    const link = context.ui.markdownContent.querySelector<HTMLAnchorElement>(
      `a[href="${legacyAnchorLink.href}"]`
    );
    expect(link).toBeTruthy();
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    link!.dispatchEvent(clickEvent);

    expect(clickEvent.defaultPrevented).toBe(true);
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
    await context.app.dispose();
  });

  it('resolves in-document anchors by id when heading id is on nested anchor elements', async () => {
    const gateway = new FakeGateway();
    gateway.pickResult = FIXTURE_MAIN_PATH;
    gateway.nextDocument = {
      ...gateway.nextDocument,
      path: FIXTURE_MAIN_PATH,
      html: '<h2><a id="mdv-overview" aria-hidden="true"></a>Overview</h2><p><a href="#overview">Jump now</a></p>',
    };
    const context = setupApp({ gateway });

    await flushMicrotasks();
    context.ui.openButton.click();
    await flushMicrotasks();

    const heading = context.ui.markdownContent.querySelector<HTMLElement>('h2');
    expect(heading).toBeTruthy();
    const scrollIntoViewMock = vi.fn();
    Object.defineProperty(heading!, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock,
    });

    const link = context.ui.markdownContent.querySelector<HTMLAnchorElement>('a[href="#overview"]');
    expect(link).toBeTruthy();

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    link!.dispatchEvent(clickEvent);

    expect(clickEvent.defaultPrevented).toBe(true);
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
    await context.app.dispose();
  });

  it('resolves legacy shorthand anchors from markdown syntax docs style tables of contents', async () => {
    const gateway = new FakeGateway();
    gateway.pickResult = FIXTURE_MAIN_PATH;
    gateway.nextDocument = {
      ...gateway.nextDocument,
      path: FIXTURE_MAIN_PATH,
      html: [
        '<ul>',
        '<li><a href="#overview">Overview</a></li>',
        '<li><a href="#html">Inline HTML</a></li>',
        '<li><a href="#p">Paragraphs and Line Breaks</a></li>',
        '</ul>',
        '<h2><a id="mdv-overview" aria-hidden="true"></a>Overview</h2>',
        '<h3><a id="mdv-inline-html" aria-hidden="true"></a>Inline HTML</h3>',
        '<h3><a id="mdv-paragraphs-and-line-breaks" aria-hidden="true"></a>Paragraphs and Line Breaks</h3>',
      ].join(''),
    };
    const context = setupApp({ gateway });

    await flushMicrotasks();
    context.ui.openButton.click();
    await flushMicrotasks();

    const heading = Array.from(context.ui.markdownContent.querySelectorAll<HTMLElement>('h3')).find(
      (candidate) => (candidate.textContent ?? '').trim() === 'Paragraphs and Line Breaks'
    );
    expect(heading).toBeTruthy();
    const scrollIntoViewMock = vi.fn();
    Object.defineProperty(heading!, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock,
    });

    const link = context.ui.markdownContent.querySelector<HTMLAnchorElement>('a[href="#p"]');
    expect(link).toBeTruthy();

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    link!.dispatchEvent(clickEvent);

    expect(clickEvent.defaultPrevented).toBe(true);
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
    await context.app.dispose();
  });

  it('asks permission before opening external URLs with the external opener', async () => {
    const externalLink = fixtureLink('https://example.com');
    const gateway = new FakeGateway();
    gateway.pickResult = FIXTURE_MAIN_PATH;
    gateway.nextDocument = {
      ...gateway.nextDocument,
      path: FIXTURE_MAIN_PATH,
      html: `<p><a href="${externalLink.href}">${externalLink.label}</a></p>`,
    };
    const externalUrlOpener = new FakeExternalUrlOpener();
    const context = setupApp({ gateway, externalUrlOpener });

    await flushMicrotasks();
    context.ui.openButton.click();
    await flushMicrotasks();

    const link = findLinkByLabel(context.ui.markdownContent, externalLink.label);
    expect(link).toBeTruthy();
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    link!.dispatchEvent(clickEvent);

    expect(clickEvent.defaultPrevented).toBe(true);
    expect(context.ui.permissionDialog.classList.contains('visible')).toBe(true);
    expect(context.ui.permissionTarget.textContent).toBe(new URL(externalLink.href).toString());
    expect(externalUrlOpener.openUrlCalls).toEqual([]);
    await allowPermission(context.ui);
    expect(externalUrlOpener.openUrlCalls).toEqual([new URL(externalLink.href).toString()]);
    expect(context.gateway.loadCalls).toHaveLength(1);

    await context.app.dispose();
  });

  it('asks for confirmation and opens markdown file links in a new tab', async () => {
    const markdownFileLink = fixtureLink('./secondary.md');
    const gateway = new FakeGateway();
    gateway.pickResult = FIXTURE_MAIN_PATH;
    gateway.nextDocument = {
      ...gateway.nextDocument,
      path: FIXTURE_MAIN_PATH,
      html: `<p><a href="${markdownFileLink.href}">${markdownFileLink.label}</a></p>`,
    };
    const context = setupApp({ gateway });

    await flushMicrotasks();
    context.ui.openButton.click();
    await flushMicrotasks();

    const link = findLinkByLabel(context.ui.markdownContent, markdownFileLink.label);
    expect(link).toBeTruthy();

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    link!.dispatchEvent(clickEvent);
    await flushMicrotasks();

    expect(clickEvent.defaultPrevented).toBe(true);
    expect(context.ui.permissionDialog.classList.contains('visible')).toBe(true);
    expect(context.ui.permissionTarget.textContent).toBe(
      fixtureLinkTargetPath(markdownFileLink.href)
    );
    await allowPermission(context.ui);
    expect(context.gateway.loadCalls).toHaveLength(2);
    expect(context.gateway.loadCalls[1]?.path).toBe(fixtureLinkTargetPath(markdownFileLink.href));
    expect(context.ui.path.textContent).toBe(fixtureLinkTargetPath(markdownFileLink.href));
    expect(context.ui.tabList.querySelectorAll('.doc-tab-item')).toHaveLength(2);

    await context.app.dispose();
  });

  it('asks for confirmation and opens non-markdown file links with system app', async () => {
    const fileLink = fixtureLink('./assets/sample.txt');
    const gateway = new FakeGateway();
    gateway.pickResult = FIXTURE_MAIN_PATH;
    gateway.nextDocument = {
      ...gateway.nextDocument,
      path: FIXTURE_MAIN_PATH,
      html: `<p><a href="${fileLink.href}">${fileLink.label}</a></p>`,
    };
    const externalUrlOpener = new FakeExternalUrlOpener();
    const context = setupApp({ gateway, externalUrlOpener });

    await flushMicrotasks();
    context.ui.openButton.click();
    await flushMicrotasks();

    const link = findLinkByLabel(context.ui.markdownContent, fileLink.label);
    expect(link).toBeTruthy();

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    link!.dispatchEvent(clickEvent);
    await flushMicrotasks();

    expect(clickEvent.defaultPrevented).toBe(true);
    expect(context.ui.permissionDialog.classList.contains('visible')).toBe(true);
    expect(context.ui.permissionTarget.textContent).toBe(fixtureLinkTargetPath(fileLink.href));
    await allowPermission(context.ui);
    expect(externalUrlOpener.openPathCalls).toEqual([
      {
        path: fixtureLinkTargetPath(fileLink.href),
        sourceDocumentPath: FIXTURE_MAIN_PATH,
      },
    ]);

    await context.app.dispose();
  });

  it('blocks non-markdown links that point outside the current document directory tree', async () => {
    const gateway = new FakeGateway();
    gateway.pickResult = FIXTURE_MAIN_PATH;
    gateway.nextDocument = {
      ...gateway.nextDocument,
      path: FIXTURE_MAIN_PATH,
      html: '<p><a href="../outside.txt">Outside file</a></p>',
    };
    const externalUrlOpener = new FakeExternalUrlOpener();
    externalUrlOpener.openPathError = new Error('Linked file is outside allowed directory: /tmp');
    const context = setupApp({ gateway, externalUrlOpener });

    await flushMicrotasks();
    context.ui.openButton.click();
    await flushMicrotasks();

    const link = findLinkByLabel(context.ui.markdownContent, 'Outside file');
    expect(link).toBeTruthy();

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    link!.dispatchEvent(clickEvent);
    await flushMicrotasks();

    expect(clickEvent.defaultPrevented).toBe(true);
    expect(context.ui.permissionDialog.classList.contains('visible')).toBe(true);
    await allowPermission(context.ui);
    expect(externalUrlOpener.openPathCalls).toHaveLength(1);
    expect(context.ui.errorBanner.classList.contains('visible')).toBe(true);
    expect(context.ui.errorText.textContent).toContain('same folder or a subfolder');

    await context.app.dispose();
  });

  it('resolves same-document file-url anchors from fixture links', async () => {
    const sameDocAnchorLink = fixtureLink('./main.md#html');
    const legacyAnchorLink = fixtureLink('#html');
    const gateway = new FakeGateway();
    gateway.pickResult = FIXTURE_MAIN_PATH;
    gateway.nextDocument = {
      ...gateway.nextDocument,
      path: FIXTURE_MAIN_PATH,
      html: `<h2><a id="mdv-inline-html" aria-hidden="true"></a>Inline HTML</h2><p><a href="${sameDocAnchorLink.href}">${legacyAnchorLink.label}</a></p>`,
    };
    const context = setupApp({ gateway });

    await flushMicrotasks();
    context.ui.openButton.click();
    await flushMicrotasks();

    const heading = context.ui.markdownContent.querySelector<HTMLElement>('h2');
    expect(heading).toBeTruthy();
    const scrollIntoViewMock = vi.fn();
    Object.defineProperty(heading!, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock,
    });

    const link = findLinkByLabel(context.ui.markdownContent, legacyAnchorLink.label);
    expect(link).toBeTruthy();

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    link!.dispatchEvent(clickEvent);

    expect(clickEvent.defaultPrevented).toBe(true);
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
    expect(context.ui.permissionDialog.classList.contains('visible')).toBe(false);
    await context.app.dispose();
  });

  it('resolves same-document file-url anchors using alias links in the document', async () => {
    const sameDocAnchorLink = fixtureLink('./main.md#html');
    const legacyAnchorLink = fixtureLink('#html');
    const gateway = new FakeGateway();
    gateway.pickResult = FIXTURE_MAIN_PATH;
    gateway.nextDocument = {
      ...gateway.nextDocument,
      path: FIXTURE_MAIN_PATH,
      html: `<h2><a id="mdv-inline-html" aria-hidden="true"></a>Inline HTML</h2><p><a href="${legacyAnchorLink.href}">${legacyAnchorLink.label}</a></p><p><a href="${sameDocAnchorLink.href}">${sameDocAnchorLink.label}</a></p>`,
    };
    const context = setupApp({ gateway });

    await flushMicrotasks();
    context.ui.openButton.click();
    await flushMicrotasks();

    const heading = context.ui.markdownContent.querySelector<HTMLElement>('h2');
    expect(heading).toBeTruthy();
    const scrollIntoViewMock = vi.fn();
    Object.defineProperty(heading!, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock,
    });

    const link = findLinkByLabel(context.ui.markdownContent, sameDocAnchorLink.label);
    expect(link).toBeTruthy();

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    link!.dispatchEvent(clickEvent);

    expect(clickEvent.defaultPrevented).toBe(true);
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
    expect(context.ui.permissionDialog.classList.contains('visible')).toBe(false);
    await context.app.dispose();
  });
});
