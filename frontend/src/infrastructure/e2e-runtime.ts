import type {
  AppVersionProvider,
  DiagnosticsReportWriter,
  DragDropEventPayload,
  ExternalUrlOpener,
  FileUpdatedEvent,
  MarkdownGateway,
  UpdateCheckResult,
  UpdateService,
} from '../application/ports';
import type { MarkdownDocument, RenderPreferences, TocEntry } from '../domain';

interface DocumentFixtureInput {
  path: string;
  title?: string;
  source: string;
  html: string;
  toc?: TocEntry[];
  wordCount?: number;
  readingTimeMinutes?: number;
}

interface DiagnosticsReportRecord {
  fileName: string;
  content: string;
}

interface GatewayCallLog {
  pickedFileCount: number;
  loadRequests: Array<{ path: string; preferences: RenderPreferences }>;
  watchStartRequests: string[];
  watchStopCount: number;
}

interface ExternalCallLog {
  urls: string[];
  paths: Array<{ path: string; sourceDocumentPath: string }>;
}

interface UpdaterCallLog {
  checks: number;
}

export interface MarkdownViewerE2eSnapshot {
  documents: MarkdownDocument[];
  loadFailures: Array<{ path: string; reason: string }>;
  launchOpenPath: string | null;
  pickMarkdownPath: string | null;
  watchedPath: string | null;
  appVersion: string;
  updateResult: UpdateCheckResult;
  diagnosticsReports: DiagnosticsReportRecord[];
  calls: {
    gateway: GatewayCallLog;
    external: ExternalCallLog;
    updater: UpdaterCallLog;
  };
}

export interface MarkdownViewerE2eControl {
  reset(): void;
  setDocument(input: DocumentFixtureInput): void;
  clearDocuments(): void;
  setLoadFailure(path: string, reason: string): void;
  clearLoadFailures(): void;
  setLaunchOpenPath(path: string | null): void;
  setPickMarkdownFileResult(path: string | null): void;
  setUpdateResult(result: UpdateCheckResult): void;
  setAppVersion(version: string): void;
  emitFileUpdated(path: string): void;
  emitOpenPath(path: string): void;
  emitDragDrop(event: DragDropEventPayload): void;
  snapshot(): MarkdownViewerE2eSnapshot;
}

interface E2eRuntimeAdapters {
  gateway: MarkdownGateway;
  externalUrlOpener: ExternalUrlOpener;
  updateService: UpdateService;
  appVersionProvider: AppVersionProvider;
  diagnosticsReportWriter: DiagnosticsReportWriter;
  control: MarkdownViewerE2eControl;
}

interface MutableE2eState {
  documentsByPath: Map<string, MarkdownDocument>;
  loadFailuresByPath: Map<string, string>;
  launchOpenPath: string | null;
  pickMarkdownPath: string | null;
  watchedPath: string | null;
  appVersion: string;
  updateResult: UpdateCheckResult;
  diagnosticsReports: DiagnosticsReportRecord[];
  calls: {
    gateway: GatewayCallLog;
    external: ExternalCallLog;
    updater: UpdaterCallLog;
  };
  listeners: {
    fileUpdated: Set<(event: FileUpdatedEvent) => void>;
    openPath: Set<(path: string) => void>;
    dragDrop: Set<(event: DragDropEventPayload) => void>;
  };
}

const DEFAULT_UPDATE_RESULT: UpdateCheckResult = { status: 'up-to-date' };

class E2eMarkdownGateway implements MarkdownGateway {
  private readonly state: MutableE2eState;

  constructor(state: MutableE2eState) {
    this.state = state;
  }

  async pickMarkdownFile(): Promise<string | null> {
    this.state.calls.gateway.pickedFileCount += 1;
    return this.state.pickMarkdownPath;
  }

  async loadMarkdownFile(path: string, preferences: RenderPreferences): Promise<MarkdownDocument> {
    const normalizedPath = normalizePath(path);
    this.state.calls.gateway.loadRequests.push({
      path: normalizedPath,
      preferences: clonePreferences(preferences),
    });

    const failReason = this.state.loadFailuresByPath.get(normalizedPath);
    if (failReason) {
      throw new Error(failReason);
    }

    const found = this.state.documentsByPath.get(normalizedPath);
    if (!found) {
      throw new Error(`No e2e markdown fixture found for path: ${normalizedPath}`);
    }

    return cloneDocument(found);
  }

  async startMarkdownWatch(path: string): Promise<void> {
    const normalizedPath = normalizePath(path);
    this.state.calls.gateway.watchStartRequests.push(normalizedPath);
    this.state.watchedPath = normalizedPath;
  }

  async stopMarkdownWatch(): Promise<void> {
    this.state.calls.gateway.watchStopCount += 1;
    this.state.watchedPath = null;
  }

  async consumeLaunchOpenPath(): Promise<string | null> {
    const current = this.state.launchOpenPath;
    this.state.launchOpenPath = null;
    return current;
  }

  async onMarkdownFileUpdated(handler: (event: FileUpdatedEvent) => void): Promise<() => void> {
    this.state.listeners.fileUpdated.add(handler);
    return () => {
      this.state.listeners.fileUpdated.delete(handler);
    };
  }

  async onOpenPathRequested(handler: (path: string) => void): Promise<() => void> {
    this.state.listeners.openPath.add(handler);
    return () => {
      this.state.listeners.openPath.delete(handler);
    };
  }

  async onDragDrop(handler: (event: DragDropEventPayload) => void): Promise<() => void> {
    this.state.listeners.dragDrop.add(handler);
    return () => {
      this.state.listeners.dragDrop.delete(handler);
    };
  }
}

class E2eExternalUrlOpener implements ExternalUrlOpener {
  private readonly state: MutableE2eState;

  constructor(state: MutableE2eState) {
    this.state = state;
  }

  async openExternalUrl(url: string): Promise<void> {
    this.state.calls.external.urls.push(url);
  }

  async openExternalPath(path: string, sourceDocumentPath: string): Promise<void> {
    this.state.calls.external.paths.push({
      path: normalizePath(path),
      sourceDocumentPath: normalizePath(sourceDocumentPath),
    });
  }
}

class E2eUpdateService implements UpdateService {
  private readonly state: MutableE2eState;

  constructor(state: MutableE2eState) {
    this.state = state;
  }

  async checkForUpdates(): Promise<UpdateCheckResult> {
    this.state.calls.updater.checks += 1;
    return cloneUpdateResult(this.state.updateResult);
  }
}

class E2eAppVersionProvider implements AppVersionProvider {
  private readonly state: MutableE2eState;

  constructor(state: MutableE2eState) {
    this.state = state;
  }

  async getAppVersion(): Promise<string> {
    return this.state.appVersion;
  }
}

class E2eDiagnosticsReportWriter implements DiagnosticsReportWriter {
  private readonly state: MutableE2eState;

  constructor(state: MutableE2eState) {
    this.state = state;
  }

  async saveReport(fileName: string, content: string): Promise<void> {
    this.state.diagnosticsReports.push({
      fileName,
      content,
    });
  }
}

class E2eControl implements MarkdownViewerE2eControl {
  private readonly state: MutableE2eState;

  constructor(state: MutableE2eState) {
    this.state = state;
  }

  reset(): void {
    this.state.documentsByPath.clear();
    this.state.loadFailuresByPath.clear();
    this.state.launchOpenPath = null;
    this.state.pickMarkdownPath = null;
    this.state.watchedPath = null;
    this.state.appVersion = '0.0.0-e2e';
    this.state.updateResult = cloneUpdateResult(DEFAULT_UPDATE_RESULT);
    this.state.diagnosticsReports = [];
    this.state.calls = emptyCallLog();
  }

  setDocument(input: DocumentFixtureInput): void {
    const document = documentFromFixture(input);
    if (!document.path) {
      return;
    }
    this.state.documentsByPath.set(document.path, document);
  }

  clearDocuments(): void {
    this.state.documentsByPath.clear();
  }

  setLoadFailure(path: string, reason: string): void {
    const normalizedPath = normalizePath(path);
    const normalizedReason = reason.trim();
    if (!normalizedPath || !normalizedReason) {
      return;
    }
    this.state.loadFailuresByPath.set(normalizedPath, normalizedReason);
  }

  clearLoadFailures(): void {
    this.state.loadFailuresByPath.clear();
  }

  setLaunchOpenPath(path: string | null): void {
    this.state.launchOpenPath = normalizeOptionalPath(path);
  }

  setPickMarkdownFileResult(path: string | null): void {
    this.state.pickMarkdownPath = normalizeOptionalPath(path);
  }

  setUpdateResult(result: UpdateCheckResult): void {
    this.state.updateResult = cloneUpdateResult(result);
  }

  setAppVersion(version: string): void {
    const trimmed = version.trim();
    this.state.appVersion = trimmed || '0.0.0-e2e';
  }

  emitFileUpdated(path: string): void {
    const normalizedPath = normalizePath(path);
    if (!normalizedPath) {
      return;
    }
    const payload: FileUpdatedEvent = {
      path: normalizedPath,
    };
    for (const listener of this.state.listeners.fileUpdated) {
      listener(payload);
    }
  }

  emitOpenPath(path: string): void {
    const normalizedPath = normalizePath(path);
    if (!normalizedPath) {
      return;
    }
    for (const listener of this.state.listeners.openPath) {
      listener(normalizedPath);
    }
  }

  emitDragDrop(event: DragDropEventPayload): void {
    const payload = cloneDragDropEvent(event);
    for (const listener of this.state.listeners.dragDrop) {
      listener(payload);
    }
  }

  snapshot(): MarkdownViewerE2eSnapshot {
    return {
      documents: Array.from(this.state.documentsByPath.values()).map((document) =>
        cloneDocument(document)
      ),
      loadFailures: Array.from(this.state.loadFailuresByPath.entries()).map(([path, reason]) => ({
        path,
        reason,
      })),
      launchOpenPath: this.state.launchOpenPath,
      pickMarkdownPath: this.state.pickMarkdownPath,
      watchedPath: this.state.watchedPath,
      appVersion: this.state.appVersion,
      updateResult: cloneUpdateResult(this.state.updateResult),
      diagnosticsReports: this.state.diagnosticsReports.map((entry) => ({ ...entry })),
      calls: {
        gateway: {
          pickedFileCount: this.state.calls.gateway.pickedFileCount,
          loadRequests: this.state.calls.gateway.loadRequests.map((request) => ({
            path: request.path,
            preferences: clonePreferences(request.preferences),
          })),
          watchStartRequests: [...this.state.calls.gateway.watchStartRequests],
          watchStopCount: this.state.calls.gateway.watchStopCount,
        },
        external: {
          urls: [...this.state.calls.external.urls],
          paths: this.state.calls.external.paths.map((entry) => ({ ...entry })),
        },
        updater: {
          checks: this.state.calls.updater.checks,
        },
      },
    };
  }
}

function createMutableState(): MutableE2eState {
  return {
    documentsByPath: new Map<string, MarkdownDocument>(),
    loadFailuresByPath: new Map<string, string>(),
    launchOpenPath: null,
    pickMarkdownPath: null,
    watchedPath: null,
    appVersion: '0.0.0-e2e',
    updateResult: cloneUpdateResult(DEFAULT_UPDATE_RESULT),
    diagnosticsReports: [],
    calls: emptyCallLog(),
    listeners: {
      fileUpdated: new Set<(event: FileUpdatedEvent) => void>(),
      openPath: new Set<(path: string) => void>(),
      dragDrop: new Set<(event: DragDropEventPayload) => void>(),
    },
  };
}

function emptyCallLog(): MutableE2eState['calls'] {
  return {
    gateway: {
      pickedFileCount: 0,
      loadRequests: [],
      watchStartRequests: [],
      watchStopCount: 0,
    },
    external: {
      urls: [],
      paths: [],
    },
    updater: {
      checks: 0,
    },
  };
}

function documentFromFixture(input: DocumentFixtureInput): MarkdownDocument {
  const normalizedPath = normalizePath(input.path);
  const source = input.source;
  const html = input.html;
  const title = input.title?.trim() || titleFromPath(normalizedPath);
  const wordCount = numberOrFallback(input.wordCount, countWords(source), 0);
  const readingTimeMinutes = numberOrFallback(input.readingTimeMinutes, Math.ceil(wordCount / 225), 1);

  return {
    path: normalizedPath,
    title,
    source,
    html,
    toc: (input.toc ?? []).map((entry) => ({ ...entry })),
    wordCount,
    readingTimeMinutes,
  };
}

function cloneDocument(document: MarkdownDocument): MarkdownDocument {
  return {
    path: document.path,
    title: document.title,
    source: document.source,
    html: document.html,
    toc: document.toc.map((entry) => ({ ...entry })),
    wordCount: document.wordCount,
    readingTimeMinutes: document.readingTimeMinutes,
  };
}

function clonePreferences(preferences: RenderPreferences): RenderPreferences {
  return {
    performanceMode: preferences.performanceMode,
    wordCountRules: {
      includeLinks: preferences.wordCountRules.includeLinks,
      includeCode: preferences.wordCountRules.includeCode,
      includeFrontMatter: preferences.wordCountRules.includeFrontMatter,
    },
  };
}

function cloneUpdateResult(result: UpdateCheckResult): UpdateCheckResult {
  if (result.status === 'up-to-date') {
    return { status: 'up-to-date' };
  }
  if (result.status === 'update-installed') {
    return {
      status: 'update-installed',
      version: result.version,
    };
  }
  return {
    status: 'unavailable',
    reason: result.reason,
  };
}

function cloneDragDropEvent(event: DragDropEventPayload): DragDropEventPayload {
  return {
    type: event.type,
    paths: [...event.paths],
  };
}

function normalizeOptionalPath(path: string | null): string | null {
  if (path === null) {
    return null;
  }
  const normalized = normalizePath(path);
  return normalized || null;
}

function normalizePath(path: string): string {
  return path.trim();
}

function titleFromPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const segment = normalized.split('/').pop() || normalized;
  return segment.trim() || 'Untitled';
}

function countWords(source: string): number {
  return source.split(/\s+/).filter(Boolean).length;
}

function numberOrFallback(value: unknown, fallback: number, minimum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return Math.max(minimum, Math.floor(fallback));
  }
  return Math.max(minimum, Math.floor(value));
}

export function createE2eRuntimeAdapters(): E2eRuntimeAdapters {
  const state = createMutableState();
  const control = new E2eControl(state);

  return {
    gateway: new E2eMarkdownGateway(state),
    externalUrlOpener: new E2eExternalUrlOpener(state),
    updateService: new E2eUpdateService(state),
    appVersionProvider: new E2eAppVersionProvider(state),
    diagnosticsReportWriter: new E2eDiagnosticsReportWriter(state),
    control,
  };
}

export function registerE2eControlOnWindow(control: MarkdownViewerE2eControl): void {
  window.__MDV_E2E__ = control;
}

declare global {
  interface Window {
    __MDV_E2E__?: MarkdownViewerE2eControl;
  }
}
