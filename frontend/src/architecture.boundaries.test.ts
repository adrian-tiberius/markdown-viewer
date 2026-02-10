import { describe, expect, it } from 'vitest';

const sourceFiles = import.meta.glob(
  ['./**/*.ts', './**/*.tsx', './**/*.js', './**/*.jsx', './**/*.mjs', './**/*.cjs'],
  {
    eager: true,
    import: 'default',
    query: '?raw',
  }
) as Record<string, string>;
const ALLOWED_TOP_LEVEL_RUNTIME_MODULES = new Set(['main']);
const FORBIDDEN_CORE_LAYER_IMPORT_PREFIXES = ['@tauri-apps/', 'highlight.js', 'katex'];
const FORBIDDEN_PRESENTATION_IMPORT_PREFIXES = ['@tauri-apps/', 'highlight.js', 'katex'];
const NON_CODE_IMPORT_PATTERN =
  /\.(css|scss|sass|less|styl|pcss|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|eot)(?:[?#].*)?$/i;
const FORBIDDEN_INNER_LAYER_GLOBAL_PATTERNS = [
  { label: 'window', pattern: /\bwindow\./ },
  { label: 'document', pattern: /\bdocument\./ },
  { label: 'localStorage', pattern: /\blocalStorage\b/ },
  { label: 'sessionStorage', pattern: /\bsessionStorage\b/ },
  { label: 'IntersectionObserver', pattern: /\bIntersectionObserver\b/ },
  { label: 'requestAnimationFrame', pattern: /\brequestAnimationFrame\b/ },
  { label: 'CSS', pattern: /\bCSS\./ },
];
type ArchitectureLayer = 'domain' | 'application' | 'infrastructure' | 'presentation';

function isTestSourceFile(filePath: string): boolean {
  return /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(filePath);
}

function isDeclarationFile(filePath: string): boolean {
  return /\.d\.(ts|tsx)$/.test(filePath);
}

function collectImportSpecifiers(source: string): string[] {
  const specifiers = new Set<string>();
  const importFromRegex = /(?:import|export)\s+(?:type\s+)?(?:[^'"]+?)from\s+['"]([^'"]+)['"]/g;
  const sideEffectImportRegex = /import\s+['"]([^'"]+)['"]/g;
  const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  const commonJsRequireRegex = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (const regex of [
    importFromRegex,
    sideEffectImportRegex,
    dynamicImportRegex,
    commonJsRequireRegex,
  ]) {
    let match: RegExpExecArray | null = regex.exec(source);
    while (match) {
      specifiers.add(match[1]);
      match = regex.exec(source);
    }
  }

  return Array.from(specifiers);
}

function resolveRelativeImport(fromFile: string, importSpecifier: string): string {
  const fromParts = fromFile.replace(/^\.\//, '').split('/');
  fromParts.pop();

  const importParts = importSpecifier.split('/');
  for (const part of importParts) {
    if (part === '.' || part === '') {
      continue;
    }
    if (part === '..') {
      fromParts.pop();
      continue;
    }
    fromParts.push(part);
  }

  return fromParts.join('/');
}

function normalizePath(path: string): string {
  return path
    .replace(/^\.\//, '')
    .replace(/[?#].*$/, '')
    .replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '');
}

function fileLayer(filePath: string): ArchitectureLayer | null {
  const normalized = normalizePath(filePath);
  if (normalized === 'domain' || normalized.startsWith('domain/')) {
    return 'domain';
  }
  if (normalized === 'application' || normalized.startsWith('application/')) {
    return 'application';
  }
  if (normalized === 'infrastructure' || normalized.startsWith('infrastructure/')) {
    return 'infrastructure';
  }
  if (normalized === 'presentation' || normalized.startsWith('presentation/')) {
    return 'presentation';
  }
  return null;
}

function resolveLocalImportPath(fromFile: string, importSpecifier: string): string | null {
  if (importSpecifier.startsWith('.')) {
    return normalizePath(resolveRelativeImport(fromFile, importSpecifier));
  }

  if (importSpecifier.startsWith('@/')) {
    return normalizePath(importSpecifier.slice(2));
  }

  if (importSpecifier.startsWith('src/')) {
    return normalizePath(importSpecifier.slice('src/'.length));
  }

  if (importSpecifier.startsWith('/src/')) {
    return normalizePath(importSpecifier.slice('/src/'.length));
  }

  if (
    importSpecifier === 'domain' ||
    importSpecifier === 'application' ||
    importSpecifier === 'infrastructure' ||
    importSpecifier === 'presentation' ||
    importSpecifier.startsWith('domain/') ||
    importSpecifier.startsWith('application/') ||
    importSpecifier.startsWith('infrastructure/') ||
    importSpecifier.startsWith('presentation/')
  ) {
    return normalizePath(importSpecifier);
  }

  return null;
}

function violatesLayerDependencyRule(layer: ArchitectureLayer, targetLayer: ArchitectureLayer): boolean {
  if (layer === 'domain') {
    return targetLayer !== 'domain';
  }

  if (layer === 'application') {
    return targetLayer === 'infrastructure' || targetLayer === 'presentation';
  }

  if (layer === 'infrastructure') {
    return targetLayer === 'presentation';
  }

  return layer === 'presentation' && targetLayer === 'infrastructure';
}

function isCoreLayer(layer: ArchitectureLayer): boolean {
  return layer === 'domain' || layer === 'application';
}

function isExternalImport(importSpecifier: string): boolean {
  return (
    !importSpecifier.startsWith('.') &&
    !importSpecifier.startsWith('@/') &&
    !importSpecifier.startsWith('src/') &&
    !importSpecifier.startsWith('/src/') &&
    importSpecifier !== 'domain' &&
    importSpecifier !== 'application' &&
    importSpecifier !== 'infrastructure' &&
    importSpecifier !== 'presentation' &&
    !importSpecifier.startsWith('domain/') &&
    !importSpecifier.startsWith('application/') &&
    !importSpecifier.startsWith('infrastructure/') &&
    !importSpecifier.startsWith('presentation/')
  );
}

describe('clean architecture boundaries', () => {
  it('keeps runtime source files inside architecture layers', () => {
    const violations = Object.keys(sourceFiles)
      .filter((filePath) => !isTestSourceFile(filePath))
      .filter((filePath) => !isDeclarationFile(filePath))
      .map((filePath) => normalizePath(filePath))
      .filter(
        (normalized) =>
          fileLayer(normalized) === null && !ALLOWED_TOP_LEVEL_RUNTIME_MODULES.has(normalized)
      );

    expect(
      violations,
      [
        'Runtime source files must live under src/domain, src/application, src/infrastructure,',
        'or src/presentation (except allowed composition roots).',
      ].join(' ')
    ).toEqual([]);
  });

  it('enforces frontend layer dependency rules', () => {
    const violations: string[] = [];

    for (const [filePath, source] of Object.entries(sourceFiles)) {
      if (isTestSourceFile(filePath) || isDeclarationFile(filePath)) {
        continue;
      }

      const layer = fileLayer(filePath);
      if (!layer) {
        continue;
      }

      for (const specifier of collectImportSpecifiers(source)) {
        if (isCoreLayer(layer) && NON_CODE_IMPORT_PATTERN.test(specifier)) {
          violations.push(
            `${filePath} -> ${specifier} (core layers must not import styles or static assets)`
          );
          continue;
        }

        const localImportPath = resolveLocalImportPath(filePath, specifier);
        if (localImportPath) {
          if (ALLOWED_TOP_LEVEL_RUNTIME_MODULES.has(localImportPath)) {
            violations.push(`${filePath} -> ${specifier} (layers cannot depend on composition root)`);
            continue;
          }

          const targetLayer = fileLayer(localImportPath);
          if (!targetLayer) {
            violations.push(
              `${filePath} -> ${specifier} (runtime imports must stay inside architecture layers)`
            );
            continue;
          }

          if (violatesLayerDependencyRule(layer, targetLayer)) {
            violations.push(`${filePath} -> ${specifier}`);
          }
          continue;
        }

        if (
          layer === 'presentation' &&
          FORBIDDEN_PRESENTATION_IMPORT_PREFIXES.some((prefix) => specifier.startsWith(prefix))
        ) {
          violations.push(
            `${filePath} -> ${specifier} (framework and rendering library imports belong in infrastructure adapters)`
          );
          continue;
        }

        if (
          isCoreLayer(layer) &&
          FORBIDDEN_CORE_LAYER_IMPORT_PREFIXES.some((prefix) => specifier.startsWith(prefix))
        ) {
          violations.push(`${filePath} -> ${specifier} (core layers must stay framework-agnostic)`);
          continue;
        }

        if (isCoreLayer(layer) && isExternalImport(specifier)) {
          violations.push(
            `${filePath} -> ${specifier} (core layers must only depend on local domain/application modules)`
          );
        }
      }
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('keeps domain and application layers free of browser globals', () => {
    const violations: string[] = [];

    for (const [filePath, source] of Object.entries(sourceFiles)) {
      if (isTestSourceFile(filePath) || isDeclarationFile(filePath)) {
        continue;
      }

      const layer = fileLayer(filePath);
      if (layer !== 'domain' && layer !== 'application') {
        continue;
      }

      for (const { label, pattern } of FORBIDDEN_INNER_LAYER_GLOBAL_PATTERNS) {
        if (pattern.test(source)) {
          violations.push(`${filePath} uses ${label}`);
        }
      }
    }

    expect(
      violations,
      [
        'Domain/application layers must be framework-agnostic and avoid direct browser runtime',
        'globals such as window/document/localStorage.',
      ].join(' ')
    ).toEqual([]);
  });
});
