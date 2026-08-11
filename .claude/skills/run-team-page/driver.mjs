// ─────────────────────────────────────────────────────────────────────────────
// driver.mjs — REPL driver for the team-page dashboard (static site).
// Chromium edition: playwright-core + the machine's installed Edge/Chrome.
//
// Usage:
//   node driver.mjs                 → interactive REPL ("help" for commands)
//   node driver.mjs smoke           → run the full verification flow, exit 0/1
//   node driver.mjs --run "cmd; cmd"→ run commands sequentially, then exit
//   printf 'nav /\nss 01\nquit\n' | node driver.mjs   (piped script)
//
// All screenshots land in .claude/skills/run-team-page/shots/ (gitignored).
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright-core';
import * as readline from 'node:readline';
import { spawn, execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(SKILL_DIR, '../../..');
const SHOT_DIR = path.join(SKILL_DIR, 'shots');
const PORT = 8000;
const BASE = `http://localhost:${PORT}`;
fs.mkdirSync(SHOT_DIR, { recursive: true });

let browser = null;
let context = null;
let page = null;
let consoleErrors = [];
let pageErrors = [];
let ACTIVE_PORT = PORT;
let serverChild = null;

const baseUrl = () => `http://localhost:${ACTIVE_PORT}`;

// ── local static server (python -m http.server) ───────────────────────────
// Port 8000 may be occupied by a foreign server (other projects do this on
// this machine) — scan for a port already serving OUR app, else a free one.
function servesOurApp(p) {
  return fetch(`http://localhost:${p}/index.html`, { signal: AbortSignal.timeout(1500) })
    .then(r => (r.ok ? r.text() : ''))
    .then(t => t.includes('hero-greeting'))
    .catch(() => false);
}
function portFree(p) {
  return fetch(`http://localhost:${p}/`, { signal: AbortSignal.timeout(800) })
    .then(() => false)
    .catch(() => true);
}

async function startServer() {
  for (let p = PORT; p < PORT + 10; p++) {
    if (await servesOurApp(p)) { ACTIVE_PORT = p; return console.log('server: already serving team-page on', baseUrl()); }
  }
  for (let p = PORT; p < PORT + 10; p++) {
    if (await portFree(p)) {
      ACTIVE_PORT = p;
      serverChild = spawn('python', ['-m', 'http.server', String(p)], { cwd: REPO, detached: true, stdio: 'ignore', windowsHide: true });
      serverChild.unref();
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 500));
        if (await servesOurApp(p)) return console.log('server: started on', baseUrl());
      }
      console.log('server: START FAILED — is python on PATH? (`python --version`)');
      return;
    }
  }
  console.log('server: no free port in 8000-8010');
}

function stopServer() {
  if (serverChild) {
    serverChild.kill();
    serverChild = null;
  }
  const win = process.platform === 'win32';
  try {
    if (win) {
      const out = execSync('netstat -ano | findstr ":' + ACTIVE_PORT + '"', { encoding: 'utf8' });
      const pids = new Set();
      for (const line of out.split('\n')) {
        if (line.includes('LISTENING')) {
          const pid = line.trim().split(/\s+/).pop();
          if (pid && pid !== '0') pids.add(pid);
        }
      }
      for (const pid of pids) execSync('taskkill /F /PID ' + pid, { stdio: 'ignore' });
      console.log('server: stopped (pids', [...pids].join(','), ')');
    } else {
      execSync(`lsof -ti:${ACTIVE_PORT} -sTCP:LISTEN | xargs -r kill`, { stdio: 'ignore' });
      console.log('server: stopped');
    }
  } catch { console.log('server: not running (ours was never started or already stopped)'); }
}

// ── browser (system Edge/Chrome, no downloads) ─────────────────────────────
// `launch mock` seeds a fake session token so the dashboard renders locally.
// Without it, index.html's inline auth gate redirects to login.html (the
// worker 403s localhost origins, so a real login is impossible locally).
async function launch(mock) {
  if (browser) return console.log('browser: already launched');
  const tries = [
    { channel: 'msedge' },
    { channel: 'chrome' },
    { executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' },
    { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' },
    { executablePath: '/usr/bin/chromium' },
  ];
  let lastErr = null;
  for (const opts of tries) {
    try {
      browser = await chromium.launch({ headless: true, ...opts });
      context = await browser.newContext({ viewport: { width: 1400, height: 950 } });
      if (mock) {
        await context.addInitScript(() => {
          try { sessionStorage.setItem('dashboard_token', 'local-mock'); } catch (e) {}
        });
        console.log('browser: launched (mock mode — fake token seeded)');
      } else {
        console.log('browser: launched');
      }
      page = await context.newPage();
      consoleErrors = []; pageErrors = [];
      page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
      page.on('pageerror', e => pageErrors.push(String(e)));
      console.log('browser: context ready (', JSON.stringify(opts), ')');
      return;
    } catch (e) { lastErr = e; }
  }
  console.log('browser: LAUNCH FAILED —', lastErr && lastErr.message);
}

// ── commands ────────────────────────────────────────────────────────────────
const COMMANDS = {
  async server() { await startServer(); },
  'server-stop': () => stopServer(),
  async launch(args) { await launch(args.trim().includes('mock')); },
  async nav(url) {
    if (!page) return console.log('ERROR: launch first');
    await page.goto(url.startsWith('http') ? url : baseUrl() + url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('nav:', page.url());
  },
  async wait(sel) {
    if (!page) return console.log('ERROR: launch first');
    try { await page.waitForSelector(sel, { timeout: 15000 }); console.log('found:', sel); }
    catch { console.log('TIMEOUT:', sel); }
  },
  async click(sel) {
    if (!page) return console.log('ERROR: launch first');
    try { await page.click(sel, { timeout: 5000 }); console.log('clicked:', sel); }
    catch (e) { console.log('click FAILED:', sel, '—', e.message.split('\n')[0]); }
  },
  async 'click-text'(text) {
    if (!page) return console.log('ERROR: launch first');
    try {
      await page.locator(`button:has-text("${text}"), a:has-text("${text}"), [role="button"]:has-text("${text}")`).first().click({ timeout: 5000 });
      console.log('clicked text:', text);
    } catch (e) { console.log('click-text FAILED:', text, '—', e.message.split('\n')[0]); }
  },
  async fill(args) {
    if (!page) return console.log('ERROR: launch first');
    const [sel, ...rest] = args.split(' ');
    await page.locator(sel).fill(rest.join(' ').trim()).catch(e => console.log('fill FAILED:', sel, '—', e.message.split('\n')[0]));
    console.log('filled:', sel);
  },
  async type(text) { if (page) { await page.keyboard.type(text, { delay: 20 }); console.log('typed:', text); } },
  async press(key) { if (page) { await page.keyboard.press(key); console.log('pressed:', key); } },
  async ss(name) {
    if (!page) return console.log('ERROR: launch first');
    const f = path.join(SHOT_DIR, (name || `ss-${Date.now()}`) + '.png');
    await page.screenshot({ path: f });
    console.log('screenshot:', f);
  },
  async eval(expr) {
    if (!page) return console.log('ERROR: launch first');
    try { console.log(await page.evaluate(expr)); }
    catch (e) { console.log('eval ERROR:', e.message.split('\n')[0]); }
  },
  async text(args) {
    if (!page) return console.log('ERROR: launch first');
    const sel = args.trim() || 'body';
    console.log(await page.evaluate(s => document.querySelector(s)?.innerText ?? '(null)', sel));
  },
  async state() {
    if (!page) return console.log('ERROR: launch first');
    const s = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      theme: document.documentElement.dataset.theme || '(system)',
      badge: document.querySelector('#sync-state')?.textContent.trim() ?? '(none)',
      greeting: document.querySelector('#hero-greeting')?.textContent ?? '(none)',
      openDialog: document.querySelector('dialog[open]')?.id ?? '(none)',
      activeTab: document.querySelector('[role="tab"][aria-selected="true"]')?.id ?? '(none)',
    }));
    console.log(JSON.stringify(s, null, 1));
  },
  async console(args) {
    const errors = args.includes('--errors');
    const list = errors ? consoleErrors : [...consoleErrors, ...pageErrors.map(e => 'PAGEERROR: ' + e)];
    console.log(list.length ? list.join('\n') : '(no console errors)');
    console.log('pageerrors:', pageErrors.length);
  },
  async routeapp(path) {
    if (!context) return console.log('ERROR: launch first');
    const src = fs.readFileSync(path, 'utf8');
    await context.route('**/app.js', route => route.fulfill({ body: src, contentType: 'application/javascript' }));
    console.log('route: app.js served from', path);
  },
  async netwatch() {
    if (!page) return console.log('ERROR: launch first');
    const seen = [];
    const onResp = r => { if (r.status() >= 400) seen.push(r.status() + ' ' + r.url()); };
    const onFail = r => seen.push('FAILED ' + r.url() + ' ' + ((r.failure() && r.failure().errorText) || ''));
    page.on('response', onResp);
    page.on('requestfailed', onFail);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(15000);   // let async data fetches settle
    page.off('response', onResp);
    page.off('requestfailed', onFail);
    console.log('bad responses:', seen.length ? '\n' + seen.join('\n') : '(none)');
  },
  async smoke() { await runSmoke(); },
  async quit() {
    if (browser) await browser.close().catch(() => {});
    browser = null; context = null; page = null;
    console.log('bye');
  },
  help() { console.log('commands:', Object.keys(COMMANDS).join(', ')); },
};

// ── smoke: the verification flow ───────────────────────────────────────────
let failures = 0;
function check(label, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + label);
  if (!cond) failures++;
}

async function runSmoke() {
  failures = 0;
  await startServer();
  await launch(false);
  if (!page) { console.log('SMOKE FAILED: could not launch browser'); return; }

  console.log('--- auth gate (no token) ---');
  await page.goto(baseUrl() + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  check('no-token visit redirects to login.html', page.url().includes('login.html'));
  await page.screenshot({ path: path.join(SHOT_DIR, '00-login-gate.png') });

  await browser.close().catch(() => {});
  browser = null; context = null; page = null;
  await launch(true);   // relaunch with seeded token
  console.log('--- landing (mock mode) ---');
  await page.goto(baseUrl() + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#hero-greeting', { timeout: 15000 });
  const badge = await page.textContent('#sync-state');
  console.log('sync badge:', badge.trim());
  check('hero greeting renders', (await page.textContent('#hero-greeting')).trim().length > 0);
  check('sidebar repositories populated', (await page.locator('#sidebar-repositories a').count()) > 0);
  check('workstreams section present', await page.locator('#workstreams').count() === 1);
  await page.screenshot({ path: path.join(SHOT_DIR, '01-landing.png') });

  console.log('--- theme toggle ---');
  const themeBefore = await page.evaluate(() => document.documentElement.dataset.theme || 'light');
  await page.click('#theme-toggle');
  await page.waitForTimeout(250);
  const themeAfter = await page.evaluate(() => document.documentElement.dataset.theme || 'light');
  check(`theme toggles ${themeBefore} → ${themeAfter}`, themeBefore !== themeAfter);
  await page.screenshot({ path: path.join(SHOT_DIR, '02-dark-theme.png') });

  console.log('--- workstream tabs ---');
  check('sales panel starts hidden in markup', await page.evaluate(() => document.querySelector('#sales-panel').hidden));
  check('dev panel starts visible in markup', await page.evaluate(() => !document.querySelector('#developer-panel').hidden));
  await page.click('#sales-tab');
  check('sales tab shows sales panel', await page.evaluate(() => !document.querySelector('#sales-panel').hidden));
  check('sales tab hides dev panel', await page.evaluate(() => document.querySelector('#developer-panel').hidden));
  await page.click('#developer-tab');
  check('developer tab restores dev panel', await page.evaluate(() => !document.querySelector('#developer-panel').hidden));
  await page.screenshot({ path: path.join(SHOT_DIR, '03-tabs.png') });

  console.log('--- idea dialog ---');
  await page.click('[data-dialog="idea-dialog"]');
  await page.waitForSelector('#idea-dialog[open]', { timeout: 5000 });
  check('idea dialog opens', await page.locator('#idea-dialog[open]').count() === 1);
  await page.screenshot({ path: path.join(SHOT_DIR, '04-idea-dialog.png') });
  await page.click('#idea-dialog button[value="cancel"]');
  check('idea dialog closes on cancel', await page.locator('#idea-dialog[open]').count() === 0);

  console.log('--- login page ---');
  await page.goto(baseUrl() + '/login.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#login-form', { timeout: 10000 });
  check('login form renders', await page.locator('#login-form').count() === 1);
  await page.screenshot({ path: path.join(SHOT_DIR, '05-login.png') });

  console.log('--- console ---');
  console.log('console errors:', consoleErrors.length ? consoleErrors.join('\n') : '(none)');
  check('no uncaught page errors', pageErrors.length === 0);

  console.log(failures === 0 ? 'SMOKE PASS' : `SMOKE FAIL (${failures} check(s) failed)`);
}

// ── entry point: --run / direct-command / REPL ─────────────────────────────
async function runCommands(script) {
  for (const cmd of script.split(';')) {
    const [name, ...rest] = cmd.trim().split(/\s+/);
    if (!name) continue;
    if (name === 'quit') break;
    const fn = COMMANDS[name];
    if (!fn) { console.log('unknown:', name, '— try: help'); continue; }
    try { await fn(rest.join(' ')); } catch (e) { console.log('ERROR:', e.message); }
  }
  if (browser) await browser.close().catch(() => {});
  process.exit(failures > 0 ? 1 : 0);
}

const argv = process.argv.slice(2);
if (argv.includes('--run')) {
  const idx = argv.indexOf('--run');
  await runCommands(argv.slice(idx + 1).join(' '));
} else if (argv[0] === 'smoke') {
  await runCommands('smoke');
} else if (argv.length > 0) {
  await runCommands(argv.join(' '));
} else {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'driver> ' });
  rl.on('line', async line => {
    const [name, ...rest] = line.trim().split(/\s+/);
    if (!name) return rl.prompt();
    if (name === 'quit') { await COMMANDS.quit(); rl.close(); return; }
    const fn = COMMANDS[name];
    if (!fn) console.log('unknown:', name, '— try: help');
    else { try { await fn(rest.join(' ')); } catch (e) { console.log('ERROR:', e.message); } }
    rl.prompt();
  });
  rl.on('close', async () => { if (browser) await browser.close().catch(() => {}); process.exit(failures > 0 ? 1 : 0); });
  console.log('team-page driver — "help" for commands');
  rl.prompt();
}
