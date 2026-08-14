# Vendored libraries

Committed to the repo (not fetched at runtime) to keep the site free of external assets. Both are lazy-loaded by `app.js` only when the document viewer opens a matching file type.

| File | Package | Version | Source | License |
|---|---|---|---|---|
| `mammoth.browser.min.js` | mammoth | 1.8.0 | https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js | BSD-2-Clause |
| `marked.min.js` | marked | 12.0.2 | https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js | MIT |

- `mammoth` — converts .docx (Word) files to HTML in the browser. Exposes the global `mammoth` (`mammoth.convertToHtml({ arrayBuffer })`).
- `marked` — renders Markdown to HTML. Exposes the global `marked` (`marked.parse(src)`).

Do not edit the minified files; bump the version by replacing the file and updating this table.
