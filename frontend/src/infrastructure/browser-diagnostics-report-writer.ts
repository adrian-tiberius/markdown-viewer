import type { DiagnosticsReportWriter } from '../application/ports';

export class BrowserDiagnosticsReportWriter implements DiagnosticsReportWriter {
  async saveReport(fileName: string, content: string): Promise<void> {
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const href = URL.createObjectURL(blob);

    try {
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = fileName;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      URL.revokeObjectURL(href);
    }
  }
}
