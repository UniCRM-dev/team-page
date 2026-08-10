(function () {
  "use strict";
  const config = window.DASHBOARD_CONFIG || {};
  const gh = config.github || {};
  const owner = gh.owner || "YOUR_GITHUB_ORG";
  const repos = gh.repos || {};
  const labels = gh.labels || {};
  const configured = owner !== "YOUR_GITHUB_ORG";
  const workerUrl = (config.worker || {}).url || "";
  const loginPage = (config.worker || {}).loginPage || "login.html";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const repoUrl = repo => `https://github.com/${owner}/${repo}`;
  const issuesUrl = (repo, query = "") => `${repoUrl(repo)}/issues${query ? `?q=${encodeURIComponent(query)}` : ""}`;
  const discussionCategory = slug => `https://github.com/orgs/${owner}/discussions/categories/${slug}`;
  const newDiscussion = (slug, title = "", body = "") => `https://github.com/orgs/${owner}/discussions/new?category=${encodeURIComponent(slug)}${title ? `&title=${encodeURIComponent(title)}` : ""}${body ? `&body=${encodeURIComponent(body)}` : ""}`;
  const escapeHtml = value => String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const IDEA_STORAGE_KEY = "dashboard-submitted-ideas";
  function storedIdeas() {
    try {
      const raw = JSON.parse(localStorage.getItem(IDEA_STORAGE_KEY) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch (error) { return []; }
  }

  function avatar(name) { return `<span class="avatar" title="${escapeHtml(name)}">${escapeHtml(name.slice(0, 2).toUpperCase())}</span>`; }
  function emptyState(message) { return `<p class="empty-state">${escapeHtml(message)}</p>`; }
  function issueOwner(issue) { return (issue.assignee && issue.assignee.login) || issue.user.login; }
  function issueBody(issue, max) { const text = (issue.body || "").replace(/\s+/g, " ").trim(); return text ? (text.length > max ? `${text.slice(0, max)}…` : text) : `#${issue.number} · ${issue.repo}`; }
  function hasLabel(issue, name) { return name && issue.labels.some(label => label.name === name); }
  function labelTone(label) {
    const color = (label && label.color || "888888").toLowerCase();
    const r = parseInt(color.slice(0, 2), 16), g = parseInt(color.slice(2, 4), 16), b = parseInt(color.slice(4, 6), 16);
    if (r > 170 && g < 120 && b < 120) return "red";
    if (g > 150 && r < 140 && b < 140) return "green";
    if (r > 150 && g > 110 && b < 100) return "amber";
    return "blue";
  }
  function ageLabel(iso) {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    return days <= 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days`;
  }
  function monthDay(iso) {
    const d = new Date(iso);
    return `${d.toLocaleDateString(undefined, { month: "short" }).toUpperCase()} ${String(d.getDate()).padStart(2, "0")}`;
  }

  function renderStaticData() {
    const schedule = config.schedule || [];
    $("#event-list").innerHTML = schedule.map(e => `<div class="event-item ${e.tone}"><time><strong>${escapeHtml(e.time)}</strong><span>${escapeHtml(e.period)}</span></time><div><h3>${escapeHtml(e.title)}</h3><p>${escapeHtml(e.meta)}</p></div></div>`).join("") || emptyState("Add upcoming events in config.js");
    const pipeline = config.pipeline || [];
    $("#pipeline-bars").innerHTML = pipeline.map(([name, count, width]) => `<div class="pipeline-row"><span>${escapeHtml(name)}</span><div><i style="width:${width}%"></i></div><b>${count}</b></div>`).join("") || emptyState("Configure pipeline stages in config.js");
    const poll = config.poll || {};
    if (poll.question) {
      const total = (poll.options || []).reduce((sum, option) => sum + (option.votes || 0), 0) || 1;
      $("#poll-question").textContent = poll.question;
      $("#poll-options").innerHTML = (poll.options || []).map(option => {
        const pct = Math.round(((option.votes || 0) / total) * 100);
        return `<a class="poll-option" href="${discussionCategory((config.discussions && config.discussions.categories && config.discussions.categories.polls) || "polls")}" target="_blank" rel="noopener"><span>${escapeHtml(option.label)}</span><div><i style="width:${pct}%"></i></div><b>${option.votes || 0}</b></a>`;
      }).join("") || emptyState("Add poll options in config.js");
    } else {
      $("#poll-options").innerHTML = emptyState("Add a poll in config.js");
    }
    const cats = (config.discussions && config.discussions.categories) || {};
    const ideasUrl = configured ? discussionCategory(cats.ideas || "ideas") : "https://github.com/";
    const announcementUrl = configured ? discussionCategory(cats.announcements || "announcements") : "https://github.com/";
    const ideas = storedIdeas().concat(config.ideas || []);
    $("#idea-list").innerHTML = ideas.slice(0, 8).map(idea => `<a class="idea-item" href="${ideasUrl}" target="_blank" rel="noopener"><time>${monthDay(idea.date)}</time><div><h3>${escapeHtml(idea.title)}</h3><p>${escapeHtml(idea.area)}</p><small>Submitted by ${escapeHtml(idea.submittedBy)}</small></div><span class="arrow">↗</span></a>`).join("") || emptyState("Submit an idea and it will show up here.");
    $("#announcement-list").innerHTML = (config.announcements || []).slice(0, 6).map(announcement => `<a class="announcement-item${announcement.pinned ? " pinned" : ""}" href="${announcementUrl}" target="_blank" rel="noopener"><div><h3>${escapeHtml(announcement.title)}</h3><p>${escapeHtml(announcement.body)}</p><small>${escapeHtml(announcement.author)} · ${monthDay(announcement.date)}</small></div>${announcement.pinned ? '<span class="pill amber">New</span>' : ""}</a>`).join("") || emptyState("Post an update in the announcements category.");
  }

  function configureLinks() {
    const org = configured ? `https://github.com/${owner}` : "https://github.com/";
    const project = configured ? `https://github.com/orgs/${owner}/projects/${gh.projectNumber || 1}` : org;
    const set = (id, url) => { const el = $(id); if (el) el.href = url; };
    $("#company-name").textContent = $("#footer-company").textContent = config.companyName || "UniCRM";
    document.title = `${config.companyName || "UniCRM"} Operations`;
    set("#github-org-link", org); set("#new-task-link", configured ? `${repoUrl(repos.operations)}/issues/new` : "https://github.com/issues");
    set("#priorities-link", project); set("#blockers-link", configured ? issuesUrl(repos.operations, "is:open label:blocked") : org);
    set("#milestones-link", project); set("#dev-board-link", project); set("#sales-board-link", project);
    set("#issues-link", configured ? `https://github.com/issues?q=${encodeURIComponent(`is:open org:${owner}`)}` : org);
    set("#prs-link", configured ? `https://github.com/pulls?q=${encodeURIComponent(`is:open org:${owner}`)}` : org);
    set("#actions-link", configured ? `${repoUrl(repos.product)}/actions` : org); set("#release-link", configured ? `${repoUrl(repos.product)}/releases` : org);
    set("#sidebar-notes-link", configured ? repoUrl(repos.operations) : org);
    set("#sidebar-wiki-link", configured ? `${repoUrl(repos.operations)}/wiki` : org);
    set("#sidebar-feedback-link", configured ? issuesUrl(repos.sales, "is:open label:customer-feedback") : org);
    const cats = (config.discussions && config.discussions.categories) || {};
    const pollsSlug = cats.polls || "polls";
    set("#polls-link", configured ? discussionCategory(pollsSlug) : org);
    set("#new-poll-link", configured ? newDiscussion(pollsSlug) : org);
    set("#ideas-link", configured ? discussionCategory(cats.ideas || "ideas") : org);
    set("#announcements-link", configured ? discussionCategory(cats.announcements || "announcements") : org);
    const repositoryLinks = [["Product Core", repos.product], ["Company Ops", repos.operations], ["Sales Pipeline", repos.sales], ["Ideas", repos.ideas]];
    $("#sidebar-repositories").innerHTML = repositoryLinks.map(([name, repo]) => `<a href="${configured ? repoUrl(repo) : "https://github.com/"}" target="_blank" rel="noopener"><span class="repo-indicator" aria-hidden="true"></span><span>${escapeHtml(name)}</span><b aria-hidden="true">↗</b></a>`).join("");
  }

  function authHeaders() {
    var token = null;
    try { token = sessionStorage.getItem("dashboard_token"); } catch (e) {}
    var headers = { Accept: "application/vnd.github+json" };
    if (token) headers["Authorization"] = "Bearer " + token;
    return headers;
  }

  async function github(path) {
    if (!workerUrl) {
      const response = await fetch(`https://api.github.com${path}`, { headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" } });
      if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
      return response.json();
    }
    const response = await fetch(`${workerUrl}/github${path}`, {
      headers: authHeaders()
    });
    if (response.status === 401 && response.headers.get("X-Auth-Required")) {
      try { sessionStorage.removeItem("dashboard_token"); } catch (e) {}
      location.replace(`${loginPage}?next=${encodeURIComponent(location.pathname + location.search)}`);
      throw new Error("Session expired");
    }
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    return response.json();
  }

  function renderLiveData(byRepo) {
    const all = Object.keys(byRepo).reduce((list, key) => { byRepo[key].forEach(issue => { issue.repo = repos[key]; }); return list.concat(byRepo[key]); }, []).filter(issue => !issue.pull_request);
    const isPriority = i => hasLabel(i, labels.priority);
    const isBlocker = i => hasLabel(i, labels.blocker);
    const isMilestone = i => hasLabel(i, labels.milestone);
    const isDecision = i => hasLabel(i, labels.decision);
    const isClassified = i => isPriority(i) || isBlocker(i) || isMilestone(i) || isDecision(i);

    const priorities = all.filter(isPriority);
    const blockers = all.filter(isBlocker);
    const milestones = all.filter(isMilestone).map(issue => ({ issue, at: issue.milestone && issue.milestone.due_on ? new Date(issue.milestone.due_on) : new Date(issue.created_at) })).sort((a, b) => a.at - b.at);
    const devTasks = (byRepo.product || []).filter(issue => !issue.pull_request && !isClassified(issue));
    const salesTasks = (byRepo.sales || []).filter(issue => !issue.pull_request && !isClassified(issue));

    $("#priority-count").textContent = priorities.length;
    $("#blocker-count").textContent = blockers.length;
    if (milestones[0]) {
      $("#next-milestone-date").textContent = milestones[0].at.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      $("#next-milestone-note").textContent = milestones[0].issue.title;
    }

    $("#priority-list").innerHTML = priorities.slice(0, 8).map((issue, i) => {
      const ownerName = issueOwner(issue);
      return `<a class="priority-item" href="${issue.html_url}" target="_blank" rel="noopener"><span class="priority-number">0${i + 1}</span><div class="priority-copy"><h3>${escapeHtml(issue.title)}</h3><p>${escapeHtml(issueBody(issue, 90))}</p><div class="priority-meta">${avatar(ownerName)}<span>${escapeHtml(ownerName)}</span><b>#${issue.number}</b></div></div><span class="arrow">↗</span></a>`;
    }).join("") || emptyState(`Open an issue labeled "${labels.priority}" to track a priority.`);

    $("#blocker-list").innerHTML = blockers.slice(0, 5).map(issue => {
      const blockerLabel = issue.labels.find(label => label.name === labels.blocker);
      const severity = blockerLabel && labelTone(blockerLabel) === "red" ? "high" : "medium";
      const ownerName = issueOwner(issue);
      return `<a class="blocker-item" href="${issue.html_url}" target="_blank" rel="noopener"><span class="severity ${severity}">!</span><div><h3>${escapeHtml(issue.title)}</h3><p>${avatar(ownerName)} ${escapeHtml(ownerName)} · ${escapeHtml(ageLabel(issue.created_at))}</p></div><span class="arrow">→</span></a>`;
    }).join("") || emptyState(`Open an issue labeled "${labels.blocker}" to track a blocker.`);

    $("#milestone-list").innerHTML = milestones.slice(0, 6).map(({ issue, at }) => {
      const milestoneLabel = issue.labels.find(label => label.name === labels.milestone);
      const tone = milestoneLabel ? labelTone(milestoneLabel) : "blue";
      return `<a class="timeline-item" href="${issue.html_url}" target="_blank" rel="noopener"><time><strong>${at.getDate()}</strong><span>${at.toLocaleDateString(undefined, { month: "short" }).toUpperCase()}</span></time><div><h3>${escapeHtml(issue.title)}</h3><p>${escapeHtml(issue.milestone ? issue.milestone.title : issueBody(issue, 70))}</p></div><span class="pill ${tone}">Open</span></a>`;
    }).join("") || emptyState(`Open an issue labeled "${labels.milestone}" to track a milestone.`);

    const taskRow = (issue, repo) => {
      const ownerName = issueOwner(issue);
      const firstLabel = issue.labels[0];
      const status = firstLabel ? firstLabel.name : "Open";
      const tone = firstLabel ? labelTone(firstLabel) : "green";
      return `<tr><td><a href="${issue.html_url}" target="_blank" rel="noopener">${escapeHtml(issue.title)}</a></td><td><span class="owner-cell">${avatar(ownerName)} ${escapeHtml(ownerName)}</span></td><td><span class="pill ${tone}">${escapeHtml(status)}</span></td><td>${escapeHtml(repo)}</td></tr>`;
    };
    $("#dev-task-list").innerHTML = devTasks.slice(0, 12).map(issue => taskRow(issue, repos.product)).join("") || `<tr><td class="empty-state">No open tasks — create issues in ${repos.product}.</td></tr>`;
    $("#sales-task-list").innerHTML = salesTasks.slice(0, 12).map(issue => taskRow(issue, repos.sales)).join("") || `<tr><td class="empty-state">No open tasks — create issues in ${repos.sales}.</td></tr>`;
  }

  async function loadGitHubData() {
    if (!configured || !repos.product) return;
    const keys = ["product", "operations", "sales", "ideas"];
    try {
      const [results, repo, pulls, releases, runs] = await Promise.all([
        Promise.all(keys.map(key => github(`/repos/${owner}/${repos[key]}/issues?state=open&per_page=100&sort=updated&direction=desc`))),
        github(`/repos/${owner}/${repos.product}`),
        github(`/repos/${owner}/${repos.product}/pulls?state=open&per_page=100`),
        github(`/repos/${owner}/${repos.product}/releases?per_page=1`),
        github(`/repos/${owner}/${repos.product}/actions/runs?per_page=1`)
      ]);
      const byRepo = {}; keys.forEach((key, index) => { byRepo[key] = results[index]; });
      renderLiveData(byRepo);
      $("#open-issues").textContent = repo.open_issues_count;
      $("#open-prs").textContent = pulls.length;
      $("#pr-note").textContent = `${pulls.filter(p => p.requested_reviewers && p.requested_reviewers.length).length} waiting review`;
      if (releases[0]) { $("#latest-release").textContent = releases[0].tag_name; $("#release-note").textContent = new Date(releases[0].published_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
      if (runs.workflow_runs && runs.workflow_runs[0]) { const ok = runs.workflow_runs[0].conclusion === "success"; $("#build-health").innerHTML = `<i></i> ${ok ? "Passing" : "Needs attention"}`; $("#build-health").classList.toggle("failed", !ok); $("#build-note").textContent = runs.workflow_runs[0].name; }
      $("#sync-state").innerHTML = "<i></i> Live from GitHub"; $("#sync-state").classList.add("live");
      $("#last-updated").textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    } catch (error) {
      $("#sync-state").innerHTML = "<i></i> Live data unavailable"; $("#sync-state").title = "Could not reach the GitHub API. Check that the configured repos are public and try again.";
    }
  }

  function setupInteractions() {
    const dialog = $("#idea-dialog");
    $$('[data-dialog="idea-dialog"]').forEach(button => button.addEventListener("click", () => dialog.showModal()));
    $("#idea-form").addEventListener("submit", async event => {
      if (event.submitter && event.submitter.value === "cancel") return;
      event.preventDefault();
      if (!event.currentTarget.reportValidity()) return;
      const title = $("#idea-title-input").value.trim();
      const body = `## Problem or opportunity\n${$("#idea-problem").value.trim()}\n\n## Area\n${$("#idea-area").value}\n\n## Submitted by\n${$("#idea-owner").value}\n\n---\nSubmitted from the company operations dashboard.`;
      const ideasSlug = ((config.discussions || {}).categories || {}).ideas || "ideas";

      let submittedViaApi = false;
      if (workerUrl) {
        try {
          var headers = authHeaders();
          headers["Content-Type"] = "application/json";
          const response = await fetch(`${workerUrl}/discussions`, {
            method: "POST",
            headers: headers,
            body: JSON.stringify({ title, body, category: ideasSlug })
          });
          if (response.ok) {
            const result = await response.json();
            submittedViaApi = true;
            if (result.url) window.open(result.url, "_blank", "noopener");
            showToast("Idea submitted to GitHub Discussions");
          }
        } catch (error) { /* fall through to legacy path below */ }
      }
      if (!submittedViaApi) {
        const url = configured ? newDiscussion(ideasSlug, title, body) : "https://github.com/";
        window.open(url, "_blank", "noopener");
        showToast("Idea prepared in GitHub Discussions");
      }
      const submitted = storedIdeas();
      submitted.unshift({ title, area: $("#idea-area").value, submittedBy: $("#idea-owner").value, date: new Date().toISOString() });
      try { localStorage.setItem(IDEA_STORAGE_KEY, JSON.stringify(submitted)); } catch (error) { /* storage unavailable */ }
      renderStaticData();
      dialog.close(); event.currentTarget.reset();
    });
    const tabs = $$("[role=tab]");
    tabs.forEach(tab => tab.addEventListener("click", () => {
      tabs.forEach(t => { const selected = t === tab; t.setAttribute("aria-selected", selected); $(`#${t.getAttribute("aria-controls")}`).hidden = !selected; });
    }));
    const navLinks = $$('.side-nav a[href^="#"]');
    navLinks.forEach(link => link.addEventListener("click", () => navLinks.forEach(a => a.classList.toggle("active", a === link))));

    // Show sign-out button when worker auth is active and wire it
    const signOut = $("#sign-out");
    if (signOut && workerUrl) {
      signOut.hidden = false;
      signOut.addEventListener("click", () => {
        try { sessionStorage.removeItem("dashboard_token"); } catch (e) {}
        location.replace(loginPage);
      });
    }

    // Update idea dialog button text when worker is active (no need to "Continue to GitHub")
    if (workerUrl) {
      const submitBtn = $("#submit-idea");
      if (submitBtn) submitBtn.textContent = "Submit idea";
    }
  }

  // ── Messages ──────────────────────────────────────────────────

  function timeAgo(iso) {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (diff < 1) return "Just now";
    if (diff < 60) return diff + "m ago";
    const hours = Math.floor(diff / 60);
    if (hours < 24) return hours + "h ago";
    const days = Math.floor(hours / 24);
    if (days < 7) return days + "d ago";
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  async function loadMessages() {
    if (!workerUrl) return;
    var container = $("#message-list");
    var countEl = $("#message-count");
    var syncNote = $("#message-sync-note");
    if (!container) return;

    try {
      var headers = authHeaders();
      var response = await fetch(workerUrl + "/messages", { headers: headers, cache: "no-store" });
      if (!response.ok) throw new Error("Messages fetch failed");
      var data = await response.json();
      if (!data.messages || !data.messages.length) {
        container.innerHTML = emptyState("No messages yet — leave one for the team.");
        if (countEl) countEl.textContent = "0 messages";
        return;
      }
      if (countEl) countEl.textContent = data.messages.length + " message" + (data.messages.length !== 1 ? "s" : "");
      if (syncNote) syncNote.hidden = false;
      container.innerHTML = data.messages.map(function (msg) {
        var roleClass = msg.role === "sales" ? "sales" : "";
        var initials = (msg.author || "?").slice(0, 2).toUpperCase();
        var deleteBtn = '<button class="msg-delete" title="Remove message" data-id="' + escapeHtml(msg.id) + '" aria-label="Delete message">×</button>';
        return '<div class="message-item' + (roleClass ? " " + roleClass : "") + '">'
          + '<span class="msg-avatar">' + escapeHtml(initials) + '</span>'
          + '<div class="message-body">'
          + '<div class="msg-meta"><span class="msg-author">' + escapeHtml(msg.author) + '</span>'
          + '<span class="msg-role' + (roleClass ? " " + roleClass : "") + '">' + escapeHtml(msg.role) + '</span>'
          + '<span class="msg-time">' + timeAgo(msg.timestamp) + '</span></div>'
          + '<p class="msg-text">' + escapeHtml(msg.text) + '</p>'
          + '</div>'
          + deleteBtn
          + '</div>';
      }).join("");

      // Wire delete buttons
      $$(".msg-delete", container).forEach(function (btn) {
        btn.addEventListener("click", function () {
          deleteMessage(btn.dataset.id, btn.closest(".message-item"));
        });
      });
    } catch (err) {
      container.innerHTML = emptyState("Messages unavailable — the worker may need redeploying with the KV namespace.");
    }
  }

  async function postMessage(text) {
    if (!workerUrl) return;
    try {
      var headers = authHeaders();
      headers["Content-Type"] = "application/json";
      var response = await fetch(workerUrl + "/messages", {
        method: "POST",
        headers: headers,
        body: JSON.stringify({ text: text })
      });
      if (!response.ok) {
        var data = await response.json().catch(function () { return {}; });
        throw new Error(data.error || "Failed to send");
      }
      loadMessages();
    } catch (err) {
      showToast(err.message || "Could not send message. Try again.");
    }
  }

  async function deleteMessage(id, element) {
    if (!workerUrl) return;
    try {
      var headers = authHeaders();
      var response = await fetch(workerUrl + "/messages/" + encodeURIComponent(id), {
        method: "DELETE",
        headers: headers
      });
      if (!response.ok) {
        var data = await response.json().catch(function () { return {}; });
        throw new Error(data.error || "Could not delete message");
      }
      if (element) element.remove();
      loadMessages();  // Refresh the count
    } catch (err) {
      showToast(err.message || "Could not delete message.");
    }
  }

  function setupMessages() {
    var form = $("#message-form");
    var input = $("#message-input");
    var button = $("#message-submit");
    if (!form || !workerUrl) return;

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var text = input.value.trim();
      if (!text) return;
      button.disabled = true;
      button.textContent = "Sending…";
      input.disabled = true;
      postMessage(text).then(function () {
        input.value = "";
        button.disabled = false;
        button.textContent = "Send";
        input.disabled = false;
        input.focus();
      }).catch(function () {
        button.disabled = false;
        button.textContent = "Send";
        input.disabled = false;
      });
    });

    // Load messages immediately
    loadMessages();
  }

  // ── Documents ──────────────────────────────────────────────────

  function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return "0 B";
    var units = ["B", "KB", "MB", "GB"];
    var i = Math.floor(Math.log(bytes) / Math.log(1024));
    if (i > 3) i = 3;
    return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + " " + units[i];
  }

  function isListedFile(entry) {
    return entry.type === "file" && entry.name.toLowerCase() !== "index.md";
  }

  function renderFileItem(file) {
    // A plain <a> can't attach the session token, so files open via
    // openDocument(), which fetches with auth and shows them in the viewer dialog.
    return '<button type="button" class="doc-file-item" data-download-path="' + escapeHtml(file.path) + '" data-size="' + (file.size || 0) + '">'
      + '<span class="doc-file-icon" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg></span>'
      + '<span class="doc-file-info"><strong class="doc-file-name">' + escapeHtml(file.name) + '</strong><small class="doc-file-meta">' + formatFileSize(file.size) + '</small></span>'
      + '<span class="doc-file-download">View <span aria-hidden="true">↗</span></span>'
      + '</button>';
  }

  // ── Document viewer ─────────────────────────────────────────────
  var viewerUrl = null;
  var viewerName = null;

  function viewerPreviewType(name) {
    var ext = (name.split(".").pop() || "").toLowerCase();
    if (["png", "jpg", "jpeg", "gif", "webp", "svg"].indexOf(ext) !== -1) return "image";
    if (ext === "pdf") return "pdf";
    if (["txt", "md", "csv", "log"].indexOf(ext) !== -1) return "text";
    return "other";
  }

  function viewerCleanup() {
    if (viewerUrl) {
      URL.revokeObjectURL(viewerUrl);
      viewerUrl = null;
      viewerName = null;
    }
  }

  function viewerDownload() {
    if (!viewerUrl || !viewerName) return;
    var a = document.createElement("a");
    a.href = viewerUrl;
    a.download = viewerName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function viewerClose() {
    var viewer = $("#doc-viewer-dialog");
    if (viewer && viewer.open) viewer.close();
    viewerCleanup();
  }

  async function openDocument(path, size) {
    if (!workerUrl) return;
    var viewer = $("#doc-viewer-dialog");
    var body = $("#doc-viewer-body");
    var meta = $("#doc-viewer-meta");
    var title = $("#doc-viewer-title");
    if (!viewer || !body || !meta || !title) return;

    var name = path.split("/").pop() || "document";
    title.textContent = name;
    meta.textContent = size ? formatFileSize(size) : "";
    body.innerHTML = '<p class="form-note">Loading…</p>';
    viewer.showModal();

    try {
      var response = await fetch(workerUrl + "/documents/download?path=" + encodeURIComponent(path), { headers: authHeaders(), cache: "no-store" });
      if (!response.ok) {
        var err = await response.json().catch(function () { return {}; });
        body.innerHTML = emptyState(err.error || "Could not load file");
        return;
      }
      var blob = await response.blob();
      viewerUrl = URL.createObjectURL(blob);
      viewerName = name;

      var type = viewerPreviewType(name);
      if (type === "image") {
        body.innerHTML = '<img class="doc-viewer-img" src="' + viewerUrl + '" alt="' + escapeHtml(name) + '">';
      } else if (type === "pdf") {
        body.innerHTML = '<iframe class="doc-viewer-frame" src="' + viewerUrl + '" title="' + escapeHtml(name) + '"></iframe>';
      } else if (type === "text") {
        var text = await blob.text();
        body.innerHTML = '<pre class="doc-viewer-text">' + escapeHtml(text) + '</pre>';
      } else {
        body.innerHTML = emptyState("No preview for ." + escapeHtml((name.split(".").pop() || "file")) + " files — use Download to save it.");
      }
    } catch (err) {
      body.innerHTML = emptyState("Could not load file");
    }
  }

  function docGroup(name, files) {
    if (!files.length) return "";
    return '<div class="doc-directory-group"><p class="doc-directory-name">' + escapeHtml(name) + '</p>'
      + files.map(renderFileItem).join("") + '</div>';
  }

  async function loadDocuments() {
    var container = $("#document-list");
    if (!container) return;
    if (!workerUrl) {
      container.innerHTML = emptyState("Documents are available when the worker proxy is configured.");
      return;
    }
    var docConfig = config.documents || {};
    var folder = docConfig.folder || "docs";

    container.innerHTML = emptyState("Loading documents…");

    try {
      var headers = authHeaders();
      var response = await fetch(workerUrl + "/documents?path=" + encodeURIComponent(folder), { headers: headers, cache: "no-store" });
      if (!response.ok) throw new Error("Documents fetch failed");
      var data = await response.json();
      var entries = data.entries || [];

      if (!entries.length) {
        container.innerHTML = emptyState("No documents yet — upload one to get started.");
        return;
      }

      var directories = entries.filter(function (entry) { return entry.type === "dir"; });
      var rootFiles = entries.filter(isListedFile);

      var html = docGroup(folder + " (root)", rootFiles);

      // Fetch each subdirectory's contents so files are grouped under their folder
      var dirResults = await Promise.all(directories.map(function (dir) {
        return fetch(workerUrl + "/documents?path=" + encodeURIComponent(dir.path), { headers: headers, cache: "no-store" })
          .then(function (r) { return r.ok ? r.json() : { entries: [] }; })
          .catch(function () { return { entries: [] }; });
      }));

      directories.forEach(function (dir, i) {
        var files = (dirResults[i].entries || []).filter(isListedFile);
        html += docGroup(dir.path, files);
      });

      container.innerHTML = html || emptyState("No documents found.");
    } catch (err) {
      container.innerHTML = emptyState("Documents unavailable — the worker may need redeploying with document routes.");
    }
  }

  function setupDocuments() {
    if (!workerUrl) return;

    var dialog = $("#upload-dialog");
    var form = $("#upload-form");
    var dirPicker = $("#dir-picker");
    var fileStep = $("#upload-step-file");
    var fileDropZone = $("#file-drop-zone");
    var fileInput = $("#file-input");
    var fileDropText = $("#file-drop-text");
    var fileSelected = $("#file-selected");
    var destLabel = $("#upload-dest-label");
    var submitBtn = $("#submit-upload");
    var progressStep = $("#upload-step-progress");
    var uploadStatus = $("#upload-status");
    var progressBar = $("#upload-progress-bar");
    var docConfig = config.documents || {};
    var folder = docConfig.folder || "docs";
    var selectedDir = null;

    // Delegated listener so it survives loadDocuments() re-rendering the list
    var docList = $("#document-list");
    if (docList) {
      docList.addEventListener("click", function (e) {
        var row = e.target.closest ? e.target.closest("[data-download-path]") : null;
        if (!row) return;
        e.preventDefault();
        openDocument(row.getAttribute("data-download-path"), parseInt(row.getAttribute("data-size"), 10) || 0);
      });
    }

    // Viewer dialog controls
    var viewer = $("#doc-viewer-dialog");
    if (viewer) {
      var viewerCloseBtn = $("#doc-viewer-close");
      var viewerCloseBtn2 = $("#doc-viewer-close-btn");
      var viewerDownloadBtn = $("#doc-viewer-download");
      if (viewerCloseBtn) viewerCloseBtn.addEventListener("click", viewerClose);
      if (viewerCloseBtn2) viewerCloseBtn2.addEventListener("click", viewerClose);
      if (viewerDownloadBtn) viewerDownloadBtn.addEventListener("click", viewerDownload);
      viewer.addEventListener("close", viewerCleanup);
    }

    function selectDir(dirPath) {
      selectedDir = dirPath;
      $$(".dir-option", dirPicker).forEach(function (btn) {
        btn.setAttribute("aria-current", btn.dataset.dir === dirPath ? "true" : "false");
      });
      destLabel.textContent = dirPath ? "/" + dirPath : "";
      fileStep.hidden = false;
      updateSubmitState();
    }

    function updateSubmitState() {
      submitBtn.disabled = !(selectedDir && fileInput.files && fileInput.files.length > 0);
    }

    function handleFileSelected(file) {
      if (!file) { updateSubmitState(); return; }
      fileSelected.hidden = false;
      fileSelected.textContent = file.name + " · " + formatFileSize(file.size);
      fileDropText.textContent = file.name;
      updateSubmitState();
    }

    function resetDialog() {
      selectedDir = null;
      fileInput.value = "";
      fileInput.files = new DataTransfer().files;
      fileStep.hidden = true;
      progressStep.hidden = true;
      progressBar.value = 0;
      fileSelected.hidden = true;
      fileDropText.textContent = "Drag a file here or click to browse";
      submitBtn.disabled = true;
      submitBtn.textContent = "Upload";
    }

    async function loadDirOptions() {
      dirPicker.innerHTML = '<button type="button" class="dir-option" disabled>Loading directories…</button>';
      try {
        var headers = authHeaders();
        var response = await fetch(workerUrl + "/documents?path=" + encodeURIComponent(folder), { headers: headers, cache: "no-store" });
        if (!response.ok) throw new Error("Failed to load directories");
        var data = await response.json();
        var dirs = (data.entries || []).filter(function (entry) { return entry.type === "dir"; });

        var html = '<button type="button" class="dir-option dir-option-root" data-dir="' + escapeHtml(folder) + '">' + escapeHtml(folder) + " (root)</button>";
        html += dirs.map(function (dir) {
          return '<button type="button" class="dir-option" data-dir="' + escapeHtml(dir.path) + '">' + escapeHtml(dir.name) + '</button>';
        }).join("");

        dirPicker.innerHTML = html;
        $$(".dir-option", dirPicker).forEach(function (btn) {
          btn.addEventListener("click", function () { selectDir(btn.dataset.dir); });
        });
        selectDir(folder);  // default to the docs/ root
      } catch (err) {
        dirPicker.innerHTML = '<button type="button" class="dir-option" disabled>Could not load directories — try again.</button>';
      }
    }

    // Open the dialog and load the directory list
    $$('[data-dialog="upload-dialog"]').forEach(function (button) {
      button.addEventListener("click", function () {
        resetDialog();
        dialog.showModal();
        loadDirOptions();
      });
    });

    // File drop zone: click or drag-and-drop
    fileDropZone.addEventListener("click", function () { fileInput.click(); });
    fileDropZone.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); fileInput.click(); }
    });
    ["dragenter", "dragover"].forEach(function (name) {
      fileDropZone.addEventListener(name, function (event) { event.preventDefault(); fileDropZone.classList.add("dragover"); });
    });
    ["dragleave", "drop"].forEach(function (name) {
      fileDropZone.addEventListener(name, function (event) { event.preventDefault(); fileDropZone.classList.remove("dragover"); });
    });
    fileDropZone.addEventListener("drop", function (event) {
      var files = event.dataTransfer && event.dataTransfer.files;
      if (files && files.length) {
        fileInput.files = files;
        handleFileSelected(files[0]);
      }
    });
    fileInput.addEventListener("change", function () { handleFileSelected(fileInput.files && fileInput.files[0]); });

    // Upload
    form.addEventListener("submit", function (event) {
      if (event.submitter && event.submitter.value === "cancel") return;
      event.preventDefault();
      var file = fileInput.files && fileInput.files[0];
      if (!file || !selectedDir) return;

      submitBtn.disabled = true;
      submitBtn.textContent = "Uploading…";
      fileStep.hidden = true;
      progressStep.hidden = false;
      uploadStatus.textContent = "Reading file…";

      var reader = new FileReader();
      reader.onprogress = function (e) {
        if (e.lengthComputable) progressBar.value = Math.round((e.loaded / e.total) * 100);
      };
      reader.onload = function () {
        var base64 = String(reader.result).split(",")[1];
        if (!base64) {
          showToast("Could not read the file. Try again.");
          resetDialog();
          dialog.close();
          return;
        }
        uploadStatus.textContent = "Uploading…";
        progressBar.removeAttribute("value");  // indeterminate while the request is in flight

        var headers = authHeaders();
        headers["Content-Type"] = "application/json";
        fetch(workerUrl + "/documents", {
          method: "POST",
          headers: headers,
          body: JSON.stringify({ path: selectedDir, filename: file.name, content: base64 })
        })
          .then(function (response) {
            if (response.ok) return response.json();
            return response.json().then(function (data) {
              throw new Error(data.error || "Upload failed");
            });
          })
          .then(function () {
            showToast("File uploaded successfully");
            dialog.close();
            form.reset();
            loadDocuments();
          })
          .catch(function (err) {
            showToast(err.message || "Could not upload file. Check your connection.");
            dialog.close();
          });
      };
      reader.onerror = function () {
        showToast("Could not read the file. Try again.");
        resetDialog();
        dialog.close();
      };
      reader.readAsDataURL(file);
    });

    // Reset state whenever the dialog closes (cancel, submit, backdrop)
    dialog.addEventListener("close", resetDialog);

    loadDocuments();
  }

  function showToast(message) { const toast = $("#toast"); toast.textContent = message; toast.classList.add("show"); setTimeout(() => toast.classList.remove("show"), 2600); }

  function storedTheme() { try { return localStorage.getItem("theme"); } catch (error) { return null; } }
  function setupTheme() {
    const root = document.documentElement;
    const toggle = $("#theme-toggle");
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = theme => { root.dataset.theme = theme; toggle.setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme"); };
    apply(root.dataset.theme === "dark" ? "dark" : "light");
    toggle.addEventListener("click", () => {
      const next = root.dataset.theme === "dark" ? "light" : "dark";
      apply(next);
      try { localStorage.setItem("theme", next); } catch (error) { /* storage unavailable */ }
    });
    media.addEventListener("change", event => { if (!storedTheme()) apply(event.matches ? "dark" : "light"); });
  }

  const now = new Date();
  const hour = now.getHours();
  $("#today-label").textContent = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  $("#hero-greeting").textContent = `Good ${hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}, team.`;
  $("#month-label").textContent = now.toLocaleDateString(undefined, { month: "long" });
  setupTheme(); renderStaticData(); configureLinks(); setupInteractions(); setupMessages(); setupDocuments(); loadGitHubData();
})();
