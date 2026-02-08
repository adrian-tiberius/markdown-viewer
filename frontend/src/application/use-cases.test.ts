import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from './settings';
import { renderPreferencesFromSettings, shouldReloadForFileUpdate } from './use-cases';

describe('shouldReloadForFileUpdate', () => {
  it('returns true for equivalent Windows paths', () => {
    const shouldReload = shouldReloadForFileUpdate('C:\\Docs\\Readme.MD', 'c:/docs/readme.md');
    expect(shouldReload).toBe(true);
  });

  it('treats POSIX paths as case-sensitive', () => {
    const shouldReload = shouldReloadForFileUpdate('/tmp/Docs/readme.md', '/tmp/docs/readme.md');
    expect(shouldReload).toBe(false);
  });

  it('returns false when no document is currently loaded', () => {
    const shouldReload = shouldReloadForFileUpdate(null, '/tmp/docs/readme.md');
    expect(shouldReload).toBe(false);
  });

  it('returns false for different files', () => {
    const shouldReload = shouldReloadForFileUpdate('/tmp/docs/readme.md', '/tmp/docs/other.md');
    expect(shouldReload).toBe(false);
  });
});

describe('renderPreferencesFromSettings', () => {
  it('maps performance and word-count flags from settings', () => {
    const preferences = renderPreferencesFromSettings({
      ...DEFAULT_SETTINGS,
      performanceMode: true,
      wordCountRules: {
        includeLinks: false,
        includeCode: true,
        includeFrontMatter: true,
      },
    });

    expect(preferences).toEqual({
      performanceMode: true,
      wordCountRules: {
        includeLinks: false,
        includeCode: true,
        includeFrontMatter: true,
      },
    });
  });
});
