import './style.css';
import 'highlight.js/styles/github.css';
import 'katex/dist/katex.min.css';

import {
  LocalStorageDocumentTabSessionStore,
  LocalStorageRecentDocumentsStore,
  LocalStorageScrollMemoryStore,
  LocalStorageViewerLayoutStateStore,
  LocalStorageViewerSettingsStore,
} from './infrastructure/local-storage';
import { BrowserMarkdownFormattingEngine } from './infrastructure/markdown-formatting-engine';
import { BrowserDiagnosticsReportWriter } from './infrastructure/browser-diagnostics-report-writer';
import { TauriAppVersionProvider } from './infrastructure/tauri-app-version-provider';
import { TauriExternalUrlOpener } from './infrastructure/tauri-external-url-opener';
import { TauriMarkdownGateway } from './infrastructure/tauri-markdown-gateway';
import { TauriUpdaterService } from './infrastructure/tauri-updater-service';
import { appShell, createViewerUi, MarkdownViewerApp, mountShell } from './presentation';

mountShell('#app', appShell());

function initialDocumentPathFromQuery(): string | null {
  const params = new URLSearchParams(window.location.search);
  const path = params.get('open');
  if (!path) {
    return null;
  }

  const trimmed = path.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const app = new MarkdownViewerApp({
  ui: createViewerUi(),
  gateway: new TauriMarkdownGateway(),
  formattingEngine: new BrowserMarkdownFormattingEngine(),
  externalUrlOpener: new TauriExternalUrlOpener(),
  updateService: new TauriUpdaterService(),
  appVersionProvider: new TauriAppVersionProvider(),
  diagnosticsReportWriter: new BrowserDiagnosticsReportWriter(),
  initialDocumentPath: initialDocumentPathFromQuery(),
  settingsStore: new LocalStorageViewerSettingsStore(),
  layoutStateStore: new LocalStorageViewerLayoutStateStore(),
  scrollMemoryStore: new LocalStorageScrollMemoryStore(),
  tabSessionStore: new LocalStorageDocumentTabSessionStore(),
  recentDocumentsStore: new LocalStorageRecentDocumentsStore(),
});

app.start();
