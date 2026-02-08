import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

import type {
  DragDropEventPayload,
  FileUpdatedEvent,
  MarkdownGateway,
} from '../presentation/ports';
import type { MarkdownDocument, RenderPreferences } from '../domain';

const FILE_UPDATED_EVENT = 'markdown://file-updated';

export class TauriMarkdownGateway implements MarkdownGateway {
  async pickMarkdownFile(): Promise<string | null> {
    return invoke<string | null>('pick_markdown_file');
  }

  async loadMarkdownFile(path: string, preferences: RenderPreferences): Promise<MarkdownDocument> {
    return invoke<MarkdownDocument>('load_markdown_file', {
      path,
      preferences,
    });
  }

  async startMarkdownWatch(path: string): Promise<void> {
    await invoke('start_markdown_watch', { path });
  }

  async stopMarkdownWatch(): Promise<void> {
    await invoke('stop_markdown_watch');
  }

  async onMarkdownFileUpdated(handler: (event: FileUpdatedEvent) => void): Promise<() => void> {
    return listen<FileUpdatedEvent>(FILE_UPDATED_EVENT, (event) => {
      handler(event.payload);
    });
  }

  async onDragDrop(handler: (event: DragDropEventPayload) => void): Promise<() => void> {
    return getCurrentWindow().onDragDropEvent((event) => {
      if (event.payload.type === 'over') {
        handler({ type: 'over', paths: [] });
        return;
      }
      if (event.payload.type === 'enter') {
        handler({ type: 'enter', paths: [] });
        return;
      }
      if (event.payload.type === 'leave') {
        handler({ type: 'leave', paths: [] });
        return;
      }
      handler({
        type: 'drop',
        paths: event.payload.paths,
      });
    });
  }
}
