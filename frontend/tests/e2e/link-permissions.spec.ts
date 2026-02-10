import { expect, test, type Page } from '@playwright/test';

import { openE2eApp, setDocumentFixture, setPickedMarkdownPath, snapshot } from './e2e-control';

async function openViaPicker(page: Page, path: string): Promise<void> {
  await setPickedMarkdownPath(page, path);
  await page.getByRole('button', { name: 'Open File' }).click();
  await expect(page.locator('#doc-path')).toHaveText(path);
}

async function allowPermission(page: Page): Promise<void> {
  const dialog = page.locator('#permission-dialog');
  await expect(dialog).toHaveClass(/visible/);
  await page.locator('#permission-allow').click();
  await expect(dialog).not.toHaveClass(/visible/);
}

test.describe('link permission flows', () => {
  test('opens external links only after permission and blocks unsupported protocols', async ({
    page,
  }) => {
    const path = '/workspace/docs/links.md';

    await openE2eApp(page);
    await setDocumentFixture(page, {
      path,
      title: 'Links',
      source: '[External](https://example.com) [Blocked](javascript:alert(1))',
      html: [
        '<h1 id="mdv-links">Links</h1>',
        '<p><a href="https://example.com/docs">External Link</a></p>',
        '<p><a href="javascript:alert(1)">Blocked Link</a></p>',
      ].join(''),
      toc: [{ level: 1, id: 'mdv-links', text: 'Links' }],
      wordCount: 4,
      readingTimeMinutes: 1,
    });

    await openViaPicker(page, path);

    await page.getByRole('link', { name: 'External Link' }).click();
    await expect(page.locator('#permission-title')).toHaveText('Open External Link');
    await allowPermission(page);

    const externalState = await snapshot(page);
    expect(externalState.calls.external.urls).toEqual(['https://example.com/docs']);

    await page.getByRole('link', { name: 'Blocked Link' }).click();
    await expect(page.locator('#error-message')).toContainText(
      'Blocked unsupported link protocol: javascript:'
    );
  });

  test('requires permission for local and markdown links and routes them correctly', async ({
    page,
  }) => {
    const sourcePath = '/workspace/docs/main.md';
    const linkedMarkdownPath = '/workspace/docs/linked.md';
    const linkedFilePath = '/workspace/docs/assets/manual.pdf';

    await openE2eApp(page);
    await setDocumentFixture(page, {
      path: sourcePath,
      title: 'Main Links',
      source: '[Linked markdown](./linked.md) [Local file](./assets/manual.pdf)',
      html: [
        '<h1 id="mdv-main-links">Main Links</h1>',
        '<p><a href="./linked.md">Linked markdown</a></p>',
        '<p><a href="./assets/manual.pdf">Local file</a></p>',
      ].join(''),
      toc: [{ level: 1, id: 'mdv-main-links', text: 'Main Links' }],
      wordCount: 5,
      readingTimeMinutes: 1,
    });
    await setDocumentFixture(page, {
      path: linkedMarkdownPath,
      title: 'Linked Doc',
      source: '# Linked Doc',
      html: '<h1 id="mdv-linked-doc">Linked Doc</h1>',
      toc: [{ level: 1, id: 'mdv-linked-doc', text: 'Linked Doc' }],
      wordCount: 2,
      readingTimeMinutes: 1,
    });

    await openViaPicker(page, sourcePath);

    await page.getByRole('link', { name: 'Local file' }).click();
    await expect(page.locator('#permission-title')).toHaveText('Open Linked File');
    await allowPermission(page);

    let currentState = await snapshot(page);
    expect(currentState.calls.external.paths).toEqual([
      {
        path: linkedFilePath,
        sourceDocumentPath: sourcePath,
      },
    ]);

    await page.getByRole('link', { name: 'Linked markdown' }).click();
    await expect(page.locator('#permission-title')).toHaveText('Open Linked Markdown');
    await allowPermission(page);

    await expect(page.locator('#doc-path')).toHaveText(linkedMarkdownPath);
    await expect(page.locator('.doc-tab-item')).toHaveCount(2);

    currentState = await snapshot(page);
    expect(currentState.calls.external.paths).toHaveLength(1);
    expect(currentState.calls.gateway.loadRequests.map((request) => request.path)).toEqual([
      sourcePath,
      linkedMarkdownPath,
    ]);
  });
});
