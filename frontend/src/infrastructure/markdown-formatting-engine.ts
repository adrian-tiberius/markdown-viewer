import type { MarkdownFormattingEngine } from '../presentation/ports';

export class BrowserMarkdownFormattingEngine implements MarkdownFormattingEngine {
  private hljsPromise: Promise<typeof import('highlight.js/lib/common')['default']> | null = null;
  private katexPromise: Promise<typeof import('katex')['default']> | null = null;

  async renderMath(formula: string, target: HTMLElement, displayMode: boolean): Promise<void> {
    const katex = await this.loadKatex();
    katex.render(formula, target, {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
    });
  }

  async highlightCodeElement(target: HTMLElement): Promise<void> {
    const hljs = await this.loadHighlightJs();
    hljs.highlightElement(target);
  }

  private loadKatex(): Promise<typeof import('katex')['default']> {
    if (!this.katexPromise) {
      this.katexPromise = import('katex').then((module) => module.default);
    }
    return this.katexPromise;
  }

  private loadHighlightJs(): Promise<typeof import('highlight.js/lib/common')['default']> {
    if (!this.hljsPromise) {
      this.hljsPromise = import('highlight.js/lib/common').then((module) => module.default);
    }
    return this.hljsPromise;
  }
}
