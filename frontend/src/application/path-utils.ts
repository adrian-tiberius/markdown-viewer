const MARKDOWN_EXTENSIONS = ['md', 'markdown', 'mdown', 'mkd', 'mkdn'];

export function normalizePathForCompare(path: string): string {
  const normalized = path.replaceAll('\\', '/');
  if (isWindowsStylePath(normalized)) {
    return normalized.toLowerCase();
  }
  return normalized;
}

export function isMarkdownPath(path: string): boolean {
  const clean = path.toLowerCase().split('#')[0].split('?')[0];
  return MARKDOWN_EXTENSIONS.some((extension) => clean.endsWith(`.${extension}`));
}

export function withoutFragment(url: string): string {
  const hashIndex = url.indexOf('#');
  return hashIndex === -1 ? url : url.slice(0, hashIndex);
}

export function filePathToFileUrl(path: string): string {
  const normalized = path.replaceAll('\\', '/');
  if (isWindowsDrivePath(normalized)) {
    return `file:///${encodeURI(normalized)}`;
  }
  if (normalized.startsWith('/')) {
    return `file://${encodeURI(normalized)}`;
  }
  return `file://${encodeURI(normalized)}`;
}

export function baseDirectoryFileUrl(path: string): string {
  const normalized = path.replaceAll('\\', '/');
  const slashIndex = normalized.lastIndexOf('/');
  const directory = slashIndex === -1 ? normalized : normalized.slice(0, slashIndex + 1);
  return filePathToFileUrl(directory);
}

function isWindowsStylePath(path: string): boolean {
  return isWindowsDrivePath(path) || path.startsWith('//');
}

function isWindowsDrivePath(path: string): boolean {
  return /^[a-zA-Z]:\//.test(path);
}
