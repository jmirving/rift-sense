import { describe, expect, it } from "vitest";

import { parseTempoConversionEvidence } from "../../server/riot/tempo-conversion.js";

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
        { participantId: 3, championName: "Vi", teamId: 100 },
        { participantId: 6, championName: "Zed", teamId: 200 },
        { participantId: 7, championName: "Jinx", teamId: 200 },
        { participantId: 8, championName: "Nautilus", teamId: 200 }
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

function timeline(events) {
  return {
    info: {
      frames: [
        {
          timestamp: 100_000,
          participantFrames: {},
          events
        }
      ]
    }
  };
}

function evidenceFor(sourceEventId, events, options = {}) {
  return parseTempoConversionEvidence({
    matchSummary: matchSummary(),
    matchTimeline: timeline(events),
    perspective: perspective(),
    parsedAt,
    ...options
  }).find((evidence) => evidence.sourceEventIds.includes(sourceEventId));
}

describe("tempo conversion parser", () => {
  it("detects kill into tower, plate, and objective conversion", () => {
    const evidence = evidenceFor("kill", [
      { eventId: "kill", type: "CHAMPION_KILL", timestamp: 100_000, killerId: 1, victimId: 6, assistingParticipantIds: [2] },
      { eventId: "plate", type: "TURRET_PLATE_DESTROYED", timestamp: 112_000, killerId: 1, teamId: 200 },
      { eventId: "tower", type: "BUILDING_KILL", timestamp: 125_000, killerId: 2, teamId: 200, buildingType: "TOWER_BUILDING" },
      { eventId: "dragon", type: "ELITE_MONSTER_KILL", timestamp: 150_000, killerId: 3, monsterType: "DRAGON" }
    ]);

    expect(evidence).toMatchObject({
      category: "tempo_conversion",
      timestamp: 100_000,
      windowStart: 100_000,
      windowEnd: 190_000,
      parserVersion: "tempo-conversion-0"
    });
    expect(evidence.facts.trigger).toMatchObject({
      eventId: "kill",
      teamSide: "player",
      playerParticipated: true
    });
    expect(evidence.facts.playerTeamGains.map((event) => event.eventId)).toEqual(["plate", "tower", "dragon"]);
    expect(evidence.facts.playerTeamGains.map((event) => event.gainType)).toEqual(["plate", "structure", "objective"]);
    expect(evidence.facts.enemyTeamGains).toEqual([]);
    expect(evidence.facts.playerDeathsAfterTrigger).toEqual([]);
    expect(evidence.facts.conversionResult).toBe("clean");
    expect(evidence.tags.map((tag) => tag.id)).toEqual(["clean_conversion"]);
  });

  it("detects objective into player death", () => {
    const evidence = evidenceFor("dragon", [
      { eventId: "dragon", type: "ELITE_MONSTER_KILL", timestamp: 200_000, killerId: 3, monsterType: "DRAGON" },
      { eventId: "user-death", type: "CHAMPION_KILL", timestamp: 220_000, killerId: 6, victimId: 1 }
    ]);

    expect(evidence.facts.playerDeathsAfterTrigger.map((event) => event.eventId)).toEqual(["user-death"]);
    expect(evidence.facts.conversionResult).toBe("tempo_back");
    expect(evidence.tags.map((tag) => tag.id)).toEqual([
      "failed_conversion",
      "objective_into_death",
      "reset_window_missed"
    ]);
  });

  it("detects Baron into immediate player death", () => {
    const evidence = evidenceFor("baron", [
      { eventId: "baron", type: "ELITE_MONSTER_KILL", timestamp: 300_000, killerId: 3, monsterType: "BARON_NASHOR" },
      { eventId: "ally-death", type: "CHAMPION_KILL", timestamp: 304_000, killerId: 8, victimId: 2 }
    ]);

    expect(evidence.facts.playerDeathsAfterTrigger.map((event) => event.eventId)).toEqual(["ally-death"]);
    expect(evidence.tags.map((tag) => tag.id)).toEqual([
      "failed_conversion",
      "objective_into_death",
      "baron_exit_failure",
      "reset_window_missed"
    ]);
  });

  it("detects enemy cross-map trades inside the post-window", () => {
    const evidence = evidenceFor("kill", [
      { eventId: "kill", type: "CHAMPION_KILL", timestamp: 400_000, killerId: 1, victimId: 6 },
      { eventId: "enemy-tower", type: "BUILDING_KILL", timestamp: 430_000, killerId: 7, teamId: 100, buildingType: "TOWER_BUILDING" }
    ]);

    expect(evidence.facts.enemyTeamGains.map((event) => event.eventId)).toEqual(["enemy-tower"]);
    expect(evidence.facts.enemyCrossMapTrades.map((event) => event.eventId)).toEqual(["enemy-tower"]);
    expect(evidence.facts.conversionResult).toBe("tempo_back");
    expect(evidence.tags.map((tag) => tag.id)).toEqual([
      "failed_conversion",
      "kill_into_no_plate",
      "enemy_crossmap_trade"
    ]);
  });
});
