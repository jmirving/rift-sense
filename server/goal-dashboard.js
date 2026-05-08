/**
 * @typedef {"Top" | "Jungle" | "Mid" | "ADC" | "Support" | "Multiple"} Role
 * @typedef {{ signalId: string, targetValue: number, label?: string }} TargetTemplate
 * @typedef {{ id: string, title: string, role?: Role, scope: "personal" | "team", category: string, description: string, defaultSignalIds: string[], defaultActionIds: string[], relatedContentIds: string[], suggestedWeeklyTargets?: TargetTemplate[] }} GoalTemplate
 * @typedef {{ id: string, label: string, type: "count" | "rating" | "boolean" | "note", polarity: "positive" | "negative" | "neutral", description: string, reviewPrompt?: string, roles?: Role[], categories?: string[] }} SignalTemplate
 * @typedef {{ id: string, title: string, type: "review" | "lesson" | "drill" | "checklist" | "reflection", estimatedMinutes: number, description: string, steps: string[], producesSignalIds?: string[], linkedGoalTemplateIds?: string[], linkedTeamFocusTemplateIds?: string[], ctaLabel?: string, href?: string }} ActionTemplate
 * @typedef {{ id: string, title: string, type: "lesson" | "checklist" | "decision-tree" | "drill" | "reference", roles?: Role[], categories: string[], linkedGoalTemplateIds?: string[], linkedTeamFocusTemplateIds?: string[], summary: string, body: string }} ContentTemplate
 * @typedef {{ id: string, title: string, category: string, description: string, defaultChecklist: string[], defaultSignalIds: string[], defaultActionIds: string[], relatedContentIds: string[], practiceTopic?: string, assignedReview?: string }} TeamFocusTemplate
 * @typedef {{ signalId: string, targetValue: number, currentValue?: number | null, status?: "on-track" | "missed" | "needs-review", label?: string }} ActiveTarget
 * @typedef {{ id: string, templateId: string, ownerType: "player" | "team", ownerId: string, status: "active" | "paused" | "completed", activeSince: string, weeklyTargets: ActiveTarget[], selectedSignalIds: string[], selectedActionIds: string[] }} ActiveGoalInstance
 * @typedef {{ id: string, templateId: string, ownerType: "team", ownerId: string, status: "active" | "paused" | "completed", activeSince: string, selectedSignalIds: string[], selectedActionIds: string[], checklist?: string[] }} ActiveTeamFocusInstance
 * @typedef {{ id: string, ownerId: string, sourceType: "solo-queue" | "scrim" | "vod" | "manual", matchId?: string, timestampInGame?: string, signalId: string, goalInstanceId?: string, teamFocusInstanceId?: string, value: number | string | boolean, note?: string, createdAt: string }} EvidenceEvent
 * @typedef {{ id: string, actionTemplateId: string, reason: string, linkedGoalInstanceId?: string, linkedTeamFocusInstanceId?: string, priority: "low" | "medium" | "high" }} Recommendation
 */

const goalTemplates = [
  {
    id: "goal-template-adc-die-less",
    title: "Die Less",
    role: "ADC",
    scope: "personal",
    category: "survivability",
    description:
      "Reduce preventable deaths while preserving farm, tempo, and teamfight output.",
    defaultSignalIds: [
      "signal-known-danger-death",
      "signal-bad-trade-read",
      "signal-greed-wave-death",
      "signal-cs-missed-while-present",
      "signal-clean-disengage"
    ],
    defaultActionIds: [
      "action-death-review-v1",
      "action-pregame-danger-check-v1"
    ],
    relatedContentIds: [
      "content-adc-survivability-basics",
      "content-adc-pre6-trading-check",
      "content-jungle-threat-awareness"
    ],
    suggestedWeeklyTargets: [
      {
        signalId: "signal-bad-2v2-death",
        targetValue: 0,
        label: "0 2v2 deaths"
      },
      {
        signalId: "signal-known-danger-death",
        targetValue: 0,
        label: "0 known gank deaths"
      },
      {
        signalId: "signal-bad-pre6-allin",
        targetValue: 0,
        label: "0 bad pre-6 all-ins"
      }
    ]
  },
  {
    id: "goal-template-adc-trading",
    title: "Trade Better",
    role: "ADC",
    scope: "personal",
    category: "lane-phase",
    description:
      "Take lane trades only when matchup, wave, cooldowns, and support position say yes.",
    defaultSignalIds: [
      "signal-bad-trade-read",
      "signal-bad-pre6-allin",
      "signal-clean-disengage"
    ],
    defaultActionIds: ["action-adc-pre6-trade-check-v1"],
    relatedContentIds: ["content-adc-pre6-trading-check"],
    suggestedWeeklyTargets: [
      {
        signalId: "signal-bad-pre6-allin",
        targetValue: 0,
        label: "0 bad pre-6 all-ins"
      }
    ]
  }
];

const signalTemplates = [
  {
    id: "signal-known-danger-death",
    label: "Known-danger death",
    type: "count",
    polarity: "negative",
    description:
      "A death where enemy threat was visible, pinged, or strongly inferable before the play.",
    reviewPrompt:
      "What information existed before the death, and what should have changed?",
    roles: ["ADC", "Support", "Mid", "Top", "Jungle"],
    categories: ["survivability", "awareness"]
  },
  {
    id: "signal-bad-trade-read",
    label: "Overestimated trade strength",
    type: "count",
    polarity: "negative",
    description:
      "Trades or all-ins where the matchup, wave state, or cooldown state said no.",
    roles: ["ADC", "Support", "Mid", "Top"],
    categories: ["trading", "lane-phase"]
  },
  {
    id: "signal-greed-wave-death",
    label: "Greed wave death",
    type: "count",
    polarity: "negative",
    description:
      "Stayed for a wave and died, got chunked, or lost the next tempo window.",
    roles: ["ADC", "Support", "Mid", "Top"],
    categories: ["tempo", "survivability"]
  },
  {
    id: "signal-cs-missed-while-present",
    label: "CS missed while present",
    type: "count",
    polarity: "negative",
    description: "Minions missed while in lane and able to last-hit.",
    roles: ["ADC", "Mid", "Top"],
    categories: ["farm", "lane-phase"]
  },
  {
    id: "signal-clean-disengage",
    label: "Clean disengage",
    type: "count",
    polarity: "positive",
    description: "Correctly respected danger and preserved life or tempo.",
    roles: ["ADC", "Support", "Mid", "Top", "Jungle"],
    categories: ["survivability", "awareness"]
  },
  {
    id: "signal-bad-2v2-death",
    label: "2v2 death",
    type: "count",
    polarity: "negative",
    description: "A lane 2v2 death that was avoidable from matchup, wave, or cooldown state.",
    roles: ["ADC", "Support"],
    categories: ["lane-phase", "survivability"]
  },
  {
    id: "signal-bad-pre6-allin",
    label: "Bad pre-6 all-in",
    type: "count",
    polarity: "negative",
    description: "A pre-6 all-in taken without the lane state to support it.",
    roles: ["ADC", "Support", "Mid", "Top"],
    categories: ["trading", "lane-phase"]
  },
  {
    id: "signal-late-objective-arrival",
    label: "Late objective arrival",
    type: "count",
    polarity: "negative",
    description: "Arrived late enough that the team could not contest or trade cleanly.",
    roles: ["ADC", "Support", "Mid", "Top", "Jungle"],
    categories: ["objective-control", "tempo"]
  },
  {
    id: "signal-failed-vision-retake",
    label: "Failed vision retake",
    type: "count",
    polarity: "negative",
    description: "Could not safely regain river or objective vision before the fight window.",
    roles: ["Support", "Jungle", "Mid"],
    categories: ["vision", "objective-control"]
  },
  {
    id: "signal-unclear-fight-trade-give-call",
    label: "Unclear fight/trade/give call",
    type: "count",
    polarity: "negative",
    description: "The team did not make one shared call before the objective spawned.",
    roles: ["ADC", "Support", "Mid", "Top", "Jungle"],
    categories: ["communication", "objective-control"]
  }
];

const actionTemplates = [
  {
    id: "action-death-review-v1",
    title: "Review last game deaths",
    type: "review",
    estimatedMinutes: 5,
    description:
      "Review each death and tag whether it was preventable, acceptable, or caused by a recurring pattern.",
    steps: [
      "Find each death in the last game.",
      "Tag the cause: known danger, bad trade read, greed wave, mechanics, team call, or acceptable death.",
      "Write one adjustment for next time.",
      "Pick one death pattern to remember before queueing again."
    ],
    producesSignalIds: [
      "signal-known-danger-death",
      "signal-bad-trade-read",
      "signal-greed-wave-death"
    ],
    linkedGoalTemplateIds: ["goal-template-adc-die-less"],
    ctaLabel: "Start 5-minute review",
    href: "/review"
  },
  {
    id: "action-pregame-danger-check-v1",
    title: "Run pre-game danger check",
    type: "checklist",
    estimatedMinutes: 3,
    description:
      "Name the enemy gank, roam, and all-in threats before lane starts.",
    steps: [
      "Name the first dangerous jungle timing.",
      "Name which support cooldown changes the lane.",
      "Decide the wave state where trading is allowed."
    ],
    linkedGoalTemplateIds: ["goal-template-adc-die-less"],
    ctaLabel: "Open checklist",
    href: "/training"
  },
  {
    id: "action-adc-pre6-trade-check-v1",
    title: "Run ADC pre-6 trade check",
    type: "drill",
    estimatedMinutes: 6,
    description:
      "Check support position, wave size, cooldowns, level timing, and jungle threat before forcing a trade.",
    steps: [
      "Check support position.",
      "Check wave size and level timing.",
      "Check key cooldowns.",
      "Check jungle or roam threat."
    ],
    producesSignalIds: ["signal-bad-trade-read", "signal-bad-pre6-allin"],
    linkedGoalTemplateIds: ["goal-template-adc-trading", "goal-template-adc-die-less"],
    ctaLabel: "Run trade check",
    href: "/training"
  },
  {
    id: "action-dragon-setup-review-v1",
    title: "Refresh Dragon Setup checklist",
    type: "checklist",
    estimatedMinutes: 4,
    description:
      "Review the 90/60/30 setup calls before the next scrim or flex block.",
    steps: [
      "90s: decide reset and wave plan.",
      "60s: confirm river access and vision state.",
      "30s: call fight, trade, delay, or give.",
      "On spawn: arrive as a team or commit to the trade."
    ],
    linkedTeamFocusTemplateIds: ["team-focus-template-dragon-setup"],
    ctaLabel: "Open team focus",
    href: "/team"
  }
];

const contentTemplates = [
  {
    id: "content-adc-survivability-basics",
    title: "ADC Survivability Basics",
    type: "lesson",
    roles: ["ADC"],
    categories: ["survivability", "lane-phase"],
    linkedGoalTemplateIds: ["goal-template-adc-die-less"],
    summary: "A compact review of when deaths are acceptable versus preventable.",
    body: "Preventable deaths usually have visible threat, an avoidable wave greed decision, or an unsupported trade."
  },
  {
    id: "content-adc-pre6-trading-check",
    title: "ADC Pre-6 Trading Check",
    type: "decision-tree",
    roles: ["ADC"],
    categories: ["trading", "lane-phase"],
    linkedGoalTemplateIds: ["goal-template-adc-die-less", "goal-template-adc-trading"],
    summary: "A quick check for whether a pre-6 trade is likely to be winning or dangerous.",
    body: "Before trading, check support position, cooldowns, wave size, level timing, and jungle threat."
  },
  {
    id: "content-jungle-threat-awareness",
    title: "Jungle Threat Awareness",
    type: "checklist",
    roles: ["ADC", "Support", "Mid", "Top"],
    categories: ["awareness", "survivability"],
    linkedGoalTemplateIds: ["goal-template-adc-die-less"],
    summary: "A checklist for tracking gank and roam windows before committing.",
    body: "Use ward state, last seen location, wave position, and lane priority before stepping forward."
  },
  {
    id: "content-dragon-setup-90-60-30",
    title: "Dragon Setup 90/60/30",
    type: "checklist",
    categories: ["objective-control", "team"],
    linkedTeamFocusTemplateIds: ["team-focus-template-dragon-setup"],
    summary: "Objective setup calls at 90, 60, and 30 seconds before spawn.",
    body: "Decide reset and wave plan, secure access, then make the fight/trade/give call before spawn."
  },
  {
    id: "content-wave-drop-before-objective",
    title: "Should Bot Wave Be Dropped?",
    type: "reference",
    roles: ["ADC", "Support"],
    categories: ["objective-control", "wave-management"],
    linkedTeamFocusTemplateIds: ["team-focus-template-dragon-setup"],
    summary: "A short reference for deciding whether bot wave can be sacrificed before dragon.",
    body: "Compare wave value, objective timing, enemy setup, and whether your team can arrive together."
  }
];

const teamFocusTemplates = [
  {
    id: "team-focus-template-dragon-setup",
    title: "Dragon Setup",
    category: "objective-control",
    description:
      "Improve objective setup discipline around dragon: waves, vision, arrival timing, and fight/trade/give calls.",
    practiceTopic: "90/60/30 objective setup calls",
    assignedReview: "Should bot wave be dropped before dragon?",
    defaultChecklist: [
      "90s: reset/wave plan",
      "60s: river access + vision state",
      "30s: fight / trade / delay / give",
      "Spawn: arrive as a team or commit to trade"
    ],
    defaultSignalIds: [
      "signal-late-objective-arrival",
      "signal-failed-vision-retake",
      "signal-unclear-fight-trade-give-call"
    ],
    defaultActionIds: ["action-dragon-setup-review-v1"],
    relatedContentIds: [
      "content-dragon-setup-90-60-30",
      "content-wave-drop-before-objective"
    ]
  }
];

const templateLibrary = {
  goalTemplates,
  signalTemplates,
  actionTemplates,
  contentTemplates,
  teamFocusTemplates
};

const trendBySignalId = {
  "signal-known-danger-death": "needs-attention",
  "signal-bad-trade-read": "needs-attention",
  "signal-greed-wave-death": "watch",
  "signal-cs-missed-while-present": "watch",
  "signal-clean-disengage": "positive",
  "signal-bad-2v2-death": "positive",
  "signal-bad-pre6-allin": "unknown",
  "signal-late-objective-arrival": "needs-attention",
  "signal-failed-vision-retake": "watch",
  "signal-unclear-fight-trade-give-call": "needs-attention"
};

function indexById(items) {
  return new Map(items.map((item) => [item.id, item]));
}

function findById(items, id) {
  return items.find((item) => item.id === id) ?? null;
}

function slug(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function todayIsoDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function normalizeStringArray(values) {
  return Array.isArray(values)
    ? values.map((value) => String(value ?? "").trim()).filter(Boolean)
    : [];
}

function sumEvidenceBySignal(evidenceEvents = []) {
  const totals = new Map();

  evidenceEvents.forEach((event) => {
    if (!event?.signalId) {
      return;
    }

    const numericValue =
      typeof event.value === "number"
        ? event.value
        : typeof event.value === "boolean"
          ? Number(event.value)
          : Number.parseFloat(String(event.value ?? ""));

    if (!Number.isFinite(numericValue)) {
      return;
    }

    totals.set(event.signalId, (totals.get(event.signalId) ?? 0) + numericValue);
  });

  return totals;
}

function targetStatus({ currentValue, targetValue }) {
  if (currentValue === null || currentValue === undefined) {
    return "needs-review";
  }
  return Number(currentValue) <= Number(targetValue) ? "on-track" : "missed";
}

function targetStatusLabel(status) {
  return {
    "on-track": "On track",
    missed: "Missed",
    "needs-review": "Needs review"
  }[status] ?? "Needs review";
}

function targetTrend(status) {
  return {
    "on-track": "positive",
    missed: "needs-attention",
    "needs-review": "unknown"
  }[status] ?? "unknown";
}

function resolveTargets(targets, signalIndex, evidenceTotals) {
  return (targets ?? []).map((target) => {
    const signal = signalIndex.get(target.signalId);
    const currentValue =
      target.currentValue !== undefined
        ? target.currentValue
        : evidenceTotals.has(target.signalId)
          ? evidenceTotals.get(target.signalId)
          : null;
    const status = target.status ?? targetStatus({
      currentValue,
      targetValue: target.targetValue
    });

    return {
      ...target,
      label: target.label ?? signal?.label ?? target.signalId,
      currentValue,
      status,
      statusLabel: targetStatusLabel(status),
      trend: targetTrend(status)
    };
  });
}

function resolveSignals(signalIds, signalIndex, evidenceTotals) {
  return signalIds
    .map((signalId) => signalIndex.get(signalId))
    .filter(Boolean)
    .map((signal) => {
      const value = evidenceTotals.has(signal.id) ? evidenceTotals.get(signal.id) : 0;
      return {
        id: signal.id,
        templateId: signal.id,
        label: signal.label,
        value,
        trend: trendBySignalId[signal.id] ?? "unknown",
        description: signal.description,
        type: signal.type,
        polarity: signal.polarity
      };
    });
}

function resolveAction(actionTemplate, recommendation) {
  if (!actionTemplate) {
    return null;
  }

  return {
    id: recommendation?.id ?? actionTemplate.id,
    templateId: actionTemplate.id,
    title: actionTemplate.title,
    type: actionTemplate.type,
    estimatedMinutes: actionTemplate.estimatedMinutes,
    reason: recommendation?.reason ?? actionTemplate.description,
    steps: actionTemplate.steps,
    ctaLabel: actionTemplate.ctaLabel ?? "Open",
    href: actionTemplate.href ?? "/review",
    priority: recommendation?.priority ?? "medium"
  };
}

function buildInsights({ goal, evidenceTotals }) {
  if (!goal) {
    return [];
  }

  const knownDangerDeaths = evidenceTotals.get("signal-known-danger-death") ?? 0;
  const badTradeReads = evidenceTotals.get("signal-bad-trade-read") ?? 0;
  const cleanDisengages = evidenceTotals.get("signal-clean-disengage") ?? 0;
  const insights = [];

  if (knownDangerDeaths > 0) {
    insights.push({
      id: "insight-known-threat",
      title: "Known threat is the main leak",
      summary:
        "Most preventable deaths this week came from respecting visible or inferable danger, not pure mechanics.",
      linkedGoalId: goal.id
    });
  }

  if (badTradeReads > 0) {
    insights.push({
      id: "insight-pre6-trading",
      title: "Trade checks need to happen earlier",
      summary:
        "Trading errors are showing up before level 6, so the next useful block is a pre-6 trade check.",
      linkedGoalId: goal.id
    });
  }

  if (cleanDisengages > 0) {
    insights.push({
      id: "insight-clean-disengages",
      title: "There is already a repeatable win",
      summary:
        "Clean disengages are being logged, which gives this goal a positive behavior to reinforce.",
      linkedGoalId: goal.id
    });
  }

  return insights.slice(0, 2);
}

export function getTemplateLibrary() {
  return {
    goalTemplates: goalTemplates.map((template) => ({ ...template })),
    signalTemplates: signalTemplates.map((template) => ({ ...template })),
    actionTemplates: actionTemplates.map((template) => ({ ...template })),
    contentTemplates: contentTemplates.map((template) => ({ ...template })),
    teamFocusTemplates: teamFocusTemplates.map((template) => ({ ...template }))
  };
}

export function buildDefaultGoalDashboardState(now = new Date()) {
  const activeSince = todayIsoDate(now);

  return {
    version: 1,
    activeGoalInstances: [
      {
        id: "active-goal-3nder-adc-die-less",
        templateId: "goal-template-adc-die-less",
        ownerType: "player",
        ownerId: "player-3nderwiggin",
        status: "active",
        activeSince,
        weeklyTargets: [
          { signalId: "signal-bad-2v2-death", targetValue: 0, currentValue: 0 },
          { signalId: "signal-known-danger-death", targetValue: 0 },
          { signalId: "signal-bad-pre6-allin", targetValue: 0 }
        ],
        selectedSignalIds: [
          "signal-known-danger-death",
          "signal-bad-trade-read",
          "signal-greed-wave-death",
          "signal-cs-missed-while-present",
          "signal-clean-disengage"
        ],
        selectedActionIds: ["action-death-review-v1"]
      }
    ],
    activeTeamFocusInstances: [
      {
        id: "active-team-focus-demo-dragon-setup",
        templateId: "team-focus-template-dragon-setup",
        ownerType: "team",
        ownerId: "team-nexus-demo",
        status: "active",
        activeSince,
        selectedSignalIds: [
          "signal-late-objective-arrival",
          "signal-failed-vision-retake",
          "signal-unclear-fight-trade-give-call"
        ],
        selectedActionIds: ["action-dragon-setup-review-v1"]
      }
    ],
    evidenceEvents: [
      {
        id: "evidence-known-danger-death",
        ownerId: "player-3nderwiggin",
        sourceType: "manual",
        signalId: "signal-known-danger-death",
        goalInstanceId: "active-goal-3nder-adc-die-less",
        value: 1,
        note: "Died to a roam that was visible on river ward before the fight.",
        createdAt: `${activeSince}T00:00:00.000Z`
      },
      {
        id: "evidence-bad-trade-read",
        ownerId: "player-3nderwiggin",
        sourceType: "manual",
        signalId: "signal-bad-trade-read",
        goalInstanceId: "active-goal-3nder-adc-die-less",
        value: 2,
        note: "Two pre-6 trades ignored wave or support position.",
        createdAt: `${activeSince}T00:00:00.000Z`
      },
      {
        id: "evidence-greed-wave-death",
        ownerId: "player-3nderwiggin",
        sourceType: "manual",
        signalId: "signal-greed-wave-death",
        goalInstanceId: "active-goal-3nder-adc-die-less",
        value: 1,
        createdAt: `${activeSince}T00:00:00.000Z`
      },
      {
        id: "evidence-cs-present-missed",
        ownerId: "player-3nderwiggin",
        sourceType: "manual",
        signalId: "signal-cs-missed-while-present",
        goalInstanceId: "active-goal-3nder-adc-die-less",
        value: 12,
        createdAt: `${activeSince}T00:00:00.000Z`
      },
      {
        id: "evidence-clean-disengage",
        ownerId: "player-3nderwiggin",
        sourceType: "manual",
        signalId: "signal-clean-disengage",
        goalInstanceId: "active-goal-3nder-adc-die-less",
        value: 2,
        createdAt: `${activeSince}T00:00:00.000Z`
      },
      {
        id: "evidence-late-objective-arrival",
        ownerId: "team-nexus-demo",
        sourceType: "scrim",
        signalId: "signal-late-objective-arrival",
        teamFocusInstanceId: "active-team-focus-demo-dragon-setup",
        value: 1,
        createdAt: `${activeSince}T00:00:00.000Z`
      },
      {
        id: "evidence-failed-vision-retake",
        ownerId: "team-nexus-demo",
        sourceType: "scrim",
        signalId: "signal-failed-vision-retake",
        teamFocusInstanceId: "active-team-focus-demo-dragon-setup",
        value: 1,
        createdAt: `${activeSince}T00:00:00.000Z`
      },
      {
        id: "evidence-unclear-call",
        ownerId: "team-nexus-demo",
        sourceType: "scrim",
        signalId: "signal-unclear-fight-trade-give-call",
        teamFocusInstanceId: "active-team-focus-demo-dragon-setup",
        value: 2,
        createdAt: `${activeSince}T00:00:00.000Z`
      }
    ],
    recommendations: [
      {
        id: "recommendation-review-deaths",
        actionTemplateId: "action-death-review-v1",
        reason:
          "Your active goal is Die Less, and recent evidence includes preventable death patterns.",
        linkedGoalInstanceId: "active-goal-3nder-adc-die-less",
        priority: "high"
      },
      {
        id: "recommendation-pre6-trade-check",
        actionTemplateId: "action-adc-pre6-trade-check-v1",
        reason:
          "Bad trade reads are appearing before level 6, so run the short trade check before queueing.",
        linkedGoalInstanceId: "active-goal-3nder-adc-die-less",
        priority: "medium"
      },
      {
        id: "recommendation-dragon-setup",
        actionTemplateId: "action-dragon-setup-review-v1",
        reason:
          "Your active team focus is Dragon Setup, and the next practice block needs a shared 90/60/30 call.",
        linkedTeamFocusInstanceId: "active-team-focus-demo-dragon-setup",
        priority: "medium"
      }
    ]
  };
}

export function resolveGoalDashboardState(state = {}) {
  const signalIndex = indexById(templateLibrary.signalTemplates);
  const actionIndex = indexById(templateLibrary.actionTemplates);
  const goalInstance = state.activeGoalInstances?.[0] ?? null;
  const teamFocusInstance = state.activeTeamFocusInstances?.[0] ?? null;
  const goalTemplate = goalInstance ? findById(goalTemplates, goalInstance.templateId) : null;
  const teamFocusTemplate = teamFocusInstance
    ? findById(teamFocusTemplates, teamFocusInstance.templateId)
    : null;
  const evidenceTotals = sumEvidenceBySignal(state.evidenceEvents ?? []);
  const primaryRecommendation =
    (state.recommendations ?? []).find((recommendation) =>
      goalInstance ? recommendation.linkedGoalInstanceId === goalInstance.id : false
    ) ?? state.recommendations?.[0] ?? null;
  const primaryActionTemplate =
    actionIndex.get(primaryRecommendation?.actionTemplateId) ??
    actionIndex.get(goalInstance?.selectedActionIds?.[0]) ??
    null;
  const todaysAction = resolveAction(primaryActionTemplate, primaryRecommendation);
  const goalSignals = resolveSignals(
    goalInstance?.selectedSignalIds ?? goalTemplate?.defaultSignalIds ?? [],
    signalIndex,
    evidenceTotals
  );
  const teamSignals = resolveSignals(
    teamFocusInstance?.selectedSignalIds ?? teamFocusTemplate?.defaultSignalIds ?? [],
    signalIndex,
    evidenceTotals
  );
  const weeklyTargets = resolveTargets(
    goalInstance?.weeklyTargets ?? goalTemplate?.suggestedWeeklyTargets ?? [],
    signalIndex,
    evidenceTotals
  );
  const missedTargets = weeklyTargets.filter((target) => target.status === "missed").length;

  const activePersonalGoal = goalTemplate
    ? {
        id: goalInstance.id,
        templateId: goalTemplate.id,
        title: goalTemplate.title,
        scope: goalTemplate.scope,
        role: goalTemplate.role,
        status: goalInstance.status,
        goalStatus: missedTargets > 0 ? "Needs attention" : "On track",
        goalStatusTrend: missedTargets > 0 ? "needs-attention" : "positive",
        trend: "Unknown",
        trendKey: "unknown",
        confidence: "Low sample",
        summary: goalTemplate.description,
        weeklyTargets,
        monthlyTargets: [
          "Climb ranked toward Emerald",
          "Show consistently improved lane phase",
          "Build matchup-specific trading knowledge"
        ],
        progressSummary:
          "3 preventable death patterns tagged this week; 2 clean disengages logged.",
        signals: goalSignals
      }
    : null;

  const activeTeamFocus = teamFocusTemplate
    ? {
        id: teamFocusInstance.id,
        templateId: teamFocusTemplate.id,
        title: teamFocusTemplate.title,
        scope: "team",
        status: teamFocusInstance.status,
        summary: teamFocusTemplate.description,
        practiceTopic: teamFocusTemplate.practiceTopic,
        assignedReview: teamFocusTemplate.assignedReview,
        signals: teamSignals,
        checklist: teamFocusInstance.checklist ?? teamFocusTemplate.defaultChecklist
      }
    : null;

  const suggestedNextSteps = (state.recommendations ?? [])
    .map((recommendation) => {
      const action = actionIndex.get(recommendation.actionTemplateId);
      if (!action) {
        return null;
      }
      return {
        id: recommendation.id,
        templateId: action.id,
        title: action.title,
        type: action.type,
        estimatedMinutes: action.estimatedMinutes,
        summary: action.description,
        reason: recommendation.reason,
        label: recommendation.linkedTeamFocusInstanceId ? "Team focus" : "Personal goal",
        href: action.href,
        source: recommendation.linkedTeamFocusInstanceId ? "team-focus" : "personal-goal",
        priority: recommendation.priority
      };
    })
    .filter(Boolean);

  return {
    activePersonalGoal,
    todaysAction,
    activeTeamFocus,
    recentInsights: buildInsights({ goal: activePersonalGoal, evidenceTotals }),
    suggestedNextSteps
  };
}

export function buildDefaultGoalDashboard() {
  return resolveGoalDashboardState(buildDefaultGoalDashboardState());
}

function normalizeSignal(signal) {
  return {
    id: signal.id,
    templateId: signal.templateId ?? signal.id,
    label: signal.label,
    value: signal.value,
    trend: signal.trend ?? "unknown",
    description: signal.description ?? "",
    type: signal.type ?? "count",
    polarity: signal.polarity ?? "neutral"
  };
}

function normalizeTarget(target) {
  if (typeof target === "string") {
    return {
      label: target,
      currentValue: null,
      targetValue: null,
      status: "needs-review",
      statusLabel: "Needs review",
      trend: "unknown"
    };
  }

  const status = target.status ?? "needs-review";
  return {
    ...target,
    label: target.label ?? target.signalId ?? "Weekly target",
    currentValue: target.currentValue ?? null,
    status,
    statusLabel: target.statusLabel ?? targetStatusLabel(status),
    trend: target.trend ?? targetTrend(status)
  };
}

function normalizeGoal(goal, fallback) {
  const resolved = goal ?? fallback;

  return {
    ...resolved,
    goalStatus: resolved.goalStatus ?? (resolved.status === "active" ? "Active" : "No data yet"),
    goalStatusTrend: resolved.goalStatusTrend ?? (resolved.status === "active" ? "positive" : "unknown"),
    trend: resolved.trend ?? "Unknown",
    trendKey: resolved.trendKey ?? "unknown",
    confidence: resolved.confidence ?? "Low sample",
    weeklyTargets: (resolved.weeklyTargets ?? []).map(normalizeTarget),
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
    practiceTopic: resolved.practiceTopic ?? "",
    signals: (resolved.signals ?? []).map(normalizeSignal),
    checklist: resolved.checklist ?? []
  };
}

export function normalizeGoalDashboard(goalDashboard) {
  if (goalDashboard?.activeGoalInstances || goalDashboard?.activeTeamFocusInstances) {
    return resolveGoalDashboardState(goalDashboard);
  }

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
    recentInsights:
      Array.isArray(resolved.recentInsights) && resolved.recentInsights.length > 0
        ? resolved.recentInsights
        : fallback.recentInsights,
    suggestedNextSteps:
      Array.isArray(resolved.suggestedNextSteps) && resolved.suggestedNextSteps.length > 0
        ? resolved.suggestedNextSteps
        : fallback.suggestedNextSteps
  };
}

export function buildOnboardingGoalDashboardState({
  context = "personal",
  role = "ADC",
  ownerId,
  teamId,
  selectedGoalTemplateId,
  selectedSignalIds,
  weeklyTargets,
  selectedActionTemplateId,
  selectedTeamFocusTemplateId,
  now = new Date()
}) {
  const activeSince = todayIsoDate(now);
  const setupContext = ["personal", "team", "both"].includes(context) ? context : "personal";
  const shouldCreatePersonal = setupContext === "personal" || setupContext === "both";
  const shouldCreateTeam = setupContext === "team" || setupContext === "both";
  const goalTemplate = shouldCreatePersonal
    ? findById(goalTemplates, selectedGoalTemplateId)
    : null;
  const teamFocusTemplate = shouldCreateTeam
    ? findById(teamFocusTemplates, selectedTeamFocusTemplateId)
    : null;
  const activeGoalId = shouldCreatePersonal
    ? `active-goal-${slug(ownerId)}-${slug(goalTemplate?.title ?? "goal")}`
    : null;
  const activeTeamFocusId = shouldCreateTeam
    ? `active-team-focus-${slug(teamId ?? ownerId)}-${slug(teamFocusTemplate?.title ?? "focus")}`
    : null;
  const selectedGoalSignals = normalizeStringArray(selectedSignalIds);
  const actionTemplateId =
    selectedActionTemplateId ??
    goalTemplate?.defaultActionIds?.[0] ??
    actionTemplates[0].id;

  return {
    version: 1,
    onboardingContext: setupContext,
    role,
    activeGoalInstances:
      shouldCreatePersonal && goalTemplate
        ? [
            {
              id: activeGoalId,
              templateId: goalTemplate.id,
              ownerType: "player",
              ownerId,
              status: "active",
              activeSince,
              weeklyTargets: Array.isArray(weeklyTargets) && weeklyTargets.length > 0
                ? weeklyTargets
                : goalTemplate.suggestedWeeklyTargets ?? [],
              selectedSignalIds:
                selectedGoalSignals.length > 0
                  ? selectedGoalSignals
                  : goalTemplate.defaultSignalIds,
              selectedActionIds: [actionTemplateId]
            }
          ]
        : [],
    activeTeamFocusInstances:
      shouldCreateTeam && teamFocusTemplate
        ? [
            {
              id: activeTeamFocusId,
              templateId: teamFocusTemplate.id,
              ownerType: "team",
              ownerId: teamId ?? ownerId,
              status: "active",
              activeSince,
              selectedSignalIds: teamFocusTemplate.defaultSignalIds,
              selectedActionIds: teamFocusTemplate.defaultActionIds
            }
          ]
        : [],
    evidenceEvents: [],
    recommendations: [
      shouldCreatePersonal && goalTemplate
        ? {
            id: `recommendation-${slug(ownerId)}-${slug(actionTemplateId)}`,
            actionTemplateId,
            reason:
              "Death review is the fastest way to create evidence for the selected improvement goal.",
            linkedGoalInstanceId: activeGoalId,
            priority: "high"
          }
        : null,
      shouldCreateTeam && teamFocusTemplate
        ? {
            id: `recommendation-${slug(teamId ?? ownerId)}-${slug(teamFocusTemplate.defaultActionIds[0])}`,
            actionTemplateId: teamFocusTemplate.defaultActionIds[0],
            reason:
              "The selected team focus needs a shared checklist before the next practice block.",
            linkedTeamFocusInstanceId: activeTeamFocusId,
            priority: "medium"
          }
        : null
    ].filter(Boolean)
  };
}
