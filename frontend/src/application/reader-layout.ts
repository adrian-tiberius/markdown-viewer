export const MEASURE_WIDTH_MIN = 58;
export const MEASURE_WIDTH_FALLBACK_MAX = 480;
const MEASURE_WIDTH_UNBOUNDED_MAX = Number.MAX_SAFE_INTEGER;

export function sanitizeMeasureWidth(
  value: unknown,
  fallback: number,
  max: number = MEASURE_WIDTH_UNBOUNDED_MAX
): number {
  const normalizedMax = Number.isFinite(max)
    ? Math.max(MEASURE_WIDTH_MIN, Math.floor(max))
    : MEASURE_WIDTH_UNBOUNDED_MAX;
  const normalizedFallback = clampMeasureWidth(fallback, normalizedMax);
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return normalizedFallback;
  }
  return clampMeasureWidth(value, normalizedMax);
}

export function deriveMeasureWidthMax(input: {
  availableWidthPx: number;
  horizontalPaddingPx: number;
  chWidthPx: number;
  fallbackMax?: number;
}): number {
  const fallbackMax = Math.max(
    MEASURE_WIDTH_MIN,
    Math.floor(input.fallbackMax ?? MEASURE_WIDTH_FALLBACK_MAX)
  );
  if (
    !Number.isFinite(input.availableWidthPx) ||
    !Number.isFinite(input.horizontalPaddingPx) ||
    !Number.isFinite(input.chWidthPx)
  ) {
    return fallbackMax;
  }

  if (input.availableWidthPx <= 0 || input.chWidthPx <= 0) {
    return fallbackMax;
  }

  const contentWidth = Math.max(0, input.availableWidthPx - Math.max(0, input.horizontalPaddingPx));
  const computed = Math.floor(contentWidth / input.chWidthPx);
  return Math.max(MEASURE_WIDTH_MIN, computed);
}

export function reconcileMeasureWidthOnMaxChange(input: {
  currentWidth: number;
  previousMax: number;
  nextMax: number;
  keepAtMax: boolean;
}): number {
  const normalizedPreviousMax = Math.max(MEASURE_WIDTH_MIN, Math.floor(input.previousMax));
  const normalizedNextMax = Math.max(MEASURE_WIDTH_MIN, Math.floor(input.nextMax));
  const normalizedCurrent = Math.max(MEASURE_WIDTH_MIN, Math.round(input.currentWidth));
  const wasAtMax = normalizedCurrent >= normalizedPreviousMax;

  if (input.keepAtMax && wasAtMax) {
    return normalizedNextMax;
  }
  return Math.min(normalizedNextMax, normalizedCurrent);
}

export function measureWidthCssValue(width: number, currentMax: number): string {
  const normalizedMax = Math.max(MEASURE_WIDTH_MIN, Math.floor(currentMax));
  const normalizedWidth = Math.max(MEASURE_WIDTH_MIN, Math.round(width));
  return normalizedWidth >= normalizedMax ? '100%' : `${normalizedWidth}ch`;
}

function clampMeasureWidth(value: number, max: number): number {
  return Math.round(Math.min(max, Math.max(MEASURE_WIDTH_MIN, value)));
}
