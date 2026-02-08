// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
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
});
