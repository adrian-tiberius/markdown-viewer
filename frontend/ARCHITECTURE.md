# Frontend Clean Architecture

Frontend code is organized into four layers:

- `src/domain`: Enterprise entities and invariants (`viewer.ts`).
- `src/application`: Use-case orchestration and app-level policies (`use-cases.ts`, `path-utils.ts`, `settings.ts`).
- `src/infrastructure`: External adapters (Tauri API, browser local storage, rendering libraries).
- `src/presentation`: UI shell, DOM bindings, and interface-adapter ports (`MarkdownViewerApp`, `document-view-utils.ts`, `ports.ts`).

`src/main.ts` is the composition root:

- Builds infrastructure adapters.
- Injects them into the presentation app through presentation-owned ports.
- Starts the app.
- Is the only top-level runtime file under `src/`; all other runtime modules live in a layer folder.

## Dependency Direction

Allowed dependencies point inward:

- `domain`: depends on nothing.
- `application`: depends on `domain`.
- `infrastructure`: depends on `application` + `domain` + `presentation/ports`.
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
  presentation-owned ports.
- Local imports must respect layer rules even when path aliases are introduced later
  (`@/`, `src/`, `/src/`).
- `infrastructure` can import from `presentation` only through `presentation/ports.ts`.
- Layer modules cannot import top-level composition roots (`main.ts`) or any runtime module outside
  the four architecture layer folders.
