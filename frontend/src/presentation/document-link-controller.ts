import { resolveDocumentLinkIntent } from '../application/link-navigation';
import {
  baseDirectoryFileUrl,
  hasUriScheme,
} from './document-view-utils';
import type { ViewerUi } from './ui';

interface DocumentLinkControllerDeps {
  ui: Pick<ViewerUi, 'markdownContent'>;
  openExternalUrl: (url: string) => Promise<void> | void;
  openMarkdownFile: (path: string) => Promise<void> | void;
  openLocalFile: (path: string, sourceDocumentPath: string) => Promise<void> | void;
}

export class DocumentLinkController {
  private readonly deps: DocumentLinkControllerDeps;
  private clickDisposer: (() => void) | null = null;

  constructor(deps: DocumentLinkControllerDeps) {
    this.deps = deps;
  }

  dispose(): void {
    this.clickDisposer?.();
    this.clickDisposer = null;
  }

  applyNormalizedResourceUrls(documentPath: string): void {
    const { ui } = this.deps;
    const baseUrl = baseDirectoryFileUrl(documentPath);
    const targets = ui.markdownContent.querySelectorAll<HTMLElement>(
      'a[href], img[src], source[src], video[src], audio[src]'
    );

    for (const target of targets) {
      const attribute = target.hasAttribute('href') ? 'href' : 'src';
      const raw = target.getAttribute(attribute);
      if (!raw || raw.startsWith('#') || hasUriScheme(raw)) {
        continue;
      }
      try {
        const resolved = new URL(raw, baseUrl).toString();
        target.setAttribute(attribute, resolved);
      } catch {
        // Keep original values when URL resolution fails.
      }
    }
  }

  bind(documentPath: string): void {
    const { ui } = this.deps;
    this.clickDisposer?.();

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor) {
        return;
      }

      const href = anchor.getAttribute('href');
      if (!href) {
        return;
      }

      const anchorLabel = (anchor.textContent ?? '').trim();
      const intent = resolveDocumentLinkIntent({
        href,
        documentPath,
      });
      if (intent.type === 'none') {
        return;
      }

      event.preventDefault();
      if (intent.type === 'scroll-to-anchor') {
        const heading = this.resolveHeadingTarget(intent.fragment, anchorLabel);
        if (heading) {
          heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }

      if (intent.type === 'open-external-url') {
        void this.deps.openExternalUrl(intent.url);
        return;
      }

      if (intent.type === 'open-markdown-file') {
        void this.deps.openMarkdownFile(intent.path);
        return;
      }

      void this.deps.openLocalFile(intent.path, documentPath);
    };

    ui.markdownContent.addEventListener('click', onClick);
    this.clickDisposer = () => ui.markdownContent.removeEventListener('click', onClick);
  }

  private resolveHeadingTarget(fragment: string, anchorLabel?: string): HTMLElement | null {
    const decoded = this.decodeUriComponent(fragment).trim();
    if (!decoded) {
      return null;
    }

    for (const candidate of this.headingIdCandidates(decoded)) {
      const heading = this.findHeadingById(candidate);
      if (heading) {
        return heading;
      }
    }

    const label = anchorLabel?.trim();
    if (label) {
      const heading = this.findHeadingByText(label);
      if (heading) {
        return heading;
      }
    }

    const headingFromAliasLink = this.findHeadingByAliasLinkText(decoded);
    if (headingFromAliasLink) {
      return headingFromAliasLink;
    }

    return null;
  }

  private findHeadingByAliasLinkText(fragment: string): HTMLElement | null {
    const normalizedFragment = fragment.trim().toLowerCase();
    if (!normalizedFragment) {
      return null;
    }

    const links = this.deps.ui.markdownContent.querySelectorAll<HTMLAnchorElement>('a[href]');
    for (const link of links) {
      const href = link.getAttribute('href');
      if (!href || !href.startsWith('#')) {
        continue;
      }

      const candidateFragment = this.decodeUriComponent(href.slice(1)).trim().toLowerCase();
      if (candidateFragment !== normalizedFragment) {
        continue;
      }

      const heading = this.findHeadingByText((link.textContent ?? '').trim());
      if (heading) {
        return heading;
      }
    }

    return null;
  }

  private findDocumentHeadings(): HTMLElement[] {
    return Array.from(
      this.deps.ui.markdownContent.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')
    );
  }

  private findHeadingById(id: string): HTMLElement | null {
    const escapedId = this.escapeCssIdentifier(id);
    const target = this.deps.ui.markdownContent.querySelector<HTMLElement>(`#${escapedId}`);
    if (!target) {
      return null;
    }
    return this.resolveOwningHeading(target);
  }

  private resolveOwningHeading(element: HTMLElement): HTMLElement | null {
    if (this.isHeadingElement(element)) {
      return element;
    }

    const heading = element.closest<HTMLElement>('h1, h2, h3, h4, h5, h6');
    if (heading && this.deps.ui.markdownContent.contains(heading)) {
      return heading;
    }

    return null;
  }

  private isHeadingElement(element: Element): element is HTMLHeadingElement {
    return /^h[1-6]$/i.test(element.tagName);
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

  private findHeadingByText(text: string): HTMLElement | null {
    const target = this.normalizeHeadingText(text);
    if (!target) {
      return null;
    }

    const headings = this.findDocumentHeadings();
    for (const heading of headings) {
      const headingText = this.normalizeHeadingText(heading.textContent ?? '');
      if (headingText === target) {
        return heading;
      }
    }

    return null;
  }

  private headingIdCandidates(fragment: string): string[] {
    const candidates = new Set<string>();
    const addCandidate = (id: string) => {
      const normalized = id.trim();
      if (!normalized) {
        return;
      }

      candidates.add(normalized);
      if (normalized.startsWith('mdv-')) {
        candidates.add(normalized.slice(4));
      } else {
        candidates.add(`mdv-${normalized}`);
      }
    };

    addCandidate(fragment);
    addCandidate(fragment.toLowerCase());

    const slug = this.slugifyFragment(fragment);
    if (slug) {
      addCandidate(slug);
    }

    return Array.from(candidates);
  }

  private slugifyFragment(fragment: string): string {
    return fragment
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9 _-]+/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private decodeUriComponent(value: string): string {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  private normalizeHeadingText(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
