export const team = {
  id: "team-1",
  name: "North Harbor Collective",
  mission: "Coordinate calm, shared goals across the team."
};

export const players = [
  { id: "player-1", name: "Avery Chen", role: "Facilitator" },
  { id: "player-2", name: "Jordan Patel", role: "Strategist" },
  { id: "player-3", name: "Riley Gomez", role: "Storyteller" },
  { id: "player-4", name: "Morgan Lee", role: "Analyst" },
  { id: "player-5", name: "Casey Kim", role: "Connector" }
];

export const rubricCategories = [
  {
    id: "rubric-1",
    title: "Shared Intent",
    description: "Alignment on what matters most and why."
  },
  {
    id: "rubric-2",
    title: "Collaboration Flow",
    description: "How smoothly work moves across the team."
  },
  {
    id: "rubric-3",
    title: "Support Signals",
    description: "Ways the team asks for and offers help."
  }
];

export const focusBlocks = [
  {
    id: "focus-1",
    title: "Gentle launch prep",
    intent: "Keep the rollout paced and supportive.",
    spotlight: "Onboarding, communication, and handoffs.",
    markdown: `### Focus prompts
- What will keep the day feeling steady?
- Where do we need extra clarity?
- Who needs a check-in?`
  }
];

export const plans = [
  {
    id: "plan-1",
    title: "Calm rollout plan",
    owner: "Avery Chen",
    summary: "Coordinate a low-stress rollout with clear support signals.",
    status: "Draft",
    updatedAt: "2025-02-01",
    shareSlug: "calm-rollout",
    core: {
      intention: "Keep the rollout steady while honoring everyone’s pace.",
      values: "Clarity, shared context, and space to pause.",
      scope: "Week 1 launch checklist with daily check-ins.",
      success: "Everyone knows where to ask for support and what comes next.",
      risks: "Unclear handoffs or last-minute pressure."
    },
    roleAssignments: [
      { id: "ra-1", role: "Lead", assignee: "Avery Chen" },
      { id: "ra-2", role: "Connector", assignee: "Casey Kim" }
    ],
    timeline: [
      { id: "ts-1", title: "Prep materials", date: "2025-02-03" },
      { id: "ts-2", title: "Check-in cadence", date: "2025-02-04" },
      { id: "ts-3", title: "Soft launch", date: "2025-02-06" }
    ],
    reviewNotes: [
      {
        id: "rn-1",
        author: "Jordan Patel",
        note: "Let’s add a gentle reminder about break coverage.",
        createdAt: "2025-02-02"
      }
    ]
  },
  {
    id: "plan-2",
    title: "Support handoff plan",
    owner: "Riley Gomez",
    summary: "Define a warm handoff flow for support requests.",
    status: "In progress",
    updatedAt: "2025-01-28",
    shareSlug: "support-handoff",
    core: {
      intention: "Make handoffs feel friendly and timely.",
      values: "Empathy and clarity.",
      scope: "Shared inbox and daily touch points.",
      success: "Requests move quickly without rework.",
      risks: "Dropped context between teammates."
    },
    roleAssignments: [
      { id: "ra-3", role: "Storyteller", assignee: "Riley Gomez" },
      { id: "ra-4", role: "Support", assignee: "Morgan Lee" }
    ],
    timeline: [
      { id: "ts-4", title: "Define intake", date: "2025-01-29" },
      { id: "ts-5", title: "Pilot handoff", date: "2025-02-01" }
    ],
    reviewNotes: []
  }
];
