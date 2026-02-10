import { expect, test, type Page } from '@playwright/test';

import {
  emitFileUpdated,
  emitOpenPath,
  openE2eApp,
  setDocumentFixture,
  setPickedMarkdownPath,
  snapshot,
} from './e2e-control';

async function openViaPicker(page: Page, path: string): Promise<void> {
  await setPickedMarkdownPath(page, path);
  await page.getByRole('button', { name: 'Open File' }).click();
  await expect(page.locator('#doc-path')).toHaveText(path);
}

test.describe('document workflow', () => {
  test('reloads current document when watch update event arrives', async ({ page }) => {
    const path = '/workspace/docs/live.md';

    await openE2eApp(page);
    await setDocumentFixture(page, {
      path,
      title: 'Live v1',
      source: '# Live v1',
      html: '<h1 id="mdv-live-v1">Live v1</h1><p>First revision</p>',
      toc: [{ level: 1, id: 'mdv-live-v1', text: 'Live v1' }],
      wordCount: 4,
      readingTimeMinutes: 1,
    });
    await openViaPicker(page, path);
    await expect(page.locator('#doc-title')).toHaveText('Live v1');

    await setDocumentFixture(page, {
      path,
      title: 'Live v2',
      source: '# Live v2',
      html: '<h1 id="mdv-live-v2">Live v2</h1><p>Second revision</p>',
      toc: [{ level: 1, id: 'mdv-live-v2', text: 'Live v2' }],
      wordCount: 4,
      readingTimeMinutes: 1,
    });
    await emitFileUpdated(page, path);

    await expect(page.locator('#doc-title')).toHaveText('Live v2');
    await expect(page.locator('#markdown-content h1')).toHaveText('Live v2');

    const state = await snapshot(page);
    expect(state.calls.gateway.loadRequests.length).toBeGreaterThanOrEqual(2);
    expect(state.calls.gateway.watchStartRequests.at(-1)).toBe(path);
  });

  test('opens markdown from runtime open-path events in a new active tab', async ({ page }) => {
    const primaryPath = '/workspace/docs/main.md';
    const linkedPath = '/workspace/docs/linked.md';

    await openE2eApp(page);
    await setDocumentFixture(page, {
      path: primaryPath,
      title: 'Main',
      source: '# Main',
      html: '<h1 id="mdv-main">Main</h1><p>Main file</p>',
      toc: [{ level: 1, id: 'mdv-main', text: 'Main' }],
      wordCount: 3,
      readingTimeMinutes: 1,
    });
    await setDocumentFixture(page, {
      path: linkedPath,
      title: 'Linked',
      source: '# Linked',
      html: '<h1 id="mdv-linked">Linked</h1><p>Linked file</p>',
      toc: [{ level: 1, id: 'mdv-linked', text: 'Linked' }],
      wordCount: 3,
      readingTimeMinutes: 1,
    });

    await openViaPicker(page, primaryPath);
    await emitOpenPath(page, linkedPath);

    await expect(page.locator('#doc-path')).toHaveText(linkedPath);
    await expect(page.locator('#doc-title')).toHaveText('Linked');
    await expect(page.locator('.doc-tab-item')).toHaveCount(2);
    await expect(page.locator('.doc-tab-item.active .doc-tab-button')).toHaveText('Linked');

    const state = await snapshot(page);
    expect(state.calls.gateway.loadRequests.map((entry) => entry.path)).toEqual([
      primaryPath,
      linkedPath,
    ]);
    expect(state.calls.gateway.watchStartRequests).toEqual([primaryPath, linkedPath]);
  });
});
