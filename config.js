window.DASHBOARD_CONFIG = {
  companyName: "UniCRM",
  github: {
    owner: "UniCRM-dev",
    repos: {
      product: "connectors",
      operations: "wiki",
      sales: "web",
      ideas: "skills",
      documents: "wiki"
    },
    projectNumber: 1,
    labels: { priority: "priority", blocker: "blocked", milestone: "milestone", decision: "decision", feedback: "customer-feedback" }
  },
  discussions: {
    categories: { announcements: "announcements", ideas: "ideas", polls: "polls", general: "general" }
  },
  documents: {
    repo: "wiki",
    folder: "docs"
  },
  poll: {
    question: "Should the partner beta launch in Sprint 09?",
    options: [
      { label: "Yes, on target", votes: 3 },
      { label: "Push to Sprint 10", votes: 1 },
      { label: "Not ready", votes: 0 }
    ]
  },
  ideas: [
    { title: "Automate the weekly pipeline digest into Slack", area: "Operations", submittedBy: "Chelsey", date: "2026-07-29" },
    { title: "Self-serve demo sandbox for prospects", area: "Sales", submittedBy: "Courtney", date: "2026-07-24" },
    { title: "Public changelog for customer releases", area: "Product", submittedBy: "Jesse", date: "2026-07-18" }
  ],
  announcements: [
    { title: "Partner beta launch confirmed for Aug 14", body: "Sprint 09 ships the partner beta on schedule — final onboarding runs next week.", author: "Shawn", date: "2026-08-01", pinned: true },
    { title: "New customer-feedback label on issues", body: "Sales now tags field requests with customer-feedback so they surface on the dashboard.", author: "Courtney", date: "2026-07-28" }
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
    { name: "Shawn", role: "Developer", initials: "SH" },
    { name: "Jesse", role: "Developer", initials: "JE" },
    { name: "Courtney", role: "Sales", initials: "CO" },
    { name: "Chelsey", role: "Sales", initials: "CH" }
  ],
  worker: {
    url: "https://unicrm-dashboard-proxy.shawntamez.workers.dev",
    loginPage: "login.html"
  },
  refreshSeconds: 60
};
