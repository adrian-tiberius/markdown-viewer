import type {
  ExternalUrlOpener,
  MarkdownFormattingEngine,
  MarkdownGateway,
  ScrollMemoryStore,
  ViewerLayoutState,
  ViewerLayoutStateStore,
  ViewerSettingsStore,
} from './ports';
import {
  renderPreferencesFromSettings,
  shouldReloadForFileUpdate,
} from '../application/use-cases';
import { isMarkdownPath } from '../application/path-utils';
import {
  applyLoadedDocumentToTabs,
  closeDocumentTab,
  createEmptyDocumentTabState,
  openDocumentTab,
  type DocumentTabState,
} from '../application/document-tabs';
import {
  isLinkedFileOutsideScopeError,
  resolveDocumentLinkIntent,
} from '../application/link-navigation';
import {
  MEASURE_WIDTH_FALLBACK_MAX,
  MEASURE_WIDTH_MIN,
  deriveMeasureWidthMax,
  measureWidthCssValue,
  reconcileMeasureWidthOnMaxChange,
} from '../application/reader-layout';
import { type ViewerSettings } from '../application/settings';
import {
  type MarkdownDocument,
  type TocEntry,
} from '../domain';
import {
  baseDirectoryFileUrl,
  buildParentMap,
  buildTocTree,
  escapeHtml,
  hasUriScheme,
  type TocNode,
} from './document-view-utils';
import type { ViewerUi } from './ui';

interface MarkdownViewerAppDeps {
  ui: ViewerUi;
  gateway: MarkdownGateway;
  formattingEngine: MarkdownFormattingEngine;
  externalUrlOpener: ExternalUrlOpener;
  initialDocumentPath?: string | null;
  settingsStore: ViewerSettingsStore;
  layoutStateStore: ViewerLayoutStateStore;
  scrollMemoryStore: ScrollMemoryStore;
}

interface LoadOptions {
  restartWatch: boolean;
  restoreScroll: boolean;
}

export class MarkdownViewerApp {
  private readonly deps: MarkdownViewerAppDeps;
  private settings: ViewerSettings;
  private layoutState: ViewerLayoutState;
  private currentDocument: MarkdownDocument | null = null;
  private tabState: DocumentTabState = createEmptyDocumentTabState();
  private reloadTimer: number | null = null;
  private activeHeadingId = '';
  private currentLoadNonce = 0;
  private fileUpdateUnlisten: (() => void) | null = null;
  private dragDropUnlisten: (() => void) | null = null;
  private headingObserver: IntersectionObserver | null = null;
  private codeObserver: IntersectionObserver | null = null;
  private linkClickDisposer: (() => void) | null = null;
  private tocParentMap = new Map<string, string | null>();
  private permissionResolver: ((allowed: boolean) => void) | null = null;
  private scrollSaveTimer: number | null = null;
  private cleanupRegistered = false;
  private beforeUnloadHandler: ((event: BeforeUnloadEvent) => void) | null = null;
  private windowErrorHandler: ((event: ErrorEvent) => void) | null = null;
  private unhandledRejectionHandler: ((event: PromiseRejectionEvent) => void) | null = null;
  private uiBindingDisposers: Array<() => void> = [];
  private disposed = false;
  private started = false;
  private lifecycleToken = 0;

  constructor(deps: MarkdownViewerAppDeps) {
    this.deps = deps;
    this.settings = this.deps.settingsStore.load();
    this.layoutState = this.deps.layoutStateStore.load();
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.disposed = false;
    const lifecycleToken = ++this.lifecycleToken;
    this.setupUiBindings();
    this.applySidebarLayout();
    this.refreshMeasureWidthControl({ keepAtMax: true });
    this.applySettingsToControls();
    this.applySettingsToDocument();
    this.installGlobalCrashHandlers();
    void this.registerRuntimeListeners(lifecycleToken);
    this.renderEmptyState();
    const initialDocumentPath = this.deps.initialDocumentPath?.trim();
    if (initialDocumentPath) {
      void this.openDocumentInTab(initialDocumentPath, {
        activateTab: true,
        restartWatch: true,
        restoreScroll: true,
      });
    }

    if (!this.cleanupRegistered) {
      this.cleanupRegistered = true;
      this.beforeUnloadHandler = () => {
        void this.dispose();
      };
      window.addEventListener('beforeunload', this.beforeUnloadHandler);
    }
  }

  async dispose(): Promise<void> {
    this.started = false;
    this.disposed = true;
    this.lifecycleToken += 1;
    this.currentLoadNonce += 1;

    if (this.reloadTimer !== null) {
      window.clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }
    if (this.scrollSaveTimer !== null) {
      window.clearTimeout(this.scrollSaveTimer);
      this.scrollSaveTimer = null;
    }
    this.cleanupUiBindings();

    this.fileUpdateUnlisten?.();
    this.fileUpdateUnlisten = null;
    this.dragDropUnlisten?.();
    this.dragDropUnlisten = null;
    this.cleanupObservers();
    this.linkClickDisposer?.();
    this.linkClickDisposer = null;
    this.resolvePermissionRequest(false);

    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
      this.beforeUnloadHandler = null;
      this.cleanupRegistered = false;
    }
    if (this.windowErrorHandler) {
      window.removeEventListener('error', this.windowErrorHandler);
      this.windowErrorHandler = null;
    }
    if (this.unhandledRejectionHandler) {
      window.removeEventListener('unhandledrejection', this.unhandledRejectionHandler);
      this.unhandledRejectionHandler = null;
    }

    await this.deps.gateway.stopMarkdownWatch();
    this.currentDocument = null;
    this.tabState = createEmptyDocumentTabState();
    this.renderEmptyState();
  }

  private async registerRuntimeListeners(lifecycleToken: number): Promise<void> {
    try {
      const fileUpdateUnlisten = await this.deps.gateway.onMarkdownFileUpdated((event) => {
        if (!this.isLifecycleActive(lifecycleToken)) {
          return;
        }
        const currentPath = this.currentDocument?.path ?? null;
        if (!shouldReloadForFileUpdate(currentPath, event.path)) {
          return;
        }
        this.scheduleReloadFromWatcher();
      });

      if (!this.isLifecycleActive(lifecycleToken)) {
        fileUpdateUnlisten();
        return;
      }
      this.fileUpdateUnlisten = fileUpdateUnlisten;

      const dragDropUnlisten = await this.deps.gateway.onDragDrop((event) => {
        if (!this.isLifecycleActive(lifecycleToken)) {
          return;
        }
        if (event.type === 'enter') {
          this.deps.ui.dropOverlay.classList.add('visible');
          return;
        }
        if (event.type === 'leave') {
          this.deps.ui.dropOverlay.classList.remove('visible');
          return;
        }
        if (event.type === 'over') {
          return;
        }

        this.deps.ui.dropOverlay.classList.remove('visible');
        const path = event.paths.find((candidate) => isMarkdownPath(candidate));
        if (path) {
          void this.openDocumentInTab(path, {
            activateTab: true,
            restartWatch: true,
            restoreScroll: true,
          });
        }
      });

      if (!this.isLifecycleActive(lifecycleToken)) {
        dragDropUnlisten();
        return;
      }
      this.dragDropUnlisten = dragDropUnlisten;
    } catch (error) {
      if (this.isLifecycleActive(lifecycleToken)) {
        this.showErrorBanner(this.errorToMessage(error));
      }
    }
  }

  private setupUiBindings(): void {
    const { ui } = this.deps;
    this.cleanupUiBindings();

    this.bindUiListener(ui.openButton, 'click', () => {
      void this.pickAndOpen();
    });

    this.bindUiListener(ui.reloadButton, 'click', () => {
      void this.reloadCurrentDocument();
    });

    this.bindUiListener(ui.toggleLeftSidebarButton, 'click', () => {
      this.layoutState.leftSidebarCollapsed = !this.layoutState.leftSidebarCollapsed;
      this.persistLayoutState();
      this.applySidebarLayout();
      this.refreshMeasureWidthControl({ keepAtMax: true });
      this.applySettingsToDocument();
    });

    this.bindUiListener(ui.toggleRightSidebarButton, 'click', () => {
      this.layoutState.rightSidebarCollapsed = !this.layoutState.rightSidebarCollapsed;
      this.persistLayoutState();
      this.applySidebarLayout();
      this.refreshMeasureWidthControl({ keepAtMax: true });
      this.applySettingsToDocument();
    });

    this.bindUiListener(ui.tabList, 'click', (event) => {
      const target = event.target as HTMLElement | null;
      const actionElement = target?.closest<HTMLButtonElement>('button[data-tab-action]');
      if (!actionElement) {
        return;
      }

      const action = actionElement.dataset.tabAction;
      const encodedPath = actionElement.dataset.path;
      if (!action || !encodedPath) {
        return;
      }

      const path = this.decodeUriComponent(encodedPath);
      if (action === 'activate') {
        if (path === this.currentDocument?.path) {
          return;
        }
        void this.openDocumentInTab(path, {
          activateTab: true,
          restartWatch: true,
          restoreScroll: true,
        });
        return;
      }

      if (action === 'close') {
        void this.closeTab(path);
      }
    });

    this.bindUiListener(ui.printButton, 'click', () => {
      window.print();
    });

    this.bindUiListener(ui.permissionAllowButton, 'click', () => {
      this.resolvePermissionRequest(true);
    });

    this.bindUiListener(ui.permissionCancelButton, 'click', () => {
      this.resolvePermissionRequest(false);
    });

    this.bindUiListener(ui.permissionDialog, 'click', (event) => {
      if (event.target === ui.permissionDialog) {
        this.resolvePermissionRequest(false);
      }
    });

    this.bindUiListener(window, 'keydown', (event: Event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.key === 'Escape' && this.isPermissionDialogVisible()) {
        keyboardEvent.preventDefault();
        this.resolvePermissionRequest(false);
      }
    });

    this.bindUiListener(window, 'resize', () => {
      this.refreshMeasureWidthControl({ keepAtMax: true });
      this.applySettingsToDocument();
    });

    this.bindUiListener(ui.workspace, 'transitionend', (event: Event) => {
      const transitionEvent = event as TransitionEvent;
      if (transitionEvent.propertyName !== 'grid-template-columns') {
        return;
      }
      this.refreshMeasureWidthControl({ keepAtMax: true });
      this.applySettingsToDocument();
    });

    this.bindUiListener(ui.perfToggle, 'change', () => {
      this.settings.performanceMode = ui.perfToggle.checked;
      this.persistSettings();
      this.applySettingsToDocument();
      void this.reloadCurrentDocument();
    });

    this.bindUiListener(ui.safeToggle, 'change', () => {
      this.settings.safeMode = ui.safeToggle.checked;
      this.persistSettings();
      this.applySettingsToDocument();
      if (this.currentDocument) {
        void this.renderDocument(this.currentDocument, { restoreScroll: false });
      }
    });

    this.bindUiListener(ui.themeSelect, 'change', () => {
      this.settings.theme = ui.themeSelect.value as ViewerSettings['theme'];
      this.persistSettings();
      this.applySettingsToDocument();
    });

    this.bindUiListener(ui.fontScale, 'input', () => {
      this.settings.fontScale = Number(ui.fontScale.value);
      this.persistSettings();
      this.refreshMeasureWidthControl({ keepAtMax: true });
      this.applySettingsToDocument();
    });

    this.bindUiListener(ui.lineHeight, 'input', () => {
      this.settings.lineHeight = Number(ui.lineHeight.value);
      this.persistSettings();
      this.applySettingsToDocument();
    });

    this.bindUiListener(ui.measureWidth, 'input', () => {
      this.settings.measureWidth = Number(ui.measureWidth.value);
      this.persistSettings();
      this.applySettingsToDocument();
    });

    this.bindUiListener(ui.includeLinks, 'change', () => {
      this.settings.wordCountRules.includeLinks = ui.includeLinks.checked;
      this.persistSettings();
      void this.reloadCurrentDocument();
    });

    this.bindUiListener(ui.includeCode, 'change', () => {
      this.settings.wordCountRules.includeCode = ui.includeCode.checked;
      this.persistSettings();
      void this.reloadCurrentDocument();
    });

    this.bindUiListener(ui.includeFrontMatter, 'change', () => {
      this.settings.wordCountRules.includeFrontMatter = ui.includeFrontMatter.checked;
      this.persistSettings();
      void this.reloadCurrentDocument();
    });

    this.bindUiListener(ui.tocAutoExpand, 'change', () => {
      this.settings.tocAutoExpand = ui.tocAutoExpand.checked;
      this.persistSettings();
    });

    this.bindUiListener(ui.collapseAllToc, 'click', () => {
      for (const entry of this.currentDocument?.toc ?? []) {
        this.settings.tocCollapsed[entry.id] = true;
      }
      this.persistSettings();
      this.renderToc(this.currentDocument?.toc ?? []);
    });

    this.bindUiListener(ui.expandAllToc, 'click', () => {
      this.settings.tocCollapsed = {};
      this.persistSettings();
      this.renderToc(this.currentDocument?.toc ?? []);
    });

    this.bindUiListener(ui.clearScrollMemory, 'click', () => {
      this.deps.scrollMemoryStore.clear();
    });

    this.bindUiListener(ui.recoverButton, 'click', () => {
      this.settings.safeMode = false;
      ui.safeToggle.checked = false;
      ui.errorBanner.classList.remove('visible');
      this.persistSettings();
      this.applySettingsToDocument();
      void this.reloadCurrentDocument();
    });

    this.bindUiListener(ui.dismissErrorButton, 'click', () => {
      ui.errorBanner.classList.remove('visible');
    });

    this.bindUiListener(
      ui.viewerScroll,
      'scroll',
      () => {
        if (this.scrollSaveTimer !== null) {
          window.clearTimeout(this.scrollSaveTimer);
        }
        this.scrollSaveTimer = window.setTimeout(() => {
          this.persistScroll();
        }, 140);
      },
      { passive: true }
    );
  }

  private bindUiListener(
    target: EventTarget & {
      addEventListener: (
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: AddEventListenerOptions | boolean
      ) => void;
      removeEventListener: (
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: AddEventListenerOptions | boolean
      ) => void;
    },
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean
  ): void {
    target.addEventListener(type, listener, options);
    this.uiBindingDisposers.push(() => {
      target.removeEventListener(type, listener, options);
    });
  }

  private cleanupUiBindings(): void {
    const disposers = this.uiBindingDisposers.splice(0);
    for (const dispose of disposers) {
      dispose();
    }
  }

  private isLifecycleActive(lifecycleToken: number): boolean {
    return this.started && !this.disposed && lifecycleToken === this.lifecycleToken;
  }

  private async pickAndOpen(): Promise<void> {
    const path = await this.deps.gateway.pickMarkdownFile();
    if (!path) {
      return;
    }
    await this.openDocumentInTab(path, {
      activateTab: true,
      restartWatch: true,
      restoreScroll: true,
    });
  }

  private async reloadCurrentDocument(): Promise<void> {
    const path = this.currentDocument?.path ?? this.tabState.activePath;
    if (!path) {
      return;
    }
    await this.loadDocument(path, {
      restartWatch: false,
      restoreScroll: true,
    });
  }

  private async openDocumentInTab(
    path: string,
    options: { activateTab: boolean; restartWatch: boolean; restoreScroll: boolean }
  ): Promise<void> {
    const normalizedPath = path.trim();
    if (!normalizedPath) {
      return;
    }

    this.persistScroll();
    this.tabState = openDocumentTab(this.tabState, normalizedPath, {
      activate: options.activateTab,
    });
    this.renderTabs();

    await this.loadDocument(normalizedPath, {
      restartWatch: options.restartWatch,
      restoreScroll: options.restoreScroll,
    });
  }

  private async closeTab(path: string): Promise<void> {
    const closed = closeDocumentTab(this.tabState, path);
    if (!closed.removed) {
      return;
    }
    this.tabState = closed.state;
    if (!closed.closedActive) {
      this.renderTabs();
      return;
    }

    this.persistScroll();
    if (this.tabState.tabs.length === 0) {
      this.currentDocument = null;
      await this.deps.gateway.stopMarkdownWatch();
      this.renderEmptyState();
      return;
    }

    const nextPath = closed.nextActivePath;
    this.renderTabs();
    if (!nextPath) {
      return;
    }
    await this.loadDocument(nextPath, {
      restartWatch: true,
      restoreScroll: true,
    });
  }

  private renderTabs(): void {
    const { ui } = this.deps;
    if (this.tabState.tabs.length === 0) {
      ui.tabList.innerHTML = '<li class="doc-tab-empty">No open tabs</li>';
      ui.reloadButton.disabled = true;
      return;
    }

    ui.reloadButton.disabled = false;
    ui.tabList.innerHTML = this.tabState.tabs
      .map((tab) => {
        const encodedPath = encodeURIComponent(tab.path);
        const isActive = tab.path === this.tabState.activePath;
        const activeClass = isActive ? ' active' : '';
        return `<li class="doc-tab-item${activeClass}">
    <button type="button" class="doc-tab-button" data-tab-action="activate" data-path="${escapeHtml(encodedPath)}" title="${escapeHtml(tab.path)}">${escapeHtml(tab.title)}</button>
    <button type="button" class="doc-tab-close" data-tab-action="close" data-path="${escapeHtml(encodedPath)}" aria-label="Close tab" title="Close tab">×</button>
  </li>`;
      })
      .join('');
  }

  private async loadDocument(path: string, options: LoadOptions): Promise<void> {
    if (this.disposed) {
      return;
    }

    const nonce = ++this.currentLoadNonce;
    this.setStatus('Loading markdown...');
    try {
      const documentDto = await this.deps.gateway.loadMarkdownFile(
        path,
        renderPreferencesFromSettings(this.settings)
      );

      if (nonce !== this.currentLoadNonce || this.disposed) {
        return;
      }

      this.tabState = applyLoadedDocumentToTabs(
        this.tabState,
        path,
        documentDto.path,
        documentDto.title
      );
      this.renderTabs();

      this.currentDocument = documentDto;
      this.deps.ui.errorBanner.classList.remove('visible');
      await this.renderDocument(documentDto, { restoreScroll: options.restoreScroll });
      if (nonce !== this.currentLoadNonce || this.disposed) {
        return;
      }

      if (options.restartWatch) {
        await this.deps.gateway.stopMarkdownWatch();
        if (nonce !== this.currentLoadNonce || this.disposed) {
          return;
        }
        await this.deps.gateway.startMarkdownWatch(documentDto.path);
        if (nonce !== this.currentLoadNonce || this.disposed) {
          return;
        }
      }

      this.setStatus('Ready');
    } catch (error) {
      if (nonce !== this.currentLoadNonce || this.disposed) {
        return;
      }
      this.showErrorBanner(this.errorToMessage(error));
      this.setStatus('Failed to load');
    }
  }

  private async renderDocument(
    documentDto: MarkdownDocument,
    options: { restoreScroll: boolean }
  ): Promise<void> {
    const { ui } = this.deps;
    ui.title.textContent = documentDto.title;
    ui.subtitle.textContent = this.settings.performanceMode
      ? 'Performance mode enabled'
      : 'Typography mode enabled';
    ui.path.textContent = documentDto.path;
    ui.stats.textContent = `${documentDto.wordCount.toLocaleString()} words • ${documentDto.readingTimeMinutes} min read`;

    this.cleanupObservers();
    this.renderToc(documentDto.toc);

    if (this.settings.safeMode) {
      ui.markdownContent.hidden = true;
      ui.safeContent.hidden = false;
      ui.safeContent.textContent = documentDto.source;
    } else {
      ui.safeContent.hidden = true;
      ui.markdownContent.hidden = false;
      await this.renderHtmlInBatches(documentDto.html);
      this.applyNormalizedResourceUrls(documentDto.path);
      this.wireDocumentLinkHandling(documentDto.path);
      await this.applyMathEnhancement();
      await this.applyCodeHighlighting();
      this.observeActiveHeading();
    }

    if (options.restoreScroll) {
      this.restoreScroll(documentDto.path);
    }
  }

  private async renderHtmlInBatches(html: string): Promise<void> {
    const { ui } = this.deps;
    ui.markdownContent.replaceChildren();
    const staging = document.createElement('div');
    staging.innerHTML = html;
    const nodes = Array.from(staging.childNodes);

    const chunkSize = this.settings.performanceMode || html.length > 180_000 ? 24 : nodes.length;
    for (let index = 0; index < nodes.length; index += chunkSize) {
      const chunk = nodes.slice(index, index + chunkSize);
      for (const node of chunk) {
        ui.markdownContent.appendChild(node);
      }
      if (chunkSize !== nodes.length) {
        await this.nextFrame();
      }
    }
  }

  private applyNormalizedResourceUrls(documentPath: string): void {
    const { ui } = this.deps;
    const baseUrl = baseDirectoryFileUrl(documentPath);
    const targets = ui.markdownContent.querySelectorAll<HTMLElement>(
      'a[href], img[src], source[src], video[src], audio[src]'
    );

    for (const target of targets) {
      const attribute = target.hasAttribute('href') ? 'href' : 'src';
      const raw = target.getAttribute(attribute);
      if (!raw || raw.startsWith('#') || hasUriScheme(raw)) {
        continue;
      }
      try {
        const resolved = new URL(raw, baseUrl).toString();
        target.setAttribute(attribute, resolved);
      } catch {
        // Ignore invalid URL segments and keep source as-is.
      }
    }
  }

  private wireDocumentLinkHandling(documentPath: string): void {
    const { ui } = this.deps;
    this.linkClickDisposer?.();
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor) {
        return;
      }

      const href = anchor.getAttribute('href');
      if (!href) {
        return;
      }
      const anchorLabel = (anchor.textContent ?? '').trim();
      const intent = resolveDocumentLinkIntent({
        href,
        documentPath,
      });
      if (intent.type === 'none') {
        return;
      }

      event.preventDefault();
      if (intent.type === 'scroll-to-anchor') {
        const heading = this.resolveHeadingTarget(intent.fragment, anchorLabel);
        if (heading) {
          heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }

      if (intent.type === 'open-external-url') {
        void this.requestExternalUrlPermission(intent.url);
        return;
      }

      if (intent.type === 'open-markdown-file') {
        void this.requestMarkdownLinkPermission(intent.path);
        return;
      }

      void this.requestLocalFilePermission(intent.path, documentPath);
    };

    ui.markdownContent.addEventListener('click', onClick);
    this.linkClickDisposer = () => ui.markdownContent.removeEventListener('click', onClick);
  }

  private resolveHeadingTarget(fragment: string, anchorLabel?: string): HTMLElement | null {
    const decoded = this.decodeUriComponent(fragment).trim();
    if (!decoded) {
      return null;
    }

    for (const candidate of this.headingIdCandidates(decoded)) {
      const heading = this.findHeadingById(candidate);
      if (heading) {
        return heading;
      }
    }

    const label = anchorLabel?.trim();
    if (label) {
      const heading = this.findHeadingByText(label);
      if (heading) {
        return heading;
      }
    }

    const headingFromAliasLink = this.findHeadingByAliasLinkText(decoded);
    if (headingFromAliasLink) {
      return headingFromAliasLink;
    }

    return null;
  }

  private findHeadingByAliasLinkText(fragment: string): HTMLElement | null {
    const normalizedFragment = fragment.trim().toLowerCase();
    if (!normalizedFragment) {
      return null;
    }

    const links = this.deps.ui.markdownContent.querySelectorAll<HTMLAnchorElement>('a[href]');
    for (const link of links) {
      const href = link.getAttribute('href');
      if (!href || !href.startsWith('#')) {
        continue;
      }

      const candidateFragment = this.decodeUriComponent(href.slice(1)).trim().toLowerCase();
      if (candidateFragment !== normalizedFragment) {
        continue;
      }

      const heading = this.findHeadingByText((link.textContent ?? '').trim());
      if (heading) {
        return heading;
      }
    }

    return null;
  }

  private findDocumentHeadings(): HTMLElement[] {
    return Array.from(
      this.deps.ui.markdownContent.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')
    );
  }

  private findHeadingById(id: string): HTMLElement | null {
    const escapedId = this.escapeCssIdentifier(id);
    const target = this.deps.ui.markdownContent.querySelector<HTMLElement>(`#${escapedId}`);
    if (!target) {
      return null;
    }
    return this.resolveOwningHeading(target);
  }

  private resolveOwningHeading(element: HTMLElement): HTMLElement | null {
    if (this.isHeadingElement(element)) {
      return element;
    }

    const heading = element.closest<HTMLElement>('h1, h2, h3, h4, h5, h6');
    if (heading && this.deps.ui.markdownContent.contains(heading)) {
      return heading;
    }

    return null;
  }

  private isHeadingElement(element: Element): element is HTMLHeadingElement {
    return /^h[1-6]$/i.test(element.tagName);
  }

  private escapeCssIdentifier(value: string): string {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(value);
    }

    return value.replace(/[\u0000-\u001f\u007f]|^-?\d|^-$|[^a-zA-Z0-9_-]/g, (char) => {
      if (char === '\0') {
        return '\uFFFD';
      }
      return `\\${char}`;
    });
  }

  private findHeadingByText(text: string): HTMLElement | null {
    const target = this.normalizeHeadingText(text);
    if (!target) {
      return null;
    }

    const headings = this.findDocumentHeadings();
    for (const heading of headings) {
      const headingText = this.normalizeHeadingText(heading.textContent ?? '');
      if (headingText === target) {
        return heading;
      }
    }

    return null;
  }

  private headingIdCandidates(fragment: string): string[] {
    const candidates = new Set<string>();
    const addCandidate = (id: string) => {
      const normalized = id.trim();
      if (!normalized) {
        return;
      }

      candidates.add(normalized);
      if (normalized.startsWith('mdv-')) {
        candidates.add(normalized.slice(4));
      } else {
        candidates.add(`mdv-${normalized}`);
      }
    };

    addCandidate(fragment);
    addCandidate(fragment.toLowerCase());

    const slug = this.slugifyFragment(fragment);
    if (slug) {
      addCandidate(slug);
    }

    return Array.from(candidates);
  }

  private slugifyFragment(fragment: string): string {
    return fragment
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9 _-]+/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private decodeUriComponent(value: string): string {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  private normalizeHeadingText(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async openExternalUrl(url: string): Promise<void> {
    try {
      await this.deps.externalUrlOpener.openExternalUrl(url);
    } catch (error) {
      this.showErrorBanner(`Unable to open external link: ${this.errorToMessage(error)}`);
    }
  }

  private async requestExternalUrlPermission(url: string): Promise<void> {
    const allow = await this.requestPermission({
      title: 'Open External Link',
      message: 'This will open your browser or default external handler.',
      target: url,
      allowLabel: 'Open Link',
    });
    if (!allow || this.disposed) {
      return;
    }
    await this.openExternalUrl(url);
  }

  private async openExternalPath(path: string, sourceDocumentPath: string): Promise<void> {
    try {
      await this.deps.externalUrlOpener.openExternalPath(path, sourceDocumentPath);
    } catch (error) {
      const message = this.errorToMessage(error);
      if (isLinkedFileOutsideScopeError(message)) {
        this.showErrorBanner(
          'Linked file can only be opened when it is in the same folder or a subfolder of the current markdown document.'
        );
        return;
      }
      this.showErrorBanner(`Unable to open linked file: ${message}`);
    }
  }

  private async requestMarkdownLinkPermission(path: string): Promise<void> {
    const allow = await this.requestPermission({
      title: 'Open Linked Markdown',
      message: 'Open this linked markdown document in a new tab in this window?',
      target: path,
      allowLabel: 'Open Tab',
    });
    if (!allow || this.disposed) {
      return;
    }
    await this.openMarkdownInNewTab(path);
  }

  private async requestLocalFilePermission(
    path: string,
    sourceDocumentPath: string
  ): Promise<void> {
    const allow = await this.requestPermission({
      title: 'Open Linked File',
      message: 'Open this file with your system default application?',
      target: path,
      allowLabel: 'Open File',
    });
    if (!allow || this.disposed) {
      return;
    }
    await this.openExternalPath(path, sourceDocumentPath);
  }

  private async openMarkdownInNewTab(path: string): Promise<void> {
    try {
      await this.openDocumentInTab(path, {
        activateTab: true,
        restartWatch: true,
        restoreScroll: true,
      });
    } catch (error) {
      this.showErrorBanner(`Unable to open linked markdown file: ${this.errorToMessage(error)}`);
    }
  }

  private async requestPermission(options: {
    title: string;
    message: string;
    target: string;
    allowLabel?: string;
  }): Promise<boolean> {
    if (this.permissionResolver) {
      this.resolvePermissionRequest(false);
    }

    const { ui } = this.deps;
    ui.permissionTitle.textContent = options.title;
    ui.permissionMessage.textContent = options.message;
    ui.permissionTarget.textContent = options.target;
    ui.permissionAllowButton.textContent = options.allowLabel ?? 'Allow';
    ui.permissionDialog.classList.add('visible');
    ui.permissionDialog.setAttribute('aria-hidden', 'false');

    return new Promise<boolean>((resolve) => {
      this.permissionResolver = resolve;
      ui.permissionAllowButton.focus();
    });
  }

  private resolvePermissionRequest(allowed: boolean): void {
    const resolver = this.permissionResolver;
    if (!resolver) {
      return;
    }
    this.permissionResolver = null;

    const { ui } = this.deps;
    ui.permissionDialog.classList.remove('visible');
    ui.permissionDialog.setAttribute('aria-hidden', 'true');
    ui.permissionAllowButton.textContent = 'Allow';
    resolver(allowed);
  }

  private isPermissionDialogVisible(): boolean {
    return this.deps.ui.permissionDialog.classList.contains('visible');
  }

  private async applyMathEnhancement(): Promise<void> {
    const { ui } = this.deps;
    try {
      const inlineMath = ui.markdownContent.querySelectorAll<HTMLElement>(
        'span[data-math-style="inline"], span[data-math-style="display"]'
      );
      for (const element of inlineMath) {
        if (this.disposed) {
          return;
        }
        const formula = element.textContent ?? '';
        const displayMode = element.dataset.mathStyle === 'display';
        await this.deps.formattingEngine.renderMath(formula, element, displayMode);
      }

      const codeMath = ui.markdownContent.querySelectorAll<HTMLElement>('code[data-math-style]');
      for (const code of codeMath) {
        if (this.disposed) {
          return;
        }
        const formula = code.textContent ?? '';
        const displayMode = code.dataset.mathStyle === 'display';
        const holder = document.createElement(displayMode ? 'div' : 'span');
        await this.deps.formattingEngine.renderMath(formula, holder, displayMode);

        const parent = code.parentElement;
        if (displayMode && parent?.tagName.toLowerCase() === 'pre') {
          parent.replaceWith(holder);
        } else {
          code.replaceWith(holder);
        }
      }
    } catch (error) {
      this.activateSafeMode('Math rendering failed', this.errorToMessage(error));
    }
  }

  private async applyCodeHighlighting(): Promise<void> {
    const { ui } = this.deps;
    const blocks = Array.from(ui.markdownContent.querySelectorAll<HTMLElement>('pre code'));
    if (blocks.length === 0) {
      return;
    }

    if (this.settings.performanceMode) {
      this.codeObserver = new IntersectionObserver(
        (entries, observer) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) {
              continue;
            }
            const block = entry.target as HTMLElement;
            void this.highlightBlock(block);
            observer.unobserve(block);
          }
        },
        { root: ui.viewerScroll, threshold: 0.12 }
      );

      for (const block of blocks) {
        this.codeObserver.observe(block);
      }
      return;
    }

    for (const block of blocks) {
      await this.highlightBlock(block);
    }
  }

  private async highlightBlock(block: HTMLElement): Promise<void> {
    if (block.dataset.highlighted === 'true') {
      return;
    }
    if (block.classList.contains('language-math')) {
      return;
    }
    try {
      await this.deps.formattingEngine.highlightCodeElement(block);
      block.dataset.highlighted = 'true';
    } catch (error) {
      this.activateSafeMode('Code highlighting failed', this.errorToMessage(error));
    }
  }

  private observeActiveHeading(): void {
    const { ui } = this.deps;
    const headings = this.findDocumentHeadings().filter((heading) =>
      Boolean(this.resolveObservedHeadingId(heading))
    );
    if (headings.length === 0) {
      return;
    }

    this.headingObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length === 0) {
          return;
        }
        const heading = visible[0].target as HTMLElement;
        const headingId = this.resolveObservedHeadingId(heading);
        if (!headingId || headingId === this.activeHeadingId) {
          return;
        }
        this.activeHeadingId = headingId;
        if (this.settings.tocAutoExpand) {
          this.expandAncestors(headingId);
        }
        this.updateActiveTocState();
      },
      {
        root: ui.viewerScroll,
        threshold: [0.1, 0.5, 1],
        rootMargin: '-12% 0px -72% 0px',
      }
    );

    for (const heading of headings) {
      this.headingObserver.observe(heading);
    }
  }

  private resolveObservedHeadingId(heading: HTMLElement): string | null {
    if (heading.id) {
      return heading.id;
    }

    const nested = heading.querySelector<HTMLElement>('[id]');
    return nested?.id ?? null;
  }

  private renderToc(entries: TocEntry[]): void {
    const { ui } = this.deps;
    this.activeHeadingId = '';
    const tree = buildTocTree(entries);
    this.tocParentMap = buildParentMap(tree);

    if (tree.length === 0) {
      ui.tocList.innerHTML = '<li class="toc-empty">No headings</li>';
      return;
    }

    ui.tocList.innerHTML = tree.map((node) => this.renderTocNode(node)).join('');

    const toggleButtons = ui.tocList.querySelectorAll<HTMLButtonElement>(
      'button[data-toc-toggle]'
    );
    for (const button of toggleButtons) {
      button.addEventListener('click', () => {
        const id = button.dataset.id;
        if (!id) {
          return;
        }
        this.settings.tocCollapsed[id] = !this.settings.tocCollapsed[id];
        this.persistSettings();
        this.renderToc(entries);
        this.updateActiveTocState();
      });
    }

    const links = ui.tocList.querySelectorAll<HTMLAnchorElement>('a[data-toc-link]');
    for (const link of links) {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const id = link.dataset.id;
        if (!id) {
          return;
        }
        const heading = ui.markdownContent.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
        if (heading) {
          heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        if (this.settings.tocAutoExpand) {
          this.expandAncestors(id);
        }
        this.activeHeadingId = id;
        this.updateActiveTocState();
      });
    }
  }

  private renderTocNode(node: TocNode): string {
    const collapsed = this.settings.tocCollapsed[node.id] === true;
    const hasChildren = node.children.length > 0;
    const hiddenClass = collapsed ? 'collapsed' : '';
    const toggle = hasChildren
      ? `<button class="toc-toggle" data-toc-toggle="1" data-id="${escapeHtml(node.id)}" aria-label="Toggle section">${collapsed ? '▸' : '▾'}</button>`
      : '<span class="toc-toggle spacer"></span>';

    const children = hasChildren
      ? `<ul class="toc-children ${hiddenClass}">${node.children
          .map((child) => this.renderTocNode(child))
          .join('')}</ul>`
      : '';

    return `<li class="toc-item level-${node.level}" data-id="${escapeHtml(node.id)}">
    <div class="toc-row">
      ${toggle}
      <a class="toc-link" href="#${encodeURIComponent(node.id)}" data-toc-link="1" data-id="${escapeHtml(node.id)}">${escapeHtml(node.text)}</a>
    </div>
    ${children}
  </li>`;
  }

  private updateActiveTocState(): void {
    const items = this.deps.ui.tocList.querySelectorAll<HTMLElement>('.toc-item');
    for (const item of items) {
      const isActive = item.dataset.id === this.activeHeadingId;
      item.classList.toggle('active', isActive);
    }
  }

  private expandAncestors(id: string): void {
    let cursor: string | null = id;
    while (cursor) {
      this.settings.tocCollapsed[cursor] = false;
      cursor = this.tocParentMap.get(cursor) ?? null;
    }
    this.persistSettings();
    if (this.currentDocument) {
      this.renderToc(this.currentDocument.toc);
    }
  }

  private setStatus(text: string): void {
    this.deps.ui.subtitle.textContent = text;
  }

  private persistScroll(): void {
    if (!this.currentDocument) {
      return;
    }
    const all = this.deps.scrollMemoryStore.load();
    all[this.currentDocument.path] = this.deps.ui.viewerScroll.scrollTop;
    this.deps.scrollMemoryStore.save(all);
  }

  private restoreScroll(path: string): void {
    const all = this.deps.scrollMemoryStore.load();
    const scrollTop = all[path];
    this.deps.ui.viewerScroll.scrollTop = typeof scrollTop === 'number' ? scrollTop : 0;
  }

  private scheduleReloadFromWatcher(): void {
    if (this.reloadTimer !== null) {
      window.clearTimeout(this.reloadTimer);
    }
    this.reloadTimer = window.setTimeout(() => {
      if (this.disposed) {
        return;
      }
      void this.reloadCurrentDocument();
    }, 350);
  }

  private applySettingsToControls(): void {
    const { ui } = this.deps;
    ui.perfToggle.checked = this.settings.performanceMode;
    ui.safeToggle.checked = this.settings.safeMode;
    ui.themeSelect.value = this.settings.theme;
    ui.fontScale.value = this.settings.fontScale.toString();
    ui.lineHeight.value = this.settings.lineHeight.toString();
    ui.measureWidth.min = MEASURE_WIDTH_MIN.toString();
    ui.measureWidth.value = this.settings.measureWidth.toString();
    ui.includeLinks.checked = this.settings.wordCountRules.includeLinks;
    ui.includeCode.checked = this.settings.wordCountRules.includeCode;
    ui.includeFrontMatter.checked = this.settings.wordCountRules.includeFrontMatter;
    ui.tocAutoExpand.checked = this.settings.tocAutoExpand;
  }

  private refreshMeasureWidthControl(options: { keepAtMax: boolean }): void {
    const { ui } = this.deps;
    const previousMax = this.currentMeasureWidthMax();
    const nextMax = this.calculateMeasureWidthMaxForLayout();

    ui.measureWidth.min = MEASURE_WIDTH_MIN.toString();
    ui.measureWidth.max = nextMax.toString();

    const nextSetting = reconcileMeasureWidthOnMaxChange({
      currentWidth: this.settings.measureWidth,
      previousMax,
      nextMax,
      keepAtMax: options.keepAtMax,
    });
    if (nextSetting !== this.settings.measureWidth) {
      this.settings.measureWidth = nextSetting;
      this.persistSettings();
    }
    ui.measureWidth.value = this.settings.measureWidth.toString();
  }

  private calculateMeasureWidthMaxForLayout(): number {
    const availableWidth = this.deps.ui.viewerScroll.clientWidth;
    const articleStyle = window.getComputedStyle(this.deps.ui.markdownContent);
    const paddingLeft = this.parsePx(articleStyle.paddingLeft);
    const paddingRight = this.parsePx(articleStyle.paddingRight);
    const chWidth = this.measureCharacterWidthPx(articleStyle);
    return deriveMeasureWidthMax({
      availableWidthPx: availableWidth,
      horizontalPaddingPx: paddingLeft + paddingRight,
      chWidthPx: chWidth,
      fallbackMax: MEASURE_WIDTH_FALLBACK_MAX,
    });
  }

  private measureCharacterWidthPx(articleStyle: CSSStyleDeclaration): number {
    const probe = document.createElement('span');
    probe.textContent = '0';
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    probe.style.whiteSpace = 'pre';
    probe.style.fontFamily = articleStyle.fontFamily || 'serif';
    probe.style.fontSize = articleStyle.fontSize || '16px';
    probe.style.fontWeight = articleStyle.fontWeight || '400';
    probe.style.fontStyle = articleStyle.fontStyle || 'normal';

    this.deps.ui.viewerScroll.append(probe);
    const measured = probe.getBoundingClientRect().width;
    probe.remove();
    if (Number.isFinite(measured) && measured > 0) {
      return measured;
    }

    const fallbackFontSize = this.parsePx(articleStyle.fontSize) || 16;
    return fallbackFontSize * 0.5;
  }

  private parsePx(value: string): number {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  private currentMeasureWidthMax(): number {
    const parsed = Number.parseFloat(this.deps.ui.measureWidth.max);
    if (!Number.isFinite(parsed) || parsed < MEASURE_WIDTH_MIN) {
      return MEASURE_WIDTH_FALLBACK_MAX;
    }
    return parsed;
  }

  private applySidebarLayout(): void {
    const { ui } = this.deps;
    const leftCollapsed = this.layoutState.leftSidebarCollapsed;
    const rightCollapsed = this.layoutState.rightSidebarCollapsed;

    ui.workspace.classList.toggle('left-collapsed', leftCollapsed);
    ui.workspace.classList.toggle('right-collapsed', rightCollapsed);

    this.updateSidebarToggleButton(ui.toggleLeftSidebarButton, {
      collapsed: leftCollapsed,
      expandedLabel: 'Hide Outline',
      collapsedLabel: 'Show Outline',
    });
    this.updateSidebarToggleButton(ui.toggleRightSidebarButton, {
      collapsed: rightCollapsed,
      expandedLabel: 'Hide Reading',
      collapsedLabel: 'Show Reading',
    });
  }

  private updateSidebarToggleButton(
    button: HTMLButtonElement,
    options: { collapsed: boolean; expandedLabel: string; collapsedLabel: string }
  ): void {
    const label = options.collapsed ? options.collapsedLabel : options.expandedLabel;
    button.textContent = label;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-expanded', String(!options.collapsed));
    button.classList.toggle('active', !options.collapsed);
  }

  private applySettingsToDocument(): void {
    document.documentElement.dataset.theme = this.settings.theme;
    document.documentElement.classList.toggle('performance-mode', this.settings.performanceMode);
    document.documentElement.classList.toggle('safe-mode', this.settings.safeMode);
    document.documentElement.style.setProperty(
      '--reader-font-scale',
      this.settings.fontScale.toString()
    );
    document.documentElement.style.setProperty(
      '--reader-line-height',
      this.settings.lineHeight.toString()
    );
    document.documentElement.style.setProperty(
      '--reader-measure-width',
      measureWidthCssValue(this.settings.measureWidth, this.currentMeasureWidthMax())
    );
  }

  private renderEmptyState(): void {
    const { ui } = this.deps;
    ui.title.textContent = 'Open a markdown file';
    ui.subtitle.textContent = 'Drop a .md file or click Open';
    ui.stats.textContent = '0 words • 0 min read';
    ui.path.textContent = 'No file loaded';
    ui.tocList.innerHTML = '<li class="toc-empty">No headings</li>';
    ui.safeContent.hidden = true;
    ui.markdownContent.hidden = false;
    ui.markdownContent.innerHTML = `<section class="welcome-card">
    <h2>Markdown Viewer</h2>
    <p>Focused reading UX with clean typography, live refresh, and resilient rendering.</p>
    <ul>
      <li>Drag and drop a markdown file to begin.</li>
      <li>Use Theme + Typography controls to tune readability.</li>
      <li>Performance mode lazy-loads heavy formatting on long documents.</li>
    </ul>
  </section>`;
    this.renderTabs();
  }

  private cleanupObservers(): void {
    this.headingObserver?.disconnect();
    this.headingObserver = null;
    this.codeObserver?.disconnect();
    this.codeObserver = null;
  }

  private installGlobalCrashHandlers(): void {
    if (!this.windowErrorHandler) {
      this.windowErrorHandler = (event) => {
        this.activateSafeMode('Runtime error detected', event.message);
      };
      window.addEventListener('error', this.windowErrorHandler);
    }

    if (!this.unhandledRejectionHandler) {
      this.unhandledRejectionHandler = (event) => {
        this.activateSafeMode(
          'Unhandled promise rejection',
          this.errorToMessage(event.reason)
        );
      };
      window.addEventListener('unhandledrejection', this.unhandledRejectionHandler);
    }
  }

  private activateSafeMode(reason: string, detail: string): void {
    if (this.disposed) {
      return;
    }
    this.settings.safeMode = true;
    this.deps.ui.safeToggle.checked = true;
    this.persistSettings();
    this.applySettingsToDocument();
    this.showErrorBanner(`${reason}: ${detail}`);
    if (this.currentDocument) {
      this.deps.ui.markdownContent.hidden = true;
      this.deps.ui.safeContent.hidden = false;
      this.deps.ui.safeContent.textContent = this.currentDocument.source;
    }
  }

  private showErrorBanner(message: string): void {
    this.deps.ui.errorText.textContent = message;
    this.deps.ui.errorBanner.classList.add('visible');
  }

  private persistSettings(): void {
    this.deps.settingsStore.save(this.settings);
  }

  private persistLayoutState(): void {
    this.deps.layoutStateStore.save(this.layoutState);
  }

  private nextFrame(): Promise<void> {
    return new Promise((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }

  private errorToMessage(error: unknown): string {
    if (typeof error === 'string') {
      return error;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return 'Unknown error';
  }
}
