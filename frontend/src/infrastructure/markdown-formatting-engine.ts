import type { MarkdownFormattingEngine } from '../application/ports';

export class BrowserMarkdownFormattingEngine implements MarkdownFormattingEngine {
  private hljsPromise: Promise<typeof import('highlight.js/lib/common')['default']> | null = null;
  private katexPromise: Promise<typeof import('katex')['default']> | null = null;

  async renderMathToHtml(formula: string, displayMode: boolean): Promise<string> {
    const katex = await this.loadKatex();
    return katex.renderToString(formula, {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
    });
  }

  async highlightCodeToHtml(sourceCode: string, language: string | null): Promise<string> {
    const hljs = await this.loadHighlightJs();
    if (language && hljs.getLanguage(language)) {
      try {
        return hljs.highlight(sourceCode, {
          language,
          ignoreIllegals: true,
        }).value;
      } catch {
        // Fall through to auto-detection when explicit language highlighting fails.
      }
    }

    return hljs.highlightAuto(sourceCode).value;
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
