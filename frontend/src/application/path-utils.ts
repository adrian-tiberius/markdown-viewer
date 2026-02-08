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

function isWindowsStylePath(path: string): boolean {
  return /^[a-zA-Z]:\//.test(path) || path.startsWith('//');
}
