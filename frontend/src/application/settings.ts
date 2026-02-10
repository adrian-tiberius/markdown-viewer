import type { RenderPreferences, WordCountRules } from '../domain';
import { sanitizeMeasureWidth } from './reader-layout';

export type ThemePreset = 'paper' | 'slate' | 'contrast-light' | 'contrast-dark';

export interface ViewerSettings {
  performanceMode: boolean;
  safeMode: boolean;
  theme: ThemePreset;
  fontScale: number;
  lineHeight: number;
  measureWidth: number;
  tocAutoExpand: boolean;
  tocCollapsed: Record<string, boolean>;
  wordCountRules: WordCountRules;
}

export const DEFAULT_SETTINGS: ViewerSettings = {
  performanceMode: false,
  safeMode: false,
  theme: 'paper',
  fontScale: 1,
  lineHeight: 1.62,
  measureWidth: 76,
  tocAutoExpand: true,
  tocCollapsed: {},
  wordCountRules: {
    includeLinks: true,
    includeCode: false,
    includeFrontMatter: false,
  },
};

const FONT_SCALE_RANGE = { min: 0.85, max: 1.3 };
const LINE_HEIGHT_RANGE = { min: 1.35, max: 2.0 };
const THEME_PRESETS: ThemePreset[] = ['paper', 'slate', 'contrast-light', 'contrast-dark'];

export function mergeViewerSettings(
  parsed: Partial<ViewerSettings> | null | undefined
): ViewerSettings {
  const source = asRecord(parsed);
  const wordCountSource = asRecord(source.wordCountRules);
  const tocCollapsedSource = asRecord(source.tocCollapsed);
  const tocCollapsed: Record<string, boolean> = {};

  for (const [key, value] of Object.entries(tocCollapsedSource)) {
    if (typeof value === 'boolean') {
      tocCollapsed[key] = value;
    }
  }

  return {
    ...DEFAULT_SETTINGS,
    performanceMode: asBoolean(source.performanceMode, DEFAULT_SETTINGS.performanceMode),
    safeMode: asBoolean(source.safeMode, DEFAULT_SETTINGS.safeMode),
    theme: asThemePreset(source.theme, DEFAULT_SETTINGS.theme),
    fontScale: asNumberInRange(
      source.fontScale,
      DEFAULT_SETTINGS.fontScale,
      FONT_SCALE_RANGE.min,
      FONT_SCALE_RANGE.max
    ),
    lineHeight: asNumberInRange(
      source.lineHeight,
      DEFAULT_SETTINGS.lineHeight,
      LINE_HEIGHT_RANGE.min,
      LINE_HEIGHT_RANGE.max
    ),
    measureWidth: sanitizeMeasureWidth(
      source.measureWidth,
      DEFAULT_SETTINGS.measureWidth
    ),
    tocAutoExpand: asBoolean(source.tocAutoExpand, DEFAULT_SETTINGS.tocAutoExpand),
    wordCountRules: {
      ...DEFAULT_SETTINGS.wordCountRules,
      includeLinks: asBoolean(
        wordCountSource.includeLinks,
        DEFAULT_SETTINGS.wordCountRules.includeLinks
      ),
      includeCode: asBoolean(
        wordCountSource.includeCode,
        DEFAULT_SETTINGS.wordCountRules.includeCode
      ),
      includeFrontMatter: asBoolean(
        wordCountSource.includeFrontMatter,
        DEFAULT_SETTINGS.wordCountRules.includeFrontMatter
      ),
    },
    tocCollapsed,
  };
}

export function toRenderPreferences(settings: ViewerSettings): RenderPreferences {
  return {
    performanceMode: settings.performanceMode,
    wordCountRules: {
      includeLinks: settings.wordCountRules.includeLinks,
      includeCode: settings.wordCountRules.includeCode,
      includeFrontMatter: settings.wordCountRules.includeFrontMatter,
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asThemePreset(value: unknown, fallback: ThemePreset): ThemePreset {
  if (typeof value !== 'string') {
    return fallback;
  }
  return THEME_PRESETS.includes(value as ThemePreset) ? (value as ThemePreset) : fallback;
}

function asNumberInRange(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  round = false
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  const clamped = Math.min(max, Math.max(min, value));
  return round ? Math.round(clamped) : clamped;
}
