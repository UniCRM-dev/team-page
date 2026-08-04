(function () {
  "use strict";
  const config = window.DASHBOARD_CONFIG || {};
  const gh = config.github || {};
  const owner = gh.owner || "YOUR_GITHUB_ORG";
  const repos = gh.repos || {};
  const labels = gh.labels || {};
  const configured = owner !== "YOUR_GITHUB_ORG";
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
    set("#decisions-link", configured ? issuesUrl(repos.operations, "is:issue label:decision") : org);
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

  async function github(path) {
    const response = await fetch(`https://api.github.com${path}`, { headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" } });
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
    const decisions = all.filter(isDecision).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
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

    $("#decision-list").innerHTML = decisions.slice(0, 5).map(issue => {
      const ownerName = issueOwner(issue);
      return `<a class="decision-item" href="${issue.html_url}" target="_blank" rel="noopener"><time>${monthDay(issue.created_at)}</time><div><h3>${escapeHtml(issue.title)}</h3><p>${escapeHtml(issueBody(issue, 100))}</p><small>Decided by ${escapeHtml(ownerName)}</small></div><span class="arrow">↗</span></a>`;
    }).join("") || emptyState(`Open an issue labeled "${labels.decision}" to record a decision.`);

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
    $("#idea-form").addEventListener("submit", event => {
      if (event.submitter && event.submitter.value === "cancel") return;
      event.preventDefault();
      if (!event.currentTarget.reportValidity()) return;
      const title = $("#idea-title-input").value.trim();
      const body = `## Problem or opportunity\n${$("#idea-problem").value.trim()}\n\n## Area\n${$("#idea-area").value}\n\n## Submitted by\n${$("#idea-owner").value}\n\n---\nSubmitted from the company operations dashboard.`;
      const ideasSlug = ((config.discussions || {}).categories || {}).ideas || "ideas";
      const url = configured ? newDiscussion(ideasSlug, title, body) : "https://github.com/";
      window.open(url, "_blank", "noopener");
      const submitted = storedIdeas();
      submitted.unshift({ title, area: $("#idea-area").value, submittedBy: $("#idea-owner").value, date: new Date().toISOString() });
      try { localStorage.setItem(IDEA_STORAGE_KEY, JSON.stringify(submitted)); } catch (error) { /* storage unavailable */ }
      renderStaticData();
      dialog.close(); event.currentTarget.reset(); showToast("Idea prepared in GitHub Discussions");
    });
    const tabs = $$("[role=tab]");
    tabs.forEach(tab => tab.addEventListener("click", () => {
      tabs.forEach(t => { const selected = t === tab; t.setAttribute("aria-selected", selected); $(`#${t.getAttribute("aria-controls")}`).hidden = !selected; });
    }));
    const navLinks = $$('.side-nav a[href^="#"]');
    navLinks.forEach(link => link.addEventListener("click", () => navLinks.forEach(a => a.classList.toggle("active", a === link))));
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
  setupTheme(); renderStaticData(); configureLinks(); setupInteractions(); loadGitHubData();
})();
