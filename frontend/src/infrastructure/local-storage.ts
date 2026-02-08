import type { ScrollMemoryStore, ViewerSettingsStore } from '../presentation/ports';
import { mergeViewerSettings, type ViewerSettings } from '../application/settings';

const STORAGE_KEY = 'markdown-viewer:v1:settings';
const SCROLL_STORAGE_KEY = 'markdown-viewer:v1:scroll';

export class LocalStorageViewerSettingsStore implements ViewerSettingsStore {
  load(): ViewerSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return mergeViewerSettings(undefined);
      }
      const parsed = JSON.parse(raw) as Partial<ViewerSettings>;
      return mergeViewerSettings(parsed);
    } catch {
      return mergeViewerSettings(undefined);
    }
  }

  save(next: ViewerSettings): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage write failures (private mode/quota/blocked storage).
    }
  }
}

export class LocalStorageScrollMemoryStore implements ScrollMemoryStore {
  load(): Record<string, number> {
    try {
      const raw = localStorage.getItem(SCROLL_STORAGE_KEY);
      if (!raw) {
        return {};
      }

      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed !== 'object' || parsed === null) {
        return {};
      }

      const result: Record<string, number> = {};
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === 'number') {
          result[key] = value;
        }
      }

      return result;
    } catch {
      return {};
    }
  }

  save(next: Record<string, number>): void {
    try {
      localStorage.setItem(SCROLL_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage write failures (private mode/quota/blocked storage).
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(SCROLL_STORAGE_KEY);
    } catch {
      // Ignore storage write failures (private mode/quota/blocked storage).
    }
  }
}
