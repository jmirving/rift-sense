import { trendBySignalId, findById, indexById } from "./shared.js";
import { templateLibrary } from "./templates.js";

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

export function targetStatusLabel(status) {
  return {
    "on-track": "On track",
    missed: "Missed",
    "needs-review": "Needs review"
  }[status] ?? "Needs review";
}

export function targetTrend(status) {
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

export function resolveGoalDashboardState(state = {}) {
  const signalIndex = indexById(templateLibrary.signalTemplates);
  const actionIndex = indexById(templateLibrary.actionTemplates);
  const goalInstance = state.activeGoalInstances?.[0] ?? null;
  const teamFocusInstance = state.activeTeamFocusInstances?.[0] ?? null;
  const goalTemplate = goalInstance
    ? findById(templateLibrary.goalTemplates, goalInstance.templateId)
    : null;
  const teamFocusTemplate = teamFocusInstance
    ? findById(templateLibrary.teamFocusTemplates, teamFocusInstance.templateId)
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
