export interface DocumentTab {
  path: string;
  title: string;
}

export interface DocumentTabState {
  tabs: DocumentTab[];
  activePath: string | null;
}

export interface DocumentTabSession {
  tabPaths: string[];
  activePath: string | null;
}

export interface CloseDocumentTabResult {
  state: DocumentTabState;
  removed: boolean;
  closedActive: boolean;
  nextActivePath: string | null;
}

export function createEmptyDocumentTabState(): DocumentTabState {
  return {
    tabs: [],
    activePath: null,
  };
}

export function createEmptyDocumentTabSession(): DocumentTabSession {
  return {
    tabPaths: [],
    activePath: null,
  };
}

export function tabTitleFromPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const segment = normalized.split('/').pop();
  const title = segment?.trim();
  return title && title.length > 0 ? title : path;
}

export function openDocumentTab(
  state: DocumentTabState,
  rawPath: string,
  options: { activate: boolean }
): DocumentTabState {
  const path = rawPath.trim();
  if (!path) {
    return state;
  }

  const hasTab = state.tabs.some((tab) => tab.path === path);
  const tabs = hasTab
    ? state.tabs
    : [
        ...state.tabs,
        {
          path,
          title: tabTitleFromPath(path),
        },
      ];

  return {
    tabs,
    activePath: options.activate ? path : state.activePath,
  };
}

export function closeDocumentTab(state: DocumentTabState, path: string): CloseDocumentTabResult {
  const index = state.tabs.findIndex((tab) => tab.path === path);
  if (index < 0) {
    return {
      state,
      removed: false,
      closedActive: false,
      nextActivePath: state.activePath,
    };
  }

  const tabs = state.tabs.filter((_, tabIndex) => tabIndex !== index);
  const closedActive = state.activePath === path;
  if (!closedActive) {
    return {
      state: {
        tabs,
        activePath: state.activePath,
      },
      removed: true,
      closedActive: false,
      nextActivePath: state.activePath,
    };
  }

  if (tabs.length === 0) {
    return {
      state: {
        tabs,
        activePath: null,
      },
      removed: true,
      closedActive: true,
      nextActivePath: null,
    };
  }

  const nextIndex = Math.min(index, tabs.length - 1);
  const nextActivePath = tabs[nextIndex]?.path ?? null;
  return {
    state: {
      tabs,
      activePath: nextActivePath,
    },
    removed: true,
    closedActive: true,
    nextActivePath,
  };
}

export function applyLoadedDocumentToTabs(
  state: DocumentTabState,
  requestedPath: string,
  loadedPath: string,
  loadedTitle: string
): DocumentTabState {
  const normalizedLoadedPath = loadedPath.trim();
  if (!normalizedLoadedPath) {
    return state;
  }

  const normalizedRequestedPath = requestedPath.trim();
  let tabs = [...state.tabs];
  let activePath = state.activePath;

  if (normalizedRequestedPath && normalizedRequestedPath !== normalizedLoadedPath) {
    const requestedIndex = tabs.findIndex((tab) => tab.path === normalizedRequestedPath);
    if (requestedIndex >= 0) {
      const loadedIndex = tabs.findIndex((tab) => tab.path === normalizedLoadedPath);
      if (loadedIndex >= 0) {
        tabs = tabs.filter((_, tabIndex) => tabIndex !== requestedIndex);
      } else {
        tabs = tabs.map((tab, tabIndex) =>
          tabIndex === requestedIndex ? { ...tab, path: normalizedLoadedPath } : tab
        );
      }
    }
    if (activePath === normalizedRequestedPath) {
      activePath = normalizedLoadedPath;
    }
  }

  const resolvedTitle = loadedTitle.trim() || tabTitleFromPath(normalizedLoadedPath);
  const existingIndex = tabs.findIndex((tab) => tab.path === normalizedLoadedPath);
  if (existingIndex >= 0) {
    tabs = tabs.map((tab, tabIndex) =>
      tabIndex === existingIndex ? { ...tab, title: resolvedTitle } : tab
    );
  } else {
    tabs = [
      ...tabs,
      {
        path: normalizedLoadedPath,
        title: resolvedTitle,
      },
    ];
  }

  activePath = normalizedLoadedPath;
  return {
    tabs,
    activePath,
  };
}

export function mergeDocumentTabSession(parsed: unknown): DocumentTabSession {
  const source = asRecord(parsed);
  const session = createEmptyDocumentTabSession();
  const seen = new Set<string>();
  const rawPaths = Array.isArray(source.tabPaths) ? source.tabPaths : [];

  for (const candidate of rawPaths) {
    if (typeof candidate !== 'string') {
      continue;
    }
    const path = candidate.trim();
    if (!path || seen.has(path)) {
      continue;
    }
    seen.add(path);
    session.tabPaths.push(path);
  }

  const activeCandidate = typeof source.activePath === 'string' ? source.activePath.trim() : '';
  if (activeCandidate && session.tabPaths.includes(activeCandidate)) {
    session.activePath = activeCandidate;
    return session;
  }

  session.activePath = session.tabPaths.at(-1) ?? null;
  return session;
}

export function restoreDocumentTabState(session: DocumentTabSession): DocumentTabState {
  let state = createEmptyDocumentTabState();
  for (const path of session.tabPaths) {
    state = openDocumentTab(state, path, {
      activate: false,
    });
  }

  const activePath =
    session.activePath && state.tabs.some((tab) => tab.path === session.activePath)
      ? session.activePath
      : state.tabs.at(-1)?.path ?? null;
  return {
    tabs: state.tabs,
    activePath,
  };
}

export function toDocumentTabSession(state: DocumentTabState): DocumentTabSession {
  const tabPaths = state.tabs.map((tab) => tab.path);
  const activePath =
    state.activePath && tabPaths.includes(state.activePath)
      ? state.activePath
      : tabPaths.at(-1) ?? null;
  return {
    tabPaths,
    activePath,
  };
}

export function adjacentDocumentTabPath(
  state: DocumentTabState,
  direction: 'next' | 'previous'
): string | null {
  if (state.tabs.length === 0) {
    return null;
  }

  const activeIndex = state.tabs.findIndex((tab) => tab.path === state.activePath);
  const currentIndex = activeIndex >= 0 ? activeIndex : 0;
  const nextIndex =
    direction === 'next'
      ? (currentIndex + 1) % state.tabs.length
      : (currentIndex - 1 + state.tabs.length) % state.tabs.length;
  return state.tabs[nextIndex]?.path ?? null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}
