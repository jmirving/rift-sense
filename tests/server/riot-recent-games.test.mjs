import { describe, expect, it } from "vitest";

import {
  deriveRecentGamesStatus,
  MAX_NEW_MATCHES_TO_QUEUE_PER_REFRESH,
  normalizeRecentGame,
  RECENT_MATCH_LOOKUP_LIMIT,
  resolveRecentGames,
  scoreRecentGames,
  selectReviewCandidate
} from "../../server/riot/recent-games.js";
import { createInMemoryRiotMatchesRepository } from "./test-repositories.mjs";

async function createRiotRepository() {
  const repository = createInMemoryRiotMatchesRepository();
  await repository.initialize();

  return repository;
}

async function waitFor(assertion, { attempts = 20, delayMs = 10 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await assertion();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

describe("riot recent-games service", () => {
  it("derives non-blocking recent game parser statuses", () => {
    expect(deriveRecentGamesStatus({ riotPuuid: null, apiKey: "key" })).toBe("riot_account_not_linked");
    expect(deriveRecentGamesStatus({ riotPuuid: "puuid_1", apiKey: "" })).toBe("riot_access_not_configured");
    expect(deriveRecentGamesStatus({ riotPuuid: "puuid_1", apiKey: "key", matchIdsKnown: false })).toBe("checking_recent_games");
    expect(deriveRecentGamesStatus({ riotPuuid: "puuid_1", apiKey: "key", matchIdsKnown: true, preparingCount: 2 })).toBe("games_found_parsing");
    expect(deriveRecentGamesStatus({ riotPuuid: "puuid_1", apiKey: "key", matchIdsKnown: true, readyCount: 1, preparingCount: 1 })).toBe("some_games_ready");
    expect(deriveRecentGamesStatus({ riotPuuid: "puuid_1", apiKey: "key", matchIdsKnown: true, readyCount: 2 })).toBe("all_recent_games_ready");
    expect(deriveRecentGamesStatus({ riotPuuid: "puuid_1", apiKey: "key", matchIdsKnown: true, failedCount: 1 })).toBe("parse_failed_retry_available");
  });

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

    expect(result.status).toBe("riot_access_not_configured");
    expect(result.code).toBe("riot-config-missing");
  });

  it("uses the documented default recent match lookup limit", async () => {
    const calls = [];
    const result = await resolveRecentGames({
      profile: {
        riotPuuid: "puuid_1"
      },
      config: {
        riot: {
          apiKey: "riot-key",
          routingRegion: "americas"
        }
      },
      fetchImpl: async (url) => {
        calls.push(url);
        return {
          ok: true,
          async json() {
            return [];
          }
        };
      }
    });

    expect(result.code).toBe("no-recent-games");
    expect(calls[0]).toContain(`count=${RECENT_MATCH_LOOKUP_LIMIT}`);
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

    expect(result.status).toBe("all_recent_games_ready");
    expect(result.games).toHaveLength(1);
    expect(result.games[0]).toMatchObject({
      matchId: "NA1_1",
      queueLabel: "Ranked Flex",
      championName: "Jinx"
    });
    expect(calls[0]).toContain("/by-puuid/puuid_1/ids");
    expect(calls.some((url) => url.endsWith("/matches/NA1_1/timeline"))).toBe(true);
  });

  it("starts uncached match preparation without blocking recent game status", async () => {
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

    expect(result).toMatchObject({
      status: "games_found_parsing",
      readyCount: 0,
      preparingCount: 1,
      games: []
    });

    await waitFor(async () => expect(await repository.getRawMatchData("NA1_2")).toMatchObject({
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
    }));
    await waitFor(async () => expect(await repository.getUserMatchPerspective("NA1_2", "puuid_1")).toMatchObject({
      matchId: "NA1_2",
      puuid: "puuid_1",
      participantId: 4,
      championName: "Ashe",
      teamId: 100,
      teamPosition: "BOTTOM",
      individualPosition: "BOTTOM",
      duration: 1800,
      parseStatus: "parsed"
    }));
  });

  it("queues at most the documented number of new matches per repository-backed refresh", async () => {
    const repository = await createRiotRepository();
    const matchIds = Array.from({ length: MAX_NEW_MATCHES_TO_QUEUE_PER_REFRESH + 2 }, (_, index) => `NA1_${index + 10}`);
    const fetchedMatchIds = [];

    const fetchImpl = async (url) => {
      if (url.includes("/ids?")) {
        return {
          ok: true,
          async json() {
            return matchIds;
          }
        };
      }

      const matchId = url.match(/\/matches\/([^/]+)/)?.[1];
      fetchedMatchIds.push(decodeURIComponent(matchId));

      if (url.endsWith("/timeline")) {
        return {
          ok: true,
          async json() {
            return { metadata: { matchId: decodeURIComponent(matchId) }, info: { frames: [] } };
          }
        };
      }

      return {
        ok: true,
        async json() {
          return {
            metadata: {
              matchId: decodeURIComponent(matchId)
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

    const result = await resolveRecentGames({
      profile: {
        riotPuuid: "puuid_1"
      },
      config: {
        riot: {
          apiKey: "riot-key",
          routingRegion: "americas"
        }
      },
      riotMatchesRepository: repository,
      fetchImpl
    });

    expect(result.preparingCount).toBe(MAX_NEW_MATCHES_TO_QUEUE_PER_REFRESH);
    await waitFor(async () => {
      const uniqueFetchedMatchIds = [...new Set(fetchedMatchIds)];
      expect(uniqueFetchedMatchIds).toHaveLength(MAX_NEW_MATCHES_TO_QUEUE_PER_REFRESH);
      expect(uniqueFetchedMatchIds).toEqual(matchIds.slice(0, MAX_NEW_MATCHES_TO_QUEUE_PER_REFRESH));
      await Promise.all(
        matchIds
          .slice(0, MAX_NEW_MATCHES_TO_QUEUE_PER_REFRESH)
          .map(async (matchId) => expect(await repository.getRawMatchData(matchId)).toMatchObject({ matchId }))
      );
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

    expect(result.status).toBe("all_recent_games_ready");
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

    expect(candidates.map((game) => game.matchId)).toEqual(["best", "offrole", "older", "nodeaths"]);
    expect(candidates[0].confidenceLabel).toBe("high");
    expect(candidates[0].relevanceReason).toContain("after goal start");
    expect(candidates[0].relevanceReason).toContain("contains deaths to review");
    expect(candidates.findIndex((game) => game.matchId === "best")).toBeLessThan(
      candidates.findIndex((game) => game.matchId === "offrole")
    );
    expect(candidates.findIndex((game) => game.matchId === "offrole")).toBeLessThan(
      candidates.findIndex((game) => game.matchId === "nodeaths")
    );
    expect(candidates.findIndex((game) => game.matchId === "nodeaths")).toBeGreaterThan(
      candidates.findIndex((game) => game.matchId === "older")
    );
    expect(candidates.find((game) => game.matchId === "aram")).toBeUndefined();
  });

  it("prioritizes evaluated games with stronger goal-relevant evidence", () => {
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
          matchId: "light-evidence",
          playedAt: "2026-06-01T03:00:00.000Z",
          queueLabel: "Ranked Solo/Duo",
          championName: "Ashe",
          role: "ADC",
          result: "Loss",
          kills: 6,
          deaths: 2,
          assists: 7,
          csPerMinute: 8,
          gameDurationSeconds: 1800,
          sourceMetadata: { queueBucket: "ranked" },
          evaluationStatus: "current",
          evaluationSummary: {
            deathCount: 2,
            topTags: [{ tag: "solo_death_candidate", count: 1 }],
            reviewSignals: ["2 deaths", "1 solo death candidate"]
          }
        },
        {
          matchId: "strong-evidence",
          playedAt: "2026-06-01T02:00:00.000Z",
          queueLabel: "Ranked Solo/Duo",
          championName: "Jhin",
          role: "ADC",
          result: "Loss",
          kills: 5,
          deaths: 4,
          assists: 6,
          csPerMinute: 7.7,
          gameDurationSeconds: 1800,
          sourceMetadata: { queueBucket: "ranked" },
          evaluationStatus: "current",
          evaluationSummary: {
            deathCount: 4,
            topTags: [
              { tag: "multi_enemy_collapse_candidate", count: 3 },
              { tag: "objective_window_candidate", count: 2 }
            ],
            reviewSignals: ["4 deaths", "3 multi-enemy collapse candidates", "2 objective-window candidates"]
          }
        },
        {
          matchId: "unevaluated",
          playedAt: "2026-06-01T04:00:00.000Z",
          queueLabel: "Ranked Solo/Duo",
          championName: "Caitlyn",
          role: "ADC",
          result: "Loss",
          kills: 8,
          deaths: 7,
          assists: 4,
          csPerMinute: 8.4,
          gameDurationSeconds: 1800,
          sourceMetadata: { queueBucket: "ranked" }
        }
      ]
    });

    expect(candidates.map((game) => game.matchId)).toEqual(["strong-evidence", "light-evidence", "unevaluated"]);
    expect(candidates[0].relevanceReason).toContain("evaluation ready");
    expect(candidates[0].relevanceReason).toContain("9 goal-relevant signals");
  });

  it("falls back gracefully when no saved goal is available", () => {
    const candidates = scoreRecentGames({
      goal: null,
      profile: {},
      now: new Date("2026-06-01T12:00:00.000Z"),
      games: [
        {
          matchId: "evaluated",
          playedAt: "2026-06-01T02:00:00.000Z",
          queueLabel: "Ranked Solo/Duo",
          championName: "Jinx",
          role: "ADC",
          result: "Loss",
          kills: 4,
          deaths: 3,
          assists: 8,
          csPerMinute: 7.4,
          gameDurationSeconds: 1800,
          sourceMetadata: { queueBucket: "ranked" },
          evaluationStatus: "current",
          evaluationSummary: {
            deathCount: 3,
            topTags: [{ tag: "objective_window_candidate", count: 1 }],
            reviewSignals: ["3 deaths", "1 objective-window candidate"]
          }
        },
        {
          matchId: "missing-evaluation",
          playedAt: "2026-06-01T03:00:00.000Z",
          queueLabel: "Ranked Solo/Duo",
          championName: "Sivir",
          role: "ADC",
          result: "Win",
          kills: 6,
          deaths: 1,
          assists: 9,
          csPerMinute: 8.1,
          gameDurationSeconds: 1800,
          sourceMetadata: { queueBucket: "ranked" }
        }
      ]
    });

    expect(candidates.map((game) => game.matchId)).toEqual(["evaluated", "missing-evaluation"]);
    expect(candidates[0].relevanceReason).toContain("evaluation ready");
  });

  it("selects an evaluated review candidate over an unevaluated game", () => {
    const candidates = scoreRecentGames({
      goal: { title: "Die Less", role: "ADC" },
      profile: { primaryRole: "ADC" },
      now: new Date("2026-06-01T12:00:00.000Z"),
      games: [
        {
          matchId: "unevaluated-newer",
          playedAt: "2026-06-01T04:00:00.000Z",
          queueLabel: "Ranked Solo/Duo",
          championName: "Caitlyn",
          role: "ADC",
          result: "Loss",
          kills: 8,
          deaths: 3,
          assists: 4,
          csPerMinute: 8.4,
          gameDurationSeconds: 1800,
          sourceMetadata: { queueBucket: "ranked" }
        },
        {
          matchId: "evaluated",
          playedAt: "2026-06-01T03:00:00.000Z",
          queueLabel: "Ranked Solo/Duo",
          championName: "Jhin",
          role: "ADC",
          result: "Loss",
          kills: 5,
          deaths: 2,
          assists: 6,
          csPerMinute: 7.8,
          gameDurationSeconds: 1800,
          sourceMetadata: { queueBucket: "ranked" },
          evaluationStatus: "current",
          evaluationSummary: {
            deathCount: 2,
            topTags: [{ tag: "death_count", count: 2 }],
            reviewSignals: ["2 deaths"]
          }
        }
      ]
    });
    const candidate = selectReviewCandidate({ candidateGames: candidates, goal: { title: "Die Less", role: "ADC" } });

    expect(candidate.matchId).toBe("evaluated");
    expect(candidate.selectionReason).toContain("evaluation ready");
    expect(candidate.topDeterministicSignals[0]).toMatchObject({ tag: "death_count", count: 2 });
  });

  it("prefers ranked role-matched games over unrelated normals when otherwise similar", () => {
    const candidates = scoreRecentGames({
      goal: { title: "Die Less", role: "ADC" },
      profile: { primaryRole: "ADC" },
      now: new Date("2026-06-01T12:00:00.000Z"),
      games: [
        {
          matchId: "normal-mid",
          playedAt: "2026-06-01T03:00:00.000Z",
          queueLabel: "Normal Draft",
          championName: "Ahri",
          role: "MID",
          result: "Loss",
          kills: 5,
          deaths: 3,
          assists: 4,
          csPerMinute: 7.1,
          gameDurationSeconds: 1800,
          sourceMetadata: { queueBucket: "normal" },
          evaluationStatus: "current",
          evaluationSummary: { deathCount: 3, topTags: [], reviewSignals: ["3 deaths"] }
        },
        {
          matchId: "ranked-adc",
          playedAt: "2026-06-01T03:00:00.000Z",
          queueLabel: "Ranked Solo/Duo",
          championName: "Ashe",
          role: "ADC",
          result: "Loss",
          kills: 5,
          deaths: 3,
          assists: 4,
          csPerMinute: 7.1,
          gameDurationSeconds: 1800,
          sourceMetadata: { queueBucket: "ranked" },
          evaluationStatus: "current",
          evaluationSummary: { deathCount: 3, topTags: [], reviewSignals: ["3 deaths"] }
        }
      ]
    });

    expect(candidates[0].matchId).toBe("ranked-adc");
    expect(selectReviewCandidate({ candidateGames: candidates }).matchId).toBe("ranked-adc");
  });

  it("keeps a review candidate when evaluated games have zero deaths", () => {
    const candidates = scoreRecentGames({
      goal: { title: "Die Less", role: "ADC" },
      profile: { primaryRole: "ADC" },
      now: new Date("2026-06-01T12:00:00.000Z"),
      games: [
        {
          matchId: "zero-deaths",
          playedAt: "2026-06-01T03:00:00.000Z",
          queueLabel: "Ranked Solo/Duo",
          championName: "Sivir",
          role: "ADC",
          result: "Win",
          kills: 4,
          deaths: 0,
          assists: 9,
          csPerMinute: 8.1,
          gameDurationSeconds: 1800,
          sourceMetadata: { queueBucket: "ranked" },
          evaluationStatus: "current",
          evaluationSummary: { deathCount: 0, topTags: [], reviewSignals: ["0 deaths"] }
        }
      ]
    });

    expect(selectReviewCandidate({ candidateGames: candidates, goal: { title: "Die Less" } })).toMatchObject({
      matchId: "zero-deaths",
      evaluationStatus: "current"
    });
  });
});
