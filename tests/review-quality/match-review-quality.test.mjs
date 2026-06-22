import { describe, expect, it } from "vitest";

import { buildMatchReviewPlan } from "../../public/app/app.js";
import {
  evaluateScenario,
  frame,
  killEvent,
  levelUpEvent,
  objectiveKillEvent,
  participant,
  reviewFromEvaluation
} from "../fixtures/match-evaluator-fixtures.mjs";

function allReviewText(plan) {
  const chunks = [
    plan?.mainReview?.title,
    plan?.mainReview?.diagnosis,
    ...(plan?.mainReview?.evidence ?? []),
    plan?.mainReview?.takeaway,
    ...(plan?.reviewMoments ?? []).flatMap((moment) => [
      moment.headline,
      moment.primaryLabel,
      ...(moment.evidenceFacts ?? []),
      moment.reviewQuestion,
      moment.whyReview,
      ...(moment.factorOptions ?? []).flatMap((factor) => [
        factor.label,
        ...(factor.interpretationReasons ?? []),
        factor.nextGameRule
      ])
    ])
  ];
  return chunks.flat().filter(Boolean).join(" \n ").toLowerCase();
}

function expectNoWrongRoleLanguage(plan, role) {
  const forbiddenByRole = {
    TOP: [/support proximity/i, /adc safety/i, /peel range/i, /bot 2v2/i, /lane partner cover/i],
    JUNGLE: [/last hit/i, /cs\/min/i, /support left you/i, /adc safety/i],
    SUPPORT: [/your cs/i, /last-hit better/i]
  };
  const text = allReviewText(plan);
  for (const pattern of forbiddenByRole[role] ?? []) {
    expect(text).not.toMatch(pattern);
  }
}

function expectNoKnownBadSmells(plan, { allowsObjectiveAdvice = false } = {}) {
  const text = allReviewText(plan);
  expect(text).not.toMatch(/lane matchup participants were involved/i);
  expect(text).not.toMatch(/use this when the replay shows a different cause/i);
  expect(text).not.toMatch(/objective relevance unclear/i);
  expect(text).not.toMatch(/relevant because it was relevant/i);
  expect(text).not.toMatch(/enemy hit level 8|level 8 timing|level breakpoint/i);
  if (!allowsObjectiveAdvice) {
    expect(text).not.toMatch(/dragon|baron|herald|objective setup|objective timing|set vision before contesting/i);
  }

  const questions = (plan.reviewMoments ?? []).map((moment) => moment.reviewQuestion).filter(Boolean);
  if (questions.length > 1) {
    expect(new Set(questions).size).toBe(questions.length);
  }

  for (const moment of plan.reviewMoments ?? []) {
    expect(moment.evidenceFacts?.length ?? 0).toBeGreaterThan(0);
    expect(moment.reviewQuestion).toBeTruthy();
    expect((moment.factorOptions ?? []).some((factor) =>
      !["manual_other_pattern", "no_clear_deterministic_cause"].includes(factor.id)
    )).toBe(true);
  }
}

function scoreReviewQuality(plan, { role, expectedGoalKind, objectiveTagged = false, laneTagged = false } = {}) {
  const text = allReviewText(plan);
  const moments = plan.reviewMoments ?? [];
  const nonManualFactors = moments.flatMap((moment) =>
    (moment.factorOptions ?? []).filter((factor) => !["manual_other_pattern", "no_clear_deterministic_cause"].includes(factor.id))
  );
  const dimensions = {
    hasConcreteEvidence: moments.length > 0 && moments.every((moment) => (moment.evidenceFacts ?? []).length > 0 && Boolean(moment.reviewQuestion)),
    hasRoleFit: !role || (() => {
      try {
        expectNoWrongRoleLanguage(plan, role);
        return true;
      } catch {
        return false;
      }
    })(),
    hasGoalFit: !expectedGoalKind || plan.goalKind === expectedGoalKind,
    hasActionableRule: nonManualFactors.some((factor) => /next game:/.test(String(factor.nextGameRule ?? "").toLowerCase())),
    hasNoWrongRoleLanguage: !role || (() => {
      try {
        expectNoWrongRoleLanguage(plan, role);
        return true;
      } catch {
        return false;
      }
    })(),
    hasNoKnownBadSmells: !/lane matchup participants were involved|use this when the replay shows a different cause|objective relevance unclear|relevant because it was relevant/i.test(text),
    hasObjectiveEvidenceWhenObjectiveTagged: !objectiveTagged || /dragon|baron|herald|objective/.test(text),
    hasLaneContextWhenLaneTagged: !laneTagged || /lane|gank|roam|2v2|2v1|fight shape|enemy participants/.test(text)
  };
  const passed = Object.values(dimensions).filter(Boolean).length;
  return { score: Math.round((passed / Object.keys(dimensions).length) * 100), dimensions };
}

function planFor(scenario, activeGoalTitle = "Die Less") {
  const review = reviewFromEvaluation(scenario.evaluation, { activeGoalTitle });
  return buildMatchReviewPlan(review);
}

function expectTags(evaluation, { contains = [], notContains = [] }) {
  const tags = evaluation.deathsJson.flatMap((death) => death.tags ?? []);
  for (const tag of contains) expect(tags).toContain(tag);
  for (const tag of notContains) expect(tags).not.toContain(tag);
}

function botParticipants() {
  return [
    participant({ puuid: "target_puuid", participantId: 1, championName: "Ashe", teamId: 100, teamPosition: "BOTTOM", individualPosition: "BOTTOM", lane: "BOTTOM" }),
    participant({ participantId: 2, championName: "Leona", teamId: 100, teamPosition: "UTILITY", individualPosition: "UTILITY", lane: "BOTTOM" }),
    participant({ participantId: 6, championName: "Jinx", teamId: 200, teamPosition: "BOTTOM", individualPosition: "BOTTOM", lane: "BOTTOM" }),
    participant({ participantId: 7, championName: "Nautilus", teamId: 200, teamPosition: "UTILITY", individualPosition: "UTILITY", lane: "BOTTOM" })
  ];
}

function bot2v2Scenario() {
  return evaluateScenario({
    participants: botParticipants(),
    perspective: { participantId: 1, championName: "Ashe", teamId: 100, teamPosition: "BOTTOM" },
    frames: [
      frame(120_000, {
        1: { level: 4, position: { x: 10_800, y: 2_900 } },
        2: { level: 4, position: { x: 11_050, y: 2_950 } },
        6: { level: 4, position: { x: 10_900, y: 3_000 } },
        7: { level: 4, position: { x: 11_000, y: 3_100 } }
      }, [
        killEvent({ timestamp: 120_000, victimId: 1, killerId: 6, assistingParticipantIds: [7], position: { x: 10_800, y: 2_900 } })
      ])
    ]
  });
}

function bot2v1Scenario() {
  return evaluateScenario({
    participants: botParticipants(),
    perspective: { participantId: 1, championName: "Ashe", teamId: 100, teamPosition: "BOTTOM" },
    frames: [
      frame(120_000, {
        1: { level: 4, position: { x: 10_800, y: 2_900 } },
        6: { level: 4, position: { x: 10_900, y: 3_000 } },
        7: { level: 4, position: { x: 11_000, y: 3_100 } }
      }, [
        killEvent({ timestamp: 120_000, victimId: 1, killerId: 6, assistingParticipantIds: [7], position: { x: 10_800, y: 2_900 } })
      ])
    ]
  });
}

function topGankScenario() {
  return evaluateScenario({
    participants: [
      participant({ puuid: "target_puuid", participantId: 1, championName: "Gwen", teamId: 100, teamPosition: "TOP", individualPosition: "TOP", lane: "TOP" }),
      participant({ participantId: 6, championName: "Renekton", teamId: 200, teamPosition: "TOP", individualPosition: "TOP", lane: "TOP" }),
      participant({ participantId: 7, championName: "Taliyah", teamId: 200, teamPosition: "JUNGLE", individualPosition: "JUNGLE", lane: "JUNGLE" })
    ],
    perspective: { participantId: 1, championName: "Gwen", teamId: 100, teamPosition: "TOP" },
    frames: [
      frame(120_000, { 1: 5, 6: 5, 7: 5 }, [
        killEvent({ timestamp: 120_000, victimId: 1, killerId: 6, assistingParticipantIds: [7], position: { x: 2_900, y: 10_000 } })
      ])
    ]
  });
}

function topRoamScenario() {
  return evaluateScenario({
    participants: [
      participant({ puuid: "target_puuid", participantId: 1, championName: "Gwen", teamId: 100, teamPosition: "TOP", individualPosition: "TOP", lane: "TOP" }),
      participant({ participantId: 6, championName: "Renekton", teamId: 200, teamPosition: "TOP", individualPosition: "TOP", lane: "TOP" }),
      participant({ participantId: 7, championName: "Ahri", teamId: 200, teamPosition: "MIDDLE", individualPosition: "MIDDLE", lane: "MIDDLE" })
    ],
    perspective: { participantId: 1, championName: "Gwen", teamId: 100, teamPosition: "TOP" },
    frames: [
      frame(120_000, { 1: 6, 6: 6, 7: 6 }, [
        killEvent({ timestamp: 120_000, victimId: 1, killerId: 6, assistingParticipantIds: [7], position: { x: 2_900, y: 10_000 } })
      ])
    ]
  });
}

function midRoamScenario() {
  return evaluateScenario({
    participants: [
      participant({ puuid: "target_puuid", participantId: 1, championName: "Syndra", teamId: 100, teamPosition: "MIDDLE", individualPosition: "MIDDLE", lane: "MIDDLE" }),
      participant({ participantId: 6, championName: "Ahri", teamId: 200, teamPosition: "MIDDLE", individualPosition: "MIDDLE", lane: "MIDDLE" }),
      participant({ participantId: 7, championName: "Nautilus", teamId: 200, teamPosition: "UTILITY", individualPosition: "UTILITY", lane: "BOTTOM" })
    ],
    perspective: { participantId: 1, championName: "Syndra", teamId: 100, teamPosition: "MIDDLE" },
    frames: [
      frame(120_000, { 1: 6, 6: 6, 7: 5 }, [
        killEvent({ timestamp: 120_000, victimId: 1, killerId: 6, assistingParticipantIds: [7], position: { x: 6_800, y: 6_900 } })
      ])
    ]
  });
}

function jungleObjectiveScenario() {
  return evaluateScenario({
    participants: [
      participant({ puuid: "target_puuid", participantId: 1, championName: "Vi", teamId: 100, teamPosition: "JUNGLE", individualPosition: "JUNGLE", lane: "JUNGLE" }),
      participant({ participantId: 6, championName: "LeeSin", teamId: 200, teamPosition: "JUNGLE", individualPosition: "JUNGLE", lane: "JUNGLE" })
    ],
    perspective: { participantId: 1, championName: "Vi", teamId: 100, teamPosition: "JUNGLE" },
    frames: [
      frame(310_000, { 1: { level: 6, position: { x: 9_700, y: 4_500 } }, 6: { level: 6, position: { x: 9_800, y: 4_400 } } }, [
        objectiveKillEvent({ timestamp: 330_000, monsterType: "DRAGON", killerId: 6, killerTeamId: 200 }),
        killEvent({ timestamp: 310_000, victimId: 1, killerId: 6, assistingParticipantIds: [], position: { x: 9_700, y: 4_500 } })
      ])
    ]
  });
}

describe("review-quality role scenarios", () => {
  it("keeps a normal bot 2v2 as lane fight review, not generic collapse", () => {
    const { evaluation, review } = bot2v2Scenario();
    const plan = buildMatchReviewPlan(review);
    const text = allReviewText(plan);

    expectTags(evaluation, {
      contains: ["bot_lane_2v2_death"],
      notContains: ["multi_enemy_collapse_candidate"]
    });
    expect(plan.reviewMoments[0].primaryLabel).toMatch(/2v2|lane/i);
    expect(text).toMatch(/2v2|lane fight|even fight/i);
    expect(text).toMatch(/killed by jinx/i);
    expect(text).toMatch(/assisted by nautilus/i);
    expect(text).not.toMatch(/enemy participants:.*jinx.*nautilus/i);
    expect(text).toMatch(/leona.*trade or peel|lane partners commit/i);
    expect(text).not.toMatch(/multiple enemies|collapse/i);
    expectNoKnownBadSmells(plan);
    expect(scoreReviewQuality(plan, { role: "SUPPORT", expectedGoalKind: "die_less", laneTagged: true }).score).toBeGreaterThanOrEqual(80);
  });

  it("keeps a bot 2v1 punish focused on partner cover instead of generic multiple enemies", () => {
    const { evaluation, review } = bot2v1Scenario();
    const plan = buildMatchReviewPlan(review);
    const text = allReviewText(plan);

    expectTags(evaluation, {
      contains: ["bot_lane_2v1_punish"],
      notContains: ["multi_enemy_collapse_candidate"]
    });
    expect(text).toMatch(/2v1|partner can cover|allied lane partner was not detected/i);
    expect(text).not.toMatch(/multiple enemies/i);
    expectNoKnownBadSmells(plan);
  });

  it("keeps a top lane gank distinct from bot or support-peel language", () => {
    const { evaluation, review } = topGankScenario();
    const plan = buildMatchReviewPlan(review);
    const text = allReviewText(plan);

    expectTags(evaluation, {
      contains: ["lane_gank_death"],
      notContains: ["multi_enemy_collapse_candidate"]
    });
    expect(text).toMatch(/top-lane gank|enemy jungle involved|enemy top \+ jungle/i);
    expectNoWrongRoleLanguage(plan, "TOP");
    expectNoKnownBadSmells(plan);
    expect(scoreReviewQuality(plan, { role: "TOP", expectedGoalKind: "die_less", laneTagged: true }).score).toBeGreaterThanOrEqual(80);
  });

  it("keeps a top lane roam/collapse role-specific and non-bot-lane", () => {
    const { evaluation, review } = topRoamScenario();
    const plan = buildMatchReviewPlan(review);
    const text = allReviewText(plan);

    expectTags(evaluation, {
      contains: ["top_lane_roam"],
      notContains: ["multi_enemy_collapse_candidate"]
    });
    expect(text).toMatch(/top-lane roam\/collapse|enemy mid joined|non-lane enemy joined/i);
    expect(text).not.toMatch(/bot-lane|bot 2v2|lane partner cover/i);
    expectNoWrongRoleLanguage(plan, "TOP");
    expectNoKnownBadSmells(plan);
  });

  it("keeps a mid lane roam/collapse from sounding like ADC support proximity coaching", () => {
    const { evaluation, review } = midRoamScenario();
    const plan = buildMatchReviewPlan(review);
    const text = allReviewText(plan);

    expectTags(evaluation, {
      contains: ["mid_lane_roam"],
      notContains: ["multi_enemy_collapse_candidate"]
    });
    expect(text).toMatch(/mid-lane roam\/collapse|enemy support joined|non-lane enemy joined/i);
    expect(text).not.toMatch(/adc|bot 2v2|lane partner cover|support proximity/i);
    expectNoKnownBadSmells(plan);
  });

  it("surfaces objective evidence and objective replay question for jungle objective deaths", () => {
    const { evaluation, review } = jungleObjectiveScenario();
    const plan = buildMatchReviewPlan(review);
    const text = allReviewText(plan);

    expectTags(evaluation, {
      contains: ["objective_window_candidate"],
      notContains: []
    });
    expect(evaluation.deathsJson[0].tags).toEqual(expect.arrayContaining([
      expect.stringMatching(/^objective_(setup|exit)_death_candidate$/)
    ]));
    expect(text).toMatch(/dragon/i);
    expect(plan.reviewMoments[0].reviewQuestion).toMatch(/dragon|objective/i);
    expect(text).not.toMatch(/^.*generic positioning.*$/i);
    expectNoWrongRoleLanguage(plan, "JUNGLE");
    expectNoKnownBadSmells(plan, { allowsObjectiveAdvice: true });
    expect(scoreReviewQuality(plan, { role: "JUNGLE", expectedGoalKind: "die_less", objectiveTagged: true }).score).toBeGreaterThanOrEqual(80);
  });
});

describe("review-quality goal fit", () => {
  it("uses death language and prioritizes death evidence for Die Less", () => {
    const scenario = bot2v2Scenario();
    const plan = planFor(scenario, "Die Less");

    expect(plan.goalKind).toBe("die_less");
    expect(plan.reviewMoments[0].headline).toMatch(/^Death at /);
    expect(plan.reviewMoments[0].progressLabel).toMatch(/^Death 1 of 1$/);
    expect(plan.reviewMoments[0].evidenceFacts.join(" ")).toMatch(/killed by|fight shape|enemy participants/i);
  });

  it("uses moment language for Farm Better while documenting death-derived limitation", () => {
    const scenario = bot2v2Scenario();
    const plan = planFor(scenario, "Farm Better");

    expect(plan.goalKind).toBe("farm");
    expect(plan.reviewMoments[0].headline).toMatch(/bot lane 2v2 death|2v2 lane death|review moment/i);
    expect(plan.reviewMoments[0].progressLabel).toBe("Moment 1 of 1");
    expect(plan.reviewMoments[0].evidenceFacts.join(" ")).toMatch(/killed by|fight shape/i);
    // TODO: Farm-specific quality needs farm/economy/wave evidence in review input.
    expect(plan.reviewMoments[0].waveImpactFacts ?? []).toEqual([]);
  });

  it("does not suppress objective timing evidence for Better Objectives", () => {
    const scenario = jungleObjectiveScenario();
    const plan = planFor(scenario, "Better Objectives");
    const text = allReviewText(plan);

    expect(plan.goalKind).toBe("objective");
    expect(text).toMatch(/dragon/i);
    expect(plan.reviewMoments[0].headline).toMatch(/objective|dragon|collapsed|setup/i);
    expect(plan.reviewMoments[0].reviewQuestion).toMatch(/dragon|objective/i);
  });

  it("keeps lane evidence visible for Lane Better when no objective evidence exists", () => {
    const scenario = topGankScenario();
    const plan = planFor(scenario, "Lane Better");
    const text = allReviewText(plan);

    expect(plan.goalKind).toBe("laning");
    expect(text).toMatch(/top-lane gank|enemy jungle involved|enemy top \+ jungle/i);
    expect(text).not.toMatch(/dragon|baron|herald|objective setup|set vision before contesting/i);
    expectNoKnownBadSmells(plan);
  });
});

describe("review-quality smell guards", () => {
  it("does not create level-breakpoint advice for level 8+ enemy level-ups", () => {
    const { evaluation, review } = evaluateScenario({
      participants: [
        participant({ puuid: "target_puuid", participantId: 1, championName: "Gwen", teamId: 100, teamPosition: "TOP", individualPosition: "TOP", lane: "TOP" }),
        participant({ participantId: 6, championName: "Renekton", teamId: 200, teamPosition: "TOP", individualPosition: "TOP", lane: "TOP" })
      ],
      perspective: { participantId: 1, championName: "Gwen", teamId: 100, teamPosition: "TOP" },
      frames: [
        frame(120_000, { 1: 7, 6: 8 }, [
          levelUpEvent({ timestamp: 105_000, participantId: 6, level: 8 }),
          killEvent({ timestamp: 120_000, victimId: 1, killerId: 6, assistingParticipantIds: [] })
        ])
      ]
    });
    const plan = buildMatchReviewPlan(review);
    const text = allReviewText(plan);

    expect(evaluation.deathsJson[0].tags).not.toContain("level_up_all_in_candidate");
    expect(text).not.toMatch(/level breakpoint|enemy hit level 8|level 8 timing/i);
  });

  it("does not add objective advice when evaluator has no objective facts or tags", () => {
    const { evaluation, review } = bot2v2Scenario();
    const plan = buildMatchReviewPlan(review);

    expect(evaluation.deathsJson[0].objectiveFacts).toEqual([]);
    expect(evaluation.deathsJson[0].tags).not.toContain("objective_window_candidate");
    expectNoKnownBadSmells(plan);
  });
});
