// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import { DocumentLinkController } from './document-link-controller';

describe('document-link-controller (presentation)', () => {
  it('routes anchor, external, markdown, and local file links to the correct handlers', () => {
    const markdownContent = document.createElement('article');
    markdownContent.innerHTML = [
      '<h2><a id="mdv-inline-html" aria-hidden="true"></a>Inline HTML</h2>',
      '<p><a id="anchor-link" href="#html">Inline HTML</a></p>',
      '<p><a id="external-link" href="https://example.com/docs">External</a></p>',
      '<p><a id="markdown-link" href="./next.md">Next</a></p>',
      '<p><a id="local-link" href="./assets/sample-image.svg">Asset</a></p>',
      '<img id="relative-image" src="./assets/sample-image.svg" />',
    ].join('');
    document.body.append(markdownContent);

    const openExternalUrl = vi.fn();
    const openMarkdownFile = vi.fn();
    const openLocalFile = vi.fn();
    const controller = new DocumentLinkController({
      ui: { markdownContent },
      openExternalUrl,
      openMarkdownFile,
      openLocalFile,
    });

    const sourcePath = '/work/markdown-viewer/test-fixtures/link-behavior/main.md';
    controller.applyNormalizedResourceUrls(sourcePath);
    controller.bind(sourcePath);

    const heading = markdownContent.querySelector<HTMLElement>('h2')!;
    const scrollIntoViewMock = vi.fn();
    Object.defineProperty(heading, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock,
    });

    const anchorEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    markdownContent.querySelector<HTMLElement>('#anchor-link')!.dispatchEvent(anchorEvent);
    expect(anchorEvent.defaultPrevented).toBe(true);
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);

    const externalEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    markdownContent.querySelector<HTMLElement>('#external-link')!.dispatchEvent(externalEvent);
    expect(externalEvent.defaultPrevented).toBe(true);
    expect(openExternalUrl).toHaveBeenCalledWith('https://example.com/docs');

    const markdownEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    markdownContent.querySelector<HTMLElement>('#markdown-link')!.dispatchEvent(markdownEvent);
    expect(markdownEvent.defaultPrevented).toBe(true);
    expect(openMarkdownFile).toHaveBeenCalledWith('/work/markdown-viewer/test-fixtures/link-behavior/next.md');

    const localEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    markdownContent.querySelector<HTMLElement>('#local-link')!.dispatchEvent(localEvent);
    expect(localEvent.defaultPrevented).toBe(true);
    expect(openLocalFile).toHaveBeenCalledWith(
      '/work/markdown-viewer/test-fixtures/link-behavior/assets/sample-image.svg',
      sourcePath
    );

    const normalizedImageSrc = markdownContent
      .querySelector<HTMLImageElement>('#relative-image')!
      .getAttribute('src');
    expect(normalizedImageSrc).toBe(
      'file:///work/markdown-viewer/test-fixtures/link-behavior/assets/sample-image.svg'
    );

    controller.dispose();
  });
});
