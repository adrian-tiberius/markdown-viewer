import { describe, expect, it } from 'vitest';

import {
  CHUNKED_HTML_RENDER_SIZE,
  LARGE_DOCUMENT_HTML_THRESHOLD,
  shouldChunkHtmlRender,
} from './render-performance-budget';

describe('render-performance-budget', () => {
  it('uses the documented chunk size constant', () => {
    expect(CHUNKED_HTML_RENDER_SIZE).toBe(24);
  });

  it('forces chunking in performance mode regardless of html length', () => {
    expect(
      shouldChunkHtmlRender({
        performanceMode: true,
        htmlLength: 1_000,
      })
    ).toBe(true);
  });

  it('chunks when html exceeds the threshold in typography mode', () => {
    expect(
      shouldChunkHtmlRender({
        performanceMode: false,
        htmlLength: LARGE_DOCUMENT_HTML_THRESHOLD + 1,
      })
    ).toBe(true);
    expect(
      shouldChunkHtmlRender({
        performanceMode: false,
        htmlLength: LARGE_DOCUMENT_HTML_THRESHOLD,
      })
    ).toBe(false);
  });
});
