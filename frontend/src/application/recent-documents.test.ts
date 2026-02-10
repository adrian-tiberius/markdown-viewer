import { describe, expect, it } from 'vitest';

import {
  addRecentDocument,
  createEmptyRecentDocumentsState,
  mergeRecentDocumentsState,
} from './recent-documents';

describe('recent-documents', () => {
  it('sanitizes malformed persisted recent documents', () => {
    const state = mergeRecentDocumentsState({
      entries: [
        { path: '/tmp/spec.md', title: 'Spec' },
        { path: '  ' },
        { path: '/tmp/spec.md', title: 'Duplicate' },
        { path: '/tmp/notes.md' },
        7,
      ],
    });

    expect(state).toEqual({
      entries: [
        { path: '/tmp/spec.md', title: 'Spec' },
        { path: '/tmp/notes.md', title: 'notes.md' },
      ],
    });
  });

  it('adds new documents to the front and de-duplicates', () => {
    const base = createEmptyRecentDocumentsState();
    const withSpec = addRecentDocument(base, '/tmp/spec.md');
    const withNotes = addRecentDocument(withSpec, '/tmp/notes.md');
    const withSpecAgain = addRecentDocument(withNotes, '/tmp/spec.md');

    expect(withSpecAgain.entries).toEqual([
      { path: '/tmp/spec.md', title: 'spec.md' },
      { path: '/tmp/notes.md', title: 'notes.md' },
    ]);
  });

  it('honors the max entries limit', () => {
    let state = createEmptyRecentDocumentsState();
    state = addRecentDocument(state, '/tmp/a.md', 2);
    state = addRecentDocument(state, '/tmp/b.md', 2);
    state = addRecentDocument(state, '/tmp/c.md', 2);

    expect(state.entries).toEqual([
      { path: '/tmp/c.md', title: 'c.md' },
      { path: '/tmp/b.md', title: 'b.md' },
    ]);
  });
});
