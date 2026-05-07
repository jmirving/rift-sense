export function buildDefaultGoalDashboard() {
  return {
    activePersonalGoal: {
      id: "goal-adc-die-less",
      title: "Die Less",
      scope: "personal",
      role: "ADC",
      status: "active",
      summary:
        "Reduce preventable deaths so ADC can keep farming, preserve tempo, and contribute damage in fights.",
      weeklyTargets: [
        "No 2v2 deaths",
        "No known gank/roam deaths",
        "No bad pre-6 all-ins"
      ],
      monthlyTargets: [
        "Climb ranked toward Emerald",
        "Show consistently improved lane phase",
        "Build matchup-specific trading knowledge"
      ],
      progressSummary: "3 preventable death patterns tagged this week; 2 clean disengages logged.",
      signals: [
        {
          id: "known-danger-deaths",
          label: "Known-danger roam/gank deaths",
          value: 1,
          trend: "needs-attention",
          description: "Enemy threat was visible or strongly implied before the death."
        },
        {
          id: "bad-trade-read",
          label: "Overestimated trade strength",
          value: 2,
          trend: "needs-attention",
          description: "Trades or all-ins where the matchup or wave state said no."
        },
        {
          id: "greed-wave",
          label: "Greed wave deaths or tempo losses",
          value: 1,
          trend: "watch",
          description: "Stayed for a wave and died, got chunked, or lost the next tempo window."
        },
        {
          id: "cs-present-missed",
          label: "CS missed while present",
          value: 12,
          trend: "watch",
          description: "Minions missed while in lane and able to last-hit."
        },
        {
          id: "clean-disengages",
          label: "Clean disengages",
          value: 2,
          trend: "positive",
          description: "Correctly respected danger and preserved life or tempo."
        }
      ]
    },
    todaysAction: {
      id: "action-review-last-game-deaths",
      title: "Review last game deaths",
      type: "review",
      estimatedMinutes: 5,
      reason:
        "Your active goal is Die Less, and death quality is the highest-impact signal to review first.",
      steps: [
        "Find each death in the last game.",
        "Tag the death: known danger, bad trade read, greed wave, mechanics, team call, or acceptable death.",
        "Write one sentence: what should I do next time?",
        "Mark one death pattern to remember before queueing again."
      ],
      ctaLabel: "Start 5-minute review",
      href: "/review"
    },
    activeTeamFocus: {
      id: "team-focus-dragon-setup",
      title: "Dragon Setup",
      scope: "team",
      status: "active",
      summary:
        "Improve objective setup discipline around dragon: waves, vision, arrival timing, and fight/trade/give calls.",
      practiceTopic: "90/60/30 objective setup calls",
      assignedReview: "Identify whether bot wave should be dropped before dragon.",
      signals: [
        {
          id: "late-objective-arrival",
          label: "Late objective arrival",
          value: 1,
          trend: "needs-attention"
        },
        {
          id: "failed-vision-retake",
          label: "Failed vision retake",
          value: 1,
          trend: "watch"
        },
        {
          id: "unclear-call",
          label: "Unclear fight/trade/give call",
          value: 2,
          trend: "needs-attention"
        }
      ],
      checklist: [
        "90s: decide reset/wave plan",
        "60s: confirm river access and vision state",
        "30s: call fight, trade, delay, or give",
        "On spawn: do not arrive late as half a team"
      ]
    },
    suggestedNextSteps: [
      {
        id: "next-review-deaths",
        title: "Review last game deaths",
        summary: "Tag each death against your Die Less signals before queueing again.",
        label: "Personal goal",
        href: "/review",
        source: "personal-goal"
      },
      {
        id: "next-adc-trading-tree",
        title: "Run ADC trading decision tree",
        summary: "Check whether the next all-in is matchup, wave, and cooldown supported.",
        label: "Training",
        href: "/training",
        source: "personal-goal"
      },
      {
        id: "next-dragon-checklist",
        title: "Refresh Dragon Setup checklist",
        summary: "Review the 90/60/30 calls before the next scrim or flex block.",
        label: "Team focus",
        href: "/team",
        source: "team-focus"
      },
      {
        id: "next-matchup-notes",
        title: "Open matchup notes",
        summary: "Use the library for lane notes that explain when pre-6 trades are actually winning.",
        label: "Library",
        href: "/library?topic=laning",
        source: "library"
      }
    ]
  };
}

function normalizeSignal(signal) {
  return {
    id: signal.id,
    label: signal.label,
    value: signal.value,
    trend: signal.trend ?? "unknown",
    description: signal.description ?? ""
  };
}

function normalizeGoal(goal, fallback) {
  const resolved = goal ?? fallback;

  return {
    ...resolved,
    weeklyTargets: resolved.weeklyTargets ?? [],
    monthlyTargets: resolved.monthlyTargets ?? [],
    signals: (resolved.signals ?? []).map(normalizeSignal)
  };
}

function normalizeAction(action, fallback) {
  const resolved = action ?? fallback;

  return {
    ...resolved,
    estimatedMinutes: Number(resolved.estimatedMinutes ?? 0),
    steps: resolved.steps ?? [],
    href: resolved.href ?? "/review"
  };
}

function normalizeTeamFocus(teamFocus, fallback) {
  const resolved = teamFocus ?? fallback;

  return {
    ...resolved,
    assignedReview: resolved.assignedReview ?? "",
    signals: (resolved.signals ?? []).map(normalizeSignal),
    checklist: resolved.checklist ?? []
  };
}

export function normalizeGoalDashboard(goalDashboard) {
  const fallback = buildDefaultGoalDashboard();
  const resolved = goalDashboard ?? {};

  return {
    activePersonalGoal: normalizeGoal(
      resolved.activePersonalGoal,
      fallback.activePersonalGoal
    ),
    todaysAction: normalizeAction(resolved.todaysAction, fallback.todaysAction),
    activeTeamFocus: normalizeTeamFocus(
      resolved.activeTeamFocus,
      fallback.activeTeamFocus
    ),
    suggestedNextSteps:
      Array.isArray(resolved.suggestedNextSteps) && resolved.suggestedNextSteps.length > 0
        ? resolved.suggestedNextSteps
        : fallback.suggestedNextSteps
  };
}
