import { describe, expect, it } from 'vitest';

import {
  createEmptyFindNavigationState,
  deriveFindNavigationState,
  findStatusLabel,
  stepFindNavigationIndex,
} from './find-navigation';

describe('find-navigation', () => {
  it('starts empty and labels no matches', () => {
    const state = createEmptyFindNavigationState();
    expect(state).toEqual({
      query: '',
      matchCount: 0,
      activeIndex: -1,
    });
    expect(findStatusLabel(state)).toBe('0 / 0');
  });

  it('derives first active match when query has matches', () => {
    const previous = createEmptyFindNavigationState();
    const next = deriveFindNavigationState({
      previous,
      query: 'markdown',
      matchCount: 3,
    });

    expect(next).toEqual({
      query: 'markdown',
      matchCount: 3,
      activeIndex: 0,
    });
    expect(findStatusLabel(next)).toBe('1 / 3');
  });

  it('wraps next and previous navigation over match bounds', () => {
    const base = {
      query: 'markdown',
      matchCount: 2,
      activeIndex: 1,
    };

    const next = stepFindNavigationIndex(base, 'next');
    expect(next.activeIndex).toBe(0);

    const previous = stepFindNavigationIndex(base, 'previous');
    expect(previous.activeIndex).toBe(0);
  });
});
