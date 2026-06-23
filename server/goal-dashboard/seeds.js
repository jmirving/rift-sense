import { templateLibrary } from "./templates.js";
import { findById, normalizeStringArray, slug, todayIsoDate } from "./shared.js";
import { normalizeRoleForStorage } from "./roles.js";

function findGoalTemplate(id) {
  return findById(templateLibrary.goalTemplates, id) ??
    templateLibrary.goalTemplates.find((template) => template.legacyIds?.includes(id)) ??
    null;
}

function rankSnapshot({ rank, division, lp, capturedAt }) {
  return {
    rank: rank || null,
    division: division || null,
    lp: Number.isFinite(Number(lp)) ? Number(lp) : null,
    capturedAt
  };
}

export function buildDefaultGoalDashboardState(now = new Date()) {
  const activeSince = todayIsoDate(now);
  const focusTemplate = findById(templateLibrary.focusTemplates, "focus-die-less");
  const goalTemplate = findGoalTemplate("goal-template-rank-climb");

  return {
    version: 2,
    focusPlan: {
      goalInstance: {
        id: "goal-instance-3nder-reach-emerald",
        goalTemplateId: goalTemplate.id,
        ownerId: "player-3nderwiggin",
        status: "active",
        activeSince,
        original: rankSnapshot({ rank: "Gold", division: "II", lp: 34, capturedAt: activeSince }),
        target: rankSnapshot({ rank: "Emerald", division: "IV", lp: 0, capturedAt: activeSince }),
        current: rankSnapshot({ rank: "Gold", division: "I", lp: 12, capturedAt: activeSince }),
        originalRole: "Bot",
        originalPrimaryFocusTemplateId: focusTemplate.id,
        originalSelectedMetricIds: focusTemplate.defaultMetricIds,
        originalTargets: focusTemplate.suggestedTargets,
        originalSelectedDate: activeSince
      },
      focusInstances: [
        {
          id: "active-goal-3nder-adc-die-less",
          focusTemplateId: focusTemplate.id,
          ownerType: "player",
          ownerId: "player-3nderwiggin",
          status: "active",
          priority: "primary",
          stage: "active_tracking",
          selectedSignalIds: focusTemplate.defaultSignalIds,
          selectedMetricIds: focusTemplate.defaultMetricIds,
          targets: focusTemplate.suggestedTargets.map((target) => ({ ...target, selectedAt: activeSince })),
          selectedActionIds: ["action-death-review-v1"],
          activeSince,
          selectedAt: activeSince,
          originalSelectedMetricIds: focusTemplate.defaultMetricIds,
          originalTargets: focusTemplate.suggestedTargets,
          originalSelectedSignalIds: focusTemplate.defaultSignalIds
        },
        {
          id: "focus-instance-3nder-farm-better",
          focusTemplateId: "focus-farm-better",
          ownerType: "player",
          ownerId: "player-3nderwiggin",
          status: "later",
          priority: "later",
          stage: "later",
          selectedSignalIds: ["signal-cs-missed-while-present"],
          selectedMetricIds: ["metric-cs-missed-while-present"],
          targets: [],
          selectedActionIds: ["action-death-review-v1"],
          activeSince,
          selectedAt: activeSince,
          originalSelectedMetricIds: ["metric-cs-missed-while-present"],
          originalTargets: [],
          originalSelectedSignalIds: ["signal-cs-missed-while-present"]
        }
      ]
    },
    activeGoalInstances: [
      {
        id: "active-goal-3nder-adc-die-less",
        templateId: "focus-die-less",
        focusTemplateId: "focus-die-less",
        goalTemplateId: "goal-template-rank-climb",
        ownerType: "player",
        ownerId: "player-3nderwiggin",
        status: "active",
        activeSince,
        activeGoalStartedAt: activeSince,
        weeklyTargets: [
          { signalId: "signal-bad-2v2-death", targetValue: 0, currentValue: 0, selectedAt: activeSince },
          { signalId: "signal-known-danger-death", targetValue: 0, selectedAt: activeSince },
          { signalId: "signal-bad-pre6-allin", targetValue: 0, selectedAt: activeSince }
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
          "Your current focus is Die Less, and recent evidence includes preventable death patterns.",
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

export function buildOnboardingGoalDashboardState({
  context = "personal",
  role = "ADC",
  ownerId,
  teamId,
  selectedGoalTemplateId,
  primaryFocusTemplateId,
  supportingFocusTemplateIds,
  laterFocusTemplateIds,
  selectedSignalIds,
  selectedMetricIds,
  targets,
  weeklyTargets,
  selectedActionTemplateId,
  selectedTeamFocusTemplateId,
  goalTarget,
  goalOriginal,
  goalCurrent,
  now = new Date()
}) {
  const activeSince = todayIsoDate(now);
  const storedRole = normalizeRoleForStorage(role);
  const setupContext = ["personal", "team", "both"].includes(context) ? context : "personal";
  const shouldCreatePersonal = setupContext === "personal" || setupContext === "both";
  const shouldCreateTeam = setupContext === "team" || setupContext === "both";
  const selectedBroadGoal = findGoalTemplate(selectedGoalTemplateId);
  const legacyFocusFromGoalId = findById(templateLibrary.focusTemplates, selectedGoalTemplateId) ??
    templateLibrary.focusTemplates.find((template) => template.legacyGoalTemplateIds?.includes(selectedGoalTemplateId));
  const goalTemplate = shouldCreatePersonal
    ? selectedBroadGoal ?? findGoalTemplate("goal-template-rank-climb") ?? templateLibrary.goalTemplates[0]
    : null;
  const primaryFocusTemplate = shouldCreatePersonal
    ? findById(templateLibrary.focusTemplates, primaryFocusTemplateId) ??
      legacyFocusFromGoalId ??
      findById(templateLibrary.focusTemplates, goalTemplate?.defaultFocusPath?.[0]) ??
      templateLibrary.focusTemplates[0]
    : null;
  const teamFocusTemplate = shouldCreateTeam
    ? findById(templateLibrary.teamFocusTemplates, selectedTeamFocusTemplateId)
    : null;
  const goalInstanceId = shouldCreatePersonal
    ? `goal-instance-${slug(ownerId)}-${slug(goalTemplate?.title ?? "goal")}`
    : null;
  const primaryFocusInstanceId = shouldCreatePersonal
    ? `focus-instance-${slug(ownerId)}-${slug(primaryFocusTemplate?.title ?? "focus")}`
    : null;
  const activeTeamFocusId = shouldCreateTeam
    ? `active-team-focus-${slug(teamId ?? ownerId)}-${slug(teamFocusTemplate?.title ?? "focus")}`
    : null;
  const selectedGoalSignals = normalizeStringArray(selectedSignalIds);
  const selectedGoalMetrics = normalizeStringArray(selectedMetricIds);
  const originalRank = rankSnapshot({
    rank: goalOriginal?.rank ?? goalTarget?.startRank ?? "Gold",
    division: goalOriginal?.division ?? goalTarget?.startDivision ?? "II",
    lp: goalOriginal?.lp ?? goalTarget?.startLp ?? 34,
    capturedAt: goalOriginal?.capturedAt ?? activeSince
  });
  const targetRank = rankSnapshot({
    rank: goalTarget?.rank ?? goalTarget?.targetRank ?? "Emerald",
    division: goalTarget?.division ?? goalTarget?.targetDivision ?? "IV",
    lp: goalTarget?.lp ?? goalTarget?.targetLp ?? 0,
    capturedAt: goalTarget?.capturedAt ?? activeSince
  });
  const currentRank = goalCurrent
    ? rankSnapshot({ ...goalCurrent, capturedAt: goalCurrent.capturedAt ?? activeSince })
    : rankSnapshot({ rank: null, division: null, lp: null, capturedAt: null });
  const actionTemplateId =
    selectedActionTemplateId ??
    primaryFocusTemplate?.defaultActionIds?.[0] ??
    templateLibrary.actionTemplates[0].id;
  const normalizedTargets = Array.isArray(targets) && targets.length > 0
    ? targets.map((target) => ({ ...target, selectedAt: target.selectedAt ?? activeSince }))
    : primaryFocusTemplate?.suggestedTargets?.map((target) => ({ ...target, selectedAt: activeSince })) ?? [];
  const supportingIds = normalizeStringArray(supportingFocusTemplateIds)
    .filter((id) => id !== primaryFocusTemplate?.id);
  const laterIds = normalizeStringArray(laterFocusTemplateIds)
    .filter((id) => id !== primaryFocusTemplate?.id && !supportingIds.includes(id));
  const buildFocusInstance = (template, priority, index = 0) => ({
    id: priority === "primary"
      ? primaryFocusInstanceId
      : `focus-instance-${slug(ownerId)}-${slug(template.title)}-${priority}-${index}`,
    focusTemplateId: template.id,
    ownerType: "player",
    ownerId,
    status: priority === "later" ? "later" : "active",
    priority,
    stage: priority === "later" ? "later" : "initial_assessment",
    selectedSignalIds:
      priority === "primary" && selectedGoalSignals.length > 0
        ? selectedGoalSignals
        : template.defaultSignalIds,
    selectedMetricIds:
      priority === "primary" && selectedGoalMetrics.length > 0
        ? selectedGoalMetrics
        : template.defaultMetricIds ?? [],
    targets: priority === "primary"
      ? normalizedTargets
      : template.suggestedTargets?.map((target) => ({ ...target, selectedAt: activeSince })) ?? [],
    selectedActionIds: priority === "primary" ? [actionTemplateId] : template.defaultActionIds ?? [],
    activeSince,
    selectedAt: activeSince,
    originalSelectedMetricIds:
      priority === "primary" && selectedGoalMetrics.length > 0
        ? selectedGoalMetrics
        : template.defaultMetricIds ?? [],
    originalTargets: priority === "primary"
      ? normalizedTargets
      : template.suggestedTargets?.map((target) => ({ ...target, selectedAt: activeSince })) ?? [],
    originalSelectedSignalIds:
      priority === "primary" && selectedGoalSignals.length > 0
        ? selectedGoalSignals
        : template.defaultSignalIds
  });
  const focusInstances = shouldCreatePersonal && primaryFocusTemplate
    ? [
        buildFocusInstance(primaryFocusTemplate, "primary"),
        ...supportingIds
          .map((id, index) => {
            const template = findById(templateLibrary.focusTemplates, id);
            return template ? buildFocusInstance(template, "supporting", index) : null;
          })
          .filter(Boolean),
        ...laterIds
          .map((id, index) => {
            const template = findById(templateLibrary.focusTemplates, id);
            return template ? buildFocusInstance(template, "later", index) : null;
          })
          .filter(Boolean)
      ]
    : [];

  return {
    version: 2,
    onboardingContext: setupContext,
    role: storedRole,
    focusPlan:
      shouldCreatePersonal && goalTemplate
        ? {
            goalInstance: {
              id: goalInstanceId,
              goalTemplateId: goalTemplate.id,
              ownerId,
              status: "active",
              activeSince,
              original: originalRank,
              target: targetRank,
              current: currentRank,
              originalRole: storedRole,
              originalPrimaryFocusTemplateId: primaryFocusTemplate?.id,
              originalSelectedMetricIds: selectedGoalMetrics.length > 0
                ? selectedGoalMetrics
                : primaryFocusTemplate?.defaultMetricIds ?? [],
              originalTargets: normalizedTargets,
              originalSelectedDate: activeSince
            },
            focusInstances
          }
        : null,
    activeGoalInstances:
      shouldCreatePersonal && primaryFocusTemplate
        ? [
            {
              id: primaryFocusInstanceId,
              templateId: primaryFocusTemplate.id,
              focusTemplateId: primaryFocusTemplate.id,
              goalTemplateId: goalTemplate?.id,
              ownerType: "player",
              ownerId,
              status: "active",
              activeSince,
              activeGoalStartedAt: activeSince,
              weeklyTargets: Array.isArray(weeklyTargets) && weeklyTargets.length > 0
                ? weeklyTargets.map((target) => ({ ...target, selectedAt: target.selectedAt ?? activeSince }))
                : (primaryFocusTemplate.suggestedWeeklyTargets ?? []).map((target) => ({ ...target, selectedAt: activeSince })),
              selectedSignalIds:
                selectedGoalSignals.length > 0
                  ? selectedGoalSignals
                  : primaryFocusTemplate.defaultSignalIds,
              selectedMetricIds:
                selectedGoalMetrics.length > 0
                  ? selectedGoalMetrics
                  : primaryFocusTemplate.defaultMetricIds ?? [],
              targets: normalizedTargets,
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
              "Review the selected focus to create evidence for the current plan.",
            linkedGoalInstanceId: primaryFocusInstanceId,
            linkedFocusInstanceId: primaryFocusInstanceId,
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
