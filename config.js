window.DASHBOARD_CONFIG = {
  companyName: "UniCRM",
  github: {
    owner: "UniCRM-dev",
    repos: {
      product: "portal",
      operations: "wiki",
      sales: "web",
      ideas: "skills"
    },
    projectNumber: 1,
    labels: { priority: "priority", blocker: "blocked", milestone: "milestone", decision: "decision", feedback: "customer-feedback" }
  },
  discussions: {
    categories: { announcements: "announcements", ideas: "ideas", polls: "polls", general: "general" }
  },
  poll: {
    question: "Should the partner beta launch in Sprint 09?",
    options: [
      { label: "Yes, on target", votes: 3 },
      { label: "Push to Sprint 10", votes: 1 },
      { label: "Not ready", votes: 0 }
    ]
  },
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
  ]
};
