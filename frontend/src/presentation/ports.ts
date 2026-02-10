import type {
  MarkdownDocument,
  RenderPreferences,
} from '../domain';
import type { ViewerSettings } from '../application/settings';
import type { DocumentTabSession } from '../application/document-tabs';
import type { RecentDocumentsState } from '../application/recent-documents';

export interface DragDropEventPayload {
  type: 'enter' | 'leave' | 'over' | 'drop';
  paths: string[];
}

export interface FileUpdatedEvent {
  path: string;
}

export interface MarkdownGateway {
  pickMarkdownFile(): Promise<string | null>;
  loadMarkdownFile(path: string, preferences: RenderPreferences): Promise<MarkdownDocument>;
  startMarkdownWatch(path: string): Promise<void>;
  stopMarkdownWatch(): Promise<void>;
  onMarkdownFileUpdated(handler: (event: FileUpdatedEvent) => void): Promise<() => void>;
  onDragDrop(handler: (event: DragDropEventPayload) => void): Promise<() => void>;
}

export interface MarkdownFormattingEngine {
  renderMath(formula: string, target: HTMLElement, displayMode: boolean): Promise<void>;
  highlightCodeElement(target: HTMLElement): Promise<void>;
}

export interface ExternalUrlOpener {
  openExternalUrl(url: string): Promise<void>;
  openExternalPath(path: string, sourceDocumentPath: string): Promise<void>;
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
