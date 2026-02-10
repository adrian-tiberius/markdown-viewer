import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, mergeViewerSettings } from './settings';

describe('settings', () => {
  it('returns defaults for missing input', () => {
    expect(mergeViewerSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('sanitizes malformed persisted settings', () => {
    const merged = mergeViewerSettings({
      performanceMode: 'yes' as unknown as boolean,
      safeMode: true,
      theme: 'unknown-theme' as unknown as 'paper',
      fontScale: 9 as unknown as number,
      lineHeight: Number.NaN,
      measureWidth: 40 as unknown as number,
      tocAutoExpand: 'no' as unknown as boolean,
      tocCollapsed: {
        keep: true,
        drop: 'x' as unknown as boolean,
      },
      wordCountRules: {
        includeLinks: 'x' as unknown as boolean,
        includeCode: true,
        includeFrontMatter: 1 as unknown as boolean,
      },
    });

    expect(merged.performanceMode).toBe(DEFAULT_SETTINGS.performanceMode);
    expect(merged.safeMode).toBe(true);
    expect(merged.theme).toBe(DEFAULT_SETTINGS.theme);
    expect(merged.fontScale).toBe(1.3);
    expect(merged.lineHeight).toBe(DEFAULT_SETTINGS.lineHeight);
    expect(merged.measureWidth).toBe(58);
    expect(merged.tocAutoExpand).toBe(DEFAULT_SETTINGS.tocAutoExpand);
    expect(merged.tocCollapsed).toEqual({ keep: true });
    expect(merged.wordCountRules).toEqual({
      includeLinks: DEFAULT_SETTINGS.wordCountRules.includeLinks,
      includeCode: true,
      includeFrontMatter: DEFAULT_SETTINGS.wordCountRules.includeFrontMatter,
    });
  });

  it('preserves large measure widths and lets runtime layout clamp against visible space', () => {
    const merged = mergeViewerSettings({
      measureWidth: 999 as unknown as number,
    });

    expect(merged.measureWidth).toBe(999);
  });
});
