import { describe, expect, it } from 'vitest';

import { buildWorkspaceQuickOpenItems } from './workspace-quick-open';

describe('workspace-quick-open', () => {
  it('merges open tabs and recent documents while de-duplicating by path', () => {
    const items = buildWorkspaceQuickOpenItems({
      tabs: {
        tabs: [
          { path: '/docs/spec.md', title: 'Spec' },
          { path: '/docs/roadmap.md', title: 'Roadmap' },
        ],
        activePath: '/docs/roadmap.md',
      },
      recentDocuments: {
        entries: [
          { path: '/docs/roadmap.md', title: 'Roadmap' },
          { path: '/docs/notes.md', title: 'Notes' },
        ],
      },
    });

    expect(items).toEqual([
      { path: '/docs/spec.md', title: 'Spec', source: 'tab', isActive: false },
      { path: '/docs/roadmap.md', title: 'Roadmap', source: 'tab', isActive: true },
      { path: '/docs/notes.md', title: 'Notes', source: 'recent', isActive: false },
    ]);
  });
});
