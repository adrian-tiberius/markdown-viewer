# Link Behavior Test Document

Use this file to test markdown link behavior in the app.

## Quick Anchor Checks

- [Overview](#overview)
- [Inline HTML](#html)
- [Paragraphs and Line Breaks](#p)

## Overview

If this jump worked, internal anchor scrolling works.

## Inline HTML

This heading intentionally maps to `#html` in the link above
(similar to legacy markdown docs).

## Paragraphs and Line Breaks

This heading intentionally maps to `#p` in the link above.

## Markdown File Links (should prompt, then open in a new tab)

- [Open sibling markdown](./secondary.md)
- [Open nested markdown](./nested/deep-note.md)
- [Open markdown with spaces in file name](./assets/linked%20note.md)

## Non-Markdown File Links (should prompt, then open externally)

- [Open plain text file](./assets/sample.txt)
- [Open file with spaces](./assets/notes%20with%20spaces.txt)
- [Open SVG image](./assets/sample-image.svg)

## Same-Document File URL Anchor

- [Jump to Inline HTML using file URL](./main.md#html)

## External URL (should open browser)

- [Open example.com](https://example.com)
