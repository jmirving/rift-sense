import jwt from "jsonwebtoken";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../../server/app.js";
import { loadConfig } from "../../server/config.js";
import { buildDefaultGoalDashboardState, resolveGoalDashboardState } from "../../server/goal-dashboard.js";
import { seedSystemGoalTypes } from "../../server/goal-types/system-goal-types.js";
import {
  createInMemoryAssetStore,
  createInMemoryContentItemsRepository,
  createInMemoryGoalTypesRepository,
  createInMemoryRiotMatchesRepository,
  createInMemoryUserHomesRepository
} from "./test-repositories.mjs";

async function createTestApp({
  authEnabled = false,
  perfLoggingEnabled = false,
  riotApiKey = "",
  fetchSharedProfile,
  resolveRecentGames,
  riotMatchesRepository,
  matchEvaluationsRepository,
  fetchImpl
} = {}) {
  const config = loadConfig({
    NODE_ENV: "test",
    PORT: "0",
    DATABASE_URL: "postgres://test:test@localhost:5432/riftsense_test",
    RIFTSENSE_DEMO_USER_ID: "usr_demo_home",
    NEXUS_AUTH_ENABLED: authEnabled ? "true" : "false",
    NEXUS_JWT_SECRET: "test-secret",
    NEXUS_AUTH_ISSUER: "nexus",
    NEXUS_AUTH_AUDIENCE: "riftsense",
    RIFTSENSE_PERF_LOGGING: perfLoggingEnabled ? "true" : "",
    RIFTSENSE_RIOT_API_KEY: riotApiKey
  });

  const contentItemsRepository = createInMemoryContentItemsRepository();
  const goalTypesRepository = createInMemoryGoalTypesRepository();
  const userHomesRepository = createInMemoryUserHomesRepository();
  const assetStore = createInMemoryAssetStore();

  await contentItemsRepository.initialize();
  await goalTypesRepository.initialize();
  await seedSystemGoalTypes(goalTypesRepository);
  await userHomesRepository.initialize();
  await assetStore.initialize();

  await contentItemsRepository.saveContentItem({
    id: "cnt_home_video",
    title: "Wave Control Basics",
    description: "Published video used by the home dashboard.",
    contentType: "video",
    sourceType: "external_url",
    status: "published",
    topicTags: ["macro"],
    patchSensitive: false,
    grouping: null,
    asset: {
      kind: "external-link",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      provider: "youtube"
    },
    viewer: null,
    createdAt: "2026-03-27T00:00:00.000Z",
    updatedAt: "2026-03-27T00:00:00.000Z",
    publishedAt: "2026-03-27T00:00:00.000Z",
    archivedAt: null
  });

  await userHomesRepository.saveUserHome({
    id: "usr_demo_home",
    profile: {
      displayName: "Demo User",
      teamName: "Demo Team",
      primaryRole: "Support",
      focusArea: "Review setup habits"
    }
  });

  await userHomesRepository.saveUserHome({
    id: "usr_local_dev",
    profile: {
      displayName: "Authenticated User",
      teamName: "Dev Team",
      primaryRole: "Mid",
      focusArea: "Objective setup"
    }
  });

  const app = createApp({
    config,
    contentItemsRepository,
    goalTypesRepository,
    userHomesRepository,
    assetStore,
    previewService: {
      async ensureDeckPreview(item) {
        return item;
      }
    },
    fetchSharedProfile,
    resolveRecentGames,
    riotMatchesRepository,
    matchEvaluationsRepository,
    fetchImpl
  });
  app.locals.testRepositories = {
    contentItemsRepository,
    goalTypesRepository,
    userHomesRepository,
    assetStore
  };
  return app;
}

describe("home API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requires authentication for the home payload when no user is authenticated", async () => {
    const app = await createTestApp();

    const response = await request(app).get("/api/home");

    expect(response.status).toBe(401);
    expect(response.body.error).toMatchObject({
      code: "UNAUTHORIZED",
      message: "Authentication required."
    });
  });

  it("does not emit server perf logs for /api/home by default", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const app = await createTestApp();

    const response = await request(app).get("/api/home");

    expect(response.status).toBe(401);
    expect(info).not.toHaveBeenCalled();
  });

  it("emits server perf logs for /api/home when enabled", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const app = await createTestApp({ perfLoggingEnabled: true });

    const response = await request(app).get("/api/home");

    expect(response.status).toBe(401);
    expect(info).toHaveBeenCalled();
    expect(info.mock.calls.map((call) => JSON.parse(call[0]))).toContainEqual(expect.objectContaining({
      event: "perf_timing",
      route: "home",
      step: "route",
      outcome: "failure",
      durationMs: expect.any(Number)
    }));
  });

  it("returns the public demo home from the dedicated demo endpoint", async () => {
    const app = await createTestApp();

    const response = await request(app).get("/api/demo/home");

    expect(response.status).toBe(200);
    expect(response.body.home.user.id).toBe("demo_public_dashboard");
    expect(response.body.home.user.source).toBe("demo");
    expect(response.body.home.user.profile.displayName).toBe("Public Demo Player");
    expect(
      response.body.home.goalDashboard.suggestedNextSteps.some(
        (step) => step.href === "/library?topic=laning"
      )
    ).toBe(false);
    expect(response.body.home.goalDashboard.activePersonalGoal.riotEvidence).toMatchObject({
      status: "riot_account_not_linked"
    });
  });

  it("returns the seeded Riot ADC demo variant", async () => {
    const app = await createTestApp();

    const response = await request(app).get("/api/demo/home/adc");

    expect(response.status).toBe(200);
    expect(response.body.home.goalDashboard.activePersonalGoal.riotEvidence.status).toBe("seeded-demo");
    expect(response.body.home.goalDashboard.activePersonalGoal.riotEvidence.candidateGames).toHaveLength(3);
  });

  it("returns the authenticated user's home when Nexus auth is enabled", async () => {
    const app = await createTestApp({
      authEnabled: true,
      async fetchSharedProfile() {
        return {
          userId: "usr_local_dev",
          riotGameName: "3nderWiggin",
          riotTagline: "NA1",
          riotPuuid: "puuid_local_dev_3nderwiggin",
          primaryRole: "ADC",
          secondaryRoles: ["Support"],
          preferredTeamId: null,
          activeTeamId: null
        };
      }
    });
    const token = jwt.sign(
      { sub: "usr_local_dev", iss: "nexus", aud: "riftsense" },
      "test-secret",
      { algorithm: "HS256", expiresIn: "1h" }
    );

    const response = await request(app)
      .get("/api/home")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.home.user.id).toBe("usr_local_dev");
    expect(response.body.home.user.source).toBe("authenticated");
    expect(response.body.home.focusBoard).toBeUndefined();
    expect(response.body.home.goalDashboard.activePersonalGoal.title).toBe("Die Less");
    expect(response.body.home.goalDashboard.activePersonalGoal.evidenceSource.summary).toContain("Based on 5 signal events");
    expect(response.body.home.goalDashboard.activePersonalGoal.riotEvidence).toMatchObject({
      status: "riot_access_not_configured"
    });
    expect(response.body.home.goalDashboard.activePersonalGoal.role).toBe("ADC");
    expect(response.body.home.user.profile.primaryRole).toBe("ADC");
    expect(response.body.home.user.profile.riotGameName).toBe("3nderWiggin");
    expect(response.body.home.user.profile.riotTagline).toBe("NA1");
    expect(response.body.home.user.profile.riotPuuid).toBe("puuid_local_dev_3nderwiggin");
  });

  it("returns an authenticated empty home instead of the demo home when no saved home exists", async () => {
    const app = await createTestApp({
      authEnabled: true,
      async fetchSharedProfile() {
        return {
          userId: "usr_new_auth",
          riotGameName: "FreshPlayer",
          riotTagline: "NA1",
          riotPuuid: null,
          primaryRole: null,
          secondaryRoles: []
        };
      }
    });
    const token = jwt.sign(
      { sub: "usr_new_auth", iss: "nexus", aud: "riftsense", displayName: "Fresh Player" },
      "test-secret",
      { algorithm: "HS256", expiresIn: "1h" }
    );

    const response = await request(app)
      .get("/api/home")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.home.user.id).toBe("usr_new_auth");
    expect(response.body.home.user.source).toBe("authenticated");
    expect(response.body.home.user.profile.riotGameName).toBe("FreshPlayer");
    expect(response.body.home.user.profile.primaryRole).toBeNull();
    expect(response.body.home.setupGuide).toMatchObject({
      status: "setup-needed",
      href: "/focus-plan"
    });
    expect(response.body.home.goalDashboard.activePersonalGoal.goalStatus).toBe("Goal Plan needed");
    expect(response.body.home.goalDashboard.todaysAction.href).toBe("/focus-plan");
    expect(response.body.home.goalDashboard.activePersonalGoal.riotEvidence.status).toBe("riot_account_not_linked");
  });

  it("uses shared profile fields instead of local defaults when authenticated", async () => {
    const app = await createTestApp({
      authEnabled: true,
      async fetchSharedProfile() {
        return {
          userId: "usr_local_dev",
          riotGameName: "RoleSwap",
          riotTagline: "NA1",
          riotPuuid: null,
          primaryRole: null,
          secondaryRoles: ["Support"],
          preferredTeamId: "team-1",
          activeTeamId: "team-2"
        };
      }
    });
    const token = jwt.sign(
      { sub: "usr_local_dev", iss: "nexus", aud: "riftsense" },
      "test-secret",
      { algorithm: "HS256", expiresIn: "1h" }
    );

    const response = await request(app)
      .get("/api/home")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.home.user.profile.primaryRole).toBeNull();
    expect(response.body.home.user.profile.riotPuuid).toBeNull();
    expect(response.body.home.user.profile.riotGameName).toBe("RoleSwap");
    expect(response.body.home.user.profile.preferredTeamId).toBe("team-1");
    expect(response.body.home.goalDashboard.activePersonalGoal.riotEvidence.status).toBe("riot_account_not_linked");
  });

  it("does not block Riot status when account is linked without a primary role", async () => {
    const app = await createTestApp({
      authEnabled: true,
      async fetchSharedProfile() {
        return {
          userId: "usr_local_dev",
          riotGameName: "3nderWiggin",
          riotTagline: "NA1",
          riotPuuid: "puuid_local_dev_3nderwiggin",
          primaryRole: null,
          secondaryRoles: ["Support"]
        };
      }
    });
    const token = jwt.sign(
      { sub: "usr_local_dev", iss: "nexus", aud: "riftsense" },
      "test-secret",
      { algorithm: "HS256", expiresIn: "1h" }
    );

    const response = await request(app)
      .get("/api/home")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.home.goalDashboard.activePersonalGoal.riotEvidence.status).toBe("riot_access_not_configured");
    expect(response.body.home.user.profile.primaryRole).toBeNull();
  });

  it("returns linked-but-unavailable state when Riot retrieval cannot run", async () => {
    const app = await createTestApp({
      authEnabled: true,
      async fetchSharedProfile() {
        return {
          userId: "usr_local_dev",
          riotGameName: "3nderWiggin",
          riotTagline: "NA1",
          riotPuuid: "puuid_local_dev_3nderwiggin",
          primaryRole: "ADC",
          secondaryRoles: ["Support"]
        };
      },
      async resolveRecentGames() {
        return {
          status: "recent_games_unavailable",
          sourceLabel: "Riot account linked",
          message: "Riot account linked. Recent games are temporarily unavailable.",
          games: []
        };
      }
    });
    const token = jwt.sign(
      { sub: "usr_local_dev", iss: "nexus", aud: "riftsense" },
      "test-secret",
      { algorithm: "HS256", expiresIn: "1h" }
    );

    const response = await request(app)
      .get("/api/home")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.home.goalDashboard.activePersonalGoal.riotEvidence.status).toBe("recent_games_unavailable");
    expect(response.body.home.goalDashboard.activePersonalGoal.riotEvidence.sourceLabel).toBe("Riot account linked");
  });

  it("returns scored recent games for authenticated Riot-linked users", async () => {
    const app = await createTestApp({
      authEnabled: true,
      async fetchSharedProfile() {
        return {
          userId: "usr_local_dev",
          riotGameName: "3nderWiggin",
          riotTagline: "NA1",
          riotPuuid: "puuid_local_dev_3nderwiggin",
          primaryRole: "ADC",
          secondaryRoles: ["Support"]
        };
      },
      async resolveRecentGames() {
        return {
          status: "all_recent_games_ready",
          sourceLabel: "Riot recent games",
          message: "Recent games loaded from Riot.",
          games: [
            {
              matchId: "NA1_1",
              playedAt: "2026-06-08T05:00:00.000Z",
              queueId: 420,
              queueLabel: "Ranked Solo/Duo",
              championId: 202,
              championName: "Jhin",
              role: "ADC",
              roleConfidence: "high",
              result: "Loss",
              kills: 8,
              deaths: 5,
              assists: 6,
              csPerMinute: 8.1,
              gameDurationSeconds: 1860,
              sourceMetadata: { queueBucket: "ranked" }
            },
            {
              matchId: "NA1_2",
              playedAt: "2026-05-20T05:00:00.000Z",
              queueId: 430,
              queueLabel: "Normal Blind",
              championId: 103,
              championName: "Ahri",
              role: "MID",
              roleConfidence: "high",
              result: "Win",
              kills: 3,
              deaths: 0,
              assists: 8,
              csPerMinute: 7.2,
              gameDurationSeconds: 1720,
              sourceMetadata: { queueBucket: "normal" }
            }
          ]
        };
      }
    });
    const token = jwt.sign(
      { sub: "usr_local_dev", iss: "nexus", aud: "riftsense" },
      "test-secret",
      { algorithm: "HS256", expiresIn: "1h" }
    );

    const response = await request(app)
      .get("/api/home")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.home.goalDashboard.activePersonalGoal.riotEvidence.status).toBe("all_recent_games_ready");
    expect(response.body.home.goalDashboard.activePersonalGoal.riotEvidence.candidateGames[0]).toMatchObject({
      matchId: "NA1_1",
      championName: "Jhin",
      confidenceLabel: "high"
    });
    expect(response.body.home.goalDashboard.activePersonalGoal.riotEvidence.candidateGames[0].relevanceReason).toContain("ADC role match");
    expect(response.body.home.goalDashboard.activePersonalGoal.riotEvidence.reviewCandidate).toBeNull();
    expect(JSON.stringify(response.body.home.goalDashboard.activePersonalGoal.riotEvidence.reviewCandidate)).not.toContain("timelineJson");
  });

  it("uses lightweight recent-game cards and existing evaluation summaries on /api/home", async () => {
    const riotMatchesRepository = createInMemoryRiotMatchesRepository();
    await riotMatchesRepository.initialize();
    await riotMatchesRepository.saveUserMatchPerspective({
      matchId: "NA1_card_1",
      puuid: "puuid_owner",
      championName: "Jhin",
      championId: 202,
      teamPosition: "BOTTOM",
      individualPosition: "BOTTOM",
      queueId: 420,
      gameEnd: Date.parse("2026-06-08T03:00:00.000Z"),
      duration: 1800,
      win: false,
      kills: 6,
      deaths: 2,
      assists: 7,
      totalMinionsKilled: 190,
      neutralMinionsKilled: 10,
      parseStatus: "parsed"
    });
    await riotMatchesRepository.saveUserMatchPerspective({
      matchId: "NA1_card_2",
      puuid: "puuid_owner",
      championName: "Ashe",
      championId: 22,
      teamPosition: "BOTTOM",
      individualPosition: "BOTTOM",
      queueId: 420,
      gameEnd: Date.parse("2026-06-07T03:00:00.000Z"),
      duration: 1700,
      win: true,
      kills: 4,
      deaths: 1,
      assists: 9,
      totalMinionsKilled: 180,
      neutralMinionsKilled: 8,
      parseStatus: "parsed"
    });
    riotMatchesRepository.getRawMatchData = vi.fn(async () => {
      throw new Error("home should not load raw match data");
    });
    const matchEvaluationsRepository = {
      listRecentPersistedPerspectivesForUser: vi.fn(async () => {
        throw new Error("home should not list evaluation inputs");
      }),
      getMatchEvaluation: vi.fn(async () => {
        throw new Error("home should not read evaluations one-by-one");
      }),
      getPersistedMatchReview: vi.fn(async () => {
        throw new Error("home should not load single-match reviews");
      }),
      saveMatchEvaluation: vi.fn(async () => {
        throw new Error("home should not compute evaluations");
      }),
      async listRecentEvaluationSummariesForUser({ puuid, matchIds, evaluationVersion }) {
        expect(puuid).toBe("puuid_owner");
        expect(matchIds).toEqual(["NA1_card_1", "NA1_card_2"]);
        expect(evaluationVersion).toBe("deterministic-v2");
        return [
          {
            matchId: "NA1_card_1",
            puuid,
            evaluationVersion,
            evaluationStatus: "current",
            evaluationSummary: {
              deathCount: 2,
              topTags: [{ tag: "solo_death_candidate", count: 1 }],
              reviewSignals: ["2 deaths", "1 possible unsupported death"],
              evaluatedAt: "2026-06-08T04:00:00.000Z"
            },
            updatedAt: "2026-06-08T04:00:00.000Z"
          }
        ];
      }
    };
    const app = await createTestApp({
      authEnabled: true,
      riotApiKey: "riot-key",
      riotMatchesRepository,
      matchEvaluationsRepository,
      async fetchSharedProfile() {
        return {
          userId: "usr_local_dev",
          primaryRole: "ADC",
          riotGameName: "Owner",
          riotTagline: "NA1",
          riotPuuid: "puuid_owner"
        };
      },
      async fetchImpl(url) {
        if (url.includes("/ids?")) {
          return {
            ok: true,
            async json() {
              return ["NA1_card_1", "NA1_card_2"];
            }
          };
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }
    });
    const token = jwt.sign(
      { sub: "usr_local_dev", iss: "nexus", aud: "riftsense" },
      "test-secret",
      { algorithm: "HS256", expiresIn: "1h" }
    );

    const response = await request(app)
      .get("/api/home")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    const games = response.body.home.goalDashboard.activePersonalGoal.riotEvidence.candidateGames;
    const reviewCandidate = response.body.home.goalDashboard.activePersonalGoal.riotEvidence.reviewCandidate;
    expect(games).toEqual(expect.arrayContaining([
      expect.objectContaining({
        matchId: "NA1_card_1",
        championName: "Jhin",
        queueLabel: "Ranked Solo/Duo",
        result: "Loss",
        kda: "6/2/7",
        evaluationStatus: "current",
        evaluationSummary: expect.objectContaining({ deathCount: 2 }),
        evaluationDeaths: []
      }),
      expect.objectContaining({
        matchId: "NA1_card_2",
        championName: "Ashe",
        queueLabel: "Ranked Solo/Duo",
        result: "Win",
        kda: "4/1/9",
        evaluationStatus: "not_evaluated",
        evaluationSummary: null,
        evaluationDeaths: []
      })
    ]));
    expect(reviewCandidate).toMatchObject({
      matchId: "NA1_card_1",
      evaluationStatus: "current",
      topDeterministicSignals: [expect.objectContaining({ tag: "death_count", count: 2 })]
    });
    expect(riotMatchesRepository.getRawMatchData).not.toHaveBeenCalled();
    expect(matchEvaluationsRepository.listRecentPersistedPerspectivesForUser).not.toHaveBeenCalled();
    expect(matchEvaluationsRepository.getMatchEvaluation).not.toHaveBeenCalled();
    expect(matchEvaluationsRepository.getPersistedMatchReview).not.toHaveBeenCalled();
    expect(matchEvaluationsRepository.saveMatchEvaluation).not.toHaveBeenCalled();
  });

  it("does not request evaluation summaries for incomplete recent-game perspectives", async () => {
    const riotMatchesRepository = createInMemoryRiotMatchesRepository();
    await riotMatchesRepository.initialize();
    await riotMatchesRepository.saveUserMatchPerspective({
      matchId: "NA1_ready_for_eval_lookup",
      puuid: "puuid_eval_filter",
      championName: "Jhin",
      queueId: 420,
      win: false,
      kills: 6,
      deaths: 2,
      assists: 7,
      parseStatus: "parsed"
    });
    await riotMatchesRepository.saveUserMatchPerspective({
      matchId: "NA1_partial_no_eval_lookup",
      puuid: "puuid_eval_filter",
      championName: "Brand",
      parseStatus: "parsed"
    });
    const matchEvaluationsRepository = {
      async listRecentEvaluationSummariesForUser({ matchIds }) {
        expect(matchIds).toEqual(["NA1_ready_for_eval_lookup"]);
        return [];
      }
    };
    const app = await createTestApp({
      authEnabled: true,
      riotApiKey: "riot-key",
      riotMatchesRepository,
      matchEvaluationsRepository,
      async fetchSharedProfile() {
        return {
          userId: "usr_local_dev",
          primaryRole: "ADC",
          riotPuuid: "puuid_eval_filter"
        };
      },
      async fetchImpl(url) {
        if (url.includes("/ids?")) {
          return {
            ok: true,
            async json() {
              return ["NA1_ready_for_eval_lookup", "NA1_partial_no_eval_lookup"];
            }
          };
        }
        return {
          ok: false,
          status: 503,
          async json() {
            return {};
          }
        };
      }
    });
    const token = jwt.sign(
      { sub: "usr_local_dev", iss: "nexus", aud: "riftsense" },
      "test-secret",
      { algorithm: "HS256", expiresIn: "1h" }
    );

    const response = await request(app)
      .get("/api/home")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.home.goalDashboard.activePersonalGoal.riotEvidence.readyCount).toBe(1);
    expect(response.body.home.goalDashboard.activePersonalGoal.riotEvidence.preparingCount).toBe(1);
  });

  it("includes per-match durable review progress for candidate games", async () => {
    const matchEvaluationsRepository = {
      async listRecentEvaluationSummariesForUser() {
        return [];
      },
      async listReviewedMomentSummariesForUserByMatch({ userId, matchIds }) {
        expect(userId).toBe("usr_local_dev");
        expect(matchIds).toEqual(["NA1_reviewed", "NA1_partial", "NA1_open"]);
        return [
          {
            matchId: "NA1_reviewed",
            reviewedMomentCount: 2,
            needsManualReviewCount: 1,
            triagedMomentCount: 2,
            reviewedAt: "2026-06-09T02:00:00.000Z",
            lastReviewedAt: "2026-06-09T02:00:00.000Z"
          },
          {
            matchId: "NA1_partial",
            reviewedMomentCount: 1,
            needsManualReviewCount: 0,
            triagedMomentCount: 1,
            reviewedAt: "2026-06-09T01:00:00.000Z",
            lastReviewedAt: "2026-06-09T01:00:00.000Z"
          }
        ];
      }
    };
    const app = await createTestApp({
      authEnabled: true,
      riotApiKey: "riot-key",
      matchEvaluationsRepository,
      async fetchSharedProfile() {
        return {
          userId: "usr_local_dev",
          primaryRole: "ADC",
          riotPuuid: "puuid_owner"
        };
      },
      async resolveRecentGames() {
        return {
          status: "all_recent_games_ready",
          sourceLabel: "Riot recent games",
          games: [
            {
              matchId: "NA1_reviewed",
              playedAt: "2026-06-08T03:00:00.000Z",
              queueLabel: "Ranked Solo/Duo",
              championName: "Jhin",
              role: "ADC",
              result: "Loss",
              kda: "4/2/5",
              evaluationStatus: "current",
              evaluationSummary: { deathCount: 2, reviewSignals: ["2 deaths"], topTags: [{ tag: "death_count", count: 2 }] }
            },
            {
              matchId: "NA1_partial",
              playedAt: "2026-06-07T03:00:00.000Z",
              queueLabel: "Ranked Solo/Duo",
              championName: "Ashe",
              role: "ADC",
              result: "Loss",
              kda: "3/3/4",
              evaluationStatus: "current",
              evaluationSummary: { deathCount: 3, reviewSignals: ["3 deaths"], topTags: [{ tag: "death_count", count: 3 }] }
            },
            {
              matchId: "NA1_open",
              playedAt: "2026-06-06T03:00:00.000Z",
              queueLabel: "Ranked Solo/Duo",
              championName: "Caitlyn",
              role: "ADC",
              result: "Loss",
              kda: "2/1/6",
              evaluationStatus: "current",
              evaluationSummary: { deathCount: 1, reviewSignals: ["1 death"], topTags: [{ tag: "death_count", count: 1 }] }
            }
          ],
          readyCount: 3,
          summaryReadyCount: 3,
          evaluationReadyCount: 3,
          discoveredCount: 3
        };
      }
    });
    const goalDashboard = buildDefaultGoalDashboardState(new Date("2026-06-08T00:00:00.000Z"));
    await app.locals.testRepositories.userHomesRepository.saveUserHome({
      id: "usr_local_dev",
      profile: { displayName: "Authenticated User", primaryRole: "ADC" },
      goalDashboard
    });
    const token = jwt.sign(
      { sub: "usr_local_dev", iss: "nexus", aud: "riftsense" },
      "test-secret",
      { algorithm: "HS256", expiresIn: "1h" }
    );

    const response = await request(app)
      .get("/api/home")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    const evidence = response.body.home.goalDashboard.activePersonalGoal.riotEvidence;
    expect(evidence.candidateGames).toEqual(expect.arrayContaining([
      expect.objectContaining({
        matchId: "NA1_reviewed",
        reviewedMomentCount: 2,
        needsManualReviewCount: 1,
        triagedMomentCount: 2,
        totalReviewMomentCount: 2,
        reviewStatus: "needs_manual_review"
      }),
      expect.objectContaining({
        matchId: "NA1_partial",
        reviewedMomentCount: 1,
        triagedMomentCount: 1,
        totalReviewMomentCount: 3,
        reviewStatus: "in_progress"
      })
    ]));
    expect(evidence.initialAssessment).toMatchObject({
      target: 3,
      completedMatchIds: ["NA1_reviewed"],
      completedCount: 1,
      nextMatchId: "NA1_partial",
      assessmentComplete: false
    });
    expect(evidence.reviewProgress).toMatchObject({
      totalReviewedMoments: 3,
      totalNeedsManualReviewMoments: 1,
      totalTriagedMoments: 3,
      totalReviewedTriagedGames: 1,
      reviewedMatchIds: ["NA1_reviewed", "NA1_partial"]
    });
  });

  it("refresh reports newly discovered match IDs separately from relevance-scored candidates", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const app = await createTestApp({
      authEnabled: true,
      perfLoggingEnabled: true,
      riotMatchesRepository: {
        async listRecentGameCardsForUser({ puuid }) {
          expect(puuid).toBe("puuid_owner");
          return [{ matchId: "NA1_existing_candidate" }];
        }
      },
      matchEvaluationsRepository: {
        async listRecentEvaluationSummariesForUser() {
          return [];
        }
      },
      async fetchSharedProfile() {
        return {
          userId: "usr_local_dev",
          primaryRole: "ADC",
          riotPuuid: "puuid_owner"
        };
      },
      async resolveRecentGames() {
        return {
          status: "all_recent_games_ready",
          sourceLabel: "Riot recent games",
          message: "Recent games loaded.",
          discoveredMatchIds: ["NA1_new_partial", "NA1_existing_candidate"],
          queuedMatchIds: ["NA1_new_partial"],
          games: [
            {
              matchId: "NA1_new_partial",
              championName: "Kai'Sa",
              evaluationStatus: "not_evaluated"
            },
            {
              matchId: "NA1_existing_candidate",
              playedAt: "2026-06-08T05:00:00.000Z",
              queueId: 420,
              queueLabel: "Ranked Solo/Duo",
              championName: "Jhin",
              role: "ADC",
              result: "Loss",
              kills: 3,
              deaths: 5,
              assists: 4,
              kda: "3/5/4",
              csPerMinute: 7.1,
              gameDurationSeconds: 1800,
              evaluationStatus: "current",
              evaluationSummary: {
                deathCount: 5,
                reviewSignals: ["5 deaths"],
                topTags: [{ tag: "death_count", count: 5 }]
              }
            }
          ],
          readyCount: 1,
          summaryReadyCount: 1,
          evaluationReadyCount: 1,
          preparingCount: 1,
          failedCount: 0,
          discoveredCount: 2
        };
      }
    });
    const token = jwt.sign(
      { sub: "usr_local_dev", iss: "nexus", aud: "riftsense" },
      "test-secret",
      { algorithm: "HS256", expiresIn: "1h" }
    );

    const response = await request(app)
      .post("/api/home/recent-games/refresh")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      newCount: 1,
      discoveredMatchIds: ["NA1_new_partial", "NA1_existing_candidate"],
      storedBeforeMatchIds: ["NA1_existing_candidate"],
      newDiscoveredMatchIds: ["NA1_new_partial"],
      queuedMatchIds: ["NA1_new_partial"],
      summaryReadyCount: 1,
      evaluationReadyCount: 1
    });
    expect(response.body.riotEvidence.recentGames.map((game) => game.matchId)).toEqual([
      "NA1_new_partial",
      "NA1_existing_candidate"
    ]);
    expect(response.body.riotEvidence.reviewCandidate.matchId).toBe("NA1_existing_candidate");
    expect(response.body.riotEvidence.candidateGames[0].matchId).toBe("NA1_existing_candidate");

    const routeLog = info.mock.calls
      .map((call) => JSON.parse(call[0]))
      .find((entry) => entry.route === "recent_games_refresh" && entry.step === "route");
    expect(routeLog).toMatchObject({
      puuidPresent: true,
      discoveredCount: 2,
      newDiscoveredCount: 1,
      queuedCount: 1,
      summaryReadyCount: 1,
      evaluationReadyCount: 1
    });
  });

  it("uses only confirmed reviewed moments for dashboard progress", async () => {
    const matchEvaluationsRepository = {
      async listConfirmedReviewedMomentsForUser({ userId }) {
        expect(userId).toBe("usr_local_dev");
        return [
          {
            userId,
            matchId: "NA1_confirmed",
            puuid: "puuid_owner",
            deathIndex: 1,
            deathTimestampSeconds: 494,
            signalId: "solo_death_candidate",
            status: "confirmed",
            causeCategory: "walked_without_cover",
            updatedAt: "2026-06-08T04:00:00.000Z"
          }
        ];
      }
    };
    const app = await createTestApp({
      authEnabled: true,
      matchEvaluationsRepository,
      async fetchSharedProfile() {
        return {
          userId: "usr_local_dev",
          primaryRole: "ADC",
          riotPuuid: null
        };
      }
    });
    const goalDashboard = buildDefaultGoalDashboardState(new Date("2026-06-08T00:00:00.000Z"));
    goalDashboard.evidenceEvents = [];
    await app.locals.testRepositories.userHomesRepository.saveUserHome({
      id: "usr_local_dev",
      profile: {
        displayName: "Authenticated User",
        primaryRole: "ADC"
      },
      goalDashboard
    });
    const token = jwt.sign(
      { sub: "usr_local_dev", iss: "nexus", aud: "riftsense" },
      "test-secret",
      { algorithm: "HS256", expiresIn: "1h" }
    );

    const response = await request(app)
      .get("/api/home")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    const goal = response.body.home.goalDashboard.activePersonalGoal;
    expect(goal.evidenceSource).toMatchObject({
      totalEvents: 1,
      confidence: "Low sample"
    });
    expect(goal.evidenceSource.summary).toContain("Based on 1 signal event");
    expect(goal.signals.find((signal) => signal.id === "signal-known-danger-death").value).toBe(1);
    expect(goal.signals.find((signal) => signal.id === "signal-bad-trade-read").value).toBe(0);
  });

  it("leaves dashboard progress empty when reviewed moments are dismissed or unsure", async () => {
    const app = await createTestApp({
      authEnabled: true,
      matchEvaluationsRepository: {
        async listConfirmedReviewedMomentsForUser() {
          return [];
        }
      },
      async fetchSharedProfile() {
        return {
          userId: "usr_local_dev",
          primaryRole: "ADC",
          riotPuuid: null
        };
      }
    });
    const goalDashboard = buildDefaultGoalDashboardState(new Date("2026-06-08T00:00:00.000Z"));
    goalDashboard.evidenceEvents = [];
    await app.locals.testRepositories.userHomesRepository.saveUserHome({
      id: "usr_local_dev",
      profile: {
        displayName: "Authenticated User",
        primaryRole: "ADC"
      },
      goalDashboard
    });
    const token = jwt.sign(
      { sub: "usr_local_dev", iss: "nexus", aud: "riftsense" },
      "test-secret",
      { algorithm: "HS256", expiresIn: "1h" }
    );

    const response = await request(app)
      .get("/api/home")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    const goal = response.body.home.goalDashboard.activePersonalGoal;
    expect(goal.evidenceSource).toMatchObject({
      totalEvents: 0,
      confidence: "No reviewed games yet",
      confidenceTrend: "unknown"
    });
    expect(goal.evidenceSource.summary).toBe("No reviewed games yet");
    expect(goal.signals.every((signal) => signal.value === 0)).toBe(true);
  });

  it("ignores authenticated identity on the dedicated demo endpoint", async () => {
    const app = await createTestApp({ authEnabled: true });
    const token = jwt.sign(
      { sub: "usr_local_dev", iss: "nexus", aud: "riftsense" },
      "test-secret",
      { algorithm: "HS256", expiresIn: "1h" }
    );

    const response = await request(app)
      .get("/api/demo/home")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.home.user.id).toBe("demo_public_dashboard");
    expect(response.body.home.user.source).toBe("demo");
    expect(response.body.home.user.profile.displayName).toBe("Public Demo Player");
  });

  it("serves the client app from the demo route", async () => {
    const app = await createTestApp();

    const response = await request(app).get("/demo");

    expect(response.status).toBe(200);
    expect(response.text).toContain('<div id="app"></div>');
    expect(response.text).toContain('<script type="module" src="/app/main.js"></script>');
  });

  it("serves the client app from the public root and about routes", async () => {
    const app = await createTestApp();

    const homeResponse = await request(app).get("/");
    const aboutResponse = await request(app).get("/about");

    expect(homeResponse.status).toBe(200);
    expect(homeResponse.text).toContain('<div id="app"></div>');
    expect(aboutResponse.status).toBe(200);
    expect(aboutResponse.text).toContain('<div id="app"></div>');
  });

  it("serves the client app from onboarding routes", async () => {
    const app = await createTestApp();

    const onboardingResponse = await request(app).get("/onboarding");
    const demoOnboardingResponse = await request(app).get("/demo/onboarding");

    expect(onboardingResponse.status).toBe(200);
    expect(onboardingResponse.text).toContain('<div id="app"></div>');
    expect(demoOnboardingResponse.status).toBe(200);
    expect(demoOnboardingResponse.text).toContain('<div id="app"></div>');
  });

  it("serves the client app from setup routes", async () => {
    const app = await createTestApp();

    const setupResponse = await request(app).get("/setup");
    const demoSetupResponse = await request(app).get("/demo/setup");

    expect(setupResponse.status).toBe(200);
    expect(setupResponse.text).toContain('<div id="app"></div>');
    expect(setupResponse.text).toContain('<script type="module" src="/app/main.js"></script>');
    expect(demoSetupResponse.status).toBe(200);
    expect(demoSetupResponse.text).toContain('<div id="app"></div>');
    expect(demoSetupResponse.text).toContain('<script type="module" src="/app/main.js"></script>');
  });

  it("returns onboarding template options", async () => {
    const app = await createTestApp();

    const response = await request(app).get("/api/onboarding/options");

    expect(response.status).toBe(200);
    expect(response.body.templates.goalTemplates[0].id).toBe("goal-template-rank-climb");
    expect(response.body.templates.focusTemplates[0].id).toBe("focus-die-less");
    expect(response.body.templates.signalTemplates[0].id).toBe("signal-known-danger-death");
    expect(response.body.templates.metricTemplates[0].id).toBe("metric-known-danger-deaths-week");
    expect(response.body.templates.actionTemplates[0].id).toBe("action-death-review-v1");
    expect(response.body.templates.teamFocusTemplates[0].id).toBe("team-focus-template-dragon-setup");
    expect(response.body.systemGoalTypes.map((goalType) => goalType.id)).toEqual([
      "death_review",
      "fight_participation",
      "lane_pressure_conversion",
      "map_state_safety",
      "objective_setup_exit",
      "tempo_conversion",
      "vision_information"
    ]);
    expect(response.body.systemGoalTypes[0]).toMatchObject({
      createdBySystem: true,
      isActiveOption: true,
      roleApplicability: ["ANY"]
    });
  });

  it("saves onboarding to the local demo user when auth is disabled", async () => {
    const app = await createTestApp();

    const saveResponse = await request(app)
      .post("/api/onboarding")
      .send({
        context: "both",
        role: "ADC",
        selectedGoalTemplateId: "goal-template-adc-die-less",
        selectedSignalIds: ["signal-known-danger-death", "signal-clean-disengage"],
        weeklyTargets: [
          {
            signalId: "signal-known-danger-death",
            targetValue: 0,
            label: "0 known gank deaths"
          }
        ],
        selectedActionTemplateId: "action-death-review-v1",
        selectedTeamFocusTemplateId: "team-focus-template-dragon-setup"
      });

    expect(saveResponse.status).toBe(201);
    expect(saveResponse.body.goalDashboard.focusPlan.goal.templateId).toBe("goal-template-rank-climb");
    expect(saveResponse.body.goalDashboard.focusPlan.primaryFocus.templateId).toBe("focus-die-less");
    expect(saveResponse.body.goalDashboard.activePersonalGoal.templateId).toBe("focus-die-less");

    const savedHome = await app.locals.testRepositories.userHomesRepository.getUserHome("usr_demo_home");
    expect(savedHome.goalDashboard.focusPlan.goalInstance.goalTemplateId).toBe("goal-template-rank-climb");
    expect(savedHome.profile.primaryRole).toBe("Bot");
    expect(savedHome.goalDashboard.focusPlan.focusInstances[0].focusTemplateId).toBe("focus-die-less");
    expect(savedHome.goalDashboard.activeGoalInstances[0].templateId).toBe("focus-die-less");
  });

  it("stores configurable ranked goal baseline and editable metric targets", async () => {
    const app = await createTestApp();

    const saveResponse = await request(app)
      .post("/api/onboarding")
      .send({
        context: "personal",
        role: "Bot",
        selectedGoalTemplateId: "goal-template-rank-climb",
        primaryFocusTemplateId: "focus-die-less",
        selectedSignalIds: ["signal-known-danger-death", "signal-clean-disengage"],
        selectedMetricIds: ["metric-known-danger-deaths-week"],
        goalOriginal: { rank: "Gold", division: "II", lp: 34 },
        goalTarget: { rank: "Diamond", division: "IV", lp: 22 },
        targets: [
          {
            id: "custom-known-danger",
            metricId: "metric-known-danger-deaths-week",
            operator: ">=",
            value: 4,
            window: "next_3_games"
          }
        ],
        selectedActionTemplateId: "action-death-review-v1"
      });

    expect(saveResponse.status).toBe(201);

    const savedHome = await app.locals.testRepositories.userHomesRepository.getUserHome("usr_demo_home");
    expect(savedHome.profile.primaryRole).toBe("Bot");
    expect(savedHome.goalDashboard.focusPlan.goalInstance).toMatchObject({
      goalTemplateId: "goal-template-rank-climb",
      original: { rank: "Gold", division: "II", lp: 34 },
      target: { rank: "Diamond", division: "IV", lp: 22 },
      originalRole: "Bot",
      originalPrimaryFocusTemplateId: "focus-die-less",
      originalSelectedMetricIds: ["metric-known-danger-deaths-week"]
    });
    expect(savedHome.goalDashboard.focusPlan.focusInstances[0]).toMatchObject({
      originalSelectedSignalIds: ["signal-known-danger-death", "signal-clean-disengage"],
      originalSelectedMetricIds: ["metric-known-danger-deaths-week"],
      targets: [
        expect.objectContaining({
          id: "custom-known-danger",
          operator: ">=",
          value: 4,
          window: "next_3_games"
        })
      ]
    });
  });

  it("normalizes legacy ADC role to Bot on onboarding save", async () => {
    const app = await createTestApp();

    const response = await request(app)
      .post("/api/onboarding")
      .send({
        context: "personal",
        role: "ADC",
        selectedGoalTemplateId: "goal-template-rank-climb",
        primaryFocusTemplateId: "focus-die-less"
      });

    expect(response.status).toBe(201);
    const savedHome = await app.locals.testRepositories.userHomesRepository.getUserHome("usr_demo_home");
    expect(savedHome.profile.primaryRole).toBe("Bot");
    expect(savedHome.goalDashboard.role).toBe("Bot");
  });

  it("saves onboarding to the authenticated user when auth is enabled", async () => {
    const app = await createTestApp({ authEnabled: true });
    const token = jwt.sign(
      { sub: "usr_local_dev", iss: "nexus", aud: "riftsense", displayName: "Nexus Name" },
      "test-secret",
      { algorithm: "HS256", expiresIn: "1h" }
    );

    const saveResponse = await request(app)
      .post("/api/onboarding")
      .set("Authorization", `Bearer ${token}`)
      .send({
        context: "personal",
        role: "Support",
        selectedGoalTemplateId: "goal-template-rank-climb",
        primaryFocusTemplateId: "focus-die-less",
        supportingFocusTemplateIds: ["focus-lane-better"],
        laterFocusTemplateIds: ["focus-teamfight-better"],
        selectedSignalIds: ["signal-known-danger-death"],
        selectedMetricIds: ["metric-known-danger-deaths-week"],
        targets: [
          {
            metricId: "metric-known-danger-deaths-week",
            operator: "<=",
            value: 0,
            window: "week"
          }
        ],
        selectedActionTemplateId: "action-death-review-v1"
      });

    expect(saveResponse.status).toBe(201);

    const savedHome = await app.locals.testRepositories.userHomesRepository.getUserHome("usr_local_dev");
    expect(savedHome.profile).toMatchObject({
      displayName: "Authenticated User",
      teamName: "Dev Team",
      primaryRole: "Support",
      focusArea: "Die Less"
    });
    expect(savedHome.profile.teamName).not.toBe("Local Demo Squad");
    expect(savedHome.profile.focusArea).not.toBe("Template-backed onboarding");
    expect(savedHome.goalDashboard.focusPlan.goalInstance.goalTemplateId).toBe("goal-template-rank-climb");
    expect(savedHome.goalDashboard.focusPlan.focusInstances.map((focus) => focus.focusTemplateId)).toEqual([
      "focus-die-less",
      "focus-lane-better",
      "focus-teamfight-better"
    ]);

    const homeResponse = await request(app)
      .get("/api/home")
      .set("Authorization", `Bearer ${token}`);

    expect(homeResponse.status).toBe(200);
    expect(homeResponse.body.home.user.id).toBe("usr_local_dev");
    expect(homeResponse.body.home.user.source).toBe("authenticated");
    expect(homeResponse.body.home.goalDashboard.activePersonalGoal.id).toBe("focus-instance-usr-local-dev-die-less");
    expect(homeResponse.body.home.goalDashboard.activeTeamFocus).toBeNull();
  });

  it("creates a new authenticated onboarding home without demo placeholder profile values", async () => {
    const app = await createTestApp({ authEnabled: true });
    const token = jwt.sign(
      { sub: "usr_new_player", iss: "nexus", aud: "riftsense", displayName: "Nexus Player" },
      "test-secret",
      { algorithm: "HS256", expiresIn: "1h" }
    );

    const saveResponse = await request(app)
      .post("/api/onboarding")
      .set("Authorization", `Bearer ${token}`)
      .send({
        context: "both",
        role: "Jungle",
        selectedGoalTemplateId: "goal-template-adc-trading",
        selectedSignalIds: ["signal-bad-trade-read"],
        weeklyTargets: [
          {
            signalId: "signal-bad-trade-read",
            targetValue: 1
          }
        ],
        selectedTeamFocusTemplateId: "team-focus-template-dragon-setup"
      });

    expect(saveResponse.status).toBe(201);

    const savedHome = await app.locals.testRepositories.userHomesRepository.getUserHome("usr_new_player");
    expect(savedHome.id).toBe("usr_new_player");
    expect(savedHome.profile).toMatchObject({
      displayName: "Nexus Player",
      teamName: null,
      primaryRole: "Jungle",
      focusArea: "Lane Better"
    });
    expect(savedHome.profile.teamName).not.toBe("Local Demo Squad");
    expect(savedHome.profile.displayName).not.toBe("RiftSense Player");
    expect(savedHome.profile.focusArea).not.toBe("Template-backed onboarding");
    expect(savedHome.goalDashboard.activeGoalInstances[0].templateId).toBe("focus-lane-better");
    expect(savedHome.goalDashboard.activeTeamFocusInstances[0].templateId).toBe("team-focus-template-dragon-setup");
  });

  it("resolves multiple focus instances and picks the primary focus", () => {
    const resolved = resolveGoalDashboardState({
      version: 2,
      focusPlan: {
        goalInstance: {
          id: "goal-instance-test",
          goalTemplateId: "goal-template-rank-climb",
          ownerId: "usr_test",
          status: "active",
          activeSince: "2026-06-23"
        },
        focusInstances: [
          {
            id: "focus-supporting",
            focusTemplateId: "focus-farm-better",
            ownerType: "player",
            ownerId: "usr_test",
            status: "active",
            priority: "supporting",
            stage: "initial_assessment",
            selectedSignalIds: ["signal-cs-missed-while-present"],
            selectedMetricIds: ["metric-cs-missed-while-present"],
            targets: [],
            selectedActionIds: ["action-death-review-v1"],
            activeSince: "2026-06-23"
          },
          {
            id: "focus-primary",
            focusTemplateId: "focus-die-less",
            ownerType: "player",
            ownerId: "usr_test",
            status: "active",
            priority: "primary",
            stage: "initial_assessment",
            selectedSignalIds: ["signal-known-danger-death"],
            selectedMetricIds: ["metric-known-danger-deaths-week"],
            targets: [],
            selectedActionIds: ["action-death-review-v1"],
            activeSince: "2026-06-23"
          }
        ]
      },
      evidenceEvents: [],
      recommendations: []
    });

    expect(resolved.focusPlan.goal.title).toBe("Reach target rank");
    expect(resolved.focusPlan.primaryFocus.id).toBe("focus-primary");
    expect(resolved.focusPlan.supportingFocuses[0].id).toBe("focus-supporting");
    expect(resolved.activePersonalGoal.id).toBe("focus-primary");
    expect(resolved.activePersonalGoal.title).toBe("Die Less");
    expect(resolved.activePersonalGoal.stage).toBe("initial_assessment");
  });

  it("does not promote paused or detached focuses to primary", () => {
    const resolved = resolveGoalDashboardState({
      version: 2,
      focusPlan: {
        goalInstance: {
          id: "goal-instance-test",
          goalTemplateId: "goal-template-rank-climb",
          ownerId: "usr_test",
          status: "active",
          activeSince: "2026-06-23"
        },
        focusInstances: [
          {
            id: "focus-paused-primary",
            focusTemplateId: "focus-die-less",
            ownerType: "player",
            ownerId: "usr_test",
            status: "paused",
            priority: "primary",
            selectedSignalIds: ["signal-known-danger-death"],
            selectedMetricIds: ["metric-known-danger-deaths-week"],
            targets: []
          },
          {
            id: "focus-active-supporting",
            focusTemplateId: "focus-farm-better",
            ownerType: "player",
            ownerId: "usr_test",
            status: "active",
            priority: "supporting",
            selectedSignalIds: ["signal-cs-missed-while-present"],
            selectedMetricIds: ["metric-cs-missed-while-present"],
            targets: []
          },
          {
            id: "focus-detached",
            focusTemplateId: "focus-lane-better",
            ownerType: "player",
            ownerId: "usr_test",
            status: "detached",
            priority: "detached",
            selectedSignalIds: ["signal-bad-trade-read"],
            selectedMetricIds: [],
            targets: []
          }
        ]
      },
      evidenceEvents: [],
      recommendations: []
    });

    expect(resolved.focusPlan.primaryFocus.id).toBe("focus-active-supporting");
    expect(resolved.focusPlan.allFocuses.map((focus) => focus.id)).not.toContain("focus-detached");
  });

  it("does not mutate authenticated user homes from demo routes", async () => {
    const app = await createTestApp({ authEnabled: true });
    const token = jwt.sign(
      { sub: "usr_local_dev", iss: "nexus", aud: "riftsense", displayName: "Nexus Name" },
      "test-secret",
      { algorithm: "HS256", expiresIn: "1h" }
    );
    const before = await app.locals.testRepositories.userHomesRepository.getUserHome("usr_local_dev");

    const response = await request(app)
      .get("/api/demo/home")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.home.user.id).toBe("demo_public_dashboard");
    await expect(app.locals.testRepositories.userHomesRepository.getUserHome("usr_local_dev")).resolves.toEqual(before);
  });

  it("rejects invalid onboarding template IDs", async () => {
    const app = await createTestApp();

    const response = await request(app)
      .post("/api/onboarding")
      .send({
        context: "personal",
        role: "ADC",
        selectedGoalTemplateId: "missing-template"
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("BAD_REQUEST");
  });
});
