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
