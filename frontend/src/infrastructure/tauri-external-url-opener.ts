import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';

import type { ExternalUrlOpener } from '../presentation/ports';

export class TauriExternalUrlOpener implements ExternalUrlOpener {
  async openExternalUrl(url: string): Promise<void> {
    await openUrl(url);
  }

  async openExternalPath(path: string, sourceDocumentPath: string): Promise<void> {
    await invoke('open_linked_file', {
      path,
      sourceDocumentPath,
    });
  }
}
