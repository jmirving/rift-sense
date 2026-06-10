import { expect, it } from "vitest";

import {
  DETERMINISTIC_MATCH_EVALUATOR_VERSION,
  evaluateMatchFacts
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
      Object.entries(levels).map(([participantId, level]) => [participantId, { participantId: Number(participantId), level }])
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
    evaluationVersion: "deterministic-v1"
  });
});

it("extracts death events and conservative deterministic tags", () => {
  const result = evaluate({
    timelineJson: {
      info: {
        frames: [
          frame(100_000, { 1: 8, 6: 9, 7: 8 }),
          {
            ...frame(120_000, { 1: 8, 6: 10, 7: 8 }),
            events: [
              { type: "LEVEL_UP", timestamp: 105_000, participantId: 6 },
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

  expect(result.deathsJson).toEqual([
    {
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
      victimLevel: 8,
      killerLevel: 10,
      enemyParticipantsInvolved: [6, 7],
      tags: [
        "multi_enemy_collapse_candidate",
        "objective_window_candidate",
        "enemy_level_up_recently_candidate"
      ]
    }
  ]);
  expect(result.tagsJson.counts).toMatchObject({
    death_count: 1,
    solo_death_candidate: 0,
    multi_enemy_collapse_candidate: 1,
    objective_window_candidate: 1,
    enemy_level_up_recently_candidate: 1,
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
