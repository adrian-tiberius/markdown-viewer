import { describe, expect, it } from 'vitest';

import {
  baseDirectoryFileUrl,
  filePathToFileUrl,
  isMarkdownPath,
  normalizePathForCompare,
  withoutFragment,
} from './path-utils';

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
});
