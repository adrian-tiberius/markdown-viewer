// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import type { TocEntry } from '../domain';
import { TocController } from './toc-controller';

function setup(entries: TocEntry[]) {
  document.body.innerHTML = `
    <div id="viewer-scroll"></div>
    <ul id="toc-list"></ul>
    <article id="markdown-content"></article>
  `;

  const tocList = document.querySelector<HTMLUListElement>('#toc-list')!;
  const markdownContent = document.querySelector<HTMLElement>('#markdown-content')!;
  const viewerScroll = document.querySelector<HTMLElement>('#viewer-scroll')!;
  const collapsedState: Record<string, boolean> = {};
  let persistedCount = 0;

  const controller = new TocController({
    ui: {
      tocList,
      markdownContent,
      viewerScroll,
    },
    isAutoExpandEnabled: () => false,
    isCollapsed: (id: string) => collapsedState[id] === true,
    setCollapsed: (id: string, collapsed: boolean) => {
      collapsedState[id] = collapsed;
    },
    persistCollapsedState: () => {
      persistedCount += 1;
    },
  });

  controller.render(entries);

  return {
    controller,
    tocList,
    markdownContent,
    collapsedState,
    persistedCount: () => persistedCount,
  };
}

describe('toc-controller (presentation)', () => {
  it('toggles collapsed state for nested sections and persists updates', () => {
    const entries: TocEntry[] = [
      { id: 'overview', text: 'Overview', level: 2 },
      { id: 'details', text: 'Details', level: 3 },
    ];
    const context = setup(entries);

    const toggle = context.tocList.querySelector<HTMLButtonElement>(
      'button[data-toc-toggle][data-id="overview"]'
    );
    expect(toggle).toBeTruthy();

    toggle!.click();
    expect(context.collapsedState.overview).toBe(true);
    expect(context.persistedCount()).toBe(1);
  });

  it('uses CSS selector fallback when CSS.escape is unavailable', () => {
    const entries: TocEntry[] = [{ id: 'intro:section', text: 'Intro', level: 2 }];
    const context = setup(entries);
    context.markdownContent.innerHTML = '<h2 id="intro:section">Intro</h2>';
    const heading = context.markdownContent.querySelector<HTMLElement>('#intro\\:section')!;
    const scrollIntoViewMock = vi.fn();
    Object.defineProperty(heading, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock,
    });

    const originalCss = (globalThis as { CSS?: unknown }).CSS;
    Object.defineProperty(globalThis, 'CSS', {
      configurable: true,
      value: undefined,
    });

    try {
      const link = context.tocList.querySelector<HTMLAnchorElement>(
        'a[data-toc-link][data-id="intro:section"]'
      );
      expect(link).toBeTruthy();
      const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
      link!.dispatchEvent(clickEvent);
      expect(clickEvent.defaultPrevented).toBe(true);
      expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(globalThis, 'CSS', {
        configurable: true,
        value: originalCss,
      });
    }
  });
});
