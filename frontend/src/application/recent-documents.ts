import { tabTitleFromPath } from './document-tabs';

export interface RecentDocumentEntry {
  path: string;
  title: string;
}

export interface RecentDocumentsState {
  entries: RecentDocumentEntry[];
}

export const RECENT_DOCUMENTS_LIMIT = 12;

export function createEmptyRecentDocumentsState(): RecentDocumentsState {
  return {
    entries: [],
  };
}

export function mergeRecentDocumentsState(
  parsed: unknown,
  maxEntries = RECENT_DOCUMENTS_LIMIT
): RecentDocumentsState {
  const source = asRecord(parsed);
  const rawEntries = Array.isArray(source.entries) ? source.entries : [];
  const entries: RecentDocumentEntry[] = [];
  const seen = new Set<string>();

  for (const candidate of rawEntries) {
    if (entries.length >= maxEntries) {
      break;
    }
    const asEntry = asRecord(candidate);
    const path = typeof asEntry.path === 'string' ? asEntry.path.trim() : '';
    if (!path || seen.has(path)) {
      continue;
    }
    seen.add(path);

    const titleCandidate = typeof asEntry.title === 'string' ? asEntry.title.trim() : '';
    entries.push({
      path,
      title: titleCandidate || tabTitleFromPath(path),
    });
  }

  return {
    entries,
  };
}

export function addRecentDocument(
  state: RecentDocumentsState,
  rawPath: string,
  maxEntries = RECENT_DOCUMENTS_LIMIT
): RecentDocumentsState {
  const path = rawPath.trim();
  if (!path) {
    return state;
  }

  const filtered = state.entries.filter((entry) => entry.path !== path);
  const nextEntries = [
    {
      path,
      title: tabTitleFromPath(path),
    },
    ...filtered,
  ].slice(0, maxEntries);

  return {
    entries: nextEntries,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}
