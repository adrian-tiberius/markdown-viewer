import {
  createEmptyFindNavigationState,
  deriveFindNavigationState,
  findStatusLabel,
  normalizeFindQuery,
  stepFindNavigationIndex,
  type FindNavigationState,
} from '../application/find-navigation';
import type { ViewerUi } from './ui';

interface FindControllerDeps {
  ui: Pick<
    ViewerUi,
    'findBar' | 'findInput' | 'findCount' | 'markdownContent' | 'safeContent'
  >;
  isSafeMode: () => boolean;
}

export class FindController {
  private readonly deps: FindControllerDeps;
  private state: FindNavigationState = createEmptyFindNavigationState();
  private matchElements: HTMLElement[] = [];

  constructor(deps: FindControllerDeps) {
    this.deps = deps;
    this.updateStatus();
  }

  show(options: { selectExistingText: boolean }): void {
    const { ui } = this.deps;
    ui.findBar.classList.add('visible');
    ui.findBar.setAttribute('aria-hidden', 'false');
    ui.findInput.value = this.state.query;
    ui.findInput.focus();
    if (options.selectExistingText) {
      ui.findInput.select();
    }

    if (!this.state.query) {
      this.updateStatus();
    }
  }

  hide(options: { clearQuery: boolean }): void {
    const { ui } = this.deps;
    ui.findBar.classList.remove('visible');
    ui.findBar.setAttribute('aria-hidden', 'true');
    if (!options.clearQuery) {
      return;
    }

    ui.findInput.value = '';
    this.state = createEmptyFindNavigationState();
    this.clearHighlights();
    this.updateStatus();
  }

  isVisible(): boolean {
    return this.deps.ui.findBar.classList.contains('visible');
  }

  query(): string {
    return this.state.query;
  }

  applyQuery(rawQuery: string): void {
    const query = normalizeFindQuery(rawQuery);
    this.clearHighlights();
    this.state = deriveFindNavigationState({
      previous: this.state,
      query,
      matchCount: 0,
    });

    if (!query) {
      this.updateStatus();
      return;
    }

    this.matchElements = this.highlightMatches(query);
    this.state = deriveFindNavigationState({
      previous: this.state,
      query,
      matchCount: this.matchElements.length,
    });
    this.activateMatch(this.state.activeIndex, {
      scroll: true,
    });
    this.updateStatus();
  }

  step(direction: 'next' | 'previous'): boolean {
    if (!this.state.query) {
      return false;
    }

    this.state = stepFindNavigationIndex(this.state, direction);
    this.activateMatch(this.state.activeIndex, {
      scroll: true,
    });
    this.updateStatus();
    return true;
  }

  reapplyOnRenderedDocument(): void {
    const query = this.state.query;
    if (!query) {
      this.clearHighlights();
      this.updateStatus();
      return;
    }

    this.deps.ui.findInput.value = query;
    this.applyQuery(query);
  }

  clearHighlights(): void {
    const containers = [this.deps.ui.markdownContent, this.deps.ui.safeContent];
    for (const container of containers) {
      const marks = Array.from(container.querySelectorAll<HTMLElement>('mark.mdv-find-match'));
      for (const mark of marks) {
        const text = document.createTextNode(mark.textContent ?? '');
        mark.replaceWith(text);
      }
      container.normalize();
    }
    this.matchElements = [];
  }

  resetForEmptyContent(): void {
    this.state = deriveFindNavigationState({
      previous: this.state,
      query: this.state.query,
      matchCount: 0,
    });
    this.updateStatus();
  }

  private highlightMatches(query: string): HTMLElement[] {
    const container = this.currentContainer();
    const normalizedQuery = query.toLowerCase();
    const matches: HTMLElement[] = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode: (node: Node): number => {
        const text = node.nodeValue ?? '';
        if (!text.trim()) {
          return NodeFilter.FILTER_REJECT;
        }
        if (!(node.parentElement instanceof HTMLElement)) {
          return NodeFilter.FILTER_REJECT;
        }
        if (node.parentElement.closest('.mdv-find-match')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const textNodes: Text[] = [];
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode as Text);
    }

    for (const textNode of textNodes) {
      const original = textNode.nodeValue ?? '';
      const normalized = original.toLowerCase();
      let cursor = 0;
      let matchIndex = normalized.indexOf(normalizedQuery, cursor);
      if (matchIndex < 0) {
        continue;
      }

      const fragment = document.createDocumentFragment();
      while (matchIndex >= 0) {
        if (matchIndex > cursor) {
          fragment.append(document.createTextNode(original.slice(cursor, matchIndex)));
        }

        const end = matchIndex + normalizedQuery.length;
        const mark = document.createElement('mark');
        mark.className = 'mdv-find-match';
        mark.textContent = original.slice(matchIndex, end);
        fragment.append(mark);
        matches.push(mark);

        cursor = end;
        matchIndex = normalized.indexOf(normalizedQuery, cursor);
      }

      if (cursor < original.length) {
        fragment.append(document.createTextNode(original.slice(cursor)));
      }

      textNode.parentNode?.replaceChild(fragment, textNode);
    }

    return matches;
  }

  private activateMatch(index: number, options: { scroll: boolean }): void {
    for (const element of this.matchElements) {
      element.classList.remove('active');
    }

    if (index < 0 || index >= this.matchElements.length) {
      return;
    }

    const target = this.matchElements[index];
    target.classList.add('active');
    if (options.scroll && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  private updateStatus(): void {
    this.deps.ui.findCount.textContent = findStatusLabel(this.state);
  }

  private currentContainer(): HTMLElement {
    return this.deps.isSafeMode() ? this.deps.ui.safeContent : this.deps.ui.markdownContent;
  }
}
