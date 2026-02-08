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

export function withoutFragment(url: string): string {
  const hashIndex = url.indexOf('#');
  return hashIndex === -1 ? url : url.slice(0, hashIndex);
}

export function baseDirectoryFileUrl(path: string): string {
  const normalized = path.replaceAll('\\', '/');
  const slashIndex = normalized.lastIndexOf('/');
  const directory = slashIndex === -1 ? normalized : normalized.slice(0, slashIndex + 1);
  return filePathToFileUrl(directory);
}

export function filePathToFileUrl(path: string): string {
  const normalized = path.replaceAll('\\', '/');
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return `file:///${encodeURI(normalized)}`;
  }
  if (normalized.startsWith('/')) {
    return `file://${encodeURI(normalized)}`;
  }
  return `file://${encodeURI(normalized)}`;
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
