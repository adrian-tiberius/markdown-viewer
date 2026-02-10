import type { TocEntry } from '../domain';
import {
  buildParentMap,
  buildTocTree,
  escapeHtml,
  type TocNode,
} from './document-view-utils';
import type { ViewerUi } from './ui';

interface TocControllerDeps {
  ui: Pick<ViewerUi, 'tocList' | 'markdownContent' | 'viewerScroll'>;
  isAutoExpandEnabled: () => boolean;
  isCollapsed: (id: string) => boolean;
  setCollapsed: (id: string, collapsed: boolean) => void;
  persistCollapsedState: () => void;
}

export class TocController {
  private readonly deps: TocControllerDeps;
  private activeHeadingId = '';
  private headingObserver: IntersectionObserver | null = null;
  private tocParentMap = new Map<string, string | null>();
  private tocEntries: TocEntry[] = [];

  constructor(deps: TocControllerDeps) {
    this.deps = deps;
  }

  render(entries: TocEntry[]): void {
    this.tocEntries = entries;
    this.renderEntries(entries, {
      preserveActiveHeading: false,
    });
  }

  observeActiveHeading(): void {
    const { ui } = this.deps;
    const headings = this.findDocumentHeadings().filter((heading) =>
      Boolean(this.resolveObservedHeadingId(heading))
    );
    if (headings.length === 0) {
      return;
    }

    this.headingObserver = new IntersectionObserver(
      (observations) => {
        const visible = observations
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top);
        if (visible.length === 0) {
          return;
        }

        const heading = visible[0].target as HTMLElement;
        const headingId = this.resolveObservedHeadingId(heading);
        if (!headingId || headingId === this.activeHeadingId) {
          return;
        }
        this.activeHeadingId = headingId;
        if (this.deps.isAutoExpandEnabled()) {
          this.expandAncestors(headingId);
        }
        this.updateActiveState();
      },
      {
        root: ui.viewerScroll,
        threshold: [0.1, 0.5, 1],
        rootMargin: '-12% 0px -72% 0px',
      }
    );

    for (const heading of headings) {
      this.headingObserver.observe(heading);
    }
  }

  disconnect(): void {
    this.headingObserver?.disconnect();
    this.headingObserver = null;
  }

  private renderEntries(
    entries: TocEntry[],
    options: {
      preserveActiveHeading: boolean;
    }
  ): void {
    const { ui } = this.deps;
    const previousActiveHeading = this.activeHeadingId;
    this.activeHeadingId = options.preserveActiveHeading ? previousActiveHeading : '';

    const tree = buildTocTree(entries);
    this.tocParentMap = buildParentMap(tree);

    if (tree.length === 0) {
      ui.tocList.innerHTML = '<li class="toc-empty">No headings</li>';
      return;
    }

    ui.tocList.innerHTML = tree.map((node) => this.renderNode(node)).join('');

    const toggleButtons = ui.tocList.querySelectorAll<HTMLButtonElement>(
      'button[data-toc-toggle]'
    );
    for (const button of toggleButtons) {
      button.addEventListener('click', () => {
        const id = button.dataset.id;
        if (!id) {
          return;
        }
        this.deps.setCollapsed(id, !this.deps.isCollapsed(id));
        this.deps.persistCollapsedState();
        this.renderEntries(entries, {
          preserveActiveHeading: true,
        });
        this.updateActiveState();
      });
    }

    const links = ui.tocList.querySelectorAll<HTMLAnchorElement>('a[data-toc-link]');
    for (const link of links) {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const id = link.dataset.id;
        if (!id) {
          return;
        }
        const heading = ui.markdownContent.querySelector<HTMLElement>(
          `#${this.escapeCssIdentifier(id)}`
        );
        if (heading) {
          heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        if (this.deps.isAutoExpandEnabled()) {
          this.expandAncestors(id);
        }
        this.activeHeadingId = id;
        this.updateActiveState();
      });
    }
  }

  private renderNode(node: TocNode): string {
    const collapsed = this.deps.isCollapsed(node.id);
    const hasChildren = node.children.length > 0;
    const hiddenClass = collapsed ? 'collapsed' : '';
    const toggle = hasChildren
      ? `<button class="toc-toggle" data-toc-toggle="1" data-id="${escapeHtml(node.id)}" aria-label="Toggle section">${collapsed ? '▸' : '▾'}</button>`
      : '<span class="toc-toggle spacer"></span>';

    const children = hasChildren
      ? `<ul class="toc-children ${hiddenClass}">${node.children
          .map((child) => this.renderNode(child))
          .join('')}</ul>`
      : '';

    return `<li class="toc-item level-${node.level}" data-id="${escapeHtml(node.id)}">
    <div class="toc-row">
      ${toggle}
      <a class="toc-link" href="#${encodeURIComponent(node.id)}" data-toc-link="1" data-id="${escapeHtml(node.id)}">${escapeHtml(node.text)}</a>
    </div>
    ${children}
  </li>`;
  }

  private updateActiveState(): void {
    const items = this.deps.ui.tocList.querySelectorAll<HTMLElement>('.toc-item');
    for (const item of items) {
      const isActive = item.dataset.id === this.activeHeadingId;
      item.classList.toggle('active', isActive);
    }
  }

  private expandAncestors(id: string): void {
    let cursor: string | null = id;
    while (cursor) {
      this.deps.setCollapsed(cursor, false);
      cursor = this.tocParentMap.get(cursor) ?? null;
    }

    this.deps.persistCollapsedState();
    this.renderEntries(this.tocEntries, {
      preserveActiveHeading: true,
    });
  }

  private resolveObservedHeadingId(heading: HTMLElement): string | null {
    if (heading.id) {
      return heading.id;
    }

    const nested = heading.querySelector<HTMLElement>('[id]');
    return nested?.id ?? null;
  }

  private findDocumentHeadings(): HTMLElement[] {
    return Array.from(
      this.deps.ui.markdownContent.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')
    );
  }

  private escapeCssIdentifier(value: string): string {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(value);
    }

    return value.replace(/[\u0000-\u001f\u007f]|^-?\d|^-$|[^a-zA-Z0-9_-]/g, (char) => {
      if (char === '\0') {
        return '\uFFFD';
      }
      return `\\${char}`;
    });
  }
}
