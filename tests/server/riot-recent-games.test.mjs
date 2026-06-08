import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { createRiotMatchesRepository } from "../../server/repositories/riot-matches.js";
import { normalizeRecentGame, resolveRecentGames, scoreRecentGames } from "../../server/riot/recent-games.js";

const tempDirectories = [];

async function createRiotRepository() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "rift-sense-riot-service-"));
  tempDirectories.push(tempRoot);

  const repository = createRiotMatchesRepository({
    rawMatchesDir: path.resolve(tempRoot, "raw"),
    perspectivesDir: path.resolve(tempRoot, "perspectives")
  });
  await repository.initialize();

  return repository;
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("riot recent-games service", () => {
  it("normalizes a Riot match payload into the internal recent game shape", () => {
    const normalized = normalizeRecentGame(
      {
        metadata: {
          matchId: "NA1_555"
        },
        info: {
          queueId: 420,
          gameDuration: 1800,
          gameEndTimestamp: Date.parse("2026-06-01T03:00:00.000Z"),
          participants: [
            {
              puuid: "puuid_1",
              championId: 22,
              championName: "Ashe",
              teamPosition: "BOTTOM",
              win: true,
              kills: 6,
              deaths: 4,
              assists: 10,
              totalMinionsKilled: 210,
              neutralMinionsKilled: 12
            }
          ]
        }
      },
      "puuid_1"
    );

    expect(normalized).toMatchObject({
      matchId: "NA1_555",
      queueId: 420,
      queueLabel: "Ranked Solo/Duo",
      championId: 22,
      championName: "Ashe",
      role: "ADC",
      roleConfidence: "high",
      result: "Win",
      kills: 6,
      deaths: 4,
      assists: 10,
      csPerMinute: 7.4,
      gameDurationSeconds: 1800
    });
  });

  it("returns linked-but-unavailable when Riot access is not configured", async () => {
    const result = await resolveRecentGames({
      profile: {
        riotPuuid: "puuid_1"
      },
      config: {
        riot: {
          apiKey: ""
        }
      },
      fetchImpl: async () => {
        throw new Error("should not fetch");
      }
    });

    expect(result.status).toBe("unavailable");
    expect(result.code).toBe("riot-config-missing");
  });

  it("fetches and normalizes recent games from mocked Riot endpoints", async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      if (url.includes("/ids?")) {
        return {
          ok: true,
          async json() {
            return ["NA1_1"];
          }
        };
      }

      return {
        ok: true,
        async json() {
          return {
            metadata: {
              matchId: "NA1_1"
            },
            info: {
              queueId: 440,
              gameDuration: 1680,
              gameEndTimestamp: Date.parse("2026-06-01T01:00:00.000Z"),
              participants: [
                {
                  puuid: "puuid_1",
                  championId: 222,
                  championName: "Jinx",
                  teamPosition: "BOTTOM",
                  win: false,
                  kills: 4,
                  deaths: 7,
                  assists: 5,
                  totalMinionsKilled: 201,
                  neutralMinionsKilled: 8
                }
              ]
            }
          };
        }
      };
    };

    const result = await resolveRecentGames({
      profile: {
        riotPuuid: "puuid_1"
      },
      config: {
        riot: {
          apiKey: "riot-key",
          routingRegion: "americas",
          platformRegion: "na1",
          matchCount: 4
        }
      },
      fetchImpl
    });

    expect(result.status).toBe("available");
    expect(result.games).toHaveLength(1);
    expect(result.games[0]).toMatchObject({
      matchId: "NA1_1",
      queueLabel: "Ranked Flex",
      championName: "Jinx"
    });
    expect(calls[0]).toContain("/by-puuid/puuid_1/ids");
    expect(calls.some((url) => url.endsWith("/matches/NA1_1/timeline"))).toBe(true);
  });

  it("stores raw match data and user perspective while fetching recent games", async () => {
    const repository = await createRiotRepository();

    const fetchImpl = async (url) => {
      if (url.includes("/ids?")) {
        return {
          ok: true,
          async json() {
            return ["NA1_2"];
          }
        };
      }

      if (url.endsWith("/matches/NA1_2/timeline")) {
        return {
          ok: true,
          async json() {
            return { metadata: { matchId: "NA1_2" }, info: { frames: [] } };
          }
        };
      }

      return {
        ok: true,
        async json() {
          return {
            metadata: {
              matchId: "NA1_2"
            },
            info: {
              queueId: 420,
              gameDuration: 1800,
              participants: [
                {
                  puuid: "puuid_1",
                  participantId: 4,
                  championName: "Ashe",
                  teamId: 100,
                  teamPosition: "BOTTOM",
                  individualPosition: "BOTTOM",
                  win: true
                }
              ]
            }
          };
        }
      };
    };

    await resolveRecentGames({
      profile: {
        riotPuuid: "puuid_1"
      },
      config: {
        riot: {
          apiKey: "riot-key",
          routingRegion: "americas",
          matchCount: 1
        }
      },
      riotMatchesRepository: repository,
      fetchImpl
    });

    await expect(repository.getRawMatchData("NA1_2")).resolves.toMatchObject({
      matchId: "NA1_2",
      summaryJson: {
        metadata: {
          matchId: "NA1_2"
        }
      },
      timelineJson: {
        metadata: {
          matchId: "NA1_2"
        }
      }
    });
    await expect(repository.getUserMatchPerspective("NA1_2", "puuid_1")).resolves.toMatchObject({
      matchId: "NA1_2",
      puuid: "puuid_1",
      participantId: 4,
      championName: "Ashe",
      teamId: 100,
      teamPosition: "BOTTOM",
      individualPosition: "BOTTOM",
      duration: 1800,
      parseStatus: "raw_data_available"
    });
  });

  it("reuses fresh stored raw match data without re-fetching match payloads", async () => {
    const repository = await createRiotRepository();
    await repository.saveRawMatchData({
      matchId: "NA1_cached",
      summaryJson: {
        metadata: {
          matchId: "NA1_cached"
        },
        info: {
          queueId: 420,
          gameDuration: 1800,
          participants: [
            {
              puuid: "puuid_1",
              participantId: 2,
              championName: "Caitlyn",
              teamId: 100,
              teamPosition: "BOTTOM",
              win: true
            }
          ]
        }
      },
      timelineJson: {
        metadata: {
          matchId: "NA1_cached"
        }
      }
    });

    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      if (url.includes("/ids?")) {
        return {
          ok: true,
          async json() {
            return ["NA1_cached"];
          }
        };
      }

      throw new Error("match payload should not be fetched");
    };

    const result = await resolveRecentGames({
      profile: {
        riotPuuid: "puuid_1"
      },
      config: {
        riot: {
          apiKey: "riot-key",
          routingRegion: "americas",
          matchCount: 1
        }
      },
      riotMatchesRepository: repository,
      fetchImpl
    });

    expect(result.status).toBe("available");
    expect(result.games[0]).toMatchObject({
      matchId: "NA1_cached",
      championName: "Caitlyn"
    });
    expect(calls).toHaveLength(1);
  });

  it("scores and sorts candidate games by role, timing, queue, and deaths for Die Less", () => {
    const candidates = scoreRecentGames({
      goal: {
        title: "Die Less",
        role: "ADC",
        activeSince: "2026-05-25"
      },
      profile: {
        primaryRole: "ADC"
      },
      now: new Date("2026-06-01T12:00:00.000Z"),
      games: [
        {
          matchId: "best",
          playedAt: "2026-06-01T02:00:00.000Z",
          queueLabel: "Ranked Solo/Duo",
          championName: "Caitlyn",
          role: "ADC",
          result: "Loss",
          kills: 7,
          deaths: 5,
          assists: 4,
          csPerMinute: 8.5,
          gameDurationSeconds: 1900,
          sourceMetadata: { queueBucket: "ranked" }
        },
        {
          matchId: "offrole",
          playedAt: "2026-06-01T01:00:00.000Z",
          queueLabel: "Ranked Solo/Duo",
          championName: "Ahri",
          role: "MID",
          result: "Win",
          kills: 6,
          deaths: 3,
          assists: 8,
          csPerMinute: 7.8,
          gameDurationSeconds: 1900,
          sourceMetadata: { queueBucket: "ranked" }
        },
        {
          matchId: "older",
          playedAt: "2026-05-10T01:00:00.000Z",
          queueLabel: "Ranked Flex",
          championName: "Jinx",
          role: "ADC",
          result: "Win",
          kills: 9,
          deaths: 4,
          assists: 7,
          csPerMinute: 8.2,
          gameDurationSeconds: 1900,
          sourceMetadata: { queueBucket: "ranked" }
        },
        {
          matchId: "nodeaths",
          playedAt: "2026-06-01T00:00:00.000Z",
          queueLabel: "Normal Draft",
          championName: "Ashe",
          role: "ADC",
          result: "Win",
          kills: 2,
          deaths: 0,
          assists: 6,
          csPerMinute: 7.0,
          gameDurationSeconds: 1900,
          sourceMetadata: { queueBucket: "normal" }
        },
        {
          matchId: "aram",
          playedAt: "2026-06-01T00:00:00.000Z",
          queueLabel: "ARAM",
          championName: "Ezreal",
          role: "ADC",
          result: "Loss",
          kills: 10,
          deaths: 8,
          assists: 9,
          csPerMinute: 5.5,
          gameDurationSeconds: 1200,
          sourceMetadata: { queueBucket: "aram" }
        }
      ]
    });

    expect(candidates.map((game) => game.matchId)).toEqual(["best", "nodeaths", "offrole", "older"]);
    expect(candidates[0].confidenceLabel).toBe("high");
    expect(candidates[0].relevanceReason).toContain("after goal start");
    expect(candidates[0].relevanceReason).toContain("contains deaths to review");
    expect(candidates.findIndex((game) => game.matchId === "best")).toBeLessThan(
      candidates.findIndex((game) => game.matchId === "offrole")
    );
    expect(candidates.findIndex((game) => game.matchId === "best")).toBeLessThan(
      candidates.findIndex((game) => game.matchId === "nodeaths")
    );
    expect(candidates.findIndex((game) => game.matchId === "nodeaths")).toBeLessThan(
      candidates.findIndex((game) => game.matchId === "older")
    );
    expect(candidates.find((game) => game.matchId === "aram")).toBeUndefined();
  });
});
