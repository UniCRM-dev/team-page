# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A framework-free, build-free static site: a single-page operations dashboard for a four-person company, deployed via GitHub Pages. There is no package.json, no bundler, and no test suite — it's plain HTML/CSS/JS served directly.

## Running locally

No build step. Open `index.html` through any local web server (opening the file directly via `file://` also works since there are no ES modules). Example:

```
python -m http.server 8000
```

## Deployment

- **Site (frontend):** GitHub Pages rebuilds automatically on every push to `main`. No action needed.
- **Worker (API):** `.github/workflows/deploy-worker.yml` deploys automatically when files under `worker/` change, and has a manual "Deploy Cloudflare Worker" button (Actions tab — works from a phone browser). It requires the repo secrets `CLOUDFLARE_API_TOKEN` (Workers Scripts: Edit permission) and `CLOUDFLARE_ACCOUNT_ID`. Worker secrets (`AUTH_PASSWORD`, `SESSION_SECRET`, `GITHUB_TOKEN`) are set via `wrangler secret put` and persist across deploys.
- **Data:** everything shown on the dashboard is fetched live from GitHub/Google on page load, then refreshed every `config.js → refreshSeconds` seconds and whenever the tab regains focus. No deploy is needed for content changes — only for code changes.

## Architecture

- `index.html` — all page structure/content regions (sidebar, hero, status strip, priorities/blockers, milestones/events, developer & sales workstream tabs, decisions, quick links, idea-submission dialog). Elements that get populated or rewired at runtime carry stable `id`s (e.g. `#priority-list`, `#sync-state`, `#sidebar-repositories`) — `app.js` looks these up directly.
- `config.js` — sets `window.DASHBOARD_CONFIG`: GitHub org/owner, the four repo names (`product`, `operations`, `sales`, `ideas`), the GitHub Project number, issue label names, the Discussions category slugs (`discussions.categories`), the dashboard poll (`poll`), and the `team` roster. This is the single file a new deployment must edit.
- `app.js` — one IIFE, no modules, no dependencies. It:
  - Holds the built-in mock `data` object (priorities, blockers, milestones, events, dev/sales tasks, decisions) and renders it into the DOM (`renderMockData`).
  - Wires every link/href across the page to the configured GitHub org/repos (`configureLinks`).
  - Optionally overlays live data by calling the public GitHub REST API unauthenticated (`loadGitHubData`): repo issue count, open PRs, latest release, latest Actions run. Falls back silently to the mock data on any fetch failure or rate limit, and reflects that state in `#sync-state` ("Mock data" vs "Live from GitHub").
  - Handles UI interactions (`setupInteractions`): the idea-submission dialog (builds a prefilled GitHub Discussion URL in the org's **Ideas** category — never posts on the user's behalf), workstream tab switching, sidebar active-link state.
  - Owns the theme toggle (`setupTheme`): flips `data-theme` on `<html>`, persists to `localStorage`, and follows the OS preference until the user makes an explicit choice.
- `styles.css` — the design system. Every color, radius, shadow, font, and layout dimension is a CSS custom property declared in `:root` (light) and `[data-theme="dark"]`. **Nothing below the token block should hardcode a color** — add a token instead. System fonts only; no webfonts, per the no-external-assets rule.
  - Tints and glows (`--ring`, `--accent-glow`, `--bg-blur`, `--hover-wash`, `--green-glow`, `--red-glow`, `--live-border`) are precomputed rgba/hex rather than `color-mix()`, deliberately, for older-browser support. They do **not** track their source color automatically — the comment above them in `:root` lists which token feeds which. Update both halves or the themes drift.
- `sidebar.css` — left navigation rail, kept separate but consuming the same tokens. It loads after `styles.css` and overrides `--sidebar-w` in its own media queries.
- Theme is resolved by an inline script in `<head>` before first paint (FOUC guard); `app.js` only wires the toggle afterwards. Both must agree on the `localStorage` key `theme`.
- `.nojekyll` — required so GitHub Pages serves files as-is (no Jekyll processing).

### Key constraint: no tokens, ever

This is a public static site. `config.js`, all JS, and anything injected at build/deploy time is visible to any visitor — there is no server. **Never add a GitHub token, secret, or credential to this repo.** Private/authenticated data needs a separate proxy/GitHub App, not this codebase. See the "Private repositories and token security" section of README.md before touching anything related to auth or private data.

### `configured` flag

`app.js` derives `configured = owner !== "YOUR_GITHUB_ORG"`. Until `config.js` is filled in with a real org, every link in the page falls back to generic `https://github.com/...` URLs instead of repo-specific ones — this is intentional placeholder behavior, not a bug.

## `sources/` directory

Read-only mirror of an external ChatGPT project ("UniversalCRM"), synced by an outside tool — see `AGENTS.md`. Do not edit, rename, move, or delete files under `sources/`; they may be overwritten by the next sync regardless of local changes.
