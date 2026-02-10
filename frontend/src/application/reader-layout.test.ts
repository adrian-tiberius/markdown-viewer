import { describe, expect, it } from 'vitest';

import {
  MEASURE_WIDTH_FALLBACK_MAX,
  MEASURE_WIDTH_MIN,
  deriveMeasureWidthMax,
  measureWidthCssValue,
  reconcileMeasureWidthOnMaxChange,
  sanitizeMeasureWidth,
} from './reader-layout';

describe('reader-layout', () => {
  it('sanitizes invalid values and clamps width within range', () => {
    expect(sanitizeMeasureWidth('x', 76)).toBe(76);
    expect(sanitizeMeasureWidth(10, 76)).toBe(MEASURE_WIDTH_MIN);
    expect(sanitizeMeasureWidth(9999, 76)).toBe(9999);
  });

  it('derives measure width max from available content width metrics', () => {
    const max = deriveMeasureWidthMax({
      availableWidthPx: 1200,
      horizontalPaddingPx: 48,
      chWidthPx: 8,
    });
    expect(max).toBe(144);
  });

  it('falls back to configured max when runtime metrics are invalid', () => {
    expect(
      deriveMeasureWidthMax({
        availableWidthPx: 0,
        horizontalPaddingPx: 24,
        chWidthPx: 8,
      })
    ).toBe(MEASURE_WIDTH_FALLBACK_MAX);
  });

  it('keeps selection pinned to max when max changes and keepAtMax is enabled', () => {
    const next = reconcileMeasureWidthOnMaxChange({
      currentWidth: 120,
      previousMax: 120,
      nextMax: 160,
      keepAtMax: true,
    });
    expect(next).toBe(160);
  });

  it('maps max selection to full-width css', () => {
    expect(measureWidthCssValue(160, 160)).toBe('100%');
    expect(measureWidthCssValue(120, 160)).toBe('120ch');
  });
});
