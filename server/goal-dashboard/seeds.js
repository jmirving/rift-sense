import { templateLibrary } from "./templates.js";
import { findById, normalizeStringArray, slug, todayIsoDate } from "./shared.js";

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
    ? findById(templateLibrary.goalTemplates, selectedGoalTemplateId)
    : null;
  const teamFocusTemplate = shouldCreateTeam
    ? findById(templateLibrary.teamFocusTemplates, selectedTeamFocusTemplateId)
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
    templateLibrary.actionTemplates[0].id;

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
