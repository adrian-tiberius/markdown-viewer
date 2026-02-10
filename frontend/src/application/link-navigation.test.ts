import { describe, expect, it } from 'vitest';

import {
  isLinkedFileOutsideScopeError,
  resolveDocumentLinkIntent,
} from './link-navigation';

describe('link-navigation', () => {
  const documentPath = '/tmp/docs/main.md';

  it('classifies same-document hash links as scroll intent', () => {
    expect(resolveDocumentLinkIntent({ href: '#overview', documentPath })).toEqual({
      type: 'scroll-to-anchor',
      fragment: 'overview',
    });
  });

  it('classifies supported external links', () => {
    expect(
      resolveDocumentLinkIntent({ href: 'https://example.com/path', documentPath })
    ).toEqual({
      type: 'open-external-url',
      url: 'https://example.com/path',
    });
  });

  it('ignores unsupported external protocols', () => {
    expect(
      resolveDocumentLinkIntent({ href: 'javascript:alert(1)', documentPath })
    ).toEqual({ type: 'none' });
  });

  it('classifies linked markdown files for in-app open', () => {
    expect(resolveDocumentLinkIntent({ href: './nested/readme.md', documentPath })).toEqual({
      type: 'open-markdown-file',
      path: '/tmp/docs/nested/readme.md',
    });
  });

  it('classifies linked non-markdown files for external open', () => {
    expect(resolveDocumentLinkIntent({ href: './assets/sample.txt', documentPath })).toEqual({
      type: 'open-local-file',
      path: '/tmp/docs/assets/sample.txt',
    });
  });

  it('treats same-document file URL anchors as scroll intent', () => {
    expect(resolveDocumentLinkIntent({ href: './main.md#intro', documentPath })).toEqual({
      type: 'scroll-to-anchor',
      fragment: 'intro',
    });
  });

  it('detects outside-scope errors produced by backend security checks', () => {
    expect(
      isLinkedFileOutsideScopeError('Linked file is outside allowed directory: /tmp/docs')
    ).toBe(true);
    expect(isLinkedFileOutsideScopeError('other failure')).toBe(false);
  });
});
