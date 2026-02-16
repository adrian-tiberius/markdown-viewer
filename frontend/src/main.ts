import 'highlight.js/styles/github.css';
import 'katex/dist/katex.min.css';
import './style.css';

import type {
  AppVersionProvider,
  DiagnosticsReportWriter,
  ExternalUrlOpener,
  MarkdownGateway,
  UpdateService,
} from './application/ports';
import {
  LocalStorageDocumentTabSessionStore,
  LocalStorageRecentDocumentsStore,
  LocalStorageScrollMemoryStore,
  LocalStorageViewerLayoutStateStore,
  LocalStorageViewerSettingsStore,
} from './infrastructure/local-storage';
import { BrowserMarkdownFormattingEngine } from './infrastructure/markdown-formatting-engine';
import { BrowserDiagnosticsReportWriter } from './infrastructure/browser-diagnostics-report-writer';
import { appShell, createViewerUi, MarkdownViewerApp, mountShell } from './presentation';

type RuntimeMode = 'tauri' | 'e2e';

interface RuntimeServices {
  gateway: MarkdownGateway;
  externalUrlOpener: ExternalUrlOpener;
  updateService: UpdateService;
  appVersionProvider: AppVersionProvider;
  diagnosticsReportWriter: DiagnosticsReportWriter;
}

function initialDocumentPathFromQuery(): string | null {
  const params = new URLSearchParams(window.location.search);
  const path = params.get('open');
  if (!path) {
    return null;
  }

  const trimmed = path.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function runtimeModeFromQuery(): RuntimeMode {
  const params = new URLSearchParams(window.location.search);
  return params.get('runtime') === 'e2e' ? 'e2e' : 'tauri';
}

async function runtimeServicesForMode(mode: RuntimeMode): Promise<RuntimeServices> {
  if (mode === 'e2e') {
    const { createE2eRuntimeAdapters, registerE2eControlOnWindow } = await import(
      './infrastructure/e2e-runtime'
    );
    const adapters = createE2eRuntimeAdapters();
    registerE2eControlOnWindow(adapters.control);
    return {
      gateway: adapters.gateway,
      externalUrlOpener: adapters.externalUrlOpener,
      updateService: adapters.updateService,
      appVersionProvider: adapters.appVersionProvider,
      diagnosticsReportWriter: adapters.diagnosticsReportWriter,
    };
  }

  const [
    { TauriMarkdownGateway },
    { TauriExternalUrlOpener },
    { TauriUpdaterService },
    { TauriAppVersionProvider },
  ] = await Promise.all([
    import('./infrastructure/tauri-markdown-gateway'),
    import('./infrastructure/tauri-external-url-opener'),
    import('./infrastructure/tauri-updater-service'),
    import('./infrastructure/tauri-app-version-provider'),
  ]);

  return {
    gateway: new TauriMarkdownGateway(),
    externalUrlOpener: new TauriExternalUrlOpener(),
    updateService: new TauriUpdaterService(),
    appVersionProvider: new TauriAppVersionProvider(),
    diagnosticsReportWriter: new BrowserDiagnosticsReportWriter(),
  };
}

async function bootstrap(): Promise<void> {
  mountShell('#app', appShell());
  const runtimeServices = await runtimeServicesForMode(runtimeModeFromQuery());

  const app = new MarkdownViewerApp({
    ui: createViewerUi(),
    gateway: runtimeServices.gateway,
    formattingEngine: new BrowserMarkdownFormattingEngine(),
    externalUrlOpener: runtimeServices.externalUrlOpener,
    updateService: runtimeServices.updateService,
    appVersionProvider: runtimeServices.appVersionProvider,
    diagnosticsReportWriter: runtimeServices.diagnosticsReportWriter,
    initialDocumentPath: initialDocumentPathFromQuery(),
    settingsStore: new LocalStorageViewerSettingsStore(),
    layoutStateStore: new LocalStorageViewerLayoutStateStore(),
    scrollMemoryStore: new LocalStorageScrollMemoryStore(),
    tabSessionStore: new LocalStorageDocumentTabSessionStore(),
    recentDocumentsStore: new LocalStorageRecentDocumentsStore(),
  });

  app.start();
}

void bootstrap();
