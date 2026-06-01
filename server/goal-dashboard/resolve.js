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

function formatSourceLabel(sourceType, count) {
  const noun = count === 1 ? "event" : "events";
  return {
    manual: `${count} manual tag${count === 1 ? "" : "s"}`,
    vod: `${count} reviewed game${count === 1 ? "" : "s"}`,
    scrim: `${count} scrim ${noun}`,
    "solo-queue": `${count} ranked game${count === 1 ? "" : "s"}`
  }[sourceType] ?? `${count} ${sourceType} ${noun}`;
}

function buildEvidenceSource(events = [], emptyLabel = "No reviewed games yet") {
  if (events.length === 0) {
    return {
      summary: emptyLabel,
      confidence: "No reviewed games yet",
      confidenceTrend: "unknown",
      totalEvents: 0,
      sourceBreakdown: []
    };
  }

  const bySource = new Map();
  events.forEach((event) => {
    bySource.set(event.sourceType, (bySource.get(event.sourceType) ?? 0) + 1);
  });

  const sourceBreakdown = Array.from(bySource.entries()).map(([sourceType, count]) => ({
    sourceType,
    count,
    label: formatSourceLabel(sourceType, count)
  }));
  const totalEvents = events.length;
  const confidence = totalEvents >= 8 ? "Medium sample" : "Low sample";

  return {
    summary: `Based on ${totalEvents} signal ${totalEvents === 1 ? "event" : "events"} · ${sourceBreakdown.map((item) => item.label).join(" + ")}`,
    confidence,
    confidenceTrend: totalEvents >= 8 ? "watch" : "unknown",
    totalEvents,
    sourceBreakdown
  };
}

function describeInsightSignals(items = []) {
  return items
    .filter((item) => Number(item.value) > 0)
    .map((item) => `${item.value} ${item.label.toLowerCase()}${Number(item.value) === 1 ? "" : "s"}`);
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
      linkedGoalId: goal.id,
      basedOn: describeInsightSignals([
        { label: "Known-danger death", value: knownDangerDeaths },
        { label: "Greed wave death", value: evidenceTotals.get("signal-greed-wave-death") ?? 0 }
      ])
    });
  }

  if (badTradeReads > 0) {
    insights.push({
      id: "insight-pre6-trading",
      title: "Trade checks need to happen earlier",
      summary:
        "Trading errors are showing up before level 6, so the next useful block is a pre-6 trade check.",
      linkedGoalId: goal.id,
      basedOn: describeInsightSignals([
        { label: "Overestimated trade strength", value: badTradeReads },
        { label: "Bad pre-6 all-in", value: evidenceTotals.get("signal-bad-pre6-allin") ?? 0 }
      ])
    });
  }

  if (cleanDisengages > 0) {
    insights.push({
      id: "insight-clean-disengages",
      title: "There is already a repeatable win",
      summary:
        "Clean disengages are being logged, which gives this goal a positive behavior to reinforce.",
      linkedGoalId: goal.id,
      basedOn: describeInsightSignals([
        { label: "Clean disengage", value: cleanDisengages }
      ])
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
  const goalEvidenceEvents = (state.evidenceEvents ?? []).filter(
    (event) => event.goalInstanceId && event.goalInstanceId === goalInstance?.id
  );
  const teamEvidenceEvents = (state.evidenceEvents ?? []).filter(
    (event) => event.teamFocusInstanceId && event.teamFocusInstanceId === teamFocusInstance?.id
  );
  const primaryRecommendation =
    (state.recommendations ?? []).find((recommendation) =>
      goalInstance ? recommendation.linkedGoalInstanceId === goalInstance.id : false
    ) ?? state.recommendations?.[0] ?? null;
  const teamRecommendation =
    (state.recommendations ?? []).find((recommendation) =>
      teamFocusInstance ? recommendation.linkedTeamFocusInstanceId === teamFocusInstance.id : false
    ) ?? null;
  const primaryActionTemplate =
    actionIndex.get(primaryRecommendation?.actionTemplateId) ??
    actionIndex.get(goalInstance?.selectedActionIds?.[0]) ??
    null;
  const teamActionTemplate =
    actionIndex.get(teamRecommendation?.actionTemplateId) ??
    actionIndex.get(teamFocusInstance?.selectedActionIds?.[0]) ??
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
  const goalEvidenceSource =
    goalEvidenceEvents.length > 0
      ? buildEvidenceSource(goalEvidenceEvents)
      : state.onboardingContext
        ? buildEvidenceSource([], "Seeded from onboarding")
        : buildEvidenceSource([], "No reviewed games yet");
  const teamEvidenceSource =
    teamEvidenceEvents.length > 0
      ? buildEvidenceSource(teamEvidenceEvents)
      : state.onboardingContext
        ? buildEvidenceSource([], "Seeded from onboarding")
        : buildEvidenceSource([], "No reviewed team evidence yet");
  const teamHeadlineSignal = [...teamSignals]
    .sort((left, right) => Number(right.value ?? 0) - Number(left.value ?? 0))[0] ?? null;

  const activePersonalGoal = goalTemplate
      ? {
        id: goalInstance.id,
        templateId: goalTemplate.id,
        title: goalTemplate.title,
        scope: goalTemplate.scope,
        role: goalTemplate.role,
        status: goalInstance.status,
        activeSince: goalInstance.activeSince,
        goalStatus: missedTargets > 0 ? "Needs attention" : "On track",
        goalStatusTrend: missedTargets > 0 ? "needs-attention" : "positive",
        trend: "Unknown",
        trendKey: "unknown",
        confidence: goalEvidenceSource.confidence,
        summary: goalTemplate.description,
        weeklyTargets,
        monthlyTargets: [
          "Climb ranked toward Emerald",
          "Show consistently improved lane phase",
          "Build matchup-specific trading knowledge"
        ],
        progressSummary:
          "3 preventable death patterns tagged this week; 2 clean disengages logged.",
        signals: goalSignals,
        evidenceSource: goalEvidenceSource
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
        checklist: teamFocusInstance.checklist ?? teamFocusTemplate.defaultChecklist,
        assignment: teamFocusTemplate.assignedReview,
        nextTeamAction: teamActionTemplate
          ? {
              title: teamActionTemplate.title,
              type: teamActionTemplate.type,
              estimatedMinutes: teamActionTemplate.estimatedMinutes,
              href: teamActionTemplate.href ?? "/team"
            }
          : null,
        evidenceSource: teamEvidenceSource,
        headlineSignal: teamHeadlineSignal
          ? {
              label: teamHeadlineSignal.label,
              value: teamHeadlineSignal.value,
              trend: teamHeadlineSignal.trend
            }
          : null
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
