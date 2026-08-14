---
name: run-team-page
description: Build, run, test, and drive the team-page operations dashboard. Use when asked to start the dashboard, take a screenshot of it, smoke-test it, or interact with its UI.
---

The team-page dashboard is a framework-free static site (no build, no
package.json) whose data comes from a Cloudflare Worker. To run it and
interact with it, use the Playwright REPL driver at
`.claude/skills/run-team-page/driver.mjs` — don't open a browser by hand.

All paths below are relative to the repo root (`team-page/`). The
driver handles the static server (port scanning, never kills foreign
servers) and launches a headless system Edge/Chrome via playwright-core
(no browser download).

## Prerequisites

- Node.js + npm (driver, wrangler)
- Python 3 (`python -m http.server` — the driver's static server)
- Microsoft Edge or Chrome installed (driven headless)

One-time dependency install (playwright-core; does NOT download a browser):

```bash
cd .claude/skills/run-team-page
npm install --no-save playwright-core
```

## Build

None. `index.html` + `config.js` + `app.js` + `styles.css` are served
directly. The worker (`worker/src/index.js`) has no build step either —
wrangler bundles it on `dev`/`deploy`.

## Run (agent path)

```bash
cd .claude/skills/run-team-page
node driver.mjs            # interactive REPL ("help" for commands)
node driver.mjs smoke      # full verification flow, exit 0 on pass
node driver.mjs --run "server; launch mock; nav /index.html; ss 01; quit"
```

`smoke` runs the whole loop end-to-end: starts the static server on a
free port (8000-8010), verifies the no-token auth gate redirects to
login.html, relaunches in mock mode (seeded session token), and checks
the landing page, theme toggle, workstream tabs, idea dialog, and login
form. It fails only on a failing check or an uncaught page error.
Screenshots land in `.claude/skills/run-team-page/shots/` (gitignored).

Commands:

| command | what it does |
|---|---|
| `server` / `server-stop` | start/stop the static server (auto port scan) |
| `launch [mock]` | open headless browser; `mock` seeds a fake session token |
| `nav <path>` | go to `http://localhost:<port>/<path>` (or a full URL) |
| `wait <css>` | wait for element (15s) |
| `click <css>` / `click-text <text>` | click element / button or link containing text |
| `fill <css> <text>` / `type <text>` / `press <key>` | form input |
| `ss [name]` | screenshot → `shots/<name>.png` |
| `eval <js>` / `text [css]` / `state` | inspect the page (DOM, innerText, url/theme/badge) |
| `console [--errors]` | show captured console errors + pageerror count |
| `smoke` | run the full verification flow |
| `quit` | close browser, exit |

## Run (human path)

```bash
python -m http.server 8000
# http://localhost:8000/index.html — dashboard (redirects to login.html
# without a session token); http://localhost:8000/login.html — login page
```

## Worker (API) — local smoke

The frontend fetches live data from the Cloudflare Worker. To run the
worker locally (one shell):

```bash
cd worker
# Keep the KEY= prefix (no cut -f2-) — .dev.vars needs KEY=value lines.
# Empty ALLOWED_ORIGINS puts the local worker in dev mode (any origin).
grep -E '^(AUTH_PASSWORD|SESSION_SECRET|GITHUB_TOKEN)=' ../.env | tr -d '\r' > .dev.vars
printf 'ALLOWED_ORIGINS=\n' >> .dev.vars
npx wrangler dev --port 8787
```

Then (second shell):

```bash
cd /path/to/team-page
PASS=$(grep -E '^AUTH_PASSWORD=' .env | cut -d= -f2- | tr -d '"' | tr -d ' ' | tr -d '\r')
TOKEN=$(curl -s -X POST http://localhost:8787/login -H 'Content-Type: application/json' \
  -d "{\"username\":\"Shawn\",\"password\":\"$PASS\"}" | grep -oE '"token":"[^"]+"' | cut -d'"' -f4)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8787/me
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8787/metrics
```

`.dev.vars` is gitignored — never commit it. The worker rejects
requests whose `Origin` header isn't in `wrangler.toml`
`ALLOWED_ORIGINS` (403); plain curl sends no Origin and is allowed.

## Gotchas

- **The dashboard redirects to login.html without a session token.**
  `index.html` has an inline auth gate checking `sessionStorage`
  `dashboard_token`. The worker 403s localhost origins, so a real login
  is impossible locally — always use `launch mock` to seed a fake token.
- **"Live data unavailable" + CORS console errors locally are expected.**
  The page fetches the deployed worker from localhost; the origin check
  rejects it by design. Smoke only fails on *uncaught page errors*.
- **Port 8000 is often taken by other projects on this machine.** The
  driver scans 8000-8010 for a port already serving *our* app or a free
  one, and never kills a foreign server.
- **Theme persists per browser context** (localStorage) — after toggling
  in the smoke run, subsequent pages in that context load dark.

## Troubleshooting

- **"browser: LAUNCH FAILED"** — no Edge/Chrome found. The driver tries
  the `msedge`/`chrome` channels, then known install paths; install
  either browser.
- **"server: START FAILED — is python on PATH?"** — `python --version`
  must resolve.
- **Login returns 400 "Username and password are required"** — the
  worker's `/login` requires BOTH `username` and `password` in the JSON
  body.
- **`npx wrangler dev` errors about missing secrets** — recreate
  `.dev.vars` from `.env` (command above), then restart.
- **`wrangler dev` stops responding / curl gets 000 on 8787** — on
  Windows, killing the background task leaves the npx→wrangler→workerd
  tree alive, so several instances pile up on the same port and socket
  fan-out goes to dead workers. Fix: `netstat -ano | findstr :8787` to
  list LISTENING PIDs, `taskkill /F /PID <each>` (and repeat — workerd
  respawns until the parent wrangler is dead), then start one fresh
  instance.
