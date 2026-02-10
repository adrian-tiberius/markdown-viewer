import { describe, expect, it, vi } from 'vitest';

import {
  DocumentWorkspaceTabsUseCase,
} from './document-workspace-tabs-use-case';
import type { DocumentLoadResult } from './document-load-use-case';
import type {
  CloseDocumentTabResult,
  DocumentTabState,
} from './document-tabs';

class FakeSession {
  snapshotState: DocumentTabState = { tabs: [], activePath: null };
  closeResult: CloseDocumentTabResult = {
    state: { tabs: [], activePath: null },
    removed: false,
    closedActive: false,
    nextActivePath: null,
  };
  hasTabsValue = false;
  activePathValue: string | null = null;
  adjacentPathValue: string | null = null;

  readonly tabStateSnapshot = vi.fn(() => this.snapshotState);
  readonly replaceTabState = vi.fn((state: DocumentTabState) => {
    this.snapshotState = state;
  });
  readonly openTab = vi.fn((_path: string, _options: { activate: boolean }) => {});
  readonly closeTab = vi.fn((_path: string) => this.closeResult);
  readonly hasTabs = vi.fn(() => this.hasTabsValue);
  readonly activePath = vi.fn(() => this.activePathValue);
  readonly adjacentPath = vi.fn((_direction: 'next' | 'previous') => this.adjacentPathValue);
}

function setup(options: {
  session?: FakeSession;
  currentDocumentPath?: string | null;
  loadResult?: DocumentLoadResult;
}) {
  const session = options.session ?? new FakeSession();
  const persistScroll = vi.fn();
  const currentDocumentPath = vi.fn(() => options.currentDocumentPath ?? null);
  const loadDocument = vi.fn(
    async (_path: string, _opts: { restartWatch: boolean; restoreScroll: boolean }) =>
      options.loadResult ?? 'success'
  );

  const useCase = new DocumentWorkspaceTabsUseCase({
    session,
    loadDocument,
    currentDocumentPath,
    persistScroll,
  });

  return {
    useCase,
    session,
    loadDocument,
    currentDocumentPath,
    persistScroll,
  };
}

describe('document-workspace-tabs-use-case', () => {
  it('opens a document tab and restores previous tab state when initial load fails', async () => {
    const session = new FakeSession();
    session.snapshotState = {
      tabs: [{ path: '/tmp/current.md', title: 'current.md' }],
      activePath: '/tmp/current.md',
    };
    const context = setup({
      session,
      loadResult: 'failed-before-load',
      currentDocumentPath: '/tmp/current.md',
    });

    await context.useCase.openInTab('  /tmp/new.md  ', {
      activateTab: true,
      restartWatch: true,
      restoreScroll: true,
    });

    expect(context.persistScroll).toHaveBeenCalledTimes(1);
    expect(session.openTab).toHaveBeenCalledWith('/tmp/new.md', { activate: true });
    expect(context.loadDocument).toHaveBeenCalledWith('/tmp/new.md', {
      restartWatch: true,
      restoreScroll: true,
    });
    expect(session.replaceTabState).toHaveBeenCalledWith(session.snapshotState);
  });

  it('returns workspace-empty when closing the active last tab', async () => {
    const session = new FakeSession();
    session.closeResult = {
      state: { tabs: [], activePath: null },
      removed: true,
      closedActive: true,
      nextActivePath: null,
    };
    session.hasTabsValue = false;
    const context = setup({ session });

    const outcome = await context.useCase.closeTab('/tmp/current.md');

    expect(context.persistScroll).toHaveBeenCalledTimes(1);
    expect(outcome).toBe('workspace-empty');
    expect(context.loadDocument).not.toHaveBeenCalled();
  });

  it('loads the next active tab after closing the current one and rolls back when load fails', async () => {
    const session = new FakeSession();
    session.snapshotState = {
      tabs: [
        { path: '/tmp/a.md', title: 'a.md' },
        { path: '/tmp/b.md', title: 'b.md' },
      ],
      activePath: '/tmp/a.md',
    };
    session.closeResult = {
      state: {
        tabs: [{ path: '/tmp/b.md', title: 'b.md' }],
        activePath: '/tmp/b.md',
      },
      removed: true,
      closedActive: true,
      nextActivePath: '/tmp/b.md',
    };
    session.hasTabsValue = true;
    const context = setup({
      session,
      loadResult: 'failed-before-load',
    });

    await context.useCase.closeTab('/tmp/a.md');

    expect(context.loadDocument).toHaveBeenCalledWith('/tmp/b.md', {
      restartWatch: true,
      restoreScroll: true,
    });
    expect(session.replaceTabState).toHaveBeenCalledWith(session.snapshotState);
  });

  it('does not open adjacent tab when computed target matches current document', async () => {
    const session = new FakeSession();
    session.adjacentPathValue = '/tmp/current.md';
    const context = setup({
      session,
      currentDocumentPath: '/tmp/current.md',
    });

    await context.useCase.activateAdjacentTab('next');

    expect(context.loadDocument).not.toHaveBeenCalled();
    expect(session.openTab).not.toHaveBeenCalled();
  });
});
