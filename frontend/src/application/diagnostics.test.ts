import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from './settings';
import { buildDiagnosticsReport, diagnosticsReportFileName } from './diagnostics';

describe('diagnostics', () => {
  it('creates a stable diagnostics file name from an ISO timestamp', () => {
    expect(diagnosticsReportFileName('2026-02-10T22:55:12.456Z')).toBe(
      'markdown-viewer-diagnostics-20260210225512456.json'
    );
  });

  it('builds a formatted diagnostics report payload', () => {
    const report = buildDiagnosticsReport({
      generatedAtIso: '2026-02-10T22:55:12.456Z',
      appVersion: '0.1.0-alpha.1',
      userAgent: 'test-agent',
      currentDocumentPath: '/docs/spec.md',
      openTabCount: 2,
      recentDocumentCount: 4,
      settings: DEFAULT_SETTINGS,
    });

    const parsed = JSON.parse(report) as {
      appVersion: string;
      workspace: { currentDocumentPath: string; openTabCount: number; recentDocumentCount: number };
      settings: { performanceMode: boolean; safeMode: boolean; theme: string };
    };

    expect(parsed.appVersion).toBe('0.1.0-alpha.1');
    expect(parsed.workspace.currentDocumentPath).toBe('/docs/spec.md');
    expect(parsed.workspace.openTabCount).toBe(2);
    expect(parsed.workspace.recentDocumentCount).toBe(4);
    expect(parsed.settings.performanceMode).toBe(false);
    expect(parsed.settings.safeMode).toBe(false);
    expect(parsed.settings.theme).toBe('paper');
  });
});
