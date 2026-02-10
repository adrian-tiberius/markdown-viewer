import { expect, test } from '@playwright/test';

import { openE2eApp, setDocumentFixture, setPickedMarkdownPath, snapshot } from './e2e-control';

test.describe('e2e harness', () => {
  test('boots in e2e mode and loads a seeded markdown file', async ({ page }) => {
    const path = '/workspace/docs/alpha.md';

    await openE2eApp(page);
    await setDocumentFixture(page, {
      path,
      title: 'Alpha Spec',
      source: '# Alpha Spec',
      html: '<h1 id="mdv-alpha-spec">Alpha Spec</h1><p>Harness smoke</p>',
      toc: [{ level: 1, id: 'mdv-alpha-spec', text: 'Alpha Spec' }],
      wordCount: 3,
      readingTimeMinutes: 1,
    });
    await setPickedMarkdownPath(page, path);

    await page.getByRole('button', { name: 'Open File' }).click();

    await expect(page.locator('#doc-title')).toHaveText('Alpha Spec');
    await expect(page.locator('#doc-path')).toHaveText(path);
    await expect(page.locator('#markdown-content h1')).toHaveText('Alpha Spec');

    const state = await snapshot(page);
    expect(state.calls.gateway.pickedFileCount).toBe(1);
    expect(state.calls.gateway.loadRequests).toHaveLength(1);
    expect(state.calls.gateway.watchStartRequests).toEqual([path]);
  });
});
