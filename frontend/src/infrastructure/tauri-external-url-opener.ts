import { openPath, openUrl } from '@tauri-apps/plugin-opener';

import type { ExternalUrlOpener } from '../presentation/ports';

export class TauriExternalUrlOpener implements ExternalUrlOpener {
  async openExternalUrl(url: string): Promise<void> {
    await openUrl(url);
  }

  async openExternalPath(path: string): Promise<void> {
    await openPath(path);
  }
}
