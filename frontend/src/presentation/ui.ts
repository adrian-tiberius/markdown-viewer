export interface ViewerUi {
  workspace: HTMLElement;
  openButton: HTMLButtonElement;
  reloadButton: HTMLButtonElement;
  printButton: HTMLButtonElement;
  openCommandPaletteButton: HTMLButtonElement;
  toggleLeftSidebarButton: HTMLButtonElement;
  toggleRightSidebarButton: HTMLButtonElement;
  perfToggle: HTMLInputElement;
  safeToggle: HTMLInputElement;
  themeSelect: HTMLSelectElement;
  fontScale: HTMLInputElement;
  lineHeight: HTMLInputElement;
  measureWidth: HTMLInputElement;
  includeLinks: HTMLInputElement;
  includeCode: HTMLInputElement;
  includeFrontMatter: HTMLInputElement;
  tocAutoExpand: HTMLInputElement;
  collapseAllToc: HTMLButtonElement;
  expandAllToc: HTMLButtonElement;
  clearScrollMemory: HTMLButtonElement;
  clearRecentDocuments: HTMLButtonElement;
  title: HTMLElement;
  subtitle: HTMLElement;
  stats: HTMLElement;
  path: HTMLElement;
  tabList: HTMLUListElement;
  findBar: HTMLElement;
  findInput: HTMLInputElement;
  findCount: HTMLElement;
  findPrev: HTMLButtonElement;
  findNext: HTMLButtonElement;
  findClose: HTMLButtonElement;
  recentDocumentsList: HTMLUListElement;
  tocList: HTMLUListElement;
  markdownContent: HTMLElement;
  safeContent: HTMLPreElement;
  viewerScroll: HTMLElement;
  errorBanner: HTMLElement;
  errorText: HTMLElement;
  recoverButton: HTMLButtonElement;
  dismissErrorButton: HTMLButtonElement;
  dropOverlay: HTMLElement;
  permissionDialog: HTMLElement;
  permissionTitle: HTMLElement;
  permissionMessage: HTMLElement;
  permissionTarget: HTMLElement;
  permissionAllowButton: HTMLButtonElement;
  permissionCancelButton: HTMLButtonElement;
  commandPalette: HTMLElement;
  commandPaletteInput: HTMLInputElement;
  commandPaletteList: HTMLUListElement;
  showShortcutsHelpButton: HTMLButtonElement;
  shortcutsDialog: HTMLElement;
  shortcutsCloseButton: HTMLButtonElement;
}

export function mountShell(containerSelector: string, shellHtml: string): void {
  const root = mustGet<HTMLDivElement>(containerSelector);
  root.innerHTML = shellHtml;
}

export function createViewerUi(): ViewerUi {
  return {
    workspace: mustGet<HTMLElement>('#workspace'),
    openButton: mustGet<HTMLButtonElement>('#open-file'),
    reloadButton: mustGet<HTMLButtonElement>('#reload-file'),
    printButton: mustGet<HTMLButtonElement>('#print-view'),
    openCommandPaletteButton: mustGet<HTMLButtonElement>('#open-command-palette'),
    toggleLeftSidebarButton: mustGet<HTMLButtonElement>('#toggle-left-sidebar'),
    toggleRightSidebarButton: mustGet<HTMLButtonElement>('#toggle-right-sidebar'),
    perfToggle: mustGet<HTMLInputElement>('#performance-mode'),
    safeToggle: mustGet<HTMLInputElement>('#safe-mode'),
    themeSelect: mustGet<HTMLSelectElement>('#theme-preset'),
    fontScale: mustGet<HTMLInputElement>('#font-scale'),
    lineHeight: mustGet<HTMLInputElement>('#line-height'),
    measureWidth: mustGet<HTMLInputElement>('#measure-width'),
    includeLinks: mustGet<HTMLInputElement>('#count-links'),
    includeCode: mustGet<HTMLInputElement>('#count-code'),
    includeFrontMatter: mustGet<HTMLInputElement>('#count-frontmatter'),
    tocAutoExpand: mustGet<HTMLInputElement>('#toc-auto-expand'),
    collapseAllToc: mustGet<HTMLButtonElement>('#toc-collapse-all'),
    expandAllToc: mustGet<HTMLButtonElement>('#toc-expand-all'),
    clearScrollMemory: mustGet<HTMLButtonElement>('#clear-scroll-memory'),
    clearRecentDocuments: mustGet<HTMLButtonElement>('#clear-recent-documents'),
    title: mustGet<HTMLElement>('#doc-title'),
    subtitle: mustGet<HTMLElement>('#doc-subtitle'),
    stats: mustGet<HTMLElement>('#doc-stats'),
    path: mustGet<HTMLElement>('#doc-path'),
    tabList: mustGet<HTMLUListElement>('#doc-tabs'),
    findBar: mustGet<HTMLElement>('#find-bar'),
    findInput: mustGet<HTMLInputElement>('#find-input'),
    findCount: mustGet<HTMLElement>('#find-count'),
    findPrev: mustGet<HTMLButtonElement>('#find-prev'),
    findNext: mustGet<HTMLButtonElement>('#find-next'),
    findClose: mustGet<HTMLButtonElement>('#find-close'),
    recentDocumentsList: mustGet<HTMLUListElement>('#recent-documents-list'),
    tocList: mustGet<HTMLUListElement>('#toc-list'),
    markdownContent: mustGet<HTMLElement>('#markdown-content'),
    safeContent: mustGet<HTMLPreElement>('#safe-content'),
    viewerScroll: mustGet<HTMLElement>('#viewer-scroll'),
    errorBanner: mustGet<HTMLElement>('#error-banner'),
    errorText: mustGet<HTMLElement>('#error-message'),
    recoverButton: mustGet<HTMLButtonElement>('#recover-view'),
    dismissErrorButton: mustGet<HTMLButtonElement>('#dismiss-error'),
    dropOverlay: mustGet<HTMLElement>('#drop-overlay'),
    permissionDialog: mustGet<HTMLElement>('#permission-dialog'),
    permissionTitle: mustGet<HTMLElement>('#permission-title'),
    permissionMessage: mustGet<HTMLElement>('#permission-message'),
    permissionTarget: mustGet<HTMLElement>('#permission-target'),
    permissionAllowButton: mustGet<HTMLButtonElement>('#permission-allow'),
    permissionCancelButton: mustGet<HTMLButtonElement>('#permission-cancel'),
    commandPalette: mustGet<HTMLElement>('#command-palette'),
    commandPaletteInput: mustGet<HTMLInputElement>('#command-palette-input'),
    commandPaletteList: mustGet<HTMLUListElement>('#command-palette-list'),
    showShortcutsHelpButton: mustGet<HTMLButtonElement>('#show-shortcuts-help'),
    shortcutsDialog: mustGet<HTMLElement>('#shortcuts-dialog'),
    shortcutsCloseButton: mustGet<HTMLButtonElement>('#shortcuts-close'),
  };
}

function mustGet<T extends Element>(selector: string): T {
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element as T;
}
