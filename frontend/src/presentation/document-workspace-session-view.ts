import type { DocumentTabState } from '../application/document-tabs';
import type { RecentDocumentsState } from '../application/recent-documents';
import { escapeHtml } from './document-view-utils';
import type { ViewerUi } from './ui';

interface DocumentWorkspaceSessionViewDeps {
  ui: Pick<ViewerUi, 'tabList' | 'reloadButton' | 'recentDocumentsList'>;
}

export class DocumentWorkspaceSessionView {
  private readonly deps: DocumentWorkspaceSessionViewDeps;

  constructor(deps: DocumentWorkspaceSessionViewDeps) {
    this.deps = deps;
  }

  renderTabs(tabState: DocumentTabState): void {
    const { ui } = this.deps;
    if (tabState.tabs.length === 0) {
      ui.tabList.innerHTML = '<li class="doc-tab-empty">No open tabs</li>';
      ui.reloadButton.disabled = true;
      return;
    }

    ui.reloadButton.disabled = false;
    ui.tabList.innerHTML = tabState.tabs
      .map((tab) => {
        const encodedPath = encodeURIComponent(tab.path);
        const isActive = tab.path === tabState.activePath;
        const activeClass = isActive ? ' active' : '';
        return `<li class="doc-tab-item${activeClass}">
    <button type="button" class="doc-tab-button" data-tab-action="activate" data-path="${escapeHtml(encodedPath)}" title="${escapeHtml(tab.path)}">${escapeHtml(tab.title)}</button>
    <button type="button" class="doc-tab-close" data-tab-action="close" data-path="${escapeHtml(encodedPath)}" aria-label="Close tab" title="Close tab">×</button>
  </li>`;
      })
      .join('');
  }

  renderRecentDocuments(recentDocuments: RecentDocumentsState): void {
    const { recentDocumentsList } = this.deps.ui;
    const entries = recentDocuments.entries;

    if (entries.length === 0) {
      recentDocumentsList.innerHTML = '<li class="recent-documents-empty">No recent documents</li>';
      return;
    }

    recentDocumentsList.innerHTML = entries
      .map((entry) => {
        const encodedPath = encodeURIComponent(entry.path);
        return `<li class="recent-documents-item">
    <button type="button" class="recent-document-button" data-recent-open="1" data-path="${escapeHtml(encodedPath)}" title="${escapeHtml(entry.path)}">
      <span class="recent-document-title">${escapeHtml(entry.title)}</span>
      <span class="recent-document-path">${escapeHtml(entry.path)}</span>
    </button>
  </li>`;
      })
      .join('');
  }
}
