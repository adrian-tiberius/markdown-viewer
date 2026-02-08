import type {
  MarkdownFormattingEngine,
  MarkdownGateway,
  ScrollMemoryStore,
  ViewerSettingsStore,
} from './ports';
import {
  renderPreferencesFromSettings,
  shouldReloadForFileUpdate,
} from '../application/use-cases';
import { isMarkdownPath } from '../application/path-utils';
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
  filePathToFileUrl,
  hasUriScheme,
  type TocNode,
  withoutFragment,
} from './document-view-utils';
import type { ViewerUi } from './ui';

interface MarkdownViewerAppDeps {
  ui: ViewerUi;
  gateway: MarkdownGateway;
  formattingEngine: MarkdownFormattingEngine;
  settingsStore: ViewerSettingsStore;
  scrollMemoryStore: ScrollMemoryStore;
}

interface LoadOptions {
  restartWatch: boolean;
  restoreScroll: boolean;
}

export class MarkdownViewerApp {
  private readonly deps: MarkdownViewerAppDeps;
  private settings: ViewerSettings;
  private currentDocument: MarkdownDocument | null = null;
  private reloadTimer: number | null = null;
  private activeHeadingId = '';
  private currentLoadNonce = 0;
  private fileUpdateUnlisten: (() => void) | null = null;
  private dragDropUnlisten: (() => void) | null = null;
  private headingObserver: IntersectionObserver | null = null;
  private codeObserver: IntersectionObserver | null = null;
  private linkClickDisposer: (() => void) | null = null;
  private tocParentMap = new Map<string, string | null>();
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
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.disposed = false;
    const lifecycleToken = ++this.lifecycleToken;
    this.setupUiBindings();
    this.applySettingsToControls();
    this.applySettingsToDocument();
    this.installGlobalCrashHandlers();
    void this.registerRuntimeListeners(lifecycleToken);
    this.renderEmptyState();

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
          void this.loadDocument(path, { restartWatch: true, restoreScroll: true });
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

    this.bindUiListener(ui.printButton, 'click', () => {
      window.print();
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
    await this.loadDocument(path, { restartWatch: true, restoreScroll: true });
  }

  private async reloadCurrentDocument(): Promise<void> {
    if (!this.currentDocument) {
      return;
    }
    await this.loadDocument(this.currentDocument.path, {
      restartWatch: false,
      restoreScroll: true,
    });
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

      this.currentDocument = documentDto;
      this.deps.ui.errorBanner.classList.remove('visible');
      await this.renderDocument(documentDto, { restoreScroll: options.restoreScroll });
      if (nonce !== this.currentLoadNonce || this.disposed) {
        return;
      }

      if (options.restartWatch) {
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
    const documentUrl = withoutFragment(filePathToFileUrl(documentPath));
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

      if (href.startsWith('#')) {
        const id = href.slice(1);
        const heading = ui.markdownContent.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
        if (heading) {
          event.preventDefault();
          heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }

      if (!href.startsWith('file://')) {
        return;
      }

      try {
        const url = new URL(href);
        const targetFile = withoutFragment(url.toString());
        if (targetFile === documentUrl && url.hash) {
          event.preventDefault();
          const targetId = decodeURIComponent(url.hash.slice(1));
          const heading = ui.markdownContent.querySelector<HTMLElement>(
            `#${CSS.escape(targetId)}`
          );
          if (heading) {
            heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
          return;
        }

        if (isMarkdownPath(url.pathname)) {
          event.preventDefault();
          void this.loadDocument(url.toString(), {
            restartWatch: true,
            restoreScroll: true,
          });
        }
      } catch {
        // Keep browser default behavior when URL parsing fails.
      }
    };

    ui.markdownContent.addEventListener('click', onClick);
    this.linkClickDisposer = () => ui.markdownContent.removeEventListener('click', onClick);
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
    const headings = Array.from(
      ui.markdownContent.querySelectorAll<HTMLElement>(
        'h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]'
      )
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
        if (!heading.id || heading.id === this.activeHeadingId) {
          return;
        }
        this.activeHeadingId = heading.id;
        if (this.settings.tocAutoExpand) {
          this.expandAncestors(heading.id);
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
    ui.measureWidth.value = this.settings.measureWidth.toString();
    ui.includeLinks.checked = this.settings.wordCountRules.includeLinks;
    ui.includeCode.checked = this.settings.wordCountRules.includeCode;
    ui.includeFrontMatter.checked = this.settings.wordCountRules.includeFrontMatter;
    ui.tocAutoExpand.checked = this.settings.tocAutoExpand;
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
      `${this.settings.measureWidth}ch`
    );
  }

  private renderEmptyState(): void {
    const { ui } = this.deps;
    ui.title.textContent = 'Open a markdown file';
    ui.subtitle.textContent = 'Drop a .md file or click Open';
    ui.stats.textContent = '0 words • 0 min read';
    ui.path.textContent = 'No file loaded';
    ui.tocList.innerHTML = '<li class="toc-empty">No headings</li>';
    ui.markdownContent.innerHTML = `<section class="welcome-card">
    <h2>Markdown Viewer</h2>
    <p>Focused reading UX with clean typography, live refresh, and resilient rendering.</p>
    <ul>
      <li>Drag and drop a markdown file to begin.</li>
      <li>Use Theme + Typography controls to tune readability.</li>
      <li>Performance mode lazy-loads heavy formatting on long documents.</li>
    </ul>
  </section>`;
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
