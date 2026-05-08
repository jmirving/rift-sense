import { buildDefaultGoalDashboardState } from "./seeds.js";
import { resolveGoalDashboardState, targetStatusLabel, targetTrend } from "./resolve.js";

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

function normalizeEvidenceSource(evidenceSource) {
  const resolved = evidenceSource ?? {};

  return {
    summary: resolved.summary ?? "No reviewed games yet",
    confidence: resolved.confidence ?? "No reviewed games yet",
    confidenceTrend: resolved.confidenceTrend ?? "unknown",
    totalEvents: Number(resolved.totalEvents ?? 0),
    sourceBreakdown: Array.isArray(resolved.sourceBreakdown) ? resolved.sourceBreakdown : []
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
    confidence: resolved.confidence ?? "No reviewed games yet",
    weeklyTargets: (resolved.weeklyTargets ?? []).map(normalizeTarget),
    monthlyTargets: resolved.monthlyTargets ?? [],
    signals: (resolved.signals ?? []).map(normalizeSignal),
    evidenceSource: normalizeEvidenceSource(resolved.evidenceSource)
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
    checklist: resolved.checklist ?? [],
    assignment: resolved.assignment ?? resolved.assignedReview ?? "",
    nextTeamAction: resolved.nextTeamAction ?? null,
    evidenceSource: normalizeEvidenceSource(resolved.evidenceSource),
    headlineSignal: resolved.headlineSignal ?? null
  };
}

export function normalizeGoalDashboard(goalDashboard) {
  if (goalDashboard?.activeGoalInstances || goalDashboard?.activeTeamFocusInstances) {
    return resolveGoalDashboardState(goalDashboard);
  }

  const fallback = resolveGoalDashboardState(buildDefaultGoalDashboardState());
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
        ? resolved.recentInsights.map((insight) => ({
            ...insight,
            basedOn: Array.isArray(insight.basedOn) ? insight.basedOn : []
          }))
        : fallback.recentInsights,
    suggestedNextSteps:
      Array.isArray(resolved.suggestedNextSteps) && resolved.suggestedNextSteps.length > 0
        ? resolved.suggestedNextSteps
        : fallback.suggestedNextSteps
  };
}
