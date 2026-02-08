import type {
  MarkdownDocument,
  RenderPreferences,
} from '../domain';
import type { ViewerSettings } from '../application/settings';

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

export interface ViewerSettingsStore {
  load(): ViewerSettings;
  save(next: ViewerSettings): void;
}

export interface ScrollMemoryStore {
  load(): Record<string, number>;
  save(next: Record<string, number>): void;
  clear(): void;
}
