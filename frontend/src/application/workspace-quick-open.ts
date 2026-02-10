import type { DocumentTabState } from './document-tabs';
import type { RecentDocumentsState } from './recent-documents';

export interface WorkspaceQuickOpenItem {
  path: string;
  title: string;
  source: 'tab' | 'recent';
  isActive: boolean;
}

interface BuildWorkspaceQuickOpenItemsInput {
  tabs: DocumentTabState;
  recentDocuments: RecentDocumentsState;
}

export function buildWorkspaceQuickOpenItems(
  input: BuildWorkspaceQuickOpenItemsInput
): WorkspaceQuickOpenItem[] {
  const items: WorkspaceQuickOpenItem[] = [];
  const seen = new Set<string>();

  for (const tab of input.tabs.tabs) {
    if (seen.has(tab.path)) {
      continue;
    }
    seen.add(tab.path);
    items.push({
      path: tab.path,
      title: tab.title,
      source: 'tab',
      isActive: tab.path === input.tabs.activePath,
    });
  }

  for (const recent of input.recentDocuments.entries) {
    if (seen.has(recent.path)) {
      continue;
    }
    seen.add(recent.path);
    items.push({
      path: recent.path,
      title: recent.title,
      source: 'recent',
      isActive: false,
    });
  }

  return items;
}
