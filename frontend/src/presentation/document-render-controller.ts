import type { ViewerSettings } from '../application/settings';
import type { MarkdownDocument } from '../domain';
import type { DocumentLinkController } from './document-link-controller';
import { errorToMessage } from './error-utils';
import { FindController } from './find-controller';
import type { MarkdownFormattingEngine } from '../application/ports';
import {
  CHUNKED_HTML_RENDER_SIZE,
  shouldChunkHtmlRender,
} from '../application/render-performance-budget';
import { TocController } from './toc-controller';
import type { ViewerUi } from './ui';

interface DocumentRenderControllerDeps {
  ui: Pick<
    ViewerUi,
    | 'title'
    | 'subtitle'
    | 'path'
    | 'stats'
    | 'markdownContent'
    | 'safeContent'
    | 'viewerScroll'
  >;
  formattingEngine: MarkdownFormattingEngine;
  findController: FindController;
  tocController: TocController;
  documentLinkController: DocumentLinkController;
  getSettings: () => ViewerSettings;
  isDisposed: () => boolean;
  onActivateSafeMode: (reason: string, detail: string, source: string | null) => void;
}

export class DocumentRenderController {
  private readonly deps: DocumentRenderControllerDeps;
  private codeObserver: IntersectionObserver | null = null;
  private activeRenderToken = 0;

  constructor(deps: DocumentRenderControllerDeps) {
    this.deps = deps;
  }

  dispose(): void {
    this.invalidateActiveRender();
    this.cleanupObservers();
    this.deps.documentLinkController.dispose();
  }

  async renderDocument(documentDto: MarkdownDocument): Promise<void> {
    const { ui } = this.deps;
    const settings = this.deps.getSettings();
    const renderToken = this.beginRender();

    ui.title.textContent = documentDto.title;
    ui.subtitle.textContent = settings.performanceMode
      ? 'Performance mode enabled'
      : 'Typography mode enabled';
    ui.path.textContent = documentDto.path;
    ui.stats.textContent = `${documentDto.wordCount.toLocaleString()} words • ${documentDto.readingTimeMinutes} min read`;

    this.cleanupObservers();
    this.deps.tocController.render(documentDto.toc);

    if (settings.safeMode) {
      ui.markdownContent.hidden = true;
      ui.safeContent.hidden = false;
      ui.safeContent.textContent = documentDto.source;
      this.deps.findController.reapplyOnRenderedDocument();
      return;
    }

    ui.safeContent.hidden = true;
    ui.markdownContent.hidden = false;
    if (!(await this.renderHtmlInBatches(documentDto.html, settings, renderToken))) {
      return;
    }
    if (!this.isRenderActive(renderToken)) {
      return;
    }
    this.deps.documentLinkController.applyNormalizedResourceUrls(documentDto.path);
    this.deps.documentLinkController.bind(documentDto.path);
    if (!(await this.applyMathEnhancement(documentDto.source, renderToken))) {
      return;
    }
    if (!(await this.applyCodeHighlighting(settings, documentDto.source, renderToken))) {
      return;
    }
    if (!this.isRenderActive(renderToken)) {
      return;
    }
    this.deps.tocController.observeActiveHeading();
    this.deps.findController.reapplyOnRenderedDocument();
  }

  renderEmptyState(): void {
    const { ui } = this.deps;
    this.invalidateActiveRender();
    this.cleanupObservers();
    this.deps.documentLinkController.dispose();
    ui.title.textContent = 'Open a markdown file';
    ui.subtitle.textContent = 'Drop a .md file or click Open';
    ui.stats.textContent = '0 words • 0 min read';
    ui.path.textContent = 'No file loaded';
    this.deps.tocController.render([]);
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
    this.deps.findController.resetForEmptyContent();
  }

  private async renderHtmlInBatches(
    html: string,
    settings: ViewerSettings,
    renderToken: number
  ): Promise<boolean> {
    if (!this.isRenderActive(renderToken)) {
      return false;
    }

    const { ui } = this.deps;
    ui.markdownContent.replaceChildren();
    const staging = document.createElement('div');
    staging.innerHTML = html;
    const nodes = Array.from(staging.childNodes);

    const chunkSize = shouldChunkHtmlRender({
      performanceMode: settings.performanceMode,
      htmlLength: html.length,
    })
      ? CHUNKED_HTML_RENDER_SIZE
      : nodes.length;
    for (let index = 0; index < nodes.length; index += chunkSize) {
      if (!this.isRenderActive(renderToken)) {
        return false;
      }

      const chunk = nodes.slice(index, index + chunkSize);
      for (const node of chunk) {
        ui.markdownContent.appendChild(node);
      }
      if (chunkSize !== nodes.length) {
        await this.nextFrame();
      }
    }

    return this.isRenderActive(renderToken);
  }

  private async applyMathEnhancement(
    documentSource: string,
    renderToken: number
  ): Promise<boolean> {
    const { ui } = this.deps;
    try {
      const inlineMath = ui.markdownContent.querySelectorAll<HTMLElement>(
        'span[data-math-style="inline"], span[data-math-style="display"]'
      );
      for (const element of inlineMath) {
        if (!this.isRenderActive(renderToken)) {
          return false;
        }
        const formula = element.textContent ?? '';
        const displayMode = element.dataset.mathStyle === 'display';
        const renderedMath = await this.deps.formattingEngine.renderMathToHtml(formula, displayMode);
        if (!this.isRenderActive(renderToken)) {
          return false;
        }
        element.innerHTML = renderedMath;
      }

      const codeMath = ui.markdownContent.querySelectorAll<HTMLElement>('code[data-math-style]');
      for (const code of codeMath) {
        if (!this.isRenderActive(renderToken)) {
          return false;
        }
        const formula = code.textContent ?? '';
        const displayMode = code.dataset.mathStyle === 'display';
        const holder = document.createElement(displayMode ? 'div' : 'span');
        holder.innerHTML = await this.deps.formattingEngine.renderMathToHtml(formula, displayMode);
        if (!this.isRenderActive(renderToken)) {
          return false;
        }

        const parent = code.parentElement;
        if (displayMode && parent?.tagName.toLowerCase() === 'pre') {
          parent.replaceWith(holder);
        } else {
          code.replaceWith(holder);
        }
      }
    } catch (error) {
      if (!this.isRenderActive(renderToken)) {
        return false;
      }
      this.deps.onActivateSafeMode(
        'Math rendering failed',
        errorToMessage(error),
        documentSource
      );
      return false;
    }

    return this.isRenderActive(renderToken);
  }

  private async applyCodeHighlighting(
    settings: ViewerSettings,
    documentSource: string,
    renderToken: number
  ): Promise<boolean> {
    if (!this.isRenderActive(renderToken)) {
      return false;
    }

    const { ui } = this.deps;
    const blocks = Array.from(ui.markdownContent.querySelectorAll<HTMLElement>('pre code'));
    if (blocks.length === 0) {
      return true;
    }

    if (settings.performanceMode) {
      this.codeObserver = new IntersectionObserver(
        (entries, observer) => {
          for (const entry of entries) {
            if (!entry.isIntersecting || !this.isRenderActive(renderToken)) {
              continue;
            }
            const block = entry.target as HTMLElement;
            void this.highlightBlock(block, documentSource, renderToken);
            observer.unobserve(block);
          }
        },
        { root: ui.viewerScroll, threshold: 0.12 }
      );

      for (const block of blocks) {
        if (!this.isRenderActive(renderToken)) {
          return false;
        }
        this.codeObserver.observe(block);
      }
      return true;
    }

    for (const block of blocks) {
      if (!(await this.highlightBlock(block, documentSource, renderToken))) {
        return false;
      }
    }

    return true;
  }

  private async highlightBlock(
    block: HTMLElement,
    documentSource: string,
    renderToken: number
  ): Promise<boolean> {
    if (!this.isRenderActive(renderToken)) {
      return false;
    }
    if (block.dataset.highlighted === 'true') {
      return true;
    }
    if (block.classList.contains('language-math')) {
      return true;
    }

    try {
      const language = this.codeLanguage(block);
      const highlighted = await this.deps.formattingEngine.highlightCodeToHtml(
        block.textContent ?? '',
        language
      );
      if (
        !this.isRenderActive(renderToken) ||
        !this.deps.ui.markdownContent.contains(block)
      ) {
        return false;
      }
      block.innerHTML = highlighted;
      block.dataset.highlighted = 'true';
    } catch (error) {
      if (!this.isRenderActive(renderToken)) {
        return false;
      }
      this.deps.onActivateSafeMode('Code highlighting failed', errorToMessage(error), documentSource);
      return false;
    }

    return true;
  }

  private codeLanguage(block: HTMLElement): string | null {
    for (const className of block.classList) {
      if (!className.startsWith('language-')) {
        continue;
      }
      const language = className.slice('language-'.length).trim();
      if (language.length > 0) {
        return language;
      }
    }
    return null;
  }

  private cleanupObservers(): void {
    this.deps.tocController.disconnect();
    this.codeObserver?.disconnect();
    this.codeObserver = null;
  }

  private nextFrame(): Promise<void> {
    return new Promise((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }

  private beginRender(): number {
    this.activeRenderToken += 1;
    return this.activeRenderToken;
  }

  private invalidateActiveRender(): void {
    this.activeRenderToken += 1;
  }

  private isRenderActive(renderToken: number): boolean {
    return renderToken === this.activeRenderToken && !this.deps.isDisposed();
  }
}
