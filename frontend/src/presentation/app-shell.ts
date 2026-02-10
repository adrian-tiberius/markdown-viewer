export function appShell(): string {
  return `
    <div class="app-shell">
      <header class="topbar">
        <div class="topbar-left">
          <button id="open-file" class="btn primary">Open File</button>
          <button id="reload-file" class="btn">Reload</button>
          <button id="print-view" class="btn">Print / PDF</button>
        </div>
        <div class="topbar-right">
          <label class="toggle">
            <input id="performance-mode" type="checkbox" />
            <span>Performance Mode</span>
          </label>
          <label class="toggle">
            <input id="safe-mode" type="checkbox" />
            <span>Safe Mode</span>
          </label>
        </div>
      </header>

      <div id="drop-overlay" class="drop-overlay">Drop markdown file to open</div>

      <div class="workspace">
        <aside class="panel toc-panel">
          <div class="panel-head">
            <h2>Outline</h2>
            <div class="actions">
              <button id="toc-collapse-all" class="btn ghost">Collapse</button>
              <button id="toc-expand-all" class="btn ghost">Expand</button>
            </div>
          </div>
          <ul id="toc-list" class="toc-list"></ul>
        </aside>

        <main class="viewer-column">
          <nav class="doc-tabs-bar" aria-label="Open documents">
            <ul id="doc-tabs" class="doc-tabs">
              <li class="doc-tab-empty">No open tabs</li>
            </ul>
          </nav>

          <header class="doc-meta">
            <div class="doc-meta-main">
              <h1 id="doc-title"></h1>
              <p id="doc-subtitle"></p>
            </div>
            <div class="doc-meta-side">
              <p id="doc-stats"></p>
              <p id="doc-path" class="path"></p>
            </div>
          </header>

          <section id="error-banner" class="error-banner" role="alert">
            <p id="error-message"></p>
            <div class="actions">
              <button id="recover-view" class="btn danger">Exit Safe Mode</button>
              <button id="dismiss-error" class="btn ghost">Dismiss</button>
            </div>
          </section>

          <section id="viewer-scroll" class="viewer-scroll">
            <article id="markdown-content" class="markdown-body"></article>
            <pre id="safe-content" class="safe-content" hidden></pre>
          </section>
        </main>

        <aside class="panel settings-panel">
          <div class="panel-head">
            <h2>Reading</h2>
            <button id="clear-scroll-memory" class="btn ghost">Clear Scroll Memory</button>
          </div>

          <label>
            Theme
            <select id="theme-preset">
              <option value="paper">Paper</option>
              <option value="slate">Slate</option>
              <option value="contrast-light">High Contrast Light</option>
              <option value="contrast-dark">High Contrast Dark</option>
            </select>
          </label>

          <label>
            Font Scale
            <input id="font-scale" type="range" min="0.85" max="1.3" step="0.01" />
          </label>

          <label>
            Line Height
            <input id="line-height" type="range" min="1.35" max="2.0" step="0.01" />
          </label>

          <label>
            Measure Width
            <input id="measure-width" type="range" min="58" max="96" step="1" />
          </label>

          <fieldset>
            <legend>Word Count Rules</legend>
            <label class="toggle">
              <input id="count-links" type="checkbox" />
              <span>Include links</span>
            </label>
            <label class="toggle">
              <input id="count-code" type="checkbox" />
              <span>Include code/math</span>
            </label>
            <label class="toggle">
              <input id="count-frontmatter" type="checkbox" />
              <span>Include front matter</span>
            </label>
          </fieldset>

          <fieldset>
            <legend>TOC Behavior</legend>
            <label class="toggle">
              <input id="toc-auto-expand" type="checkbox" />
              <span>Auto-expand active section</span>
            </label>
          </fieldset>
        </aside>
      </div>
    </div>
  `;
}
