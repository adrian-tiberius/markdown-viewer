import { expect, type Page } from '@playwright/test';

import type { DragDropEventPayload, UpdateCheckResult } from '../../src/application/ports';
import type { TocEntry } from '../../src/domain';
import type { MarkdownViewerE2eSnapshot } from '../../src/infrastructure/e2e-runtime';

export interface E2eDocumentFixture {
  path: string;
  title?: string;
  source: string;
  html: string;
  toc?: TocEntry[];
  wordCount?: number;
  readingTimeMinutes?: number;
}

export async function openE2eApp(page: Page): Promise<void> {
  await page.goto('/?runtime=e2e');
  await expect(page.locator('#workspace')).toBeVisible();
  await expect
    .poll(async () => page.evaluate(() => typeof window.__MDV_E2E__ !== 'undefined'))
    .toBe(true);
  await resetE2eControl(page);
}

export async function resetE2eControl(page: Page): Promise<void> {
  await page.evaluate(() => {
    const control = window.__MDV_E2E__;
    if (!control) {
      throw new Error('E2E control is not registered');
    }
    control.reset();
  });
}

export async function setDocumentFixture(page: Page, document: E2eDocumentFixture): Promise<void> {
  await page.evaluate((payload) => {
    const control = window.__MDV_E2E__;
    if (!control) {
      throw new Error('E2E control is not registered');
    }
    control.setDocument(payload);
  }, document);
}

export async function setPickedMarkdownPath(page: Page, path: string | null): Promise<void> {
  await page.evaluate((nextPath) => {
    const control = window.__MDV_E2E__;
    if (!control) {
      throw new Error('E2E control is not registered');
    }
    control.setPickMarkdownFileResult(nextPath);
  }, path);
}

export async function setLaunchOpenPath(page: Page, path: string | null): Promise<void> {
  await page.evaluate((nextPath) => {
    const control = window.__MDV_E2E__;
    if (!control) {
      throw new Error('E2E control is not registered');
    }
    control.setLaunchOpenPath(nextPath);
  }, path);
}

export async function setUpdateResult(page: Page, result: UpdateCheckResult): Promise<void> {
  await page.evaluate((nextResult) => {
    const control = window.__MDV_E2E__;
    if (!control) {
      throw new Error('E2E control is not registered');
    }
    control.setUpdateResult(nextResult);
  }, result);
}

export async function setAppVersion(page: Page, version: string): Promise<void> {
  await page.evaluate((nextVersion) => {
    const control = window.__MDV_E2E__;
    if (!control) {
      throw new Error('E2E control is not registered');
    }
    control.setAppVersion(nextVersion);
  }, version);
}

export async function emitFileUpdated(page: Page, path: string): Promise<void> {
  await page.evaluate((nextPath) => {
    const control = window.__MDV_E2E__;
    if (!control) {
      throw new Error('E2E control is not registered');
    }
    control.emitFileUpdated(nextPath);
  }, path);
}

export async function emitOpenPath(page: Page, path: string): Promise<void> {
  await page.evaluate((nextPath) => {
    const control = window.__MDV_E2E__;
    if (!control) {
      throw new Error('E2E control is not registered');
    }
    control.emitOpenPath(nextPath);
  }, path);
}

export async function emitDragDrop(page: Page, event: DragDropEventPayload): Promise<void> {
  await page.evaluate((payload) => {
    const control = window.__MDV_E2E__;
    if (!control) {
      throw new Error('E2E control is not registered');
    }
    control.emitDragDrop(payload);
  }, event);
}

export async function snapshot(page: Page): Promise<MarkdownViewerE2eSnapshot> {
  return page.evaluate(() => {
    const control = window.__MDV_E2E__;
    if (!control) {
      throw new Error('E2E control is not registered');
    }
    return control.snapshot();
  });
}

export async function bootstrapNextNavigation(
  page: Page,
  seededSnapshot?: MarkdownViewerE2eSnapshot
): Promise<void> {
  const state = seededSnapshot ?? (await snapshot(page));
  await page.addInitScript((bootstrap) => {
    window.__MDV_E2E_BOOTSTRAP__ = bootstrap;
  }, state);
}
