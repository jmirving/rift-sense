import { expect, it } from "vitest";

import {
  DETERMINISTIC_MATCH_EVALUATOR_VERSION,
  evaluateMatchFacts,
  summarizeMatchEvaluation
} from "../../server/riot/match-evaluator.js";
import { MAP_TIMER_RULES } from "../../server/riot/map-timers.js";

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
        "enemy_level_up_recently_candidate",
        "level_up_all_in_candidate"
      ]
  });
  expect(result.deathsJson[0].fightShape).toMatchObject({
    enemyCount: 2,
    alliedCount: 1,
    notation: "2v1",
    helperText: "Fight shape: 2 enemies vs 1 ally"
  });
  expect(result.deathsJson[0].gamePhase).toBe("lane_phase");
  expect(result.deathsJson[0].objectiveFacts[0]).toMatchObject({
    name: "Dragon",
    secondsFromDeath: -8,
    timing: "before_death",
    source: "timeline_event"
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
    objective_exit_death_candidate: 0,
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

it("does not emit objective relevance at 2:00 without objective evidence", () => {
  const result = evaluate({
    timelineJson: {
      info: {
        frames: [{
          ...frame(120_000, { 1: 4, 6: 4 }),
          events: [{
            type: "CHAMPION_KILL",
            timestamp: 120_000,
            victimId: 1,
            killerId: 6,
            assistingParticipantIds: [],
            position: { x: 7000, y: 7000 }
          }]
        }]
      }
    }
  });

  expect(result.deathsJson[0].tags).not.toContain("objective_window_candidate");
  expect(result.deathsJson[0].objectiveFacts).toEqual([]);
  expect(result.deathsJson[0].evidenceSections.replayCanAnswer.join(" ")).not.toMatch(/objective|dragon|baron|herald/i);
});

it("uses deterministic first dragon setup timing before 5:00", () => {
  const result = evaluate({
    timelineJson: {
      info: {
        frames: [{
          ...frame(260_000, { 1: 5, 6: 5 }),
          events: [{
            type: "CHAMPION_KILL",
            timestamp: 260_000,
            victimId: 1,
            killerId: 6,
            assistingParticipantIds: [],
            position: { x: 9500, y: 4500 }
          }]
        }]
      }
    }
  });

  expect(result.deathsJson[0].tags).toContain("objective_setup_death_candidate");
  expect(result.deathsJson[0].objectiveFacts[0]).toMatchObject({
    name: "Dragon",
    secondsFromDeath: 40,
    source: "spawn_timer",
    reviewWindow: "setup"
  });
  expect(result.deathsJson[0].evidenceSections.replayCanAnswer.join(" ")).toMatch(/dragon/i);
});

it("keeps actual objective events as supported objective evidence", () => {
  const result = evaluate({
    timelineJson: {
      info: {
        frames: [{
          ...frame(325_000, { 1: 6, 6: 6 }),
          events: [
            { type: "ELITE_MONSTER_KILL", timestamp: 330_000, monsterType: "DRAGON", killerId: 6, killerTeamId: 200 },
            { type: "CHAMPION_KILL", timestamp: 325_000, victimId: 1, killerId: 6, assistingParticipantIds: [] }
          ]
        }]
      }
    }
  });

  expect(result.deathsJson[0].objectiveFacts[0]).toMatchObject({
    name: "Dragon",
    secondsFromDeath: 5,
    source: "timeline_event",
    teamRelation: "enemy"
  });
});

it("does not treat Herald as available after despawn or Baron as available before 20:00", () => {
  const result = evaluate({
    timelineJson: {
      info: {
        frames: [{
          ...frame(1_190_000, { 1: 12, 6: 12 }),
          events: [{ type: "CHAMPION_KILL", timestamp: 1_190_000, victimId: 1, killerId: 6, assistingParticipantIds: [] }]
        }]
      }
    }
  });

  expect(result.deathsJson[0].objectiveFacts).toEqual([]);
  expect(result.deathsJson[0].tags).not.toContain("objective_window_candidate");
});

it("does not infer Elder without supported fourth-dragon state", () => {
  const result = evaluate({
    timelineJson: {
      info: {
        frames: [{
          ...frame(1_500_000, { 1: 14, 6: 14 }),
          events: [{ type: "CHAMPION_KILL", timestamp: 1_500_000, victimId: 1, killerId: 6, assistingParticipantIds: [] }]
        }]
      }
    }
  });

  expect(result.deathsJson[0].objectiveFacts.map((fact) => fact.name)).not.toContain("Elder dragon");
});

it("identifies first Scuttle context for a 2:40 river death without objective tags", () => {
  const result = evaluate({
    timelineJson: {
      info: {
        frames: [{
          ...frame(160_000, { 1: 3, 6: 3 }),
          events: [{ type: "CHAMPION_KILL", timestamp: 160_000, victimId: 1, killerId: 6, assistingParticipantIds: [], position: { x: 7200, y: 7200 } }]
        }]
      }
    }
  });

  expect(result.deathsJson[0].campState).toMatchObject({
    supported: true,
    campName: "Scuttle",
    secondsFromDeath: 15,
    source: "spawn_timer"
  });
  expect(result.deathsJson[0].tags).not.toContain("objective_window_candidate");
});

it("does not add Scuttle context to a 2:00 lane death", () => {
  const result = evaluate({
    timelineJson: {
      info: {
        frames: [{
          ...frame(120_000, { 1: 3, 6: 3 }),
          events: [{ type: "CHAMPION_KILL", timestamp: 120_000, victimId: 1, killerId: 6, assistingParticipantIds: [], position: { x: 12_000, y: 3_000 } }]
        }]
      }
    }
  });

  expect(result.deathsJson[0].campState.supported).toBe(false);
});

it("keeps camp respawn context separate from objective setup tags", () => {
  const result = evaluate({
    timelineJson: {
      info: {
        frames: [{
          ...frame(190_000, { 1: 5, 6: 5 }),
          events: [
            { type: "JUNGLE_MONSTER_KILL", timestamp: 55_000, monsterType: "RAPTOR", killerId: 6 },
            { type: "CHAMPION_KILL", timestamp: 190_000, victimId: 1, killerId: 6, assistingParticipantIds: [], position: { x: 8000, y: 5000 } }
          ]
        }]
      }
    }
  });

  expect(result.deathsJson[0].campState).toMatchObject({ campName: "Raptors", source: "respawn_timer" });
  expect(result.deathsJson[0].tags).not.toContain("objective_setup_death_candidate");
});

it("uses local fight outcome separately from unrelated nearby deaths", () => {
  const result = evaluate({
    summaryJson: summary([
      participant({ puuid: "target_puuid", participantId: 1, championName: "Ashe", teamId: 100, teamPosition: "BOTTOM", individualPosition: "BOTTOM", lane: "BOTTOM" }),
      participant({ participantId: 2, championName: "Leona", teamId: 100, teamPosition: "UTILITY", individualPosition: "UTILITY", lane: "BOTTOM" }),
      participant({ participantId: 3, championName: "Ahri", teamId: 100 }),
      participant({ participantId: 4, championName: "Vi", teamId: 100 }),
      participant({ participantId: 6, championName: "Draven", teamId: 200, teamPosition: "BOTTOM", individualPosition: "BOTTOM", lane: "BOTTOM" }),
      participant({ participantId: 7, championName: "Pantheon", teamId: 200, teamPosition: "UTILITY", individualPosition: "UTILITY", lane: "BOTTOM" }),
      participant({ participantId: 8, championName: "Zed", teamId: 200 }),
      participant({ participantId: 9, championName: "LeeSin", teamId: 200 })
    ]),
    perspectiveRecord: { matchId: "NA1_050", puuid: "target_puuid", participantId: 1, championName: "Ashe", teamId: 100, teamPosition: "BOTTOM" },
    timelineJson: {
      info: {
        frames: [{
          ...frame(120_000, {
            1: { level: 4, position: { x: 10_000, y: 4_000 } },
            2: { level: 4, position: { x: 10_200, y: 4_100 } },
            6: { level: 4, position: { x: 10_100, y: 4_100 } },
            7: { level: 4, position: { x: 10_300, y: 4_200 } }
          }),
          events: [
            { type: "CHAMPION_KILL", timestamp: 120_000, victimId: 1, killerId: 6, assistingParticipantIds: [7], position: { x: 10_000, y: 4_000 } },
            { type: "CHAMPION_KILL", timestamp: 124_000, victimId: 6, killerId: 2, assistingParticipantIds: [1], position: { x: 10_100, y: 4_100 } },
            { type: "CHAMPION_KILL", timestamp: 125_000, victimId: 3, killerId: 8, assistingParticipantIds: [], position: { x: 5_000, y: 5_000 } },
            { type: "CHAMPION_KILL", timestamp: 126_000, victimId: 4, killerId: 9, assistingParticipantIds: [], position: { x: 5_200, y: 5_100 } }
          ]
        }]
      }
    }
  });

  expect(result.deathsJson[0].fightShape).toMatchObject({ enemyCount: 2, alliedCount: 2 });
  expect(result.deathsJson[0].localFightOutcomeContext).toMatchObject({ alliedDeaths: 1, enemyDeaths: 1, totalDeaths: 2 });
  expect(result.deathsJson[0].nearbyDeathWindowContext).toMatchObject({ alliedDeaths: 2, enemyDeaths: 0, totalDeaths: 2 });
  expect(result.deathsJson[0].evidenceSections.knownFromData.join(" ")).toContain("1 allied death, 1 enemy death");
  expect(result.deathsJson[0].evidenceSections.knownFromData.join(" ")).not.toContain("3 allied deaths, 1 enemy death");
});

it("keeps objective timer constants covered", () => {
  expect(MAP_TIMER_RULES).toMatchObject({
    dragon: { firstSpawnSeconds: 300, respawnSeconds: 300 },
    voidgrubs: { firstSpawnSeconds: 480 },
    riftHerald: { firstSpawnSeconds: 900, despawnSeconds: 1185 },
    baron: { firstSpawnSeconds: 1200, respawnSeconds: 360 },
    elderDragon: { spawnsAfterFourthDragonSeconds: 300, respawnSeconds: 360, requiresDragonSoulState: true },
    scuttle: { firstSpawnSeconds: 175, respawnAfterBothInitialDeadSeconds: 150 },
    jungleCamps: { minorCampRespawnSeconds: 135, buffRespawnSeconds: 300 }
  });
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

  expect(result.deathsJson[0].tags).not.toContain("multi_enemy_collapse_candidate");
  expect(result.deathsJson[0].tags).toContain("bot_lane_gank");
  expect(result.deathsJson[0].laneDeathContext).toBe("bot_lane_gank");
  expect(result.deathsJson[0].laneDeathContextLabel).toBe("Bot-lane gank");
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

  expect(result.deathsJson[0].tags).not.toContain("multi_enemy_collapse_candidate");
  expect(result.deathsJson[0].tags).toContain("bot_lane_roam");
  expect(result.deathsJson[0].laneDeathContext).toBe("bot_lane_roam");
});

it("classifies early solo-lane jungle interventions as lane ganks before generic outnumbered fights", () => {
  const result = evaluate({
    summaryJson: summary([
      participant({ puuid: "target_puuid", participantId: 1, championName: "Gwen", teamId: 100, teamPosition: "TOP", individualPosition: "TOP", lane: "TOP" }),
      participant({ participantId: 6, championName: "Renekton", teamId: 200, teamPosition: "TOP", individualPosition: "TOP", lane: "TOP" }),
      participant({ participantId: 7, championName: "Taliyah", teamId: 200, teamPosition: "JUNGLE", individualPosition: "JUNGLE", lane: "JUNGLE" })
    ]),
    perspectiveRecord: {
      matchId: "NA1_050",
      puuid: "target_puuid",
      participantId: 1,
      championName: "Gwen",
      teamId: 100,
      teamPosition: "TOP"
    },
    timelineJson: {
      info: {
        frames: [
          {
            ...frame(300_000, { 1: 5, 6: 5, 7: 5 }),
            events: [
              {
                type: "CHAMPION_KILL",
                timestamp: 300_000,
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

  expect(result.deathsJson[0].tags).toContain("lane_gank_death");
  expect(result.deathsJson[0].tags).not.toContain("multi_enemy_collapse_candidate");
  expect(result.deathsJson[0].laneDeathContextLabel).toBe("Top-lane gank");
  expect(result.deathsJson[0].evidenceSections.knownFromData.join(" ")).not.toContain("Lane context:");
});

it("classifies lane roams before generic outnumbered fights", () => {
  const result = evaluate({
    summaryJson: summary([
      participant({ puuid: "target_puuid", participantId: 1, championName: "Gwen", teamId: 100, teamPosition: "TOP", individualPosition: "TOP", lane: "TOP" }),
      participant({ participantId: 6, championName: "Renekton", teamId: 200, teamPosition: "TOP", individualPosition: "TOP", lane: "TOP" }),
      participant({ participantId: 7, championName: "Ahri", teamId: 200, teamPosition: "MIDDLE", individualPosition: "MIDDLE", lane: "MIDDLE" })
    ]),
    perspectiveRecord: {
      matchId: "NA1_050",
      puuid: "target_puuid",
      participantId: 1,
      championName: "Gwen",
      teamId: 100,
      teamPosition: "TOP"
    },
    timelineJson: {
      info: {
        frames: [
          {
            ...frame(360_000, { 1: 6, 6: 6, 7: 6 }),
            events: [
              {
                type: "CHAMPION_KILL",
                timestamp: 360_000,
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

  expect(result.deathsJson[0].tags).toContain("top_lane_roam");
  expect(result.deathsJson[0].tags).not.toContain("multi_enemy_collapse_candidate");
  expect(result.deathsJson[0].laneDeathContextLabel).toBe("Top-lane roam/collapse");
});

it("derives pick, teamfight, death order, and traded-up fight outcome context", () => {
  const pick = evaluate({
    timelineJson: {
      info: {
        frames: [
          {
            ...frame(120_000, { 1: 5, 6: 5 }),
            events: [{ type: "CHAMPION_KILL", timestamp: 120_000, victimId: 1, killerId: 6, assistingParticipantIds: [] }]
          }
        ]
      }
    }
  });
  expect(pick.deathsJson[0].fightOutcomeContext).toMatchObject({
    label: "pick_death",
    alliedDeaths: 1,
    enemyDeaths: 0,
    totalDeaths: 1,
    playerDeathOrder: "first",
    teamResult: "lost_by_death_count"
  });

  const teamfight = evaluate({
    summaryJson: summary([
      participant({ puuid: "target_puuid", participantId: 1, championName: "Ahri", teamId: 100 }),
      participant({ participantId: 2, championName: "Vi", teamId: 100 }),
      participant({ participantId: 3, championName: "Gwen", teamId: 100 }),
      participant({ participantId: 4, championName: "Caitlyn", teamId: 100 }),
      participant({ participantId: 6, championName: "Zed", teamId: 200 }),
      participant({ participantId: 7, championName: "LeeSin", teamId: 200 }),
      participant({ participantId: 8, championName: "Jinx", teamId: 200 }),
      participant({ participantId: 9, championName: "Nautilus", teamId: 200 })
    ]),
    timelineJson: {
      info: {
        frames: [
          {
            ...frame(900_000, { 1: 11, 2: 11, 3: 11, 4: 11, 6: 11, 7: 11, 8: 11, 9: 11 }),
            events: [
              { type: "CHAMPION_KILL", timestamp: 900_000, victimId: 1, killerId: 6, assistingParticipantIds: [], position: { x: 8000, y: 8000 } },
              { type: "CHAMPION_KILL", timestamp: 904_000, victimId: 2, killerId: 7, assistingParticipantIds: [], position: { x: 8050, y: 8000 } },
              { type: "CHAMPION_KILL", timestamp: 908_000, victimId: 6, killerId: 3, assistingParticipantIds: [], position: { x: 8100, y: 8000 } },
              { type: "CHAMPION_KILL", timestamp: 912_000, victimId: 7, killerId: 4, assistingParticipantIds: [], position: { x: 8150, y: 8000 } },
              { type: "CHAMPION_KILL", timestamp: 916_000, victimId: 3, killerId: 8, assistingParticipantIds: [], position: { x: 8200, y: 8000 } },
              { type: "CHAMPION_KILL", timestamp: 920_000, victimId: 8, killerId: 4, assistingParticipantIds: [], position: { x: 8250, y: 8000 } }
            ]
          }
        ]
      }
    }
  });
  expect(teamfight.deathsJson[0].fightOutcomeContext).toMatchObject({
    label: "teamfight_death",
    totalDeaths: 6,
    playerDeathOrder: "first"
  });

  const tradedUp = evaluate({
    timelineJson: {
      info: {
        frames: [
          {
            ...frame(500_000, { 1: 8, 6: 8, 7: 8 }),
            events: [
              { type: "CHAMPION_KILL", timestamp: 500_000, victimId: 1, killerId: 6, assistingParticipantIds: [], position: { x: 7000, y: 7000 } },
              { type: "CHAMPION_KILL", timestamp: 505_000, victimId: 6, killerId: 2, assistingParticipantIds: [], position: { x: 7050, y: 7000 } },
              { type: "CHAMPION_KILL", timestamp: 510_000, victimId: 7, killerId: 2, assistingParticipantIds: [], position: { x: 7100, y: 7000 } }
            ]
          }
        ]
      }
    }
  });
  expect(tradedUp.deathsJson[0].fightOutcomeContext).toMatchObject({
    label: "won_fight_but_died",
    alliedDeaths: 1,
    enemyDeaths: 2,
    teamResult: "won_by_death_count"
  });
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
