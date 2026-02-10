export const LARGE_DOCUMENT_HTML_THRESHOLD = 180_000;
export const CHUNKED_HTML_RENDER_SIZE = 24;

export function shouldChunkHtmlRender(input: {
  performanceMode: boolean;
  htmlLength: number;
}): boolean {
  return input.performanceMode || input.htmlLength > LARGE_DOCUMENT_HTML_THRESHOLD;
}
