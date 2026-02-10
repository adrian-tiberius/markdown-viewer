import {
  baseDirectoryFileUrl,
  filePathToFileUrl,
  isMarkdownPath,
  withoutFragment,
} from './path-utils';

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

export type LinkIntent =
  | { type: 'none' }
  | { type: 'blocked-external-protocol'; protocol: string }
  | { type: 'scroll-to-anchor'; fragment: string }
  | { type: 'open-external-url'; url: string }
  | { type: 'open-markdown-file'; path: string }
  | { type: 'open-local-file'; path: string };

export function resolveDocumentLinkIntent(input: {
  href: string;
  documentPath: string;
}): LinkIntent {
  const href = input.href.trim();
  if (!href) {
    return { type: 'none' };
  }

  if (href.startsWith('#')) {
    return { type: 'scroll-to-anchor', fragment: href.slice(1) };
  }

  const documentUrl = withoutFragment(filePathToFileUrl(input.documentPath));
  const baseUrl = baseDirectoryFileUrl(input.documentPath);
  try {
    const url = new URL(href, baseUrl);
    if (url.protocol !== 'file:') {
      if (isSupportedExternalProtocol(url.protocol)) {
        return { type: 'open-external-url', url: url.toString() };
      }
      return { type: 'blocked-external-protocol', protocol: url.protocol };
    }

    const targetFile = withoutFragment(url.toString());
    if (targetFile === documentUrl && url.hash) {
      return { type: 'scroll-to-anchor', fragment: decodeUriComponent(url.hash.slice(1)) };
    }

    const targetPath = fileUrlToPath(url);
    if (!targetPath) {
      return { type: 'none' };
    }
    if (isMarkdownPath(targetPath)) {
      return { type: 'open-markdown-file', path: targetPath };
    }
    return { type: 'open-local-file', path: targetPath };
  } catch {
    return { type: 'none' };
  }
}

export function isLinkedFileOutsideScopeError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('outside allowed directory');
}

function decodeUriComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function fileUrlToPath(url: URL): string {
  const decodedPath = decodeUriComponent(url.pathname);
  const host = url.hostname;
  if (host) {
    const normalizedPath = decodedPath.startsWith('/') ? decodedPath : `/${decodedPath}`;
    return `//${host}${normalizedPath}`;
  }

  if (/^\/[a-zA-Z]:\//.test(decodedPath)) {
    return decodedPath.slice(1);
  }

  return decodedPath;
}

function isSupportedExternalProtocol(protocol: string): boolean {
  return ALLOWED_EXTERNAL_PROTOCOLS.has(protocol.toLowerCase());
}
