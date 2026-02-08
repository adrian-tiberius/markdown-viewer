import { describe, expect, it } from 'vitest';

import {
  baseDirectoryFileUrl,
  buildParentMap,
  buildTocTree,
  escapeHtml,
  filePathToFileUrl,
  hasUriScheme,
  withoutFragment,
} from './document-view-utils';

describe('document-view-utils', () => {
  it('detects URI schemes without misclassifying relative paths', () => {
    expect(hasUriScheme('https://example.com')).toBe(true);
    expect(hasUriScheme('mailto:test@example.com')).toBe(true);
    expect(hasUriScheme('./relative/path.md')).toBe(false);
    expect(hasUriScheme('/absolute/path.md')).toBe(false);
  });

  it('drops URL fragments while keeping base URL', () => {
    expect(withoutFragment('file:///tmp/doc.md#overview')).toBe('file:///tmp/doc.md');
    expect(withoutFragment('file:///tmp/doc.md')).toBe('file:///tmp/doc.md');
  });

  it('converts filesystem paths to file URLs', () => {
    expect(filePathToFileUrl('/tmp/readme.md')).toBe('file:///tmp/readme.md');
    expect(filePathToFileUrl('C:\\Work Docs\\spec.md')).toBe('file:///C:/Work%20Docs/spec.md');
    expect(filePathToFileUrl('docs/readme.md')).toBe('file://docs/readme.md');
  });

  it('computes directory file URL from a file path', () => {
    expect(baseDirectoryFileUrl('/tmp/docs/readme.md')).toBe('file:///tmp/docs/');
    expect(baseDirectoryFileUrl('C:\\Work\\docs\\readme.md')).toBe('file:///C:/Work/docs/');
  });

  it('escapes html-sensitive characters', () => {
    expect(escapeHtml(`<div class="x">Tom & 'Jerry'</div>`)).toBe(
      '&lt;div class=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/div&gt;'
    );
  });

  it('builds toc tree and parent map for nested headings', () => {
    const tree = buildTocTree([
      { id: 'h1', text: 'H1', level: 1 },
      { id: 'h2a', text: 'H2-A', level: 2 },
      { id: 'h3a', text: 'H3-A', level: 3 },
      { id: 'h2b', text: 'H2-B', level: 2 },
      { id: 'h1b', text: 'H1-B', level: 1 },
    ]);

    expect(tree).toHaveLength(2);
    expect(tree[0].children).toHaveLength(2);
    expect(tree[0].children[0].children).toHaveLength(1);
    expect(tree[1].id).toBe('h1b');

    const parentMap = buildParentMap(tree);
    expect(parentMap.get('h1')).toBeNull();
    expect(parentMap.get('h2a')).toBe('h1');
    expect(parentMap.get('h3a')).toBe('h2a');
    expect(parentMap.get('h2b')).toBe('h1');
    expect(parentMap.get('h1b')).toBeNull();
  });
});
