import type {
  ScrollMemoryStore,
  ViewerLayoutState,
  ViewerLayoutStateStore,
  ViewerSettingsStore,
} from '../presentation/ports';
import { mergeViewerSettings, type ViewerSettings } from '../application/settings';

const STORAGE_KEY = 'markdown-viewer:v1:settings';
const SCROLL_STORAGE_KEY = 'markdown-viewer:v1:scroll';
const LAYOUT_STORAGE_KEY = 'markdown-viewer:v1:layout';
const DEFAULT_LAYOUT_STATE: ViewerLayoutState = {
  leftSidebarCollapsed: false,
  rightSidebarCollapsed: false,
};

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

export class LocalStorageViewerLayoutStateStore implements ViewerLayoutStateStore {
  load(): ViewerLayoutState {
    try {
      const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (!raw) {
        return { ...DEFAULT_LAYOUT_STATE };
      }

      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { ...DEFAULT_LAYOUT_STATE };
      }

      const asRecord = parsed as Record<string, unknown>;
      return {
        leftSidebarCollapsed:
          typeof asRecord.leftSidebarCollapsed === 'boolean'
            ? asRecord.leftSidebarCollapsed
            : DEFAULT_LAYOUT_STATE.leftSidebarCollapsed,
        rightSidebarCollapsed:
          typeof asRecord.rightSidebarCollapsed === 'boolean'
            ? asRecord.rightSidebarCollapsed
            : DEFAULT_LAYOUT_STATE.rightSidebarCollapsed,
      };
    } catch {
      return { ...DEFAULT_LAYOUT_STATE };
    }
  }

  save(next: ViewerLayoutState): void {
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage write failures (private mode/quota/blocked storage).
    }
  }
}
