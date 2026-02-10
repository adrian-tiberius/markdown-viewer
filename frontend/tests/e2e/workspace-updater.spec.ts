import { expect, test, type Page } from '@playwright/test';

import {
  bootstrapNextNavigation,
  openE2eApp,
  setDocumentFixture,
  setPickedMarkdownPath,
  setUpdateResult,
  snapshot,
} from './e2e-control';

const TAB_SESSION_STORAGE_KEY = 'markdown-viewer:v1:workspace-session';
const RECENT_DOCUMENTS_STORAGE_KEY = 'markdown-viewer:v1:recent-documents';

async function openViaPicker(page: Page, path: string): Promise<void> {
  await setPickedMarkdownPath(page, path);
  await page.getByRole('button', { name: 'Open File' }).click();
  await expect(page.locator('#doc-path')).toHaveText(path);
}

test.describe('workspace session and updater flows', () => {
  test('persists and restores tab session across reload', async ({ page }) => {
    const alphaPath = '/workspace/docs/alpha.md';
    const betaPath = '/workspace/docs/beta.md';

    await openE2eApp(page);
    await setDocumentFixture(page, {
      path: alphaPath,
      title: 'Alpha',
      source: '# Alpha',
      html: '<h1 id="mdv-alpha">Alpha</h1>',
      toc: [{ level: 1, id: 'mdv-alpha', text: 'Alpha' }],
      wordCount: 2,
      readingTimeMinutes: 1,
    });
    await setDocumentFixture(page, {
      path: betaPath,
      title: 'Beta',
      source: '# Beta',
      html: '<h1 id="mdv-beta">Beta</h1>',
      toc: [{ level: 1, id: 'mdv-beta', text: 'Beta' }],
      wordCount: 2,
      readingTimeMinutes: 1,
    });

    await openViaPicker(page, alphaPath);
    await openViaPicker(page, betaPath);

    await expect(page.locator('.doc-tab-item')).toHaveCount(2);
    await expect(page.locator('#doc-path')).toHaveText(betaPath);

    const storedSession = await page.evaluate((key) => localStorage.getItem(key), TAB_SESSION_STORAGE_KEY);
    expect(storedSession).not.toBeNull();
    expect(JSON.parse(storedSession ?? '{}')).toEqual({
      tabPaths: [alphaPath, betaPath],
      activePath: betaPath,
    });

    const storedRecentDocuments = await page.evaluate(
      (key) => localStorage.getItem(key),
      RECENT_DOCUMENTS_STORAGE_KEY
    );
    expect(storedRecentDocuments).not.toBeNull();
    expect(JSON.parse(storedRecentDocuments ?? '{}')).toEqual({
      entries: [
        { path: betaPath, title: 'beta.md' },
        { path: alphaPath, title: 'alpha.md' },
      ],
    });

    await bootstrapNextNavigation(page);
    await page.reload();

    await expect
      .poll(async () => page.evaluate(() => typeof window.__MDV_E2E__ !== 'undefined'))
      .toBe(true);
    await expect(page.locator('.doc-tab-item')).toHaveCount(2);
    await expect(page.locator('#doc-path')).toHaveText(betaPath);
    await expect(page.locator('.doc-tab-item.active .doc-tab-button')).toHaveText('Beta');

    const reloadedState = await snapshot(page);
    expect(reloadedState.calls.gateway.loadRequests.map((request) => request.path)).toEqual([
      betaPath,
    ]);
    expect(reloadedState.calls.gateway.watchStartRequests).toEqual([betaPath]);
  });

  test('runs updater checks from the command palette', async ({ page }) => {
    await openE2eApp(page);
    await setUpdateResult(page, {
      status: 'update-installed',
      version: '9.9.9',
    });

    await page.getByRole('button', { name: 'Command Palette' }).click();
    await page.locator('#command-palette-input').fill('check for updates');
    await page.getByRole('button', { name: /Check For Updates/i }).click();

    await expect(page.locator('#error-message')).toHaveText(
      'Update 9.9.9 installed. Restart the app to finish applying it.'
    );
    await expect(page.locator('#error-banner')).toHaveClass(/visible/);

    const state = await snapshot(page);
    expect(state.calls.updater.checks).toBe(1);
  });
});
