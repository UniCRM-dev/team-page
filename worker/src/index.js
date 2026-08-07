/**
 * UniCRM Dashboard Proxy — Cloudflare Worker
 *
 * Routes:
 *   POST /login        — validate shared password, set signed session cookie
 *   POST /logout       — clear session cookie
 *   GET  /me           — return {user} or 401
 *   GET  /github/*     — proxy to api.github.com  (requires session)
 *   POST /discussions  — create org discussion via GraphQL (requires session)
 *   OPTIONS *          — CORS preflight
 *
 * No dependencies, no KV, no external services. Stateless HMAC-signed sessions.
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
      if (method === "POST" && url.pathname === "/logout") {
        return handleLogout(env);
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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  // allowed === null means dev mode (any origin ok); otherwise check the list
  const ok = origin && (allowed === null || allowed.includes(origin));
  if (ok) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
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
// Session (stateless HMAC-SHA256)
// ═══════════════════════════════════════════════════════════════════

const SESSION_COOKIE = "dashboard_session";

function parseUsers(env) {
  return (env.ALLOWED_USERS || "Shawn:dev,Jesse:dev,Courtney:sales,Chelsey:sales")
    .split(",").map(s => s.trim()).filter(Boolean).map(entry => {
      const [name, role] = entry.split(":").map(p => p.trim());
      return { name, role: role || "dev" };
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

async function verifyCookie(cookieHeader, env) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`)
  );
  if (!match) return null;
  const token = match[1];
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

  // Constant-time-ish comparison
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

function setCookie(token, env) {
  const ttl = parseInt(env.SESSION_TTL_HOURS || "168", 10);
  const sameSite = env.COOKIE_SAMESITE || "none";
  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    `SameSite=${sameSite}`,
    `Max-Age=${ttl * 3600}`,
  ].join("; ");
}

function clearCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; Max-Age=0`;
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

  const origin = request.headers.get("Origin");
  return new Response(JSON.stringify({ ok: true, user: { name: user.name, role: user.role } }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin, env),
      "Set-Cookie": setCookie(token, env),
    },
  });
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
// POST /logout
// ═══════════════════════════════════════════════════════════════════

async function handleLogout(env) {
  return new Response(null, {
    status: 204,
    headers: { "Set-Cookie": clearCookie() },
  });
}

// ═══════════════════════════════════════════════════════════════════
// GET /me
// ═══════════════════════════════════════════════════════════════════

async function handleMe(request, env) {
  const session = await verifyCookie(request.headers.get("Cookie"), env);
  if (!session) {
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
  return corsResponse(
    { ok: true, user: { name: session.name, role: session.role } },
    request, env, 200
  );
}

// ═══════════════════════════════════════════════════════════════════
// GET /github/*  (API proxy)
// ═══════════════════════════════════════════════════════════════════

async function handleGithubProxy(request, env, url) {
  const session = await verifyCookie(request.headers.get("Cookie"), env);
  if (!session) {
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

  // Extract the path after /github
  const ghPath = url.pathname.slice("/github".length) + url.search;

  // Path allowlist — only /repos/* for GET
  if (!ghPath.startsWith("/repos/")) {
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
  const session = await verifyCookie(request.headers.get("Cookie"), env);
  if (!session) {
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
