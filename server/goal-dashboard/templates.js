import "./model-docs.js";

const goalTemplates = [
  {
    id: "goal-reach-emerald",
    title: "Reach Emerald",
    scope: "personal",
    category: "ranked-climb",
    description:
      "Build the consistency, review habits, and game fundamentals needed to climb toward Emerald.",
    defaultFocusPath: ["focus-die-less", "focus-farm-better", "focus-lane-better"]
  },
  {
    id: "goal-reliable-adc",
    title: "Become a reliable ADC",
    scope: "personal",
    category: "role-mastery",
    description:
      "Become a dependable bot-lane carry through safer deaths, stronger lane reads, and cleaner fights.",
    defaultFocusPath: ["focus-die-less", "focus-lane-better", "focus-teamfight-better"]
  },
  {
    id: "goal-win-more-clash",
    title: "Win more Clash / team games",
    scope: "team",
    category: "team-play",
    description:
      "Improve coordinated objective setup, fight selection, and communication in organized games.",
    defaultFocusPath: ["focus-objective-setup", "focus-teamfight-better", "focus-communication"]
  }
];

const focusTemplates = [
  {
    id: "focus-die-less",
    legacyGoalTemplateIds: ["goal-template-adc-die-less"],
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
    defaultMetricIds: [
      "metric-known-danger-deaths-week",
      "metric-preventable-deaths-game",
      "metric-clean-disengages-week"
    ],
    relatedContentIds: [
      "content-adc-survivability-basics",
      "content-adc-pre6-trading-check",
      "content-jungle-threat-awareness"
    ],
    suggestedTargets: [
      {
        id: "target-known-danger-deaths-week-zero",
        metricId: "metric-known-danger-deaths-week",
        operator: "<=",
        value: 0,
        window: "week",
        label: "Known-danger deaths this week <= 0"
      },
      {
        id: "target-preventable-deaths-game-two",
        metricId: "metric-preventable-deaths-game",
        operator: "<=",
        value: 2,
        window: "game",
        label: "Preventable deaths per game <= 2"
      },
      {
        id: "target-clean-disengages-week-three",
        metricId: "metric-clean-disengages-week",
        operator: ">=",
        value: 3,
        window: "week",
        label: "Clean disengages this week >= 3"
      }
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
        label: "0 preventable known-danger deaths"
      },
      {
        signalId: "signal-bad-pre6-allin",
        targetValue: 0,
        label: "0 bad pre-6 all-ins"
      }
    ]
  },
  {
    id: "focus-lane-better",
    legacyGoalTemplateIds: ["goal-template-adc-trading"],
    title: "Lane Better",
    alternateTitles: ["Trade Better"],
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
    defaultMetricIds: ["metric-preventable-deaths-game", "metric-bad-pre6-allins-week"],
    relatedContentIds: ["content-adc-pre6-trading-check"],
    suggestedTargets: [
      {
        id: "target-bad-pre6-allins-week-zero",
        metricId: "metric-bad-pre6-allins-week",
        operator: "<=",
        value: 0,
        window: "week",
        label: "Bad pre-6 all-ins this week <= 0"
      }
    ],
    suggestedWeeklyTargets: [
      {
        signalId: "signal-bad-pre6-allin",
        targetValue: 0,
        label: "0 bad pre-6 all-ins"
      }
    ]
  },
  {
    id: "focus-farm-better",
    title: "Farm Better",
    role: "ADC",
    scope: "personal",
    category: "farm",
    description: "Improve last-hitting and wave discipline without trading away health or tempo.",
    defaultSignalIds: ["signal-cs-missed-while-present", "signal-greed-wave-death"],
    defaultMetricIds: ["metric-cs-missed-while-present"],
    suggestedTargets: [
      {
        id: "target-cs-missed-while-present-game",
        metricId: "metric-cs-missed-while-present",
        operator: "<=",
        value: 10,
        window: "game",
        label: "CS missed while present per game <= 10"
      }
    ],
    defaultActionIds: ["action-death-review-v1"],
    relatedContentIds: ["content-adc-survivability-basics"],
    suggestedWeeklyTargets: []
  },
  {
    id: "focus-objective-setup",
    title: "Objective Setup",
    role: "ANY",
    scope: "team",
    category: "objective-control",
    description: "Arrive before objective windows with waves, vision, and a shared fight/trade/give call.",
    defaultSignalIds: [
      "signal-late-objective-arrival",
      "signal-failed-vision-retake",
      "signal-unclear-fight-trade-give-call"
    ],
    defaultMetricIds: ["metric-late-objective-arrivals-week"],
    suggestedTargets: [
      {
        id: "target-late-objective-arrivals-week-one",
        metricId: "metric-late-objective-arrivals-week",
        operator: "<=",
        value: 1,
        window: "week",
        label: "Late objective arrivals this week <= 1"
      }
    ],
    defaultActionIds: ["action-dragon-setup-review-v1"],
    relatedContentIds: ["content-dragon-setup-90-60-30"],
    suggestedWeeklyTargets: []
  },
  {
    id: "focus-teamfight-better",
    title: "Teamfight Better",
    role: "ANY",
    scope: "personal",
    category: "teamfighting",
    description: "Choose safer fight positions, cleaner targets, and better exits around major cooldowns.",
    defaultSignalIds: ["signal-known-danger-death", "signal-clean-disengage"],
    defaultMetricIds: ["metric-preventable-deaths-game", "metric-clean-disengages-week"],
    suggestedTargets: [],
    defaultActionIds: ["action-death-review-v1"],
    relatedContentIds: ["content-adc-survivability-basics"],
    suggestedWeeklyTargets: []
  },
  {
    id: "focus-convert-leads",
    title: "Convert Leads",
    role: "ANY",
    scope: "personal",
    category: "tempo",
    description: "Turn lane or fight advantages into plates, resets, objective setup, or map pressure.",
    defaultSignalIds: ["signal-late-objective-arrival", "signal-greed-wave-death"],
    defaultMetricIds: ["metric-late-objective-arrivals-week"],
    suggestedTargets: [],
    defaultActionIds: ["action-dragon-setup-review-v1"],
    relatedContentIds: ["content-wave-drop-before-objective"],
    suggestedWeeklyTargets: []
  },
  {
    id: "focus-play-from-behind",
    title: "Play From Behind",
    role: "ANY",
    scope: "personal",
    category: "resilience",
    description: "Stabilize losing games through safer waves, information checks, and lower-risk trades.",
    defaultSignalIds: ["signal-greed-wave-death", "signal-clean-disengage"],
    defaultMetricIds: ["metric-clean-disengages-week"],
    suggestedTargets: [],
    defaultActionIds: ["action-pregame-danger-check-v1"],
    relatedContentIds: ["content-jungle-threat-awareness"],
    suggestedWeeklyTargets: []
  },
  {
    id: "focus-communication",
    title: "Communication",
    role: "ANY",
    scope: "team",
    category: "communication",
    description: "Make one shared call before objective and fight windows.",
    defaultSignalIds: ["signal-unclear-fight-trade-give-call"],
    defaultMetricIds: ["metric-unclear-calls-week"],
    suggestedTargets: [],
    defaultActionIds: ["action-dragon-setup-review-v1"],
    relatedContentIds: ["content-dragon-setup-90-60-30"],
    suggestedWeeklyTargets: []
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

const metricTemplates = [
  {
    id: "metric-known-danger-deaths-week",
    label: "Known-danger deaths this week",
    signalIds: ["signal-known-danger-death"],
    aggregation: "count",
    defaultWindow: "week"
  },
  {
    id: "metric-preventable-deaths-game",
    label: "Preventable deaths per game",
    signalIds: [
      "signal-known-danger-death",
      "signal-greed-wave-death",
      "signal-bad-pre6-allin",
      "signal-bad-2v2-death"
    ],
    aggregation: "count",
    defaultWindow: "game"
  },
  {
    id: "metric-clean-disengages-week",
    label: "Clean disengages this week",
    signalIds: ["signal-clean-disengage"],
    aggregation: "count",
    defaultWindow: "week"
  },
  {
    id: "metric-cs-missed-while-present",
    label: "CS missed while present",
    signalIds: ["signal-cs-missed-while-present"],
    aggregation: "count",
    defaultWindow: "game"
  },
  {
    id: "metric-bad-pre6-allins-week",
    label: "Bad pre-6 all-ins this week",
    signalIds: ["signal-bad-pre6-allin"],
    aggregation: "count",
    defaultWindow: "week"
  },
  {
    id: "metric-late-objective-arrivals-week",
    label: "Late objective arrivals this week",
    signalIds: ["signal-late-objective-arrival"],
    aggregation: "count",
    defaultWindow: "week"
  },
  {
    id: "metric-unclear-calls-week",
    label: "Unclear fight/trade/give calls this week",
    signalIds: ["signal-unclear-fight-trade-give-call"],
    aggregation: "count",
    defaultWindow: "week"
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
    linkedFocusTemplateIds: ["focus-die-less", "focus-farm-better", "focus-teamfight-better"],
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
    linkedFocusTemplateIds: ["focus-die-less", "focus-play-from-behind"],
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
    linkedFocusTemplateIds: ["focus-lane-better", "focus-die-less"],
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
    linkedFocusTemplateIds: ["focus-objective-setup", "focus-convert-leads", "focus-communication"],
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

const targetTemplates = focusTemplates.flatMap((template) =>
  (template.suggestedTargets ?? []).map((target) => ({
    ...target,
    focusTemplateId: template.id
  }))
);

function focusIdsUsingSignal(signalId) {
  return focusTemplates
    .filter((template) => template.defaultSignalIds?.includes(signalId))
    .map((template) => template.id);
}

function enrichSignalTemplate(template) {
  return {
    ...template,
    sourceTypes: template.sourceTypes ?? ["manual", "review"],
    usedByFocusIds: template.usedByFocusIds ?? focusIdsUsingSignal(template.id),
    evidenceShape: template.evidenceShape ?? {
      value: template.type,
      note: "optional",
      sourceType: "manual|review|deterministic"
    }
  };
}

export const templateLibrary = {
  goalTemplates,
  focusTemplates,
  signalTemplates,
  metricTemplates,
  targetTemplates,
  actionTemplates,
  contentTemplates,
  teamFocusTemplates
};

export function getTemplateLibrary() {
  return {
    goalTemplates: goalTemplates.map((template) => ({ ...template })),
    focusTemplates: focusTemplates.map((template) => ({ ...template })),
    signalTemplates: signalTemplates.map(enrichSignalTemplate),
    metricTemplates: metricTemplates.map((template) => ({ ...template })),
    targetTemplates: targetTemplates.map((template) => ({ ...template })),
    actionTemplates: actionTemplates.map((template) => ({ ...template })),
    contentTemplates: contentTemplates.map((template) => ({ ...template })),
    teamFocusTemplates: teamFocusTemplates.map((template) => ({ ...template }))
  };
}
