// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  LocalStorageDocumentTabSessionStore,
  LocalStorageRecentDocumentsStore,
  LocalStorageViewerLayoutStateStore,
  LocalStorageScrollMemoryStore,
  LocalStorageViewerSettingsStore,
} from './local-storage';
import { DEFAULT_SETTINGS } from '../application/settings';

describe('local-storage adapters', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('ignores settings save errors from blocked storage', () => {
    const store = new LocalStorageViewerSettingsStore();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(() => store.save(DEFAULT_SETTINGS)).not.toThrow();
  });

  it('ignores scroll store write/clear errors from blocked storage', () => {
    const store = new LocalStorageScrollMemoryStore();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked storage');
    });

    expect(() => store.save({ '/tmp/spec.md': 120 })).not.toThrow();
    expect(() => store.clear()).not.toThrow();
  });

  it('loads sane defaults for malformed layout state and ignores write failures', () => {
    const store = new LocalStorageViewerLayoutStateStore();
    localStorage.setItem('markdown-viewer:v1:layout', '{"leftSidebarCollapsed":"x"}');
    expect(store.load()).toEqual({
      leftSidebarCollapsed: false,
      rightSidebarCollapsed: false,
    });

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    expect(() =>
      store.save({
        leftSidebarCollapsed: true,
        rightSidebarCollapsed: false,
      })
    ).not.toThrow();
  });

  it('sanitizes malformed tab session data and ignores write failures', () => {
    const store = new LocalStorageDocumentTabSessionStore();
    localStorage.setItem(
      'markdown-viewer:v1:workspace-session',
      '{"tabPaths":["/tmp/spec.md"," ","/tmp/spec.md"],"activePath":"/tmp/missing.md"}'
    );

    expect(store.load()).toEqual({
      tabPaths: ['/tmp/spec.md'],
      activePath: '/tmp/spec.md',
    });

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(() =>
      store.save({
        tabPaths: ['/tmp/spec.md'],
        activePath: '/tmp/spec.md',
      })
    ).not.toThrow();
  });

  it('sanitizes malformed recent documents data and ignores write failures', () => {
    const store = new LocalStorageRecentDocumentsStore();
    localStorage.setItem(
      'markdown-viewer:v1:recent-documents',
      '{"entries":[{"path":"/tmp/spec.md","title":"Spec"},{"path":" "},{"path":"/tmp/spec.md"}]}'
    );

    expect(store.load()).toEqual({
      entries: [{ path: '/tmp/spec.md', title: 'Spec' }],
    });

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(() =>
      store.save({
        entries: [{ path: '/tmp/spec.md', title: 'Spec' }],
      })
    ).not.toThrow();
  });
});
