import { describe, expect, it } from "vitest";

import { parseLanePressureEvidence } from "../../server/riot/lane-pressure.js";

const parsedAt = "2026-06-08T12:00:00.000Z";

function matchSummary() {
  return {
    metadata: { matchId: "NA1_1" },
    info: {
      participants: [
        { puuid: "user-puuid", participantId: 1, championName: "Ashe", teamId: 100, teamPosition: "BOTTOM" },
        { participantId: 2, championName: "Leona", teamId: 100, teamPosition: "UTILITY" },
        { participantId: 3, championName: "Vi", teamId: 100, teamPosition: "JUNGLE" },
        { participantId: 6, championName: "Jinx", teamId: 200, teamPosition: "BOTTOM" },
        { participantId: 7, championName: "Nautilus", teamId: 200, teamPosition: "UTILITY" },
        { participantId: 8, championName: "Lee Sin", teamId: 200, teamPosition: "JUNGLE" }
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

function frame(timestamp, player, opponent, events = []) {
  return {
    timestamp,
    participantFrames: {
      1: player,
      6: opponent
    },
    events
  };
}

function parse(frames) {
  return parseLanePressureEvidence({
    matchSummary: matchSummary(),
    matchTimeline: { info: { frames } },
    perspective: perspective(),
    parsedAt
  });
}

function tagIds(evidence) {
  return evidence.tags.map((tag) => tag.id);
}

describe("lane pressure parser", () => {
  it("computes CS, XP, gold, and level deltas by minute", () => {
    const [evidence] = parse([
      frame(
        6 * 60_000,
        { minionsKilled: 52, jungleMinionsKilled: 0, xp: 3_100, totalGold: 3_800, level: 6 },
        { minionsKilled: 38, jungleMinionsKilled: 0, xp: 2_600, totalGold: 3_000, level: 5 }
      )
    ]);

    expect(evidence).toMatchObject({
      category: "lane_pressure",
      timestamp: 360_000,
      parserVersion: "lane-pressure-0"
    });
    expect(evidence.facts.deltas).toEqual({
      csDelta: 14,
      xpDelta: 500,
      goldDelta: 800,
      levelDelta: 1
    });
    expect(tagIds(evidence)).toEqual([
      "lane_cs_lead",
      "xp_lead",
      "pressure_without_conversion",
      "crash_or_reset_possible"
    ]);
  });

  it("detects plate conversion from early lane pressure", () => {
    const [evidence] = parse([
      frame(
        8 * 60_000,
        { minionsKilled: 70, xp: 4_200, totalGold: 4_600, level: 7 },
        { minionsKilled: 52, xp: 3_700, totalGold: 3_900, level: 6 },
        [{ eventId: "plate", type: "TURRET_PLATE_DESTROYED", timestamp: 470_000, teamId: 200, laneType: "BOT_LANE" }]
      )
    ]);

    expect(evidence.facts.platesTaken.map((event) => event.eventId)).toEqual(["plate"]);
    expect(tagIds(evidence)).toContain("plate_conversion");
    expect(tagIds(evidence)).not.toContain("pressure_without_conversion");
  });
});
