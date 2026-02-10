import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

import type { MarkdownTabOpener } from '../presentation/ports';

function buildWindowLabel(): string {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `doc-${Date.now()}-${randomPart}`;
}

export class TauriMarkdownTabOpener implements MarkdownTabOpener {
  async openMarkdownInNewTab(path: string): Promise<void> {
    const params = new URLSearchParams({ open: path });
    const windowRef = new WebviewWindow(buildWindowLabel(), {
      url: `/?${params.toString()}`,
      title: 'Markdown Viewer',
      width: 1320,
      height: 900,
      minWidth: 980,
      minHeight: 640,
      resizable: true,
      center: true,
    });

    await new Promise<void>((resolve, reject) => {
      windowRef.once('tauri://created', () => resolve());
      windowRef.once('tauri://error', (event) => {
        reject(new Error(String(event.payload ?? 'Failed to create markdown tab window')));
      });
    });
  }
}
