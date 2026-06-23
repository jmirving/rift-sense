import express from "express";

import { getTemplateLibrary } from "../goal-dashboard.js";
import { getSystemGoalTypes } from "../goal-types/system-goal-types.js";
import { getDeterministicMatchEvaluationInventory } from "../riot/match-evaluator.js";

export function createSystemInventoryRouter({ config, goalTypesRepository }) {
  const router = express.Router();

  router.get("/", config.requireAuth, async (_request, response) => {
    const storedGoalTypes = goalTypesRepository?.listGoalTypes
      ? await goalTypesRepository.listGoalTypes({ activeOption: true })
      : getSystemGoalTypes();
    const goalTypes = storedGoalTypes.length > 0 ? storedGoalTypes : getSystemGoalTypes();
    const deterministic = getDeterministicMatchEvaluationInventory();
    const templates = getTemplateLibrary();
    const goals = templates.goalTemplates.map((goal) => ({
      id: goal.id,
      title: goal.title,
      category: goal.category,
      description: goal.description,
      defaultFocusPath: goal.defaultFocusPath ?? []
    }));
    const focuses = templates.focusTemplates.map((focus) => ({
      id: focus.id,
      title: focus.title,
      category: focus.category,
      role: focus.role,
      description: focus.description,
      defaultSignalIds: focus.defaultSignalIds ?? [],
      defaultMetricIds: focus.defaultMetricIds ?? [],
      suggestedTargets: focus.suggestedTargets ?? [],
      defaultActionIds: focus.defaultActionIds ?? [],
      supportedGoalIds: goals
        .filter((goal) => goal.defaultFocusPath.includes(focus.id))
        .map((goal) => goal.id)
    }));
    const metrics = templates.metricTemplates;
    const actions = templates.actionTemplates;

    response.json({
      taxonomy: {
        goals,
        focuses,
        signals: templates.signalTemplates,
        metrics,
        targets: templates.targetTemplates,
        actions,
        teamFocuses: templates.teamFocusTemplates
      },
      deterministicSources: {
        activeParsers: deterministic.activeParsers,
        emittedTags: deterministic.emittedTags,
        gamePhase: deterministic.phaseThresholds,
        mapTimers: deterministic.mapTimers,
        goalTypes: goalTypes.map((goalType) => ({
          id: goalType.id,
          title: goalType.title,
          evidenceCategories: goalType.evidenceCategories ?? [],
          subscribedPatterns: goalType.tagSubscriptions ?? []
        }))
      },
      relationships: {
        goalsToFocuses: goals.flatMap((goal) =>
          goal.defaultFocusPath.map((focusId, order) => ({
            goalId: goal.id,
            focusId,
            order
          }))
        ),
        focusesToSignals: focuses.flatMap((focus) =>
          focus.defaultSignalIds.map((signalId) => ({ focusId: focus.id, signalId }))
        ),
        focusesToMetrics: focuses.flatMap((focus) =>
          focus.defaultMetricIds.map((metricId) => ({ focusId: focus.id, metricId }))
        ),
        metricsToSignals: metrics.flatMap((metric) =>
          (metric.signalIds ?? []).map((signalId) => ({ metricId: metric.id, signalId }))
        ),
        actionsToFocuses: actions.flatMap((action) =>
          (action.linkedFocusTemplateIds ?? []).map((focusId) => ({ actionId: action.id, focusId }))
        )
      },
      goalTypes: goalTypes.map((goalType) => ({
        id: goalType.id,
        title: goalType.title,
        evidenceCategories: goalType.evidenceCategories ?? [],
        subscribedPatterns: goalType.tagSubscriptions ?? []
      })),
      deterministicEvidenceParsers: deterministic.activeParsers,
      systemEvidencePatterns: deterministic.emittedTags,
      gamePhase: deterministic.phaseThresholds,
      mapTimers: deterministic.mapTimers
    });
  });

  return router;
}
