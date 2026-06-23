import { trendBySignalId, findById, indexById } from "./shared.js";
import { templateLibrary } from "./templates.js";
import { buildGoalProgress } from "./progress.js";

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

function operatorTargetStatus({ currentValue, operator = "<=", value, targetValue }) {
  if (currentValue === null || currentValue === undefined) {
    return "needs-review";
  }
  const numericCurrent = Number(currentValue);
  const numericTarget = Number(value ?? targetValue);
  if (!Number.isFinite(numericCurrent) || !Number.isFinite(numericTarget)) {
    return "needs-review";
  }
  const matched = operator === ">="
    ? numericCurrent >= numericTarget
    : operator === ">"
      ? numericCurrent > numericTarget
      : operator === "<"
        ? numericCurrent < numericTarget
        : numericCurrent <= numericTarget;
  return matched ? "on-track" : "missed";
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

function resolveMetricTargets(targets, metricIndex, evidenceTotals) {
  return (targets ?? []).map((target) => {
    const metric = metricIndex.get(target.metricId);
    const currentValue =
      target.currentValue !== undefined
        ? target.currentValue
        : metric?.signalIds?.reduce((sum, signalId) => sum + (evidenceTotals.get(signalId) ?? 0), 0) ?? null;
    const status = target.status ?? operatorTargetStatus({
      currentValue,
      operator: target.operator,
      value: target.value,
      targetValue: target.targetValue
    });

    return {
      ...target,
      label: target.label ?? metric?.label ?? target.metricId,
      currentValue,
      targetValue: target.value ?? target.targetValue,
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

function resolveFocusTemplate(templateId) {
  return findById(templateLibrary.focusTemplates, templateId) ??
    templateLibrary.focusTemplates.find((template) => template.legacyGoalTemplateIds?.includes(templateId)) ??
    null;
}

function deriveFocusStage({ instance, evidenceEvents = [], reviewReadiness = {} }) {
  if (!instance) {
    return null;
  }
  if (instance.status === "paused" || instance.status === "later") {
    return instance.status;
  }
  if (reviewReadiness.initialAssessmentComplete) {
    return "active_tracking";
  }
  if (evidenceEvents.length > 0 && (!instance.targets || instance.targets.length === 0)) {
    return "pattern_confirmation";
  }
  if (evidenceEvents.length === 0) {
    return "initial_assessment";
  }
  return instance.stage === "initial_assessment" ? "active_tracking" : instance.stage ?? "active_tracking";
}

function stageLabel(stage) {
  return {
    selected: "Selected",
    initial_assessment: "Initial assessment",
    pattern_confirmation: "Pattern confirmation",
    active_tracking: "Active tracking",
    refinement: "Refinement",
    later: "Later",
    paused: "Paused",
    completed: "Completed"
  }[stage] ?? "Selected";
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
      title: "Early signal: known-danger deaths showing up",
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

export function resolveGoalDashboardState(state = {}, options = {}) {
  const signalIndex = indexById(templateLibrary.signalTemplates);
  const metricIndex = indexById(templateLibrary.metricTemplates);
  const actionIndex = indexById(templateLibrary.actionTemplates);
  const focusInstancesFromPlan = Array.isArray(state.focusPlan?.focusInstances)
    ? state.focusPlan.focusInstances
    : [];
  const primaryFocusInstance =
    focusInstancesFromPlan.find((instance) => instance.priority === "primary" && instance.status !== "completed") ??
    focusInstancesFromPlan.find((instance) => instance.status === "active") ??
    null;
  const goalInstance = primaryFocusInstance ?? state.activeGoalInstances?.[0] ?? null;
  const broadGoalInstance = state.focusPlan?.goalInstance ?? null;
  const teamFocusInstance = state.activeTeamFocusInstances?.[0] ?? null;
  const goalTemplate = broadGoalInstance
    ? findById(templateLibrary.goalTemplates, broadGoalInstance.goalTemplateId)
    : null;
  const focusTemplate = goalInstance
    ? resolveFocusTemplate(goalInstance.focusTemplateId ?? goalInstance.templateId)
    : null;
  const legacyGoalTemplate = !focusTemplate && goalInstance
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
      goalInstance ? recommendation.linkedFocusInstanceId === goalInstance.id || recommendation.linkedGoalInstanceId === goalInstance.id : false
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
    goalInstance?.selectedSignalIds ?? focusTemplate?.defaultSignalIds ?? legacyGoalTemplate?.defaultSignalIds ?? [],
    signalIndex,
    evidenceTotals
  );
  const teamSignals = resolveSignals(
    teamFocusInstance?.selectedSignalIds ?? teamFocusTemplate?.defaultSignalIds ?? [],
    signalIndex,
    evidenceTotals
  );
  const weeklyTargets = resolveTargets(
    goalInstance?.weeklyTargets ?? focusTemplate?.suggestedWeeklyTargets ?? legacyGoalTemplate?.suggestedWeeklyTargets ?? [],
    signalIndex,
    evidenceTotals
  );
  const metricTargets = resolveMetricTargets(
    goalInstance?.targets ?? focusTemplate?.suggestedTargets ?? [],
    metricIndex,
    evidenceTotals
  );
  const allTargets = metricTargets.length > 0 ? metricTargets : weeklyTargets;
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

  const focusEvidenceEvents = (state.evidenceEvents ?? []).filter(
    (event) => event.focusInstanceId && event.focusInstanceId === goalInstance?.id
  );
  const primaryFocusEvidenceEvents = focusEvidenceEvents.length > 0 ? focusEvidenceEvents : goalEvidenceEvents;
  const reviewReadiness = options.reviewReadiness ?? {};
  const primaryStage = deriveFocusStage({
    instance: goalInstance,
    evidenceEvents: primaryFocusEvidenceEvents,
    reviewReadiness
  });
  const resolvedFocusInstances = (focusInstancesFromPlan.length > 0
    ? focusInstancesFromPlan
    : goalInstance
      ? [goalInstance]
      : []
  ).map((instance) => {
    const template = resolveFocusTemplate(instance.focusTemplateId ?? instance.templateId);
    if (!template) {
      return null;
    }
    const instanceEvidence = (state.evidenceEvents ?? []).filter(
      (event) => event.focusInstanceId === instance.id || event.goalInstanceId === instance.id
    );
    const stage = deriveFocusStage({ instance, evidenceEvents: instanceEvidence, reviewReadiness });
    return {
      id: instance.id,
      templateId: template.id,
      focusTemplateId: template.id,
      title: template.title,
      scope: template.scope,
      role: template.role,
      category: template.category,
      status: instance.status,
      priority: instance.priority ?? "primary",
      stage,
      stageLabel: stageLabel(stage),
      activeSince: instance.activeSince,
      summary: template.description,
      selectedMetricIds: instance.selectedMetricIds ?? template.defaultMetricIds ?? [],
      targets: resolveMetricTargets(instance.targets ?? template.suggestedTargets ?? [], metricIndex, evidenceTotals),
      weeklyTargets: resolveTargets(instance.weeklyTargets ?? template.suggestedWeeklyTargets ?? [], signalIndex, evidenceTotals),
      signals: resolveSignals(instance.selectedSignalIds ?? template.defaultSignalIds ?? [], signalIndex, evidenceTotals),
      selectedActionIds: instance.selectedActionIds ?? template.defaultActionIds ?? []
    };
  }).filter(Boolean);
  const focusPlan = {
    goal: goalTemplate
      ? {
          id: broadGoalInstance?.id ?? goalTemplate.id,
          templateId: goalTemplate.id,
          title: goalTemplate.title,
          status: broadGoalInstance?.status ?? "active",
          activeSince: broadGoalInstance?.activeSince,
          summary: goalTemplate.description,
          defaultFocusPath: goalTemplate.defaultFocusPath ?? []
        }
      : null,
    primaryFocus: resolvedFocusInstances.find((focus) => focus.priority === "primary") ??
      resolvedFocusInstances.find((focus) => focus.status === "active") ??
      null,
    supportingFocuses: resolvedFocusInstances.filter((focus) => focus.priority === "supporting"),
    laterFocuses: resolvedFocusInstances.filter((focus) => focus.priority === "later" || focus.status === "later"),
    pausedFocuses: resolvedFocusInstances.filter((focus) => focus.priority === "paused" || focus.status === "paused"),
    allFocuses: resolvedFocusInstances,
    stage: primaryStage,
    nextAction: todaysAction,
    reviewReadiness
  };

  const activePersonalGoal = focusTemplate || legacyGoalTemplate
      ? {
        id: goalInstance.id,
        templateId: focusTemplate?.id ?? legacyGoalTemplate.id,
        focusTemplateId: focusTemplate?.id ?? legacyGoalTemplate.id,
        goalTemplateId: goalTemplate?.id ?? goalInstance.goalTemplateId,
        broadGoalTitle: goalTemplate?.title ?? null,
        title: focusTemplate?.title ?? legacyGoalTemplate.title,
        scope: focusTemplate?.scope ?? legacyGoalTemplate.scope,
        role: focusTemplate?.role ?? legacyGoalTemplate.role,
        category: focusTemplate?.category ?? legacyGoalTemplate.category,
        status: goalInstance.status,
        priority: goalInstance.priority ?? "primary",
        stage: primaryStage,
        stageLabel: stageLabel(primaryStage),
        activeSince: goalInstance.activeSince,
        activeGoalStartedAt: goalInstance.activeGoalStartedAt ?? goalInstance.goalStartedAt ?? goalInstance.activeSince,
        goalStatus: missedTargets > 0 ? "Needs attention" : "On track",
        goalStatusTrend: missedTargets > 0 ? "needs-attention" : "positive",
        trend: "Unknown",
        trendKey: "unknown",
        confidence: goalEvidenceSource.confidence,
        summary: focusTemplate?.description ?? legacyGoalTemplate.description,
        weeklyTargets,
        targets: allTargets,
        selectedMetricIds: goalInstance.selectedMetricIds ?? focusTemplate?.defaultMetricIds ?? [],
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
    focusPlan,
    goalProgress: buildGoalProgress(state, options),
    todaysAction,
    activeTeamFocus,
    recentInsights: buildInsights({ goal: activePersonalGoal, evidenceTotals }),
    suggestedNextSteps
  };
}
