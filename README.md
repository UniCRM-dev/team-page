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

### Public repositories (open mode)

When `worker.url` is empty, the dashboard reads public repository metadata without authentication. Unauthenticated GitHub API traffic is rate-limited per IP address, so heavily used dashboards may occasionally fall back to the built-in data.

### Authenticated mode (private repos)

The dashboard ships with a Cloudflare Worker proxy (`worker/`) that securely handles authentication and GitHub API access. This lets you keep all repos **private** on the GitHub Free plan (no paid seats). The Worker holds a GitHub token server-side — it is never exposed to the browser.

**Architecture**: users sign in through `login.html` → Worker sets an httpOnly session cookie → all GitHub API calls proxy through the Worker, which injects the token. The frontend never sees a credential.

**Zero cost**: Cloudflare Workers free tier (100k req/day) + GitHub Free plan. No per-user fees.

#### Setup

1. **Install wrangler** (Cloudflare's CLI):
   ```
   npm install -g wrangler
   ```

2. **Create a GitHub fine-grained personal access token** at [github.com/settings/tokens](https://github.com/settings/tokens):
   - Repository access: **Only select repositories** — select your 4 configured repos
   - Permissions: **Metadata** (read), **Issues** (read), **Pull requests** (read), **Actions** (read), **Contents** (read)
   - For idea submission through the dashboard: **Discussions** (read + write) on the ideas/discussions repo
   - Alternative: a classic PAT with `repo` scope works too

3. **Set secrets and deploy the Worker**:
   ```
   cd worker
   npx wrangler secret put AUTH_PASSWORD      # shared dashboard password
   npx wrangler secret put SESSION_SECRET      # generate with: openssl rand -base64 48
   npx wrangler secret put GITHUB_TOKEN        # your PAT from step 2
   npx wrangler deploy
   ```
   Note the `*.workers.dev` URL from the deploy output.

4. **Configure the dashboard** — in `config.js`, set:
   ```js
   worker: {
     url: "https://your-proxy.workers.dev",
     loginPage: "login.html"
   }
   ```

5. **Set ALLOWED_ORIGINS** — in `worker/wrangler.toml` `[vars]`, set `ALLOWED_ORIGINS` to your dashboard's URL (e.g. `"https://your-org.github.io"`), then redeploy the Worker. This prevents other websites from using your proxy.

6. **Verify**:
   ```
   # Login
   curl -c jar -X POST https://your-proxy.workers.dev/login \
     -H "Content-Type: application/json" \
     -d '{"username":"Shawn","password":"<your-password>"}'

   # Session check
   curl -b jar https://your-proxy.workers.dev/me

   # Proxied GitHub read
   curl -b jar https://your-proxy.workers.dev/github/repos/your-org/your-repo
   ```

7. **Push the frontend** — deploy `index.html`, `login.html`, and all assets to GitHub Pages (or Cloudflare Pages). With `worker.url` set, visiting the dashboard will redirect unauthenticated users to the login page.

#### Open mode

To run the dashboard without authentication (public repos only), leave `worker.url` as `""` in `config.js`. The page behaves exactly as before — unauthenticated GitHub API calls, mock data fallback, no login gate.

#### Upgrade path: GitHub App

For production use, replace the PAT with a GitHub App for per-repo scoping and short-lived tokens (1 hour, auto-rotated by the Worker). Set `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, and `GITHUB_INSTALLATION_ID` secrets in the Worker instead of `GITHUB_TOKEN`. The Worker detects which auth method is configured and uses it automatically.

#### Token security

The frontend never sees the GitHub token. It lives only in the Worker's encrypted secret store. The session cookie is httpOnly + signed — browser JS cannot read it. The Worker's Origin allowlist prevents cross-site request forgery.

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
- `login.html` — standalone sign-in page (gates the dashboard when auth is enabled)
- `login.css` — login page styles, token-only, matches the design system
- `styles.css` — responsive visual system and interactions
- `sidebar.css` — left navigation rail, styled from the same tokens
- `config.js` — organization, repository, project, labels, team, and worker configuration
- `app.js` — mock content, rendering, GitHub API reads (through Worker), tabs, and idea submission
- `worker/` — Cloudflare Worker proxy: session auth + GitHub API proxy + GraphQL discussions
- `.nojekyll` — tells GitHub Pages to serve the files directly
- `.gitignore` — excludes Worker secrets from version control
