export interface ViewerUi {
  openButton: HTMLButtonElement;
  reloadButton: HTMLButtonElement;
  printButton: HTMLButtonElement;
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
  title: HTMLElement;
  subtitle: HTMLElement;
  stats: HTMLElement;
  path: HTMLElement;
  tabList: HTMLUListElement;
  tocList: HTMLUListElement;
  markdownContent: HTMLElement;
  safeContent: HTMLPreElement;
  viewerScroll: HTMLElement;
  errorBanner: HTMLElement;
  errorText: HTMLElement;
  recoverButton: HTMLButtonElement;
  dismissErrorButton: HTMLButtonElement;
  dropOverlay: HTMLElement;
}

export function mountShell(containerSelector: string, shellHtml: string): void {
  const root = mustGet<HTMLDivElement>(containerSelector);
  root.innerHTML = shellHtml;
}

export function createViewerUi(): ViewerUi {
  return {
    openButton: mustGet<HTMLButtonElement>('#open-file'),
    reloadButton: mustGet<HTMLButtonElement>('#reload-file'),
    printButton: mustGet<HTMLButtonElement>('#print-view'),
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
    title: mustGet<HTMLElement>('#doc-title'),
    subtitle: mustGet<HTMLElement>('#doc-subtitle'),
    stats: mustGet<HTMLElement>('#doc-stats'),
    path: mustGet<HTMLElement>('#doc-path'),
    tabList: mustGet<HTMLUListElement>('#doc-tabs'),
    tocList: mustGet<HTMLUListElement>('#toc-list'),
    markdownContent: mustGet<HTMLElement>('#markdown-content'),
    safeContent: mustGet<HTMLPreElement>('#safe-content'),
    viewerScroll: mustGet<HTMLElement>('#viewer-scroll'),
    errorBanner: mustGet<HTMLElement>('#error-banner'),
    errorText: mustGet<HTMLElement>('#error-message'),
    recoverButton: mustGet<HTMLButtonElement>('#recover-view'),
    dismissErrorButton: mustGet<HTMLButtonElement>('#dismiss-error'),
    dropOverlay: mustGet<HTMLElement>('#drop-overlay'),
  };
}

function mustGet<T extends Element>(selector: string): T {
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element as T;
}
