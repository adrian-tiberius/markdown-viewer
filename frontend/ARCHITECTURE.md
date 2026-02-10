# Frontend Clean Architecture

Frontend code is organized into four layers:

- `src/domain`: Enterprise entities and invariants (`viewer.ts`).
- `src/application`: Use-case orchestration, app-level policies, and boundary ports (`use-cases.ts`, `path-utils.ts`, `settings.ts`, `ports.ts`).
- `src/infrastructure`: External adapters (Tauri API, browser local storage, rendering libraries).
- `src/presentation`: UI shell and DOM bindings (`MarkdownViewerApp`, `document-view-utils.ts`).

`src/main.ts` is the composition root:

- Builds infrastructure adapters.
- Injects them into the presentation app through application-owned ports.
- Starts the app.
- Is the only top-level runtime file under `src/`; all other runtime modules live in a layer folder.

## Dependency Direction

Allowed dependencies point inward:

- `domain`: depends on nothing.
- `application`: depends on `domain`.
- `infrastructure`: depends on `application` + `domain`.
- `presentation`: depends on `application` + `domain`.
- `main`: may depend on all layers for wiring.

Additional boundary contract:

- `domain` and `application` stay browser-framework agnostic. They must not access runtime globals
  like `window`, `document`, `localStorage`, `sessionStorage`, or APIs such as
  `IntersectionObserver`/`requestAnimationFrame`.
- `domain` and `application` may only import local architecture modules (no external packages,
  stylesheets, or static assets).
- `presentation` must not import platform/runtime adapters directly (`@tauri-apps/*`,
  `highlight.js`, `katex`). These imports belong in `infrastructure` implementations of
  application-owned ports.
- Local imports must respect layer rules even when path aliases are introduced later
  (`@/`, `src/`, `/src/`).
- Layer modules cannot import top-level composition roots (`main.ts`) or any runtime module outside
  the four architecture layer folders.
