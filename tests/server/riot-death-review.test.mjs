import { describe, expect, it } from "vitest";

import { parseDeathReviewEvidence } from "../../server/riot/death-review.js";

const parsedAt = "2026-06-08T12:00:00.000Z";

function matchSummary() {
  return {
    metadata: {
      matchId: "NA1_1"
    },
    info: {
      participants: [
        { puuid: "user-puuid", participantId: 1, championName: "Ashe", teamId: 100, teamPosition: "BOTTOM" },
        { participantId: 2, championName: "Leona", teamId: 100 },
        { participantId: 6, championName: "Zed", teamId: 200 },
        { participantId: 7, championName: "Vi", teamId: 200 },
        { participantId: 8, championName: "Jinx", teamId: 200 }
      ]
    }
  };
}

function perspective() {
  return {
    matchId: "NA1_1",
    puuid: "user-puuid",
    participantId: 1,
    championName: "Ashe",
    teamId: 100,
    teamPosition: "BOTTOM"
  };
}

function frame(timestamp, events = [], participantFrame = {}) {
  return {
    timestamp,
    participantFrames: {
      1: {
        level: 8,
        position: { x: 5000, y: 5000 },
        championStats: {
          health: 300,
          healthMax: 1200
        },
        ...participantFrame
      }
    },
    events
  };
}

describe("death review parser", () => {
  it("emits deterministic death review evidence for user champion deaths", () => {
    const timeline = {
      info: {
        frames: [
          frame(90_000, [
            { eventId: "level-before", type: "LEVEL_UP", timestamp: 91_000, participantId: 6, level: 6 },
            { eventId: "ally-death-1", type: "CHAMPION_KILL", timestamp: 95_000, killerId: 7, victimId: 2 },
            { eventId: "dragon-before", type: "ELITE_MONSTER_KILL", timestamp: 96_000, killerId: 7, monsterType: "DRAGON" }
          ]),
          frame(100_000, [
            {
              eventId: "user-death",
              type: "CHAMPION_KILL",
              timestamp: 100_000,
              killerId: 6,
              victimId: 1,
              assistingParticipantIds: [7],
              position: { x: 5200, y: 5100 },
              victimDamageReceived: [
                { participantId: 6, type: "CHAMPION", name: "Zed", physicalDamage: 600, magicDamage: 0, trueDamage: 0, basic: true },
                { participantId: 0, type: "TOWER", name: "SRU_ChaosTurret", physicalDamage: 350, magicDamage: 0, trueDamage: 0, basic: 0 },
                { participantId: 0, type: "MINION", name: "SRU_OrderMinionRanged", physicalDamage: 120, magicDamage: 0, trueDamage: 0, basic: 0 },
                { participantId: 0, type: "MONSTER", name: "SRU_Dragon", physicalDamage: 80, magicDamage: 0, trueDamage: 0, basic: 0 }
              ],
              victimDamageDealt: [
                { participantId: 6, type: "CHAMPION", name: "Zed", physicalDamage: 450, magicDamage: 0, trueDamage: 0, basic: 50 },
                { participantId: 7, type: "CHAMPION", name: "Vi", physicalDamage: 240, magicDamage: 0, trueDamage: 0, basic: 0 }
              ]
            },
            { eventId: "tower-after", type: "BUILDING_KILL", timestamp: 110_000, killerId: 6, buildingType: "TOWER_BUILDING" }
          ])
        ]
      }
    };

    const evidence = parseDeathReviewEvidence({
      matchSummary: matchSummary(),
      matchTimeline: timeline,
      perspective: perspective(),
      parsedAt
    });

    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      id: "NA1_1:user-puuid:death_review:100000:0",
      matchId: "NA1_1",
      puuid: "user-puuid",
      participantId: 1,
      championName: "Ashe",
      playerRole: "BOTTOM",
      category: "death_review",
      timestamp: 100_000,
      windowStart: 40_000,
      windowEnd: 130_000,
      confidence: 0.85,
      sourceEventIds: ["user-death"],
      createdAt: parsedAt,
      parserVersion: "death-review-0"
    });
    expect(evidence[0].facts).toMatchObject({
      killerId: 6,
      assistingParticipantIds: [7],
      position: { x: 5200, y: 5100 },
      priorFrame: {
        timestamp: 100_000,
        hp: 300,
        maxHp: 1200,
        level: 8,
        position: { x: 5000, y: 5000 }
      }
    });
    expect(evidence[0].facts.damageReceived).toEqual([
      { type: "champion", key: "participant:6", participantId: 6, championName: "Zed", totalDamage: 600 },
      { type: "tower", key: "SRU_ChaosTurret", sourceName: "SRU_ChaosTurret", totalDamage: 350 },
      { type: "minion", key: "SRU_OrderMinionRanged", sourceName: "SRU_OrderMinionRanged", totalDamage: 120 },
      { type: "monster", key: "SRU_Dragon", sourceName: "SRU_Dragon", totalDamage: 80 }
    ]);
    expect(evidence[0].facts.damageDealt).toEqual([
      { type: "champion", key: "participant:6", participantId: 6, championName: "Zed", totalDamage: 450 },
      { type: "champion", key: "participant:7", participantId: 7, championName: "Vi", totalDamage: 240 }
    ]);
    expect(evidence[0].facts.nearbyEventsBefore.map((event) => event.eventId)).toEqual([
      "level-before",
      "ally-death-1",
      "dragon-before"
    ]);
    expect(evidence[0].facts.nearbyEventsAfter.map((event) => event.eventId)).toEqual(["tower-after"]);
    expect(evidence[0].tags.map((tag) => tag.id)).toEqual([
      "low_hp_positioning",
      "tower_damage_relevant",
      "minion_damage_relevant",
      "enemy_level_timing_before_death",
      "post_objective_map_shift",
      "lost_fight_stagger",
      "high_return_damage"
    ]);
    expect(evidence[0].reviewQuestions).toContain("Which enemy level-up happened before the death?");
  });

  it("does not turn post-death level-ups or structures into death-cause tags", () => {
    const timeline = {
      info: {
        frames: [
          frame(200_000, [
            {
              eventId: "user-death",
              type: "CHAMPION_KILL",
              timestamp: 200_000,
              killerId: 6,
              victimId: 1,
              victimDamageReceived: [
                { participantId: 6, type: "CHAMPION", name: "Zed", physicalDamage: 700, magicDamage: 0, trueDamage: 0, basic: 0 }
              ],
              victimDamageDealt: [
                { participantId: 6, type: "CHAMPION", name: "Zed", physicalDamage: 50, magicDamage: 0, trueDamage: 0, basic: 0 }
              ]
            },
            { eventId: "level-after", type: "CHAMPION_LEVEL_UP", timestamp: 201_000, participantId: 6, level: 10 },
            { eventId: "tower-after", type: "BUILDING_KILL", timestamp: 202_000, killerId: 6, buildingType: "TOWER_BUILDING" }
          ])
        ]
      }
    };

    const [evidence] = parseDeathReviewEvidence({
      matchSummary: matchSummary(),
      matchTimeline: timeline,
      perspective: perspective(),
      parsedAt
    });

    expect(evidence.facts.nearbyEventsAfter.map((event) => event.eventId)).toEqual(["level-after", "tower-after"]);
    expect(evidence.tags.map((tag) => tag.id)).not.toContain("enemy_level_timing_before_death");
    expect(evidence.tags.map((tag) => tag.id)).not.toContain("post_objective_map_shift");
  });
});
