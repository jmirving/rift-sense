import { describe, expect, it } from "vitest";

import { parseFightParticipationEvidence } from "../../server/riot/fight-participation.js";

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

function participantFrames(overrides = {}) {
  const defaults = {
    1: { position: { x: 5_000, y: 5_000 }, level: 9 },
    2: { position: { x: 5_200, y: 5_050 }, level: 9 },
    3: { position: { x: 5_100, y: 4_900 }, level: 9 },
    6: { position: { x: 5_400, y: 5_200 }, level: 9 },
    7: { position: { x: 5_500, y: 5_100 }, level: 9 },
    8: { position: { x: 5_450, y: 4_950 }, level: 9 }
  };

  return Object.fromEntries(
    Object.entries({ ...defaults, ...overrides }).map(([participantId, frame]) => [
      participantId,
      {
        ...frame,
        championStats: {
          currentHealth: 1_000,
          maxHealth: 1_400
        }
      }
    ])
  );
}

function timeline(events, frameOverrides = {}) {
  return {
    info: {
      frames: [
        {
          timestamp: 100_000,
          participantFrames: participantFrames(frameOverrides),
          events
        }
      ]
    }
  };
}

function parse(events, options = {}) {
  return parseFightParticipationEvidence({
    matchSummary: matchSummary(),
    matchTimeline: timeline(events, options.frameOverrides),
    perspective: perspective(),
    parsedAt,
    ...options
  });
}

function tagIds(evidence) {
  return evidence.tags.map((tag) => tag.id);
}

describe("fight participation parser", () => {
  it("detects player participation with an assist", () => {
    const [evidence] = parse([
      { eventId: "assist-kill", type: "CHAMPION_KILL", timestamp: 100_000, killerId: 2, victimId: 6, assistingParticipantIds: [1] },
      { eventId: "trade-kill", type: "CHAMPION_KILL", timestamp: 110_000, killerId: 7, victimId: 2 }
    ]);

    expect(evidence).toMatchObject({
      id: "NA1_1:user-puuid:fight_participation:100000:0",
      category: "fight_participation",
      timestamp: 100_000,
      windowStart: 100_000,
      windowEnd: 110_000,
      sourceEventIds: ["assist-kill", "trade-kill"],
      parserVersion: "fight-participation-0"
    });
    expect(evidence.facts.playerGotKillOrAssist).toBe(true);
    expect(evidence.facts.playerKillOrAssistEventIds).toEqual(["assist-kill"]);
    expect(evidence.facts.playerDied).toBe(false);
    expect(evidence.facts.killsByTeam).toEqual({ 100: 1, 200: 1 });
    expect(evidence.facts.deathsByTeam).toEqual({ 100: 1, 200: 1 });
    expect(evidence.facts.positions.playerDistanceFromFightCenter).toBeLessThan(600);
    expect(tagIds(evidence)).toContain("present_for_fight");
  });

  it("detects player absent from a fight", () => {
    const [evidence] = parse([
      { eventId: "fight-1", type: "CHAMPION_KILL", timestamp: 100_000, killerId: 2, victimId: 6 },
      { eventId: "fight-2", type: "CHAMPION_KILL", timestamp: 109_000, killerId: 7, victimId: 2 }
    ], {
      frameOverrides: {
        1: { position: { x: 13_000, y: 13_000 }, level: 9 }
      }
    });

    expect(evidence.facts.playerGotKillOrAssist).toBe(false);
    expect(evidence.facts.playerDied).toBe(false);
    expect(evidence.facts.positions.playerDistanceFromFightCenter).toBeGreaterThan(4_000);
    expect(tagIds(evidence)).toContain("absent_from_fight");
  });

  it("detects player death before a fight is decided", () => {
    const [evidence] = parse([
      {
        eventId: "user-death",
        type: "CHAMPION_KILL",
        timestamp: 100_000,
        killerId: 6,
        victimId: 1,
        victimDamageReceived: [{ participantId: 6, physicalDamage: 600 }],
        victimDamageDealt: [{ participantId: 6, physicalDamage: 100 }]
      },
      { eventId: "ally-death", type: "CHAMPION_KILL", timestamp: 109_000, killerId: 7, victimId: 2 },
      { eventId: "enemy-death", type: "CHAMPION_KILL", timestamp: 114_000, killerId: 3, victimId: 7 }
    ]);

    expect(evidence.facts.playerDied).toBe(true);
    expect(evidence.facts.playerDeathEventIds).toEqual(["user-death"]);
    expect(tagIds(evidence)).toContain("died_before_fight");
  });

  it("detects high-damage losing fight", () => {
    const [evidence] = parse([
      {
        eventId: "user-death",
        type: "CHAMPION_KILL",
        timestamp: 100_000,
        killerId: 6,
        victimId: 1,
        victimDamageReceived: [{ participantId: 6, physicalDamage: 900 }],
        victimDamageDealt: [{ participantId: 6, physicalDamage: 500 }, { participantId: 7, physicalDamage: 450 }]
      },
      { eventId: "ally-death", type: "CHAMPION_KILL", timestamp: 111_000, killerId: 7, victimId: 2 }
    ]);

    expect(evidence.facts.playerDamage.totalDealt).toBe(950);
    expect(evidence.facts.deathsByTeam).toEqual({ 100: 2 });
    expect(tagIds(evidence)).toContain("high_damage_losing_fight");
  });

  it("detects low-damage death", () => {
    const [evidence] = parse([
      {
        eventId: "user-death",
        type: "CHAMPION_KILL",
        timestamp: 100_000,
        killerId: 6,
        victimId: 1,
        victimDamageReceived: [{ participantId: 6, physicalDamage: 800 }],
        victimDamageDealt: [{ participantId: 6, physicalDamage: 100 }]
      },
      { eventId: "ally-death", type: "CHAMPION_KILL", timestamp: 108_000, killerId: 7, victimId: 2 }
    ]);

    expect(evidence.facts.playerDamage).toMatchObject({
      totalDealt: 100,
      totalReceived: 800
    });
    expect(tagIds(evidence)).toContain("low_damage_death");
  });
});
