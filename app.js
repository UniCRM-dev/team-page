(function () {
  "use strict";
  const config = window.DASHBOARD_CONFIG || {};
  const gh = config.github || {};
  const owner = gh.owner || "YOUR_GITHUB_ORG";
  const repos = gh.repos || {};
  const configured = owner !== "YOUR_GITHUB_ORG";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const repoUrl = repo => `https://github.com/${owner}/${repo}`;
  const issuesUrl = (repo, query = "") => `${repoUrl(repo)}/issues${query ? `?q=${encodeURIComponent(query)}` : ""}`;
  const escapeHtml = value => String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));

  const data = {
    priorities: [
      { title: "Launch partner beta", detail: "Complete onboarding flow and invite the first five partner teams.", owner: "Shawn", progress: 74, tone: "blue", repo: repos.product },
      { title: "Build qualified pipeline", detail: "Move eight target accounts into discovery before month end.", owner: "Courtney", progress: 58, tone: "teal", repo: repos.sales },
      { title: "Finalize impact reporting", detail: "Agree on baseline metrics and publish the reporting framework.", owner: "Chelsey", progress: 42, tone: "slate", repo: repos.operations }
    ],
    blockers: [
      { title: "Partner data agreement", owner: "Courtney", age: "2 days", severity: "high" },
      { title: "Email provider sandbox limits", owner: "Jesse", age: "Today", severity: "medium" }
    ],
    milestones: [
      { day: "14", month: "AUG", title: "Partner beta launch", detail: "Product · External milestone", state: "At risk", tone: "amber" },
      { day: "22", month: "AUG", title: "Q3 pipeline review", detail: "Sales · Internal review", state: "On track", tone: "green" },
      { day: "05", month: "SEP", title: "Impact report v1", detail: "Company · Board deliverable", state: "Planning", tone: "blue" }
    ],
    events: [
      { time: "9:30", period: "AM", title: "Weekly team sync", meta: "Mon · 45 min", tone: "blue" },
      { time: "2:00", period: "PM", title: "Partner discovery", meta: "Wed · Courtney, Chelsey", tone: "teal" },
      { time: "11:00", period: "AM", title: "Sprint review", meta: "Fri · All team", tone: "slate" }
    ],
    devTasks: [
      { title: "Complete partner onboarding flow", owner: "Shawn", status: "In progress", repo: repos.product },
      { title: "Resolve webhook retry failures", owner: "Jesse", status: "Blocked", repo: repos.product },
      { title: "Review access-control update", owner: "Shawn", status: "Review", repo: repos.product }
    ],
    salesTasks: [
      { title: "Send pilot scope to HopeWorks", owner: "Courtney", when: "Today", stage: "Proposal" },
      { title: "Discovery call with North County", owner: "Chelsey", when: "Tomorrow", stage: "Qualified" },
      { title: "Renewal check-in with Civic Lab", owner: "Courtney", when: "Aug 8", stage: "Negotiation" }
    ],
    decisions: [
      { date: "AUG 01", title: "Use GitHub Issues as the operational system of record", detail: "Keeps ownership and progress close to the work while this dashboard remains the shared view.", owner: "Shawn" },
      { date: "JUL 29", title: "Prioritize partner onboarding over reporting automation", detail: "The beta deadline has the highest near-term customer impact.", owner: "Team" }
    ]
  };

  function avatar(name) { return `<span class="avatar" title="${escapeHtml(name)}">${escapeHtml(name.slice(0, 2).toUpperCase())}</span>`; }
  function renderMockData() {
    $("#priority-list").innerHTML = data.priorities.map((p, i) => `<a class="priority-item" href="${configured ? issuesUrl(p.repo, "is:open label:priority") : "https://github.com/issues"}" target="_blank" rel="noopener"><span class="priority-number">0${i + 1}</span><div class="priority-copy"><h3>${escapeHtml(p.title)}</h3><p>${escapeHtml(p.detail)}</p><div class="priority-meta">${avatar(p.owner)}<span>${escapeHtml(p.owner)}</span><span class="mini-progress"><i class="${p.tone}" style="width:${p.progress}%"></i></span><b>${p.progress}%</b></div></div><span class="arrow">↗</span></a>`).join("");
    $("#blocker-list").innerHTML = data.blockers.map(b => `<a class="blocker-item" href="${configured ? issuesUrl(repos.operations, "is:open label:blocked") : "https://github.com/issues"}" target="_blank" rel="noopener"><span class="severity ${b.severity}">!</span><div><h3>${escapeHtml(b.title)}</h3><p>${avatar(b.owner)} ${escapeHtml(b.owner)} · ${escapeHtml(b.age)}</p></div><span class="arrow">→</span></a>`).join("");
    $("#milestone-list").innerHTML = data.milestones.map(m => `<a class="timeline-item" href="${configured ? issuesUrl(repos.operations, "is:open label:milestone") : "https://github.com/issues"}" target="_blank" rel="noopener"><time><strong>${m.day}</strong><span>${m.month}</span></time><div><h3>${escapeHtml(m.title)}</h3><p>${escapeHtml(m.detail)}</p></div><span class="pill ${m.tone}">${escapeHtml(m.state)}</span></a>`).join("");
    $("#event-list").innerHTML = data.events.map(e => `<div class="event-item ${e.tone}"><time><strong>${e.time}</strong><span>${e.period}</span></time><div><h3>${escapeHtml(e.title)}</h3><p>${escapeHtml(e.meta)}</p></div></div>`).join("");
    $("#dev-task-list").innerHTML = data.devTasks.map(t => `<tr><td><a href="${configured ? issuesUrl(t.repo, `is:open ${t.title}`) : "https://github.com/issues"}" target="_blank" rel="noopener">${escapeHtml(t.title)}</a></td><td><span class="owner-cell">${avatar(t.owner)} ${escapeHtml(t.owner)}</span></td><td><span class="pill ${t.status === "Blocked" ? "red" : t.status === "Review" ? "blue" : "green"}">${escapeHtml(t.status)}</span></td><td>${escapeHtml(t.repo || "product-core")}</td></tr>`).join("");
    $("#sales-task-list").innerHTML = data.salesTasks.map(t => `<tr><td>${escapeHtml(t.title)}</td><td><span class="owner-cell">${avatar(t.owner)} ${escapeHtml(t.owner)}</span></td><td>${escapeHtml(t.when)}</td><td><span class="pill blue">${escapeHtml(t.stage)}</span></td></tr>`).join("");
    $("#pipeline-bars").innerHTML = [["Prospecting", 18, 100], ["Qualified", 9, 62], ["Proposal", 5, 40], ["Negotiation", 3, 25]].map(([label, count, width]) => `<div class="pipeline-row"><span>${label}</span><div><i style="width:${width}%"></i></div><b>${count}</b></div>`).join("");
    $("#decision-list").innerHTML = data.decisions.map(d => `<a class="decision-item" href="${configured ? issuesUrl(repos.operations, "is:issue label:decision") : "https://github.com/issues"}" target="_blank" rel="noopener"><time>${d.date}</time><div><h3>${escapeHtml(d.title)}</h3><p>${escapeHtml(d.detail)}</p><small>Decided by ${escapeHtml(d.owner)}</small></div><span class="arrow">↗</span></a>`).join("");
  }

  function configureLinks() {
    const org = configured ? `https://github.com/${owner}` : "https://github.com/";
    const project = configured ? `https://github.com/orgs/${owner}/projects/${gh.projectNumber || 1}` : org;
    const set = (id, url) => { const el = $(id); if (el) el.href = url; };
    $("#company-name").textContent = $("#footer-company").textContent = config.companyName || "Northstar";
    document.title = `${config.companyName || "Northstar"} Operations`;
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
    const repositoryLinks = [["Product Core", repos.product], ["Company Ops", repos.operations], ["Sales Pipeline", repos.sales], ["Ideas", repos.ideas]];
    $("#sidebar-repositories").innerHTML = repositoryLinks.map(([name, repo]) => `<a href="${configured ? repoUrl(repo) : "https://github.com/"}" target="_blank" rel="noopener"><span class="repo-indicator" aria-hidden="true"></span><span>${escapeHtml(name)}</span><b aria-hidden="true">↗</b></a>`).join("");
    const links = [["Notes & handbook", repos.operations, "Company context and playbooks"], ["Ideas inbox", repos.ideas, "Proposals and opportunities"], ["Customer feedback", repos.sales, "Requests from the field"]];
    $("#quick-links").innerHTML = links.map(([name, repo, desc]) => `<a href="${configured ? repoUrl(repo) : "https://github.com/"}" target="_blank" rel="noopener"><span class="quick-icon">${name.charAt(0)}</span><span><strong>${name}</strong><small>${desc}</small></span><b>↗</b></a>`).join("");
  }

  async function github(path) {
    const response = await fetch(`https://api.github.com${path}`, { headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" } });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    return response.json();
  }
  async function loadGitHubData() {
    if (!configured || !repos.product) return;
    try {
      const [repo, pulls, releases, runs] = await Promise.all([
        github(`/repos/${owner}/${repos.product}`),
        github(`/repos/${owner}/${repos.product}/pulls?state=open&per_page=100`),
        github(`/repos/${owner}/${repos.product}/releases?per_page=1`),
        github(`/repos/${owner}/${repos.product}/actions/runs?per_page=1`)
      ]);
      $("#open-issues").textContent = repo.open_issues_count;
      $("#open-prs").textContent = pulls.length;
      $("#pr-note").textContent = `${pulls.filter(p => p.requested_reviewers && p.requested_reviewers.length).length} waiting review`;
      if (releases[0]) { $("#latest-release").textContent = releases[0].tag_name; $("#release-note").textContent = new Date(releases[0].published_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
      if (runs.workflow_runs && runs.workflow_runs[0]) { const ok = runs.workflow_runs[0].conclusion === "success"; $("#build-health").innerHTML = `<i></i> ${ok ? "Passing" : "Needs attention"}`; $("#build-health").classList.toggle("failed", !ok); $("#build-note").textContent = runs.workflow_runs[0].name; }
      $("#sync-state").innerHTML = "<i></i> Live from GitHub"; $("#sync-state").classList.add("live");
      $("#last-updated").textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    } catch (error) { $("#sync-state").title = "Live data unavailable; showing the built-in dashboard examples."; }
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
      const base = configured ? `${repoUrl(repos.ideas)}/issues/new` : "https://github.com/issues/new";
      window.open(`${base}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=${encodeURIComponent("idea")}`, "_blank", "noopener");
      dialog.close(); event.currentTarget.reset(); showToast("Idea prepared in GitHub");
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
  setupTheme(); renderMockData(); configureLinks(); setupInteractions(); loadGitHubData();
})();
