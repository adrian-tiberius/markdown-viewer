import { normalizePathForCompare } from './path-utils';
import { toRenderPreferences, type ViewerSettings } from './settings';

export function shouldReloadForFileUpdate(
  currentDocumentPath: string | null,
  updatedPath: string
): boolean {
  if (!currentDocumentPath) {
    return false;
  }
  return normalizePathForCompare(currentDocumentPath) === normalizePathForCompare(updatedPath);
}

export function renderPreferencesFromSettings(settings: ViewerSettings) {
  return toRenderPreferences(settings);
}
