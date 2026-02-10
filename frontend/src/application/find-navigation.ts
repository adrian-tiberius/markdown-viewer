export interface FindNavigationState {
  query: string;
  matchCount: number;
  activeIndex: number;
}

export function createEmptyFindNavigationState(): FindNavigationState {
  return {
    query: '',
    matchCount: 0,
    activeIndex: -1,
  };
}

export function normalizeFindQuery(rawQuery: string): string {
  return rawQuery.trim();
}

export function deriveFindNavigationState(input: {
  previous: FindNavigationState;
  query: string;
  matchCount: number;
}): FindNavigationState {
  const normalizedQuery = normalizeFindQuery(input.query);
  const normalizedMatchCount = Math.max(0, Math.floor(input.matchCount));

  if (!normalizedQuery || normalizedMatchCount === 0) {
    return {
      query: normalizedQuery,
      matchCount: normalizedMatchCount,
      activeIndex: -1,
    };
  }

  const sameQuery = input.previous.query === normalizedQuery;
  const previousIndex = sameQuery ? input.previous.activeIndex : 0;
  const activeIndex = normalizeIndex(previousIndex, normalizedMatchCount);

  return {
    query: normalizedQuery,
    matchCount: normalizedMatchCount,
    activeIndex,
  };
}

export function stepFindNavigationIndex(
  state: FindNavigationState,
  direction: 'next' | 'previous'
): FindNavigationState {
  if (state.matchCount <= 0) {
    return {
      ...state,
      activeIndex: -1,
    };
  }

  const currentIndex =
    state.activeIndex >= 0 && state.activeIndex < state.matchCount ? state.activeIndex : 0;
  const activeIndex =
    direction === 'next'
      ? (currentIndex + 1) % state.matchCount
      : (currentIndex - 1 + state.matchCount) % state.matchCount;

  return {
    ...state,
    activeIndex,
  };
}

export function findStatusLabel(state: FindNavigationState): string {
  if (state.matchCount <= 0 || state.activeIndex < 0) {
    return '0 / 0';
  }
  return `${state.activeIndex + 1} / ${state.matchCount}`;
}

function normalizeIndex(index: number, matchCount: number): number {
  if (matchCount <= 0) {
    return -1;
  }
  if (!Number.isFinite(index)) {
    return 0;
  }
  const normalized = Math.floor(index);
  if (normalized < 0) {
    return 0;
  }
  if (normalized >= matchCount) {
    return matchCount - 1;
  }
  return normalized;
}
