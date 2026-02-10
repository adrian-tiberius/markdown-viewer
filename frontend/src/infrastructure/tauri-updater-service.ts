import { check } from '@tauri-apps/plugin-updater';

import type { UpdateCheckResult, UpdateService } from '../application/ports';

export class TauriUpdaterService implements UpdateService {
  async checkForUpdates(): Promise<UpdateCheckResult> {
    try {
      const update = await check();
      if (!update) {
        return { status: 'up-to-date' };
      }

      const version = update.version;
      await update.downloadAndInstall();
      await update.close();
      return {
        status: 'update-installed',
        version,
      };
    } catch (error) {
      return {
        status: 'unavailable',
        reason: this.errorMessage(error),
      };
    }
  }

  private errorMessage(error: unknown): string {
    if (typeof error === 'string') {
      return error;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return 'Unknown updater error';
  }
}
