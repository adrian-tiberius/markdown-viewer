import './style.css';
import 'highlight.js/styles/github.css';
import 'katex/dist/katex.min.css';

import {
  LocalStorageScrollMemoryStore,
  LocalStorageViewerSettingsStore,
} from './infrastructure/local-storage';
import { BrowserMarkdownFormattingEngine } from './infrastructure/markdown-formatting-engine';
import { TauriMarkdownGateway } from './infrastructure/tauri-markdown-gateway';
import { appShell, createViewerUi, MarkdownViewerApp, mountShell } from './presentation';

mountShell('#app', appShell());

const app = new MarkdownViewerApp({
  ui: createViewerUi(),
  gateway: new TauriMarkdownGateway(),
  formattingEngine: new BrowserMarkdownFormattingEngine(),
  settingsStore: new LocalStorageViewerSettingsStore(),
  scrollMemoryStore: new LocalStorageScrollMemoryStore(),
});

app.start();
