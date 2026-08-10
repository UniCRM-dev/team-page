/**
 * UniCRM Dashboard Proxy — Cloudflare Worker
 *
 * Routes:
 *   POST /login        — validate shared password, return session token
 *   GET  /me           — return {user} or 401  (token in Authorization header)
 *   GET  /github/*     — proxy to api.github.com  (token in Authorization header)
 *   POST /discussions  — create org discussion via GraphQL
 *   GET  /messages     — list recent messages
 *   POST /messages     — post a message
 *   DELETE /messages/* — delete a message (dev role only)
 *   GET  /documents    — list files/folders under the documents folder
 *   POST /documents    — upload a file to the documents repo
 *   GET  /documents/download?path= — stream a file (private, session-gated)
 *   OPTIONS *          — CORS preflight
 *
 * No external services. Uses KV for messages; HMAC-signed session tokens (stateless).
 * Token is returned in the JSON body and sent back as Authorization: Bearer <token>.
 * This avoids cross-site cookie issues entirely.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method;

    // ── CORS preflight ──────────────────────────────────────────────
    if (method === "OPTIONS") {
      return corsResponse(null, request, env, 204);
    }

    // ── Origin check on every non-preflight request ──────────────────
    const origin = request.headers.get("Origin");
    const allowed = allowedOrigins(env);
    if (origin && allowed !== null && !allowed.includes(origin)) {
      return json({ error: "Forbidden" }, { status: 403 });
    }

    // ── Routing ─────────────────────────────────────────────────────
    try {
      if (method === "POST" && url.pathname === "/login") {
        return handleLogin(request, env);
      }
      if (method === "GET" && url.pathname === "/me") {
        return handleMe(request, env);
      }
      if (method === "GET" && url.pathname.startsWith("/github/")) {
        return handleGithubProxy(request, env, url);
      }
      if (method === "POST" && url.pathname === "/discussions") {
        return handleDiscussions(request, env);
      }
      if (method === "GET" && url.pathname === "/projects") {
        return handleProjectsCount(request, env);
      }
      if (method === "GET" && url.pathname === "/calendar/events") {
        return handleCalendarEvents(request, env);
      }
      if (method === "GET" && url.pathname === "/messages") {
        return handleListMessages(request, env);
      }
      if (method === "POST" && url.pathname === "/messages") {
        return handlePostMessage(request, env);
      }
      if (method === "DELETE" && url.pathname.startsWith("/messages/")) {
        return handleDeleteMessage(request, env, url);
      }
      if (method === "GET" && url.pathname === "/documents") {
        return handleListDocuments(request, env, url);
      }
      if (method === "GET" && url.pathname === "/documents/download") {
        return handleDownloadDocument(request, env, url);
      }
      if (method === "POST" && url.pathname === "/documents") {
        return handleUploadDocument(request, env);
      }
      return json({ error: "Not found" }, { status: 404 });
    } catch (err) {
      console.error("Worker error:", err.message);
      return json({ error: "Internal server error" }, { status: 500 });
    }
  },
};

// ═══════════════════════════════════════════════════════════════════
// CORS
// ═══════════════════════════════════════════════════════════════════

function allowedOrigins(env) {
  const raw = (env.ALLOWED_ORIGINS || "").trim();
  if (!raw) return null;  // null = dev mode, any origin allowed
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

function corsHeaders(origin, env) {
  const allowed = allowedOrigins(env);
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  // allowed === null means dev mode (any origin ok); otherwise check the list
  const ok = origin && (allowed === null || allowed.includes(origin));
  if (ok) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function corsResponse(body, request, env, status) {
  const origin = request.headers.get("Origin");
  const init = { status, headers: corsHeaders(origin, env) };
  if (body) return json(body, init);
  return new Response(null, init);
}

function json(data, init) {
  const headers = { "Content-Type": "application/json", ...(init && init.headers) };
  return new Response(JSON.stringify(data), { ...init, headers });
}

// ═══════════════════════════════════════════════════════════════════
// Session (stateless HMAC-SHA256 tokens via Authorization header)
// ═══════════════════════════════════════════════════════════════════

function parseUsers(env) {
  return (env.ALLOWED_USERS || "Shawn:dev,Jesse:dev,Courtney:sales,Chelsey:sales")
    .split(",").map(s => s.trim()).filter(Boolean).map(entry => {
      const [name, role, login, id] = entry.split(":").map(p => p.trim());
      return { name, role: role || "dev", login: login || null, id: id ? Number(id) : null };
    });
}

async function signToken(payload, env) {
  const body = btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
    .replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))
  );
  const sigB64 = btoa(String.fromCharCode(...sig))
    .replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return body + "." + sigB64;
}

async function verifyToken(token, env) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;

  // Re-sign and compare
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const expectedSig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))
  );
  const expectedB64 = btoa(String.fromCharCode(...expectedSig))
    .replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

  if (sig.length !== expectedB64.length) return null;
  let mismatch = 0;
  for (let i = 0; i < sig.length; i++) {
    mismatch |= sig.charCodeAt(i) ^ expectedB64.charCodeAt(i);
  }
  if (mismatch !== 0) return null;

  // Decode payload
  let padded = body.replace(/-/g, "+").replace(/_/g, "/");
  while (padded.length % 4) padded += "=";
  try {
    const payload = JSON.parse(decodeURIComponent(escape(atob(padded))));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// Extract token from Authorization: Bearer <token> header
function getAuthToken(request) {
  const auth = request.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

// Unified session check — returns {sub, name, role} or null
async function getSession(request, env) {
  return verifyToken(getAuthToken(request), env);
}

function notAuthenticated(request, env) {
  const origin = request.headers.get("Origin");
  return new Response(JSON.stringify({ error: "Not authenticated" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin, env),
      "X-Auth-Required": "true",
    },
  });
}

// ═══════════════════════════════════════════════════════════════════
// Rate limiting (in-memory, per-isolate — sufficient for 4-person team)
// ═══════════════════════════════════════════════════════════════════

const rateMap = new Map();

function isRateLimited(ip, username) {
  const key = `${ip}|${username}`;
  const entry = rateMap.get(key);
  const now = Date.now();
  if (!entry) {
    rateMap.set(key, { fails: 1, first: now });
    return false;
  }
  // Lockout window after 5 failures
  if (entry.fails >= 5 && now - entry.first < 60_000) return true;
  // Reset window after 60s
  if (now - entry.first > 60_000) {
    rateMap.set(key, { fails: 1, first: now });
    return false;
  }
  entry.fails++;
  return false;
}

function resetRateLimit(ip, username) {
  rateMap.delete(`${ip}|${username}`);
}

// ═══════════════════════════════════════════════════════════════════
// POST /login
// ═══════════════════════════════════════════════════════════════════

async function handleLogin(request, env) {
  let username, password;

  // Accept JSON or form-urlencoded
  const ct = request.headers.get("Content-Type") || "";
  if (ct.includes("application/json")) {
    const body = await request.json();
    username = (body.username || "").trim();
    password = body.password || "";
  } else {
    const body = await request.text();
    const params = new URLSearchParams(body);
    username = (params.get("username") || "").trim();
    password = params.get("password") || "";
  }

  if (!username || !password) {
    return corsResponse({ error: "Username and password are required" }, request, env, 400);
  }

  // Rate limit
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (isRateLimited(ip, username)) {
    return corsResponse(
      { error: "Too many attempts. Wait 60 seconds before trying again." },
      request, env, 429
    );
  }

  // Validate user
  const users = parseUsers(env);
  const user = users.find(u => u.name.toLowerCase() === username.toLowerCase());
  if (!user) {
    return corsResponse({ error: "Invalid credentials" }, request, env, 401);
  }

  // Validate password (constant-time-ish via HMAC compare)
  const passwordOk = await verifyPassword(password, env.AUTH_PASSWORD);
  if (!passwordOk) {
    return corsResponse({ error: "Invalid credentials" }, request, env, 401);
  }

  resetRateLimit(ip, username);

  // Sign session token
  const now = Math.floor(Date.now() / 1000);
  const ttl = parseInt(env.SESSION_TTL_HOURS || "168", 10);
  const token = await signToken({
    sub: user.name,
    name: user.name,
    role: user.role,
    iat: now,
    exp: now + ttl * 3600,
  }, env);

  // Return token in body — frontend stores in sessionStorage and sends as Authorization header
  return corsResponse(
    { ok: true, token, user: { name: user.name, role: user.role } },
    request, env, 200
  );
}

async function verifyPassword(candidate, expected) {
  if (!expected) return false;
  // Use HMAC so both inputs are hashed — avoids timing leaks on raw strings
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(expected),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig1 = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(candidate))
  );
  const sig2 = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(expected))
  );
  if (sig1.length !== sig2.length) return false;
  for (let i = 0; i < sig1.length; i++) {
    if (sig1[i] !== sig2[i]) return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════
// GET /me
// ═══════════════════════════════════════════════════════════════════

async function handleMe(request, env) {
  const session = await getSession(request, env);
  if (!session) return notAuthenticated(request, env);
  return corsResponse(
    { ok: true, user: { name: session.name, role: session.role } },
    request, env, 200
  );
}

// ═══════════════════════════════════════════════════════════════════
// GET /github/*  (API proxy)
// ═══════════════════════════════════════════════════════════════════

async function handleGithubProxy(request, env, url) {
  const session = await getSession(request, env);
  if (!session) return notAuthenticated(request, env);

  // Extract the path after /github
  const ghPath = url.pathname.slice("/github".length) + url.search;

  // Path allowlist — /repos/* plus org repo listings for GET
  const isAllowedPath = ghPath.startsWith("/repos/") || /^\/orgs\/[^/]+\/repos(\?|$)/.test(ghPath);
  if (!isAllowedPath) {
    return json({ error: "Forbidden: only /repos/* paths are proxied" }, { status: 403 });
  }

  const token = await getGithubToken(env);
  if (!token) {
    return json({ error: "GitHub token not configured" }, { status: 502 });
  }

  const upstream = new Request(`https://api.github.com${ghPath}`, {
    method: "GET",
    headers: {
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Authorization": `Bearer ${token}`,
      "User-Agent": "unicrm-dashboard-proxy",
    },
    redirect: "follow",
  });

  const response = await fetch(upstream);

  // Build response — strip github.com cookies/auth headers
  const headers = new Headers();
  const origin = request.headers.get("Origin");
  Object.assign(headers, corsHeaders(origin, env));
  headers.set("Content-Type", response.headers.get("Content-Type") || "application/json");
  headers.set("X-GitHub-Status", String(response.status));
  // Pass through rate-limit headers so the dashboard can show them if desired
  const rlRemaining = response.headers.get("X-RateLimit-Remaining");
  if (rlRemaining) headers.set("X-RateLimit-Remaining", rlRemaining);

  return new Response(response.body, {
    status: response.status,
    headers,
  });
}

// ═══════════════════════════════════════════════════════════════════
// POST /discussions  (GraphQL create discussion)
// ═══════════════════════════════════════════════════════════════════

// Cached repository + categories lookup
let _repoCache = null;

async function handleDiscussions(request, env) {
  const session = await getSession(request, env);
  if (!session) return notAuthenticated(request, env);

  const token = await getGithubToken(env);
  if (!token) {
    return corsResponse({ error: "GitHub token not configured" }, request, env, 502);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return corsResponse({ error: "Invalid JSON body" }, request, env, 400);
  }

  const { title, body: discussionBody, category } = body;
  if (!title || !category) {
    return corsResponse({ error: "title and category are required" }, request, env, 400);
  }

  const owner = env.DISCUSSIONS_OWNER || "UniCRM-dev";
  const repo = env.DISCUSSIONS_REPO || "skills";

  try {
    // Resolve repository + category
    const { repoId, categoryId } = await resolveCategory(owner, repo, category, token);

    // Create discussion
    const mutation = `
      mutation($repoId: ID!, $catId: ID!, $title: String!, $body: String!) {
        createDiscussion(input: {
          repositoryId: $repoId,
          categoryId: $catId,
          title: $title,
          body: $body
        }) {
          discussion { url }
        }
      }`;

    const result = await graphql(mutation, {
      repoId, catId: categoryId,
      title,
      body: discussionBody || "",
    }, token);

    if (result.errors) {
      console.error("GraphQL errors:", JSON.stringify(result.errors));
      return corsResponse(
        { error: "Failed to create discussion", detail: result.errors[0].message },
        request, env, 502
      );
    }

    const discussionUrl = result.data.createDiscussion.discussion.url;
    return corsResponse({ ok: true, url: discussionUrl }, request, env, 200);

  } catch (err) {
    console.error("Discussions error:", err.message);
    return corsResponse(
      { error: "Could not create discussion. It may need to be submitted via GitHub directly." },
      request, env, 502
    );
  }
}

async function resolveCategory(owner, repo, categorySlug, token) {
  const now = Date.now();
  if (_repoCache && _repoCache.owner === owner && _repoCache.repo === repo && (now - _repoCache.at) < 3_600_000) {
    const catId = _repoCache.bySlug[categorySlug];
    if (catId) return { repoId: _repoCache.repoId, categoryId: catId };
  }

  const query = `
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        id
        discussionCategories(first: 50) {
          nodes { id name slug }
        }
      }
    }`;

  const result = await graphql(query, { owner, repo }, token);

  if (result.errors) {
    throw new Error(`Category resolution failed: ${result.errors[0].message}`);
  }

  const repository = result.data.repository;
  const bySlug = {};
  for (const node of repository.discussionCategories.nodes) {
    bySlug[node.slug] = node.id;
  }

  _repoCache = { owner, repo, repoId: repository.id, bySlug, at: now };

  const catId = bySlug[categorySlug];
  if (!catId) throw new Error(`Category "${categorySlug}" not found in ${owner}/${repo}`);

  return { repoId: repository.id, categoryId: catId };
}

async function graphql(query, variables, token) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "unicrm-dashboard-proxy",
    },
    body: JSON.stringify({ query, variables }),
  });
  return response.json();
}

// ═══════════════════════════════════════════════════════════════════
// Projects — count of org Projects (Projects v2) for the status strip
// ═══════════════════════════════════════════════════════════════════

async function handleProjectsCount(request, env) {
  const session = await getSession(request, env);
  if (!session) return notAuthenticated(request, env);

  const token = await getGithubToken(env);
  if (!token) {
    return corsResponse({ error: "GitHub token not configured" }, request, env, 502);
  }

  const owner = env.DISCUSSIONS_OWNER || "UniCRM-dev";
  const query = `query {
    organization(login: "${owner}") {
      projectsV2(first: 100) { totalCount }
    }
  }`;

  try {
    const result = await graphql(query, {}, token);
    if (result.errors) {
      console.error("Projects count error:", result.errors[0].message);
      return corsResponse({ error: "Could not count projects" }, request, env, 502);
    }
    const count = result.data.organization.projectsV2.totalCount;
    return corsResponse({ ok: true, count }, request, env);
  } catch (err) {
    console.error("Projects count fetch failed:", err.message);
    return corsResponse({ error: "Could not count projects" }, request, env, 502);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Calendar – iCal feed proxy (parses public Google Calendar feed)
// ═══════════════════════════════════════════════════════════════════

function parseICalDate(dateStr) {
  // Handles: 20260810T140000Z  or  20260810T140000  or  20260810
  var isAllDay = false;
  if (dateStr && dateStr.indexOf("VALUE=DATE") === 0) {
    isAllDay = true;
    dateStr = dateStr.slice("VALUE=DATE:".length);
  } else if (dateStr && dateStr.indexOf(":") !== -1) {
    dateStr = dateStr.slice(dateStr.indexOf(":") + 1);
  }
  if (!dateStr || dateStr.length < 8) return null;
  var year = parseInt(dateStr.slice(0, 4), 10);
  var month = parseInt(dateStr.slice(4, 6), 10) - 1;
  var day = parseInt(dateStr.slice(6, 8), 10);
  var hour = 0, min = 0;
  if (dateStr.length >= 15 && dateStr[8] === "T") {
    hour = parseInt(dateStr.slice(9, 11), 10) || 0;
    min = parseInt(dateStr.slice(11, 13), 10) || 0;
  }
  // If the date ends in Z, it's UTC; otherwise assume local (America/Chicago)
  var isUTC = dateStr.indexOf("Z") !== -1;
  var date = new Date(isUTC ? Date.UTC(year, month, day, hour, min) : new Date(year, month, day, hour, min).getTime());
  return { date: date, allDay: isAllDay };
}

function unfoldICal(text) {
  // iCal folds long lines with CRLF followed by a space or tab
  return text.replace(/\r\n /g, "").replace(/\r\n\t/g, "");
}

function parseICalField(vevent, name) {
  var re = new RegExp("\\n" + name + "(;[^\n:]*)?:([^\n]*)", "i");
  var match = vevent.match(re);
  return match ? match[2] : "";
}

async function handleCalendarEvents(request, env) {
  var session = await getSession(request, env);
  if (!session) return notAuthenticated(request, env);

  var icalUrl = env.GOOGLE_CALENDAR_ICAL_URL;
  if (!icalUrl) {
    return corsResponse({ error: "Calendar not configured" }, request, env, 502);
  }

  try {
    var resp = await fetch(icalUrl, { headers: { "User-Agent": "unicrm-dashboard-proxy" } });
    if (!resp.ok) throw new Error("iCal fetch returned " + resp.status);
    var raw = await resp.text();
    var unfolded = unfoldICal(raw);

    // Split into VEVENT blocks
    var events = [];
    var blocks = unfolded.split("BEGIN:VEVENT");
    for (var i = 1; i < blocks.length; i++) {
      var block = blocks[i];
      var endIdx = block.indexOf("END:VEVENT");
      if (endIdx === -1) continue;
      block = "\n" + block.slice(0, endIdx);

      var dtstart = parseICalField(block, "DTSTART");
      var dtend = parseICalField(block, "DTEND");
      var summary = parseICalField(block, "SUMMARY");
      var description = parseICalField(block, "DESCRIPTION");
      var location = parseICalField(block, "LOCATION");

      if (!dtstart || !summary) continue;

      var start = parseICalDate(dtstart);
      var end = dtend ? parseICalDate(dtend) : null;
      if (!start) continue;

      // Unescape iCal text
      summary = summary.replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\n/g, "\n").replace(/\\\\/g, "\\");
      description = description.replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\n/g, "\n").replace(/\\\\/g, "\\");
      location = location.replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\n/g, "\n").replace(/\\\\/g, "\\");

      events.push({
        summary: summary,
        start: start.date.toISOString(),
        end: end ? end.date.toISOString() : start.date.toISOString(),
        allDay: start.allDay,
        description: description || "",
        location: location || ""
      });
    }

    // Sort by start date, filter to upcoming only, take top 5
    var now = new Date();
    events.sort(function (a, b) { return a.start.localeCompare(b.start); });
    var upcoming = [];
    for (var j = 0; j < events.length && upcoming.length < 5; j++) {
      var ev = events[j];
      // Keep events that haven't ended yet
      if (ev.end >= now.toISOString() || ev.start >= now.toISOString()) {
        upcoming.push(ev);
      }
    }

    return corsResponse({ ok: true, events: upcoming }, request, env);
  } catch (err) {
    console.error("Calendar events error:", err.message);
    return corsResponse({ error: "Could not load calendar events" }, request, env, 502);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Messages — stored in Cloudflare Workers KV
// ═══════════════════════════════════════════════════════════════════

const MESSAGES_MAX = 50;

async function handleListMessages(request, env) {
  const session = await getSession(request, env);
  if (!session) {
    return notAuthenticated(request, env);
  }

  if (!env.MESSAGES) {
    return corsResponse({ error: "KV store not configured" }, request, env, 502);
  }

  try {
    const list = await env.MESSAGES.list({ prefix: "msg:", limit: MESSAGES_MAX });
    const messages = [];
    for (const key of list.keys) {
      const value = await env.MESSAGES.get(key.name);
      if (value) {
        try { messages.push(JSON.parse(value)); } catch { /* skip corrupted entries */ }
      }
    }
    // Messages are stored with timestamp in key, so list order is chronological ascending.
    // Reverse so newest is first.
    messages.reverse();
    return corsResponse({ ok: true, messages }, request, env, 200);
  } catch (err) {
    console.error("Messages list error:", err.message);
    return corsResponse({ error: "Could not list messages" }, request, env, 500);
  }
}

async function handlePostMessage(request, env) {
  const session = await getSession(request, env);
  if (!session) {
    return notAuthenticated(request, env);
  }

  if (!env.MESSAGES) {
    return corsResponse({ error: "KV store not configured" }, request, env, 502);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return corsResponse({ error: "Invalid JSON body" }, request, env, 400);
  }

  const text = (body.text || "").trim();
  if (!text || text.length > 600) {
    return corsResponse({ error: "Message text is required (max 600 characters)" }, request, env, 400);
  }

  const now = new Date();
  // Key format: msg:<iso-timestamp>-<random> — sorts chronologically
  const key = `msg:${now.toISOString()}-${Math.random().toString(36).slice(2, 8)}`;
  const message = {
    id: key,
    author: session.name,
    role: session.role,
    text,
    timestamp: now.toISOString(),
  };

  try {
    await env.MESSAGES.put(key, JSON.stringify(message));
    return corsResponse({ ok: true, message }, request, env, 201);
  } catch (err) {
    console.error("Messages put error:", err.message);
    return corsResponse({ error: "Could not save message" }, request, env, 500);
  }
}

async function handleDeleteMessage(request, env, url) {
  const session = await getSession(request, env);
  if (!session) {
    return notAuthenticated(request, env);
  }

  // Only developers can delete messages (light moderation)
  if (session.role !== "dev") {
    return corsResponse({ error: "Only developers can remove messages" }, request, env, 403);
  }

  if (!env.MESSAGES) {
    return corsResponse({ error: "KV store not configured" }, request, env, 502);
  }

  // Extract the message key from the URL path: /messages/msg:2024-...-abc123
  const key = url.pathname.slice("/messages/".length);
  if (!key) {
    return corsResponse({ error: "Message ID is required" }, request, env, 400);
  }

  try {
    const existing = await env.MESSAGES.get(key);
    if (!existing) {
      return corsResponse({ error: "Message not found" }, request, env, 404);
    }
    await env.MESSAGES.delete(key);
    return corsResponse({ ok: true }, request, env, 200);
  } catch (err) {
    console.error("Messages delete error:", err.message);
    return corsResponse({ error: "Could not delete message" }, request, env, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Documents — list, upload, download (wiki repo /docs folder)
// ═══════════════════════════════════════════════════════════════════

function documentsConfig(env) {
  return {
    owner: env.DOCUMENTS_OWNER || "UniCRM-dev",
    repo: env.DOCUMENTS_REPO || "wiki",
    folder: (env.DOCUMENTS_FOLDER || "docs").replace(/^\/+|\/+$/g, ""),
  };
}

// Encode each path segment individually so slashes survive encoding
function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

// Strip leading/trailing slashes and reject anything that escapes the base folder
function sanitizePath(path) {
  const cleaned = (path || "").replace(/^\/+|\/+$/g, "");
  if (!cleaned || cleaned.includes("..")) return null;
  return cleaned;
}

// ── GET /documents?path=docs/… — list one level of the folder ──

async function handleListDocuments(request, env, url) {
  const session = await getSession(request, env);
  if (!session) return notAuthenticated(request, env);

  const token = await getGithubToken(env);
  if (!token) {
    return corsResponse({ error: "GitHub token not configured" }, request, env, 502);
  }

  const cfg = documentsConfig(env);
  const requested = sanitizePath(url.searchParams.get("path")) || cfg.folder;
  if (!requested) {
    return corsResponse({ error: "Invalid path" }, request, env, 400);
  }

  try {
    const ghResponse = await fetch(
      `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodePath(requested)}`,
      {
        method: "GET",
        headers: {
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Authorization": `Bearer ${token}`,
          "User-Agent": "unicrm-dashboard-proxy",
        },
        redirect: "follow",
      }
    );

    // Folder doesn't exist yet — treat as empty
    if (ghResponse.status === 404) {
      return corsResponse({ ok: true, entries: [], path: requested }, request, env, 200);
    }
    if (!ghResponse.ok) {
      throw new Error(`GitHub returned ${ghResponse.status}`);
    }

    const data = await ghResponse.json();
    const entries = (Array.isArray(data) ? data : [data]).map(entry => ({
      name: entry.name,
      path: entry.path,
      type: entry.type, // "dir" | "file"
      size: entry.size || 0,
    }));

    return corsResponse({ ok: true, entries, path: requested }, request, env, 200);
  } catch (err) {
    console.error("List documents error:", err.message);
    return corsResponse({ error: "Could not list documents" }, request, env, 502);
  }
}

// ── POST /documents — upload a file (base64 body) ──

async function handleUploadDocument(request, env) {
  const session = await getSession(request, env);
  if (!session) return notAuthenticated(request, env);

  const token = await getGithubToken(env);
  if (!token) {
    return corsResponse({ error: "GitHub token not configured" }, request, env, 502);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return corsResponse({ error: "Invalid JSON body" }, request, env, 400);
  }

  const { path, filename, content } = body;
  const cleanPath = sanitizePath(path);
  const cleanName = (filename || "").trim().replace(/^\/+/, "");
  if (!cleanPath || !cleanName || cleanName.includes("/") || cleanName.includes("..")) {
    return corsResponse({ error: "path and filename are required" }, request, env, 400);
  }
  if (!content || typeof content !== "string") {
    return corsResponse({ error: "content is required" }, request, env, 400);
  }

  const cfg = documentsConfig(env);
  // Accept a directory path with or without the base-folder prefix (docs/finance or finance)
  const subPath = cleanPath === cfg.folder ? "" : cleanPath.replace(new RegExp("^" + cfg.folder + "/"), "");
  const fullPath = [cfg.folder, subPath, cleanName].filter(Boolean).join("/");

  // Sessions carry display names, not GitHub identities, so attribute uploads
  // to the uploader's real account via GitHub's private noreply format
  // (id+login@users.noreply.github.com — links the commit without exposing
  // their email). Fall back to a team identity for users without one.
  const uploader = parseUsers(env).find(u => u.name.toLowerCase() === session.name.toLowerCase());
  const committer = uploader && uploader.id && uploader.login
    ? { name: session.name, email: `${uploader.id}+${uploader.login}@users.noreply.github.com` }
    : { name: "UniCRM Team Page", email: "team-page@users.noreply.github.com" };

  try {
    const ghResponse = await fetch(
      `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodePath(fullPath)}`,
      {
        method: "PUT",
        headers: {
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "unicrm-dashboard-proxy",
        },
        body: JSON.stringify({
          message: `Upload ${cleanName} (by ${session.name})`,
          content,
          committer,
        }),
      }
    );

    const result = await ghResponse.json().catch(() => ({}));

    if (!ghResponse.ok) {
      // 409 = the file already exists (need the current sha to overwrite)
      if (ghResponse.status === 409) {
        return corsResponse(
          { error: `"${cleanName}" already exists in that folder. Rename the file or choose another folder.` },
          request, env, 409
        );
      }
      throw new Error(result.message || `GitHub returned ${ghResponse.status}`);
    }

    return corsResponse(
      {
        ok: true,
        file: {
          name: (result.content && result.content.name) || cleanName,
          path: (result.content && result.content.path) || fullPath,
          size: (result.content && result.content.size) || 0,
        },
      },
      request, env, 201
    );
  } catch (err) {
    console.error("Upload document error:", err.message);
    return corsResponse({ error: err.message || "Could not upload document" }, request, env, 502);
  }
}

// ── GET /documents/download?path=docs/… — stream a private file to a session ──

const VIEWABLE_EXTENSIONS = new Set(["pdf", "png", "jpg", "jpeg", "gif", "webp", "svg", "txt", "md", "csv"]);

function contentTypeFor(name) {
  const ext = name.split(".").pop().toLowerCase();
  const types = {
    pdf: "application/pdf",
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
    webp: "image/webp", svg: "image/svg+xml",
    txt: "text/plain", md: "text/markdown", csv: "text/csv",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    zip: "application/zip",
  };
  return types[ext] || "application/octet-stream";
}

function contentDispositionFor(name) {
  const sanitized = name.replace(/["\\]/g, "").replace(/[\x00-\x1f]/g, "");
  const ext = name.split(".").pop().toLowerCase();
  const disposition = VIEWABLE_EXTENSIONS.has(ext) ? "inline" : "attachment";
  return `${disposition}; filename="${sanitized}"`;
}

async function handleDownloadDocument(request, env, url) {
  const session = await getSession(request, env);
  if (!session) return notAuthenticated(request, env);

  const token = await getGithubToken(env);
  if (!token) {
    return corsResponse({ error: "GitHub token not configured" }, request, env, 502);
  }

  const cfg = documentsConfig(env);
  const requested = sanitizePath(url.searchParams.get("path"));
  if (!requested || (requested !== cfg.folder && !requested.startsWith(cfg.folder + "/"))) {
    return corsResponse({ error: "Invalid path" }, request, env, 400);
  }

  const fileName = requested.split("/").pop();

  try {
    const ghResponse = await fetch(
      `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodePath(requested)}`,
      {
        method: "GET",
        headers: {
          "Accept": "application/vnd.github.raw",
          "X-GitHub-Api-Version": "2022-11-28",
          "Authorization": `Bearer ${token}`,
          "User-Agent": "unicrm-dashboard-proxy",
        },
        redirect: "follow",
      }
    );

    if (!ghResponse.ok) {
      return corsResponse({ error: "Could not download file" }, request, env, ghResponse.status);
    }

    // Build a plain-object headers dict (like corsResponse does) — Object.assign
    // onto a Headers instance silently drops the CORS headers, which makes the
    // browser block the download.
    const origin = request.headers.get("Origin");
    const headers = {
      ...corsHeaders(origin, env),
      "Content-Type": ghResponse.headers.get("Content-Type") || contentTypeFor(fileName),
      "Content-Disposition": contentDispositionFor(fileName),
      "Cache-Control": "private, max-age=300",
    };

    return new Response(ghResponse.body, { status: 200, headers });
  } catch (err) {
    console.error("Download document error:", err.message);
    return corsResponse({ error: "Could not download file" }, request, env, 502);
  }
}

// ═══════════════════════════════════════════════════════════════════
// GitHub token — PAT first, App JWT fallback
// ═══════════════════════════════════════════════════════════════════

let _appToken = null;  // { token, expiresAt }

async function getGithubToken(env) {
  // PAT (simplest) — just return it
  if (env.GITHUB_TOKEN) return env.GITHUB_TOKEN;

  // GitHub App (upgrade path) — sign JWT, exchange for installation token
  if (env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY && env.GITHUB_INSTALLATION_ID) {
    const now = Math.floor(Date.now() / 1000);
    if (_appToken && _appToken.expiresAt > now + 300) {
      return _appToken.token;
    }
    const jwt = await signAppJwt(env);
    const response = await fetch(
      `https://api.github.com/app/installations/${env.GITHUB_INSTALLATION_ID}/access_tokens`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${jwt}`,
          "Accept": "application/vnd.github+json",
          "User-Agent": "unicrm-dashboard-proxy",
        },
      }
    );
    if (!response.ok) {
      console.error("Failed to get installation token:", response.status);
      return null;
    }
    const data = await response.json();
    _appToken = {
      token: data.token,
      expiresAt: now + (data.expires_in || 3600),
    };
    return _appToken.token;
  }

  return null;
}

async function signAppJwt(env) {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60,
    exp: now + 600,
    iss: env.GITHUB_APP_ID,
  };

  const headerB64 = btoa(unescape(encodeURIComponent(JSON.stringify(header))))
    .replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const payloadB64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
    .replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const toSign = headerB64 + "." + payloadB64;

  const pemContent = env.GITHUB_APP_PRIVATE_KEY
    .replace(/-----BEGIN RSA PRIVATE KEY-----/, "")
    .replace(/-----END RSA PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binaryKey = Uint8Array.from(atob(pemContent), c => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(toSign))
  );
  const sigB64 = btoa(String.fromCharCode(...sig))
    .replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

  return toSign + "." + sigB64;
}
