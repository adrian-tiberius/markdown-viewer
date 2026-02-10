# Tauri API Contract

This document defines the runtime contract between the frontend (`frontend/src`) and Rust backend
(`src-tauri/src/lib.rs`).

## Commands

### `pick_markdown_file`

- Input: none
- Output: `string | null`
- Behavior: opens native file picker and returns selected path.

### `load_markdown_file`

- Input: `{ path: string, preferences?: RenderPreferencesDto }`
- Output: `MarkdownDocumentDto`
- Behavior: resolves, validates, reads, renders markdown, and returns enriched document data.

### `start_markdown_watch`

- Input: `{ path: string }`
- Output: `void`
- Behavior: starts watcher for the target file and emits update events when changed.

### `stop_markdown_watch`

- Input: none
- Output: `void`
- Behavior: stops active watcher if one exists.

### `consume_launch_open_path`

- Input: none
- Output: `string | null`
- Behavior: returns a markdown path provided by OS launch/open-with args on first app boot, then clears it.

## Events

### `markdown://file-updated`

- Payload:

```ts
interface MarkdownFileUpdatedEvent {
  path: string;
}
```

- Emitted by Rust when the watched markdown file changes.
- Consumed by frontend to trigger conditional reload.

### `markdown://open-path`

- Payload:

```ts
interface MarkdownOpenPathEvent {
  path: string;
}
```

- Emitted by Rust when a second app instance is invoked with a markdown file path.
- Consumed by frontend to open the requested markdown file in the running window.

## DTO Shapes

### `RenderPreferencesDto` (frontend -> rust)

```ts
interface RenderPreferencesDto {
  performanceMode?: boolean;
  wordCountRules?: {
    includeLinks: boolean;
    includeCode: boolean;
    includeFrontMatter: boolean;
  };
}
```

If omitted, defaults are applied in Rust presentation/application layers.

### `MarkdownDocumentDto` (rust -> frontend)

```ts
interface MarkdownDocumentDto {
  path: string;
  title: string;
  source: string;
  html: string;
  toc: Array<{
    level: number;
    id: string;
    text: string;
  }>;
  wordCount: number;
  readingTimeMinutes: number;
}
```

## Source of Truth

- Command/event definitions: `src-tauri/src/lib.rs`
- DTO mappings: `src-tauri/crates/presentation/src/dto.rs`
- Frontend gateway adapter: `frontend/src/infrastructure/tauri-markdown-gateway.ts`
