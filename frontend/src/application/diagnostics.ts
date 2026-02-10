import type { ViewerSettings } from './settings';

export interface DiagnosticsReportInput {
  generatedAtIso: string;
  appVersion: string;
  userAgent: string;
  currentDocumentPath: string | null;
  openTabCount: number;
  recentDocumentCount: number;
  settings: ViewerSettings;
}

export function diagnosticsReportFileName(generatedAtIso: string): string {
  const sanitized = generatedAtIso.replace(/[^0-9]/g, '');
  return `markdown-viewer-diagnostics-${sanitized}.json`;
}

export function buildDiagnosticsReport(input: DiagnosticsReportInput): string {
  const payload = {
    generatedAt: input.generatedAtIso,
    appVersion: input.appVersion,
    userAgent: input.userAgent,
    workspace: {
      currentDocumentPath: input.currentDocumentPath,
      openTabCount: input.openTabCount,
      recentDocumentCount: input.recentDocumentCount,
    },
    settings: {
      performanceMode: input.settings.performanceMode,
      safeMode: input.settings.safeMode,
      theme: input.settings.theme,
      fontScale: input.settings.fontScale,
      lineHeight: input.settings.lineHeight,
      measureWidth: input.settings.measureWidth,
      tocAutoExpand: input.settings.tocAutoExpand,
      wordCountRules: input.settings.wordCountRules,
    },
  };

  return JSON.stringify(payload, null, 2);
}
