import { describe, expect, it } from "vitest";

import { parseVisionInformationEvidence } from "../../server/riot/vision-information.js";

const parsedAt = "2026-06-08T12:00:00.000Z";

function matchSummary(participantOverrides = {}) {
  return {
    metadata: { matchId: "NA1_1" },
    info: {
      gameDuration: 1_800,
      participants: [
        {
          puuid: "user-puuid",
          participantId: 1,
          championName: "Ashe",
          teamId: 100,
          teamPosition: "BOTTOM",
          wardsPlaced: 0,
          wardsKilled: 0,
          detectorWardsPlaced: 0,
          visionWardsBoughtInGame: 0,
          visionScore: 4,
          ...participantOverrides
        },
        { participantId: 2, championName: "Leona", teamId: 100, teamPosition: "UTILITY" },
        { participantId: 6, championName: "Jinx", teamId: 200, teamPosition: "BOTTOM" }
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

function timeline(events, frameOverrides = {}) {
  return {
    info: {
      frames: [
        {
          timestamp: 600_000,
          participantFrames: {
            1: { position: { x: 10_000, y: 9_000 } }
          },
          events,
          ...frameOverrides
        }
      ]
    }
  };
}

function parse(events, options = {}) {
  return parseVisionInformationEvidence({
    matchSummary: matchSummary(options.participantOverrides),
    matchTimeline: timeline(events, options.frameOverrides),
    perspective: perspective(),
    parsedAt
  });
}

function tagIds(evidence) {
  return evidence.tags.map((tag) => tag.id);
}

describe("vision information parser", () => {
  it("detects death after no recent ward event", () => {
    const evidence = parse([
      { eventId: "death", type: "CHAMPION_KILL", timestamp: 600_000, killerId: 6, victimId: 1 }
    ]).find((entry) => entry.id.includes(":death:"));

    expect(tagIds(evidence)).toEqual(["death_after_no_recent_ward"]);
    expect(evidence.facts.recentTeamWardEvents).toEqual([]);
  });

  it("detects objective without recent team ward activity", () => {
    const evidence = parse([
      { eventId: "dragon", type: "ELITE_MONSTER_KILL", timestamp: 700_000, killerId: 6, monsterType: "DRAGON" }
    ]).find((entry) => entry.id.includes(":objective:"));

    expect(tagIds(evidence)).toEqual(["objective_without_recent_vision"]);
    expect(evidence.windowStart).toBe(610_000);
    expect(evidence.windowEnd).toBe(700_000);
  });

  it("uses cautious wording and confidence for vision tags", () => {
    const evidence = parse([
      { eventId: "death", type: "CHAMPION_KILL", timestamp: 600_000, killerId: 6, victimId: 1 }
    ]).find((entry) => entry.id.includes(":death:"));

    expect(evidence.confidence).toBeLessThanOrEqual(0.65);
    expect(evidence.tags[0].confidence).toBeLessThanOrEqual(0.65);
    expect(evidence.facts.parserCaution).toContain("does not prove");
    expect(evidence.reviewQuestions[0]).toContain("available");
  });
});
