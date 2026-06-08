import { describe, expect, it } from "vitest";

import {
  evaluateEvidenceGoalMatch,
  linkParsedEvidenceToGoals,
  matchEvidenceToGoals
} from "../../server/goal-dashboard/evidence-goal-linking.js";

const goalTypes = [
  {
    id: "death_review",
    evidenceCategories: ["death_review"],
    tagSubscriptions: ["low_hp_positioning", "lost_fight_stagger"]
  },
  {
    id: "tempo_conversion",
    evidenceCategories: ["tempo_conversion"],
    tagSubscriptions: ["overstay_after_conversion"]
  }
];

function activeGoal(overrides = {}) {
  return {
    id: "goal-1",
    goalTypeId: "death_review",
    active: true,
    ...overrides
  };
}

function evidence(overrides = {}) {
  return {
    id: "evidence-1",
    category: "death_review",
    tags: [{ id: "low_hp_positioning" }],
    playerRole: "BOTTOM",
    championName: "Ashe",
    confidence: 0.9,
    ...overrides
  };
}

describe("evidence-to-goal linking", () => {
  it("links evidence by category match", () => {
    const matches = matchEvidenceToGoals(
      evidence({ tags: [] }),
      [activeGoal()],
      goalTypes
    );

    expect(matches).toEqual([
      {
        evidenceId: "evidence-1",
        goalId: "goal-1",
        goalTypeId: "death_review",
        matchReason: {
          categoryMatch: true,
          matchedTags: [],
          skippedByRoleScope: false,
          skippedByChampionScope: false
        }
      }
    ]);
  });

  it("links evidence by tag subscription match", () => {
    const matches = matchEvidenceToGoals(
      evidence({ category: "fight_participation", tags: [{ id: "lost_fight_stagger" }] }),
      [activeGoal()],
      goalTypes
    );

    expect(matches[0].matchReason).toMatchObject({
      categoryMatch: false,
      matchedTags: ["lost_fight_stagger"]
    });
  });

  it("does not link evidence without a category or tag match", () => {
    const matches = matchEvidenceToGoals(
      evidence({ category: "vision_information", tags: [{ id: "control_ward_missing" }] }),
      [activeGoal()],
      goalTypes
    );

    expect(matches).toEqual([]);
  });

  it("returns a role scope skip reason", () => {
    const evaluation = evaluateEvidenceGoalMatch(
      evidence({ playerRole: "JUNGLE" }),
      activeGoal({ role: "ADC" }),
      goalTypes[0]
    );

    expect(evaluation).toMatchObject({
      matched: false,
      matchReason: {
        categoryMatch: false,
        matchedTags: [],
        skippedByRoleScope: true,
        skippedByChampionScope: false
      }
    });
  });

  it("returns a champion scope skip reason", () => {
    const evaluation = evaluateEvidenceGoalMatch(
      evidence({ championName: "Jinx" }),
      activeGoal({ championScope: ["Ashe"] }),
      goalTypes[0]
    );

    expect(evaluation).toMatchObject({
      matched: false,
      matchReason: {
        categoryMatch: false,
        matchedTags: [],
        skippedByRoleScope: false,
        skippedByChampionScope: true
      }
    });
  });

  it("keeps evidence available when no goals match", () => {
    const result = linkParsedEvidenceToGoals({
      parsedEvidence: [
        evidence({ id: "unlinked-strong-evidence", category: "vision_information", tags: [{ id: "control_ward_missing" }] })
      ],
      activeGoals: [activeGoal()],
      goalTypes,
      linkedAt: "2026-06-01T00:00:00.000Z"
    });

    expect(result.evidenceGoalLinks).toEqual([]);
    expect(result.evidence).toHaveLength(1);
    expect(result.unlinkedEvidence).toEqual(result.evidence);
  });
});
