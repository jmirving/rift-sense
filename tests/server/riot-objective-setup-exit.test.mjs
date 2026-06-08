import { describe, expect, it } from "vitest";

import { parseObjectiveSetupExitEvidence } from "../../server/riot/objective-setup-exit.js";

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

function participantFrames() {
  return {
    "1": { participantId: 1, level: 9, position: { x: 9_900, y: 4_300 } },
    "2": { participantId: 2, level: 8, position: { x: 9_700, y: 4_100 } },
    "3": { participantId: 3, level: 10, position: { x: 9_500, y: 4_800 } },
    "6": { participantId: 6, level: 10, position: { x: 4_000, y: 12_000 } },
    "7": { participantId: 7, level: 9, position: { x: 11_000, y: 3_900 } },
    "8": { participantId: 8, level: 8, position: { x: 10_500, y: 4_200 } }
  };
}

function timeline(events) {
  return {
    info: {
      frames: [
        {
          timestamp: 100_000,
          participantFrames: participantFrames(),
          events
        }
      ]
    }
  };
}

function evidenceFor(sourceEventId, events, options = {}) {
  return parseObjectiveSetupExitEvidence({
    matchSummary: matchSummary(),
    matchTimeline: timeline(events),
    perspective: perspective(),
    parsedAt,
    ...options
  }).find((evidence) => evidence.sourceEventIds.includes(sourceEventId));
}

describe("objective setup and exit parser", () => {
  it("detects a clean dragon", () => {
    const evidence = evidenceFor("dragon", [
      { eventId: "ward", type: "WARD_PLACED", timestamp: 130_000, creatorId: 2, wardType: "CONTROL_WARD" },
      { eventId: "dragon", type: "ELITE_MONSTER_KILL", timestamp: 180_000, killerId: 3, monsterType: "DRAGON", monsterSubType: "FIRE_DRAGON" }
    ]);

    expect(evidence).toMatchObject({
      category: "objective_setup_exit",
      timestamp: 180_000,
      windowStart: 90_000,
      windowEnd: 240_000,
      parserVersion: "objective-setup-exit-0"
    });
    expect(evidence.facts.objective).toMatchObject({
      eventId: "dragon",
      type: "dragon",
      subtype: "FIRE_DRAGON",
      securingTeamId: 100,
      teamSide: "player"
    });
    expect(evidence.facts.wardsInSetup.map((event) => event.eventId)).toEqual(["ward"]);
    expect(evidence.facts.playerPositionBeforeObjective.position).toEqual({ x: 9_900, y: 4_300 });
    expect(evidence.facts.exitResult).toBe("clean");
    expect(evidence.tags.map((tag) => tag.id)).toEqual(["objective_setup_present", "objective_taken_cleanly"]);
  });

  it("detects objective taken followed by player death", () => {
    const evidence = evidenceFor("dragon", [
      { eventId: "dragon", type: "ELITE_MONSTER_KILL", timestamp: 200_000, killerId: 3, monsterType: "DRAGON" },
      { eventId: "user-death", type: "CHAMPION_KILL", timestamp: 220_000, killerId: 6, victimId: 1 }
    ]);

    expect(evidence.facts.playerDeathsAfterObjective.map((event) => event.eventId)).toEqual(["user-death"]);
    expect(evidence.facts.allyDeathsAfterObjective).toEqual([]);
    expect(evidence.facts.exitResult).toBe("exit_failed");
    expect(evidence.tags.map((tag) => tag.id)).toEqual([
      "objective_setup_present",
      "objective_taken_but_exit_failed"
    ]);
  });

  it("detects Baron followed by player death", () => {
    const evidence = evidenceFor("baron", [
      { eventId: "baron", type: "ELITE_MONSTER_KILL", timestamp: 300_000, killerId: 3, monsterType: "BARON_NASHOR" },
      { eventId: "user-death", type: "CHAMPION_KILL", timestamp: 304_000, killerId: 8, victimId: 1 }
    ]);

    expect(evidence.facts.objective.type).toBe("baron");
    expect(evidence.facts.playerDeathsAfterObjective.map((event) => event.eventId)).toEqual(["user-death"]);
    expect(evidence.tags.map((tag) => tag.id)).toEqual([
      "objective_setup_present",
      "objective_taken_but_exit_failed",
      "post_major_objective_death"
    ]);
  });

  it("detects enemy cross-map structure after objective", () => {
    const evidence = evidenceFor("dragon", [
      { eventId: "dragon", type: "ELITE_MONSTER_KILL", timestamp: 400_000, killerId: 3, monsterType: "DRAGON" },
      { eventId: "enemy-tower", type: "BUILDING_KILL", timestamp: 430_000, killerId: 7, teamId: 100, buildingType: "TOWER_BUILDING", laneType: "TOP_LANE" }
    ]);

    expect(evidence.facts.structuresTakenAfterObjective.map((event) => event.eventId)).toEqual(["enemy-tower"]);
    expect(evidence.facts.enemyCrossMapGains.map((event) => event.eventId)).toEqual(["enemy-tower"]);
    expect(evidence.facts.exitResult).toBe("exit_failed");
    expect(evidence.tags.map((tag) => tag.id)).toEqual([
      "objective_setup_present",
      "objective_taken_but_exit_failed",
      "enemy_objective_crossmap_trade"
    ]);
  });
});
