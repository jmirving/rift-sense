import express from "express";

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

    response.json({
      goalTypes: goalTypes.map((goalType) => ({
        id: goalType.id,
        title: goalType.title,
        evidenceCategories: goalType.evidenceCategories ?? [],
        subscribedPatterns: goalType.tagSubscriptions ?? []
      })),
      deterministicEvidenceParsers: deterministic.activeParsers,
      systemEvidencePatterns: deterministic.emittedTags,
      gamePhase: deterministic.phaseThresholds
    });
  });

  return router;
}
