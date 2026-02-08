import { describe, expect, it } from 'vitest';

import { isMarkdownPath, normalizePathForCompare } from './path-utils';

describe('path-utils', () => {
  it('normalizes Windows-style paths as case-insensitive', () => {
    expect(normalizePathForCompare('C:\\Docs\\ReadMe.MD')).toBe('c:/docs/readme.md');
    expect(normalizePathForCompare('\\\\Server\\Share\\Doc.MD')).toBe('//server/share/doc.md');
  });

  it('preserves case for POSIX paths', () => {
    expect(normalizePathForCompare('/Users/ME/Notes.md')).toBe('/Users/ME/Notes.md');
  });

  it('detects markdown paths with query/hash and mixed case', () => {
    expect(isMarkdownPath('/tmp/guide.MD')).toBe(true);
    expect(isMarkdownPath('/tmp/guide.md?line=12')).toBe(true);
    expect(isMarkdownPath('/tmp/guide.markdown#section-a')).toBe(true);
    expect(isMarkdownPath('/tmp/guide.txt')).toBe(false);
  });
});
