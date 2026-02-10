export {
  baseDirectoryFileUrl,
  filePathToFileUrl,
  withoutFragment,
} from '../application/path-utils';

export interface TocNode {
  id: string;
  text: string;
  level: number;
  children: TocNode[];
}

interface TocEntryLike {
  level: number;
  id: string;
  text: string;
}

export function hasUriScheme(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value);
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function buildTocTree(entries: TocEntryLike[]): TocNode[] {
  const root: TocNode = { id: '__root__', text: '', level: 0, children: [] };
  const stack: TocNode[] = [root];

  for (const entry of entries) {
    const node: TocNode = {
      id: entry.id,
      text: entry.text,
      level: entry.level,
      children: [],
    };

    while (stack.length > 1 && entry.level <= stack[stack.length - 1].level) {
      stack.pop();
    }
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }

  return root.children;
}

export function buildParentMap(nodes: TocNode[]): Map<string, string | null> {
  const map = new Map<string, string | null>();
  const walk = (items: TocNode[], parent: string | null) => {
    for (const item of items) {
      map.set(item.id, parent);
      walk(item.children, item.id);
    }
  };
  walk(nodes, null);
  return map;
}
