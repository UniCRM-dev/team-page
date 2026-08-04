# Company Operations Dashboard

A framework-free GitHub Pages dashboard for a four-person company team. It combines company priorities, milestones, blockers, events, development health, sales pipeline, decisions, and an idea inbox in one responsive interface.

## Quick start

1. Edit `config.js` and replace `YOUR_GITHUB_ORG` with your GitHub organization or username.
2. Update the four repository names and the GitHub Project number.
3. Adjust the built-in company data near the top of `app.js` to match your current priorities, milestones, events, tasks, sales pipeline, and decisions.
4. Commit these files to the repository you want to publish.
5. In the repository, open **Settings → Pages**, choose **Deploy from a branch**, then select the branch and `/ (root)` folder.

The page needs no build step and works by opening `index.html` through any local web server.

## GitHub integration

When configured, the dashboard reads the product repository's public metadata using the GitHub REST API:

- open issue count;
- open pull requests and requested reviewers;
- latest release;
- latest Actions workflow result.

Every work item links back to the relevant repository, issue search, project board, pull request list, Actions page, or releases page. The idea form safely prepares a new GitHub Discussion in the org's **Ideas** category; the user reviews and submits it on GitHub. The poll panel shows the current team poll and links to the **Polls** discussion category.

If configuration is incomplete, a repository is unavailable, or GitHub rate-limits the browser request, the dashboard keeps working with its built-in example data and marks the header as **Mock data**.

### Public repositories

Public repository metadata works without authentication. Unauthenticated GitHub API traffic is rate-limited per IP address, so heavily used dashboards may occasionally fall back to the built-in data. GitHub Pages should be served over HTTPS, as it is by default.

### Private repositories and token security

A static GitHub Pages site cannot safely contain a GitHub personal access token. Anything placed in `config.js`, JavaScript, repository secrets injected into the page, browser storage, or the page source can be recovered by a visitor. Do not add a token to this project.

For private data, use one of these approaches:

- keep this dashboard link-only and let GitHub enforce access after each link is opened;
- publish sanitized dashboard data to a public JSON file through a scheduled GitHub Action;
- add a small authenticated server-side proxy or GitHub App that verifies the viewer, stores credentials server-side, limits allowed API routes, and returns only the necessary fields.

GitHub Pages itself does not provide private, team-only authentication. If the operational data is sensitive, use a private hosting service with authentication or keep the page free of sensitive values.

## Labels and organization

The default links expect these labels, which can be changed in `config.js`: `priority`, `blocked`, `milestone`, `decision`, and `customer-feedback`. Suggested repositories are:

- `product-core` — product issues, pull requests, builds, and releases;
- `company-ops` — priorities, blockers, milestones, notes, and decisions;
- `sales-pipeline` — sales tasks and customer feedback;
- `ideas` — idea submissions and feature proposals.

## Customizing the design

Colors, spacing, typography, borders, and breakpoints are defined as CSS custom properties at the top of `styles.css`. Light and dark values live in `:root` and `[data-theme="dark"]`, so retheming the whole dashboard means editing those two blocks.

Tints and glows are precomputed rather than derived at runtime, so a few tokens have to be updated together. Changing `--accent` also means updating `--ring` and `--accent-glow`; the comment above those tokens lists every such pairing.

The theme follows the operating system by default and can be overridden with the toggle in the top bar; the choice persists in `localStorage`. An inline script in `index.html` resolves the theme before first paint so the page never flashes the wrong one.

The design loads Plus Jakarta Sans from Google Fonts and falls back to the system font stack when the font service is unavailable. It uses no image assets or analytics, supports keyboard navigation, honors reduced-motion preferences, and adapts down to small phone screens.

## Files

- `index.html` — accessible page structure and content regions
- `styles.css` — responsive visual system and interactions
- `sidebar.css` — left navigation rail, styled from the same tokens
- `config.js` — organization, repository, project, labels, and team configuration
- `app.js` — mock content, rendering, GitHub API reads, tabs, and idea submission
- `.nojekyll` — tells GitHub Pages to serve the files directly
