import { getVersion } from '@tauri-apps/api/app';

import type { AppVersionProvider } from '../application/ports';

export class TauriAppVersionProvider implements AppVersionProvider {
  async getAppVersion(): Promise<string> {
    try {
      return await getVersion();
    } catch {
      return 'unknown';
    }
  }
}
