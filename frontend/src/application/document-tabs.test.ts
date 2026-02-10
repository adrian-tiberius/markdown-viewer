import { describe, expect, it } from 'vitest';

import {
  applyLoadedDocumentToTabs,
  closeDocumentTab,
  createEmptyDocumentTabState,
  openDocumentTab,
  tabTitleFromPath,
} from './document-tabs';

describe('document-tabs', () => {
  it('opens and activates a new tab', () => {
    const opened = openDocumentTab(createEmptyDocumentTabState(), '/tmp/spec.md', {
      activate: true,
    });

    expect(opened.tabs).toEqual([{ path: '/tmp/spec.md', title: 'spec.md' }]);
    expect(opened.activePath).toBe('/tmp/spec.md');
  });

  it('does not duplicate tabs when opening an existing path', () => {
    const state = openDocumentTab(createEmptyDocumentTabState(), '/tmp/spec.md', {
      activate: true,
    });
    const openedAgain = openDocumentTab(state, '/tmp/spec.md', {
      activate: true,
    });

    expect(openedAgain.tabs).toHaveLength(1);
    expect(openedAgain.activePath).toBe('/tmp/spec.md');
  });

  it('closes inactive tab without changing active selection', () => {
    const initial = openDocumentTab(createEmptyDocumentTabState(), '/tmp/spec.md', {
      activate: true,
    });
    const withSecond = openDocumentTab(initial, '/tmp/notes.md', {
      activate: false,
    });

    const result = closeDocumentTab(withSecond, '/tmp/notes.md');
    expect(result.removed).toBe(true);
    expect(result.closedActive).toBe(false);
    expect(result.state.tabs).toEqual([{ path: '/tmp/spec.md', title: 'spec.md' }]);
    expect(result.state.activePath).toBe('/tmp/spec.md');
  });

  it('closes active tab and picks nearest remaining tab', () => {
    const a = openDocumentTab(createEmptyDocumentTabState(), '/tmp/a.md', { activate: true });
    const b = openDocumentTab(a, '/tmp/b.md', { activate: true });
    const c = openDocumentTab(b, '/tmp/c.md', { activate: true });

    const result = closeDocumentTab(c, '/tmp/b.md');
    expect(result.removed).toBe(true);
    expect(result.closedActive).toBe(false);

    const closeActive = closeDocumentTab(c, '/tmp/c.md');
    expect(closeActive.closedActive).toBe(true);
    expect(closeActive.state.activePath).toBe('/tmp/b.md');
  });

  it('retargets requested tab path to loaded path and updates title', () => {
    const initial = openDocumentTab(createEmptyDocumentTabState(), '/tmp/spec.md', {
      activate: true,
    });

    const updated = applyLoadedDocumentToTabs(
      initial,
      '/tmp/spec.md',
      '/tmp/spec-resolved.md',
      'Resolved Spec'
    );

    expect(updated.activePath).toBe('/tmp/spec-resolved.md');
    expect(updated.tabs).toEqual([
      { path: '/tmp/spec-resolved.md', title: 'Resolved Spec' },
    ]);
  });

  it('derives titles from path basename', () => {
    expect(tabTitleFromPath('/tmp/docs/readme.md')).toBe('readme.md');
    expect(tabTitleFromPath('C:\\Work\\notes\\daily.md')).toBe('daily.md');
  });
});
