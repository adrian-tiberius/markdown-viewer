import type { MarkdownDocument, RenderPreferences } from '../domain';
import type { DocumentTabSession } from './document-tabs';
import type { RecentDocumentsState } from './recent-documents';
import type { ViewerSettings } from './settings';

export interface DragDropEventPayload {
  type: 'enter' | 'leave' | 'over' | 'drop';
  paths: string[];
}

export interface FileUpdatedEvent {
  path: string;
}

export interface MarkdownFilePicker {
  pickMarkdownFile(): Promise<string | null>;
}

export interface MarkdownFileLoader {
  loadMarkdownFile(path: string, preferences: RenderPreferences): Promise<MarkdownDocument>;
}

export interface MarkdownWatchController {
  startMarkdownWatch(path: string): Promise<void>;
  stopMarkdownWatch(): Promise<void>;
}

export interface MarkdownFileUpdateEvents {
  onMarkdownFileUpdated(handler: (event: FileUpdatedEvent) => void): Promise<() => void>;
}

export interface DragDropEvents {
  onDragDrop(handler: (event: DragDropEventPayload) => void): Promise<() => void>;
}

export interface OpenPathRequestEvents {
  consumeLaunchOpenPath(): Promise<string | null>;
  onOpenPathRequested(handler: (path: string) => void): Promise<() => void>;
}

export interface MarkdownGateway
  extends MarkdownFilePicker,
    MarkdownFileLoader,
    MarkdownWatchController,
    MarkdownFileUpdateEvents,
    DragDropEvents,
    OpenPathRequestEvents {}

export interface MarkdownFormattingEngine {
  renderMathToHtml(formula: string, displayMode: boolean): Promise<string>;
  highlightCodeToHtml(sourceCode: string, language: string | null): Promise<string>;
}

export interface ExternalUrlOpener {
  openExternalUrl(url: string): Promise<void>;
  openExternalPath(path: string, sourceDocumentPath: string): Promise<void>;
}

export type UpdateCheckResult =
  | { status: 'up-to-date' }
  | { status: 'update-installed'; version: string }
  | { status: 'unavailable'; reason: string };

export interface UpdateService {
  checkForUpdates(): Promise<UpdateCheckResult>;
}

export interface AppVersionProvider {
  getAppVersion(): Promise<string>;
}

export interface DiagnosticsReportWriter {
  saveReport(fileName: string, content: string): Promise<void>;
}

export interface ViewerSettingsStore {
  load(): ViewerSettings;
  save(next: ViewerSettings): void;
}

export interface ScrollMemoryStore {
  load(): Record<string, number>;
  save(next: Record<string, number>): void;
  clear(): void;
}

export interface ViewerLayoutState {
  leftSidebarCollapsed: boolean;
  rightSidebarCollapsed: boolean;
}

export interface ViewerLayoutStateStore {
  load(): ViewerLayoutState;
  save(next: ViewerLayoutState): void;
}

export interface DocumentTabSessionStore {
  load(): DocumentTabSession;
  save(next: DocumentTabSession): void;
}

export interface RecentDocumentsStore {
  load(): RecentDocumentsState;
  save(next: RecentDocumentsState): void;
}
