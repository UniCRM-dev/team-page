window.DASHBOARD_CONFIG = {
  companyName: "UniCRM",
  github: {
    owner: "UniCRM-dev",
    repos: {
      product: "connectors",
      operations: "wiki",
      sales: "web",
      ideas: "team-page-portal",
      polls: "team-page-portal",
      announcements: "team-page-portal",
      documents: "wiki"
    },
    projectNumber: 2,
    taskProjectNumber: 2,
    labels: { priority: "priority", blocker: "blocked", milestone: "milestone", decision: "decision", feedback: "customer-feedback" }
  },
  discussions: {
    categories: { announcements: "announcements", ideas: "ideas", polls: "polls", general: "general" }
  },
  documents: {
    repo: "wiki",
    folder: "docs"
  },
  ideas: [
    { title: "Automate the weekly pipeline digest into Slack", area: "Operations", submittedBy: "Chelsey", date: "2026-07-29" },
    { title: "Self-serve demo sandbox for prospects", area: "Sales", submittedBy: "Courtney", date: "2026-07-24" },
    { title: "Public changelog for customer releases", area: "Product", submittedBy: "Jesse", date: "2026-07-18" }
  ],
  schedule: [
    { time: "9:30", period: "AM", title: "Weekly team sync", meta: "Mon · 45 min", tone: "blue" },
    { time: "2:00", period: "PM", title: "Partner discovery", meta: "Wed · Courtney, Chelsey", tone: "teal" },
    { time: "11:00", period: "AM", title: "Sprint review", meta: "Fri · All team", tone: "slate" }
  ],
  pipeline: [
    ["Prospecting", 18, 100],
    ["Qualified", 9, 62],
    ["Proposal", 5, 40],
    ["Negotiation", 3, 25]
  ],
  team: [
    { name: "Shawn", role: "Developer", initials: "SH", github: "ShawnTamez8" },
    { name: "Jesse", role: "Developer", initials: "JE", github: "jf26028" },
    { name: "Courtney", role: "Sales", initials: "CO" },
    { name: "Chelsey", role: "Sales", initials: "CH" }
  ],
  worker: {
    url: "https://unicrm-dashboard-proxy.shawntamez.workers.dev",
    loginPage: "login.html"
  },
  refreshSeconds: 60
};
