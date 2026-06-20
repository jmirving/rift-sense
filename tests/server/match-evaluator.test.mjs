import { expect, it } from "vitest";

import {
  DETERMINISTIC_MATCH_EVALUATOR_VERSION,
  evaluateMatchFacts,
  summarizeMatchEvaluation
} from "../../server/riot/match-evaluator.js";

const baseNow = new Date("2026-06-09T12:00:00.000Z");

function participant(overrides) {
  return {
    puuid: `puuid_${overrides.participantId}`,
    participantId: overrides.participantId,
    championName: overrides.championName,
    teamId: overrides.teamId,
    teamPosition: overrides.teamPosition ?? "MIDDLE",
    individualPosition: overrides.individualPosition ?? "MIDDLE",
    lane: overrides.lane ?? "MIDDLE",
    win: false,
    kills: 1,
    deaths: 1,
    assists: 2,
    ...overrides
  };
}

function summary(participants = [
  participant({ puuid: "target_puuid", participantId: 1, championName: "Ahri", teamId: 100 }),
  participant({ participantId: 6, championName: "Zed", teamId: 200 }),
  participant({ participantId: 7, championName: "LeeSin", teamId: 200 })
]) {
  return {
    metadata: { matchId: "NA1_050" },
    info: {
      queueId: 420,
      gameCreation: 1_780_000_000_000,
      gameDuration: 1800,
      participants
    }
  };
}

function frame(timestamp, levels = {}) {
  return {
    timestamp,
    participantFrames: Object.fromEntries(
      Object.entries(levels).map(([participantId, value]) => {
        const participantFrame = typeof value === "object" && value !== null
          ? { participantId: Number(participantId), ...value }
          : { participantId: Number(participantId), level: value };
        return [participantId, participantFrame];
      })
    )
  };
}

function evaluate({ summaryJson = summary(), timelineJson, puuid = "target_puuid", perspectiveRecord = null } = {}) {
  return evaluateMatchFacts({
    matchId: "NA1_050",
    puuid,
    summaryJson,
    timelineJson,
    perspectiveRecord: perspectiveRecord ?? {
      matchId: "NA1_050",
      puuid,
      participantId: 1,
      championName: "Ahri",
      teamId: 100,
      teamPosition: "MIDDLE"
    },
    now: baseNow
  });
}

it("finds participant by puuid and emits the stable evaluation version", () => {
  const result = evaluate({ timelineJson: { info: { frames: [frame(0, { 1: 1 })] } } });

  expect(result.evaluationVersion).toBe(DETERMINISTIC_MATCH_EVALUATOR_VERSION);
  expect(result.summaryJson).toMatchObject({
    matchId: "NA1_050",
    puuid: "target_puuid",
    championName: "Ahri",
    queueId: 420,
    participantId: 1,
    role: "MIDDLE",
    evaluatedAt: "2026-06-09T12:00:00.000Z",
    evaluationVersion: "deterministic-v2"
  });
});

it("extracts death events and conservative deterministic tags", () => {
  const result = evaluate({
    timelineJson: {
      info: {
        frames: [
          frame(100_000, { 1: 5, 6: 5, 7: 5 }),
          {
            ...frame(120_000, { 1: 5, 6: 6, 7: 5 }),
            events: [
              { type: "LEVEL_UP", timestamp: 105_000, participantId: 6, level: 6 },
              { type: "ELITE_MONSTER_KILL", timestamp: 112_000, monsterType: "DRAGON", killerId: 7 },
              {
                type: "CHAMPION_KILL",
                timestamp: 120_000,
                victimId: 1,
                killerId: 6,
                assistingParticipantIds: [7],
                position: { x: 5000, y: 6000 }
              }
            ]
          }
        ]
      }
    }
  });

  expect(result.deathsJson).toHaveLength(1);
  expect(result.deathsJson[0]).toMatchObject({
      deathIndex: 1,
      timestampMs: 120_000,
      timestampSeconds: 120,
      minute: 2,
      victimParticipantId: 1,
      killerParticipantId: 6,
      killerChampionName: "Zed",
      assistingParticipantIds: [7],
      assistingChampionNames: ["LeeSin"],
      position: { x: 5000, y: 6000 },
      victimLevel: 5,
      killerLevel: 6,
      enemyParticipantsInvolved: [6, 7],
      enemyLevelUpsBeforeDeath: [
        {
          participantId: 6,
          timestampMs: 105_000,
          level: 6,
          championName: "Zed",
          secondsBeforeDeath: 15
        }
      ],
      tags: [
        "multi_enemy_collapse_candidate",
        "objective_window_candidate",
        "objective_exit_death_candidate",
        "enemy_level_up_recently_candidate",
        "level_up_all_in_candidate"
      ]
  });
  expect(result.deathsJson[0].fightShape).toMatchObject({
    enemyCount: 2,
    alliedCount: 1,
    notation: "2v1",
    helperText: "Enemy 2 / Allied 1 near the death"
  });
  expect(result.deathsJson[0].gamePhase).toBe("lane_phase");
  expect(result.deathsJson[0].objectiveFacts[0]).toMatchObject({
    name: "dragon",
    secondsFromDeath: -8,
    timing: "killed_before_death"
  });
  expect(result.summaryJson).toMatchObject({
    teamId: 100,
    teamSide: "blue",
    teamSideLabel: "You were blue side"
  });
  expect(result.tagsJson.counts).toMatchObject({
    death_count: 1,
    solo_death_candidate: 0,
    multi_enemy_collapse_candidate: 1,
    objective_window_candidate: 1,
    objective_setup_death_candidate: 0,
    objective_exit_death_candidate: 1,
    enemy_level_up_recently_candidate: 1,
    level_up_all_in_candidate: 1,
    isolated_forward_death_candidate: 0,
    missing_timeline: 0,
    missing_participant: 0
  });
});

it("handles zero-death games", () => {
  const result = evaluate({
    timelineJson: {
      info: {
        frames: [
          {
            ...frame(0, { 1: 1 }),
            events: [{ type: "WARD_PLACED", timestamp: 1_000, participantId: 1 }]
          }
        ]
      }
    }
  });

  expect(result.deathsJson).toEqual([]);
  expect(result.tagsJson.counts.death_count).toBe(0);
  expect(result.tagsJson.counts.missing_timeline).toBe(0);
});

it("marks missing malformed timeline without guessing", () => {
  const result = evaluate({ timelineJson: { metadata: { matchId: "NA1_050" } } });

  expect(result.deathsJson).toEqual([]);
  expect(result.tagsJson.counts).toMatchObject({
    death_count: 0,
    missing_timeline: 1,
    missing_participant: 0
  });
  expect(result.tagsJson.matchTags).toEqual(["missing_timeline"]);
});

it("marks missing participant without throwing", () => {
  const result = evaluate({
    puuid: "absent_puuid",
    timelineJson: { info: { frames: [frame(0, { 1: 1 })] } },
    perspectiveRecord: { matchId: "NA1_050", puuid: "absent_puuid" }
  });

  expect(result.summaryJson.participantId).toBeNull();
  expect(result.deathsJson).toEqual([]);
  expect(result.tagsJson.counts.missing_participant).toBe(1);
});

it("tags solo deaths when exactly one enemy participant is involved", () => {
  const result = evaluate({
    timelineJson: {
      info: {
        frames: [
          {
            ...frame(60_000, { 1: 5, 6: 6 }),
            events: [
              {
                type: "CHAMPION_KILL",
                timestamp: 60_000,
                victimId: 1,
                killerId: 6,
                assistingParticipantIds: []
              }
            ]
          }
        ]
      }
    }
  });

  expect(result.deathsJson[0].tags).toEqual(["solo_death_candidate"]);
  expect(result.tagsJson.counts.solo_death_candidate).toBe(1);
});

it("emits level breakpoint candidates for enemy level 2 before death", () => {
  const result = evaluate({
    timelineJson: {
      info: {
        frames: [
          {
            ...frame(120_000, { 1: 1, 6: 2 }),
            events: [
              { type: "LEVEL_UP", timestamp: 105_000, participantId: 6, level: 2 },
              {
                type: "CHAMPION_KILL",
                timestamp: 120_000,
                victimId: 1,
                killerId: 6,
                assistingParticipantIds: []
              }
            ]
          }
        ]
      }
    }
  });

  expect(result.deathsJson[0].tags).toContain("level_up_all_in_candidate");
  expect(result.deathsJson[0].enemyLevelUpsBeforeDeath).toEqual([
    {
      participantId: 6,
      timestampMs: 105_000,
      level: 2,
      championName: "Zed",
      secondsBeforeDeath: 15
    }
  ]);
  expect(result.tagsJson.counts.level_up_all_in_candidate).toBe(1);
});

it("emits level breakpoint candidates for enemy level 3 before death", () => {
  const result = evaluate({
    timelineJson: {
      info: {
        frames: [
          {
            ...frame(120_000, { 1: 2, 6: 3 }),
            events: [
              { type: "LEVEL_UP", timestamp: 105_000, participantId: 6, level: 3 },
              {
                type: "CHAMPION_KILL",
                timestamp: 120_000,
                victimId: 1,
                killerId: 6,
                assistingParticipantIds: []
              }
            ]
          }
        ]
      }
    }
  });

  expect(result.deathsJson[0].tags).toContain("level_up_all_in_candidate");
  expect(result.deathsJson[0].enemyLevelUpsBeforeDeath[0].level).toBe(3);
});

it("emits level breakpoint candidates for enemy level 6 before death", () => {
  const result = evaluate({
    timelineJson: {
      info: {
        frames: [
          {
            ...frame(120_000, { 1: 5, 6: 6 }),
            events: [
              { type: "LEVEL_UP", timestamp: 105_000, participantId: 6, level: 6 },
              {
                type: "CHAMPION_KILL",
                timestamp: 120_000,
                victimId: 1,
                killerId: 6,
                assistingParticipantIds: []
              }
            ]
          }
        ]
      }
    }
  });

  expect(result.deathsJson[0].tags).toContain("level_up_all_in_candidate");
  expect(summarizeMatchEvaluation(result).reviewSignals).toContain("1 level breakpoint candidate");
});

it("does not emit generic level-up timing after level 6", () => {
  const result = evaluate({
    timelineJson: {
      info: {
        frames: [
          {
            ...frame(120_000, { 1: 7, 6: 8 }),
            events: [
              { type: "LEVEL_UP", timestamp: 105_000, participantId: 6, level: 8 },
              {
                type: "CHAMPION_KILL",
                timestamp: 120_000,
                victimId: 1,
                killerId: 6,
                assistingParticipantIds: []
              }
            ]
          }
        ]
      }
    }
  });

  expect(result.deathsJson[0].tags).not.toContain("enemy_level_up_recently_candidate");
  expect(result.deathsJson[0].tags).not.toContain("level_up_all_in_candidate");
  expect(result.deathsJson[0].enemyLevelUpsBeforeDeath).toEqual([]);
});

it("does not emit level_up_all_in_candidate for enemy level-ups after death", () => {
  const result = evaluate({
    timelineJson: {
      info: {
        frames: [
          {
            ...frame(120_000, { 1: 8, 6: 10 }),
            events: [
              {
                type: "CHAMPION_KILL",
                timestamp: 120_000,
                victimId: 1,
                killerId: 6,
                assistingParticipantIds: []
              },
              { type: "LEVEL_UP", timestamp: 121_000, participantId: 6, level: 10 }
            ]
          }
        ]
      }
    }
  });

  expect(result.deathsJson[0].tags).not.toContain("level_up_all_in_candidate");
  expect(result.deathsJson[0].enemyLevelUpsBeforeDeath).toEqual([]);
  expect(result.tagsJson.counts.level_up_all_in_candidate).toBe(0);
});

it("emits distinct objective setup and exit death windows", () => {
  const result = evaluate({
    timelineJson: {
      info: {
        frames: [
          {
            ...frame(100_000, { 1: 8, 6: 8 }),
            events: [
              {
                type: "CHAMPION_KILL",
                timestamp: 100_000,
                victimId: 1,
                killerId: 6,
                assistingParticipantIds: []
              },
              { type: "ELITE_MONSTER_KILL", timestamp: 120_000, monsterType: "DRAGON", killerId: 6 },
              {
                type: "CHAMPION_KILL",
                timestamp: 150_000,
                victimId: 1,
                killerId: 6,
                assistingParticipantIds: []
              }
            ]
          }
        ]
      }
    }
  });

  expect(result.deathsJson[0].tags).toContain("objective_setup_death_candidate");
  expect(result.deathsJson[0].tags).not.toContain("objective_exit_death_candidate");
  expect(result.deathsJson[1].tags).toContain("objective_exit_death_candidate");
  expect(result.deathsJson[1].tags).not.toContain("objective_setup_death_candidate");
  expect(result.tagsJson.counts.objective_setup_death_candidate).toBe(1);
  expect(result.tagsJson.counts.objective_exit_death_candidate).toBe(1);
});

it("adds nearby death counts when participant frame positions support them", () => {
  const result = evaluate({
    summaryJson: summary([
      participant({ puuid: "target_puuid", participantId: 1, championName: "Ahri", teamId: 100 }),
      participant({ participantId: 2, championName: "Vi", teamId: 100 }),
      participant({ participantId: 6, championName: "Zed", teamId: 200 }),
      participant({ participantId: 7, championName: "LeeSin", teamId: 200 })
    ]),
    timelineJson: {
      info: {
        frames: [
          {
            ...frame(120_000, {
              1: { level: 8, position: { x: 5000, y: 5000 } },
              2: { level: 8, position: { x: 5600, y: 5000 } },
              6: { level: 9, position: { x: 5900, y: 5000 } },
              7: { level: 8, position: { x: 9000, y: 9000 } }
            }),
            events: [
              {
                type: "CHAMPION_KILL",
                timestamp: 120_000,
                victimId: 1,
                killerId: 6,
                assistingParticipantIds: [],
                position: { x: 5000, y: 5000 }
              }
            ]
          }
        ]
      }
    }
  });

  expect(result.deathsJson[0]).toMatchObject({
    nearbyEnemyCount: 1,
    nearbyAllyCount: 1,
    nearbyEnemyChampionNames: ["Zed"],
    nearbyAllyChampionNames: ["Vi"]
  });
});

it("does not tag normal bot/support versus bot/support deaths as multi-enemy collapse", () => {
  const result = evaluate({
    summaryJson: summary([
      participant({ puuid: "target_puuid", participantId: 1, championName: "Ashe", teamId: 100, teamPosition: "BOTTOM", individualPosition: "BOTTOM", lane: "BOTTOM" }),
      participant({ participantId: 2, championName: "Leona", teamId: 100, teamPosition: "UTILITY", individualPosition: "UTILITY", lane: "BOTTOM" }),
      participant({ participantId: 6, championName: "Jinx", teamId: 200, teamPosition: "BOTTOM", individualPosition: "BOTTOM", lane: "BOTTOM" }),
      participant({ participantId: 7, championName: "Nautilus", teamId: 200, teamPosition: "UTILITY", individualPosition: "UTILITY", lane: "BOTTOM" })
    ]),
    perspectiveRecord: {
      matchId: "NA1_050",
      puuid: "target_puuid",
      participantId: 1,
      championName: "Ashe",
      teamId: 100,
      teamPosition: "BOTTOM"
    },
    timelineJson: {
      info: {
        frames: [
          {
            ...frame(120_000, {
              1: { level: 4, position: { x: 10_000, y: 4_000 } },
              2: { level: 4, position: { x: 10_300, y: 4_000 } },
              6: { level: 4, position: { x: 10_100, y: 4_100 } },
              7: { level: 4, position: { x: 10_200, y: 4_200 } }
            }),
            events: [
              {
                type: "CHAMPION_KILL",
                timestamp: 120_000,
                victimId: 1,
                killerId: 6,
                assistingParticipantIds: [7],
                position: { x: 10_000, y: 4_000 }
              }
            ]
          }
        ]
      }
    }
  });

  expect(result.deathsJson[0].tags).not.toContain("multi_enemy_collapse_candidate");
  expect(result.deathsJson[0].tags).toContain("bot_lane_2v2_death");
  expect(result.deathsJson[0].laneDeathContext).toBe("bot_lane_2v2_death");
});

it("tags bot 2v1 punish when allied lane partner is not detected", () => {
  const result = evaluate({
    summaryJson: summary([
      participant({ puuid: "target_puuid", participantId: 1, championName: "Ashe", teamId: 100, teamPosition: "BOTTOM", individualPosition: "BOTTOM", lane: "BOTTOM" }),
      participant({ participantId: 2, championName: "Leona", teamId: 100, teamPosition: "UTILITY", individualPosition: "UTILITY", lane: "BOTTOM" }),
      participant({ participantId: 6, championName: "Jinx", teamId: 200, teamPosition: "BOTTOM", individualPosition: "BOTTOM", lane: "BOTTOM" }),
      participant({ participantId: 7, championName: "Nautilus", teamId: 200, teamPosition: "UTILITY", individualPosition: "UTILITY", lane: "BOTTOM" })
    ]),
    perspectiveRecord: {
      matchId: "NA1_050",
      puuid: "target_puuid",
      participantId: 1,
      championName: "Ashe",
      teamId: 100,
      teamPosition: "BOTTOM"
    },
    timelineJson: {
      info: {
        frames: [
          {
            ...frame(120_000, { 1: 4, 2: 4, 6: 4, 7: 4 }),
            events: [
              {
                type: "CHAMPION_KILL",
                timestamp: 120_000,
                victimId: 1,
                killerId: 6,
                assistingParticipantIds: [7]
              }
            ]
          }
        ]
      }
    }
  });

  expect(result.deathsJson[0].tags).toContain("bot_lane_2v1_punish");
  expect(result.deathsJson[0].tags).not.toContain("multi_enemy_collapse_candidate");
});

it("tags bot 3v2 deaths as ganks when a jungler joins", () => {
  const result = evaluate({
    summaryJson: summary([
      participant({ puuid: "target_puuid", participantId: 1, championName: "Ashe", teamId: 100, teamPosition: "BOTTOM", individualPosition: "BOTTOM", lane: "BOTTOM" }),
      participant({ participantId: 6, championName: "Jinx", teamId: 200, teamPosition: "BOTTOM", individualPosition: "BOTTOM", lane: "BOTTOM" }),
      participant({ participantId: 7, championName: "Nautilus", teamId: 200, teamPosition: "UTILITY", individualPosition: "UTILITY", lane: "BOTTOM" }),
      participant({ participantId: 8, championName: "LeeSin", teamId: 200, teamPosition: "JUNGLE", individualPosition: "JUNGLE", lane: "JUNGLE" })
    ]),
    timelineJson: {
      info: {
        frames: [
          {
            ...frame(120_000, { 1: 4, 6: 4, 7: 4, 8: 4 }),
            events: [
              {
                type: "CHAMPION_KILL",
                timestamp: 120_000,
                victimId: 1,
                killerId: 6,
                assistingParticipantIds: [7, 8]
              }
            ]
          }
        ]
      }
    }
  });

  expect(result.deathsJson[0].tags).toContain("multi_enemy_collapse_candidate");
  expect(result.deathsJson[0].tags).toContain("bot_lane_gank");
  expect(result.deathsJson[0].laneDeathContext).toBe("bot_lane_gank");
});

it("tags bot deaths as roams when a non-lane role joins", () => {
  const result = evaluate({
    summaryJson: summary([
      participant({ puuid: "target_puuid", participantId: 1, championName: "Ashe", teamId: 100, teamPosition: "BOTTOM", individualPosition: "BOTTOM", lane: "BOTTOM" }),
      participant({ participantId: 6, championName: "Jinx", teamId: 200, teamPosition: "BOTTOM", individualPosition: "BOTTOM", lane: "BOTTOM" }),
      participant({ participantId: 7, championName: "Nautilus", teamId: 200, teamPosition: "UTILITY", individualPosition: "UTILITY", lane: "BOTTOM" }),
      participant({ participantId: 8, championName: "Ahri", teamId: 200, teamPosition: "MIDDLE", individualPosition: "MIDDLE", lane: "MIDDLE" })
    ]),
    timelineJson: {
      info: {
        frames: [
          {
            ...frame(120_000, { 1: 5, 6: 5, 7: 5, 8: 6 }),
            events: [
              {
                type: "CHAMPION_KILL",
                timestamp: 120_000,
                victimId: 1,
                killerId: 6,
                assistingParticipantIds: [7, 8]
              }
            ]
          }
        ]
      }
    }
  });

  expect(result.deathsJson[0].tags).toContain("multi_enemy_collapse_candidate");
  expect(result.deathsJson[0].tags).toContain("bot_lane_roam");
  expect(result.deathsJson[0].laneDeathContext).toBe("bot_lane_roam");
});

it("tags late-game deaths with three nearby enemies as possible collapse", () => {
  const result = evaluate({
    summaryJson: summary([
      participant({ puuid: "target_puuid", participantId: 1, championName: "Ahri", teamId: 100 }),
      participant({ participantId: 6, championName: "Zed", teamId: 200 }),
      participant({ participantId: 7, championName: "LeeSin", teamId: 200 }),
      participant({ participantId: 8, championName: "Jinx", teamId: 200 })
    ]),
    timelineJson: {
      info: {
        frames: [
          {
            ...frame(1_800_000, {
              1: { level: 14, position: { x: 5000, y: 5000 } },
              6: { level: 14, position: { x: 5200, y: 5000 } },
              7: { level: 13, position: { x: 5300, y: 5100 } },
              8: { level: 13, position: { x: 5400, y: 5200 } }
            }),
            events: [
              {
                type: "CHAMPION_KILL",
                timestamp: 1_800_000,
                victimId: 1,
                killerId: 6,
                assistingParticipantIds: [],
                position: { x: 5000, y: 5000 }
              }
            ]
          }
        ]
      }
    }
  });

  expect(result.deathsJson[0].nearbyEnemyCount).toBe(3);
  expect(result.deathsJson[0].tags).toContain("multi_enemy_collapse_candidate");
});

it("omits nearby death counts when participant frame positions are unavailable", () => {
  const result = evaluate({
    timelineJson: {
      info: {
        frames: [
          {
            ...frame(120_000, { 1: 8, 6: 9 }),
            events: [
              {
                type: "CHAMPION_KILL",
                timestamp: 120_000,
                victimId: 1,
                killerId: 6,
                assistingParticipantIds: []
              }
            ]
          }
        ]
      }
    }
  });

  expect(result.deathsJson[0]).not.toHaveProperty("nearbyEnemyCount");
  expect(result.deathsJson[0]).not.toHaveProperty("nearbyAllyCount");
});

it("includes new tags in summaries and top tags when present", () => {
  const result = evaluate({
    timelineJson: {
      info: {
        frames: [
          {
            ...frame(120_000, { 1: 5, 6: 6 }),
            events: [
              { type: "LEVEL_UP", timestamp: 105_000, participantId: 6, level: 6 },
              {
                type: "CHAMPION_KILL",
                timestamp: 120_000,
                victimId: 1,
                killerId: 6,
                assistingParticipantIds: []
              }
            ]
          }
        ]
      }
    }
  });

  const summaryResult = summarizeMatchEvaluation(result);

  expect(summaryResult.topTags.map((entry) => entry.tag)).toContain("level_up_all_in_candidate");
  expect(summaryResult.reviewSignals).toContain("1 level breakpoint candidate");
});
