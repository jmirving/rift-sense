import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../../server/app.js";
import { loadConfig } from "../../server/config.js";
import {
  createInMemoryAssetStore,
  createInMemoryContentItemsRepository,
  createInMemoryGoalTypesRepository,
  createInMemoryUserHomesRepository
} from "./test-repositories.mjs";

function token(claims = {}) {
  return jwt.sign(
    { sub: "usr_local_dev", iss: "nexus", aud: "riftsense", ...claims },
    "test-secret",
    { algorithm: "HS256", expiresIn: "1h" }
  );
}

function createEvaluationRepository() {
  const seenPuuids = [];
  const reviewedMoments = [];
  const input = {
    matchId: "NA1_051",
    puuid: "puuid_owner",
    summaryJson: { metadata: { matchId: "NA1_051" } },
    timelineJson: {
      info: {
        frames: [{ events: [{ type: "SECRET_TIMELINE_EVENT" }] }]
      }
    },
    perspectiveRecord: {
      matchId: "NA1_051",
      puuid: "puuid_owner",
      participantId: 1,
      championName: "Ahri",
      teamId: 100
    },
    sourceRawMatchUpdatedAt: "2026-06-01T00:00:00.000Z",
    sourcePerspectiveUpdatedAt: "2026-06-01T00:01:00.000Z",
    rawMatchMissing: false
  };
  const evaluation = {
    matchId: "NA1_051",
    puuid: "puuid_owner",
    evaluationVersion: "deterministic-v2",
    sourceRawMatchUpdatedAt: "2026-06-01T00:00:00.000Z",
    sourcePerspectiveUpdatedAt: "2026-06-01T00:01:00.000Z",
    summaryJson: {
      matchId: "NA1_051",
      puuid: "puuid_owner",
      championName: "Ahri",
      queueId: 420,
      gameCreation: 1_780_000_000_000,
      win: false,
      kills: 1,
      deaths: 2,
      assists: 3,
      evaluatedAt: "2026-06-02T00:00:00.000Z"
    },
    deathsJson: [
      {
        deathIndex: 1,
        timestampSeconds: 494,
        killerChampionName: "LeBlanc",
        assistingChampionNames: ["Briar"],
        tags: ["solo_death_candidate"]
      },
      { deathIndex: 2 }
    ],
    tagsJson: {
      counts: {
        death_count: 2,
        solo_death_candidate: 1,
        objective_window_candidate: 1
      }
    },
    updatedAt: "2026-06-02T00:00:00.000Z"
  };

  return {
    seenPuuids,
    reviewedMoments,
    async listRecentPersistedPerspectivesForUser({ puuid }) {
      seenPuuids.push(puuid);
      return puuid === "puuid_owner" ? [input] : [];
    },
    async getMatchEvaluation() {
      return evaluation;
    },
    async getPersistedMatchInput() {
      return input;
    },
    async getPersistedMatchReview({ matchId, puuid }) {
      if (matchId !== input.matchId || puuid !== input.puuid) {
        return null;
      }
      return {
        matchId: input.matchId,
        puuid: input.puuid,
        perspectiveRecord: input.perspectiveRecord,
        sourcePerspectiveUpdatedAt: input.sourcePerspectiveUpdatedAt,
        evaluation
      };
    },
    async listReviewedMomentsForMatch({ userId, matchId }) {
      return reviewedMoments
        .filter((moment) => moment.userId === userId && moment.matchId === matchId)
        .sort((left, right) => left.deathIndex - right.deathIndex || left.signalId.localeCompare(right.signalId));
    },
    async saveReviewedMoment(record) {
      const existingIndex = reviewedMoments.findIndex((moment) =>
        moment.userId === record.userId &&
        moment.matchId === record.matchId &&
        moment.deathIndex === record.deathIndex &&
        moment.signalId === record.signalId
      );
      const saved = {
        ...record,
        createdAt: "2026-06-03T00:00:00.000Z",
        updatedAt: "2026-06-03T00:00:00.000Z"
      };
      if (existingIndex >= 0) {
        reviewedMoments[existingIndex] = {
          ...reviewedMoments[existingIndex],
          ...saved,
          createdAt: reviewedMoments[existingIndex].createdAt
        };
      } else {
        reviewedMoments.push(saved);
      }
      return existingIndex >= 0 ? reviewedMoments[existingIndex] : saved;
    },
    async saveMatchEvaluation() {
      throw new Error("current evaluation should not be recomputed");
    }
  };
}

function createMissingEvaluationRepository() {
  return {
    async getPersistedMatchReview({ matchId, puuid }) {
      if (matchId !== "NA1_pending" || puuid !== "puuid_owner") {
        return null;
      }

      return {
        matchId: "NA1_pending",
        puuid: "puuid_owner",
        perspectiveRecord: {
          matchId: "NA1_pending",
          puuid: "puuid_owner",
          championName: "Jhin",
          queueId: 420,
          gameEnd: 1_780_000_000_000,
          win: false,
          kills: 4,
          deaths: 3,
          assists: 5,
          teamPosition: "BOTTOM"
        },
        sourcePerspectiveUpdatedAt: "2026-06-01T00:01:00.000Z",
        evaluation: null
      };
    }
  };
}

function createComputingEvaluationRepository() {
  const saved = [];
  const input = {
    matchId: "NA1_compute",
    puuid: "puuid_owner",
    summaryJson: {
      metadata: { matchId: "NA1_compute" },
      info: {
        queueId: 420,
        gameCreation: 1_780_000_000_000,
        gameDuration: 1800,
        participants: [
          {
            puuid: "puuid_owner",
            participantId: 1,
            championName: "Ahri",
            teamId: 100,
            teamPosition: "MIDDLE",
            individualPosition: "MIDDLE",
            lane: "MIDDLE",
            win: false,
            kills: 1,
            deaths: 1,
            assists: 2
          },
          {
            puuid: "puuid_enemy",
            participantId: 6,
            championName: "Zed",
            teamId: 200,
            win: true,
            kills: 5,
            deaths: 1,
            assists: 0
          }
        ]
      }
    },
    timelineJson: {
      info: {
        frames: [
          {
            timestamp: 60_000,
            participantFrames: {
              1: { participantId: 1, level: 5 },
              6: { participantId: 6, level: 6 }
            },
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
    },
    perspectiveRecord: {
      matchId: "NA1_compute",
      puuid: "puuid_owner",
      participantId: 1,
      championName: "Ahri",
      teamId: 100
    },
    sourceRawMatchUpdatedAt: "2026-06-01T00:00:00.000Z",
    sourcePerspectiveUpdatedAt: "2026-06-01T00:01:00.000Z",
    rawMatchMissing: false
  };

  return {
    saved,
    async listRecentPersistedPerspectivesForUser({ puuid }) {
      return puuid === "puuid_owner" ? [input] : [];
    },
    async getMatchEvaluation() {
      return null;
    },
    async getPersistedMatchInput({ matchId, puuid }) {
      return matchId === input.matchId && puuid === input.puuid ? input : null;
    },
    async saveMatchEvaluation(record) {
      saved.push(record);
      return {
        ...record,
        createdAt: "2026-06-02T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z"
      };
    }
  };
}

async function createTestApp({ fetchSharedProfile, matchEvaluationsRepository } = {}) {
  const config = loadConfig({
    NODE_ENV: "test",
    PORT: "0",
    DATABASE_URL: "postgres://test:test@localhost:5432/riftsense_test",
    NEXUS_AUTH_ENABLED: "true",
    NEXUS_JWT_SECRET: "test-secret",
    NEXUS_AUTH_ISSUER: "nexus",
    NEXUS_AUTH_AUDIENCE: "riftsense"
  });
  const contentItemsRepository = createInMemoryContentItemsRepository();
  const goalTypesRepository = createInMemoryGoalTypesRepository();
  const userHomesRepository = createInMemoryUserHomesRepository();
  const assetStore = createInMemoryAssetStore();

  return createApp({
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
    matchEvaluationsRepository
  });
}

describe("match evaluations API", () => {
  it("requires authentication", async () => {
    const app = await createTestApp({ matchEvaluationsRepository: createEvaluationRepository() });

    const response = await request(app).get("/api/matches/recent/evaluations");

    expect(response.status).toBe(401);
  });

  it("rejects unauthenticated access to a match evaluation", async () => {
    const app = await createTestApp({ matchEvaluationsRepository: createEvaluationRepository() });

    const response = await request(app).get("/api/matches/NA1_051/evaluation");

    expect(response.status).toBe(401);
  });

  it("loads the authenticated user's own persisted match evaluation", async () => {
    const repository = createEvaluationRepository();
    repository.reviewedMoments.push({
      userId: "usr_local_dev",
      matchId: "NA1_051",
      puuid: "puuid_owner",
      deathIndex: 1,
      deathTimestampSeconds: 494,
      signalId: "solo_death_candidate",
      status: "confirmed",
      causeCategory: "walked_without_cover",
      createdAt: "2026-06-03T00:00:00.000Z",
      updatedAt: "2026-06-03T00:00:00.000Z"
    });
    const app = await createTestApp({
      matchEvaluationsRepository: repository,
      async fetchSharedProfile() {
        return {
          userId: "usr_local_dev",
          riotGameName: "Owner",
          riotTagline: "NA1",
          riotPuuid: "puuid_owner"
        };
      }
    });

    const response = await request(app)
      .get("/api/matches/NA1_051/evaluation")
      .set("Authorization", `Bearer ${token({ riot: { puuid: "puuid_owner" } })}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      matchId: "NA1_051",
      evaluationStatus: "current",
      evaluationVersion: "deterministic-v2",
      matchSummary: {
        championName: "Ahri",
        queueId: 420,
        queueLabel: "Ranked Solo/Duo",
        result: "Loss",
        kills: 1,
        deaths: 2,
        assists: 3
      },
      evaluationSummary: {
        deathCount: 2,
        reviewSignals: ["2 deaths", "1 objective-window candidate", "1 possible unsupported death"]
      },
      deathEvents: [
        {
          deathIndex: 1,
          timestampSeconds: 494,
          killerChampionName: "LeBlanc",
          assistingChampionNames: ["Briar"],
          tags: ["solo_death_candidate"]
        },
        {
          deathIndex: 2
        }
      ],
      deterministicTagCounts: {
        death_count: 2,
        solo_death_candidate: 1,
        objective_window_candidate: 1
      },
      reviewedMoments: [
        {
          deathIndex: 1,
          signalId: "solo_death_candidate",
          status: "confirmed",
          causeCategory: "walked_without_cover"
        }
      ]
    });
    expect(JSON.stringify(response.body)).not.toContain("SECRET_TIMELINE_EVENT");
    expect(JSON.stringify(response.body)).not.toContain("timelineJson");
  });

  it.each([
    ["confirmed", "walked_without_cover"],
    ["dismissed", null],
    ["unsure", null]
  ])("persists %s reviewed moment state", async (status, causeCategory) => {
    const repository = createEvaluationRepository();
    const app = await createTestApp({
      matchEvaluationsRepository: repository,
      async fetchSharedProfile() {
        return {
          userId: "usr_local_dev",
          riotPuuid: "puuid_owner"
        };
      }
    });

    const response = await request(app)
      .put("/api/matches/NA1_051/reviewed-moments")
      .set("Authorization", `Bearer ${token({ riot: { puuid: "puuid_owner" } })}`)
      .send({
        deathIndex: 1,
        deathTimestampSeconds: 494,
        signalId: "solo_death_candidate",
        status,
        causeCategory
      });

    expect(response.status).toBe(200);
    expect(response.body.reviewedMoment).toMatchObject({
      userId: "usr_local_dev",
      matchId: "NA1_051",
      puuid: "puuid_owner",
      deathIndex: 1,
      deathTimestampSeconds: 494,
      signalId: "solo_death_candidate",
      status,
      causeCategory
    });
    expect(repository.reviewedMoments).toHaveLength(1);
  });

  it("does not return another user's match evaluation", async () => {
    const app = await createTestApp({
      matchEvaluationsRepository: createEvaluationRepository(),
      async fetchSharedProfile() {
        return {
          userId: "usr_local_dev",
          riotPuuid: "puuid_other"
        };
      }
    });

    const response = await request(app)
      .get("/api/matches/NA1_051/evaluation")
      .set("Authorization", `Bearer ${token({ riot: { puuid: "puuid_other" } })}`);

    expect(response.status).toBe(404);
  });

  it("returns not_evaluated state with perspective summary when evaluation is missing", async () => {
    const app = await createTestApp({
      matchEvaluationsRepository: createMissingEvaluationRepository(),
      async fetchSharedProfile() {
        return {
          userId: "usr_local_dev",
          riotPuuid: "puuid_owner"
        };
      }
    });

    const response = await request(app)
      .get("/api/matches/NA1_pending/evaluation")
      .set("Authorization", `Bearer ${token({ riot: { puuid: "puuid_owner" } })}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      matchId: "NA1_pending",
      evaluationStatus: "not_evaluated",
      matchSummary: {
        championName: "Jhin",
        queueId: 420,
        queueLabel: "Ranked Solo/Duo",
        result: "Loss",
        kills: 4,
        deaths: 3,
        assists: 5,
        role: "BOTTOM"
      },
      evaluationSummary: null,
      deathEvents: []
    });
  });

  it("uses the authenticated user's Riot puuid and returns evaluation summaries", async () => {
    const repository = createEvaluationRepository();
    const app = await createTestApp({
      matchEvaluationsRepository: repository,
      async fetchSharedProfile() {
        return {
          userId: "usr_local_dev",
          riotGameName: "Owner",
          riotTagline: "NA1",
          riotPuuid: "puuid_owner"
        };
      }
    });

    const response = await request(app)
      .get("/api/matches/recent/evaluations?puuid=puuid_other")
      .set("Authorization", `Bearer ${token({ riot: { puuid: "puuid_token" } })}`);

    expect(response.status).toBe(200);
    expect(repository.seenPuuids).toEqual(["puuid_owner"]);
    expect(response.body).toMatchObject({
      evaluationVersion: "deterministic-v2",
      summary: {
        evaluated: 0,
        cached: 1,
        skipped: 0,
        failed: 0
      },
      games: [
        {
          matchId: "NA1_051",
          championName: "Ahri",
          queueId: 420,
          gameCreation: 1_780_000_000_000,
          win: false,
          kills: 1,
          deaths: 2,
          assists: 3,
          evaluationStatus: "current",
          evaluationVersion: "deterministic-v2",
          evaluationSummary: {
            deathCount: 2,
            topTags: [
              { tag: "objective_window_candidate", count: 1 },
              { tag: "solo_death_candidate", count: 1 }
            ]
          },
          evaluationDeaths: [
            {
              deathIndex: 1,
              timestampSeconds: 494,
              killerChampionName: "LeBlanc",
              assistingChampionNames: ["Briar"],
              tags: ["solo_death_candidate"]
            },
            {
              deathIndex: 2
            }
          ]
        }
      ]
    });
    expect(JSON.stringify(response.body)).not.toContain("SECRET_TIMELINE_EVENT");
    expect(JSON.stringify(response.body)).not.toContain("timelineJson");
  });

  it("computes missing evaluations from the explicit endpoint", async () => {
    const repository = createComputingEvaluationRepository();
    const app = await createTestApp({
      matchEvaluationsRepository: repository,
      async fetchSharedProfile() {
        return {
          userId: "usr_local_dev",
          riotGameName: "Owner",
          riotTagline: "NA1",
          riotPuuid: "puuid_owner"
        };
      }
    });

    const response = await request(app)
      .get("/api/matches/recent/evaluations")
      .set("Authorization", `Bearer ${token({ riot: { puuid: "puuid_owner" } })}`);

    expect(response.status).toBe(200);
    expect(repository.saved).toHaveLength(1);
    expect(response.body.summary).toMatchObject({
      evaluated: 1,
      cached: 0,
      skipped: 0,
      failed: 0
    });
    expect(response.body.games[0]).toMatchObject({
      matchId: "NA1_compute",
      evaluationStatus: "current",
      evaluationSummary: {
        deathCount: 1
      }
    });
  });

  it("rejects authenticated users without a linked Riot account", async () => {
    const app = await createTestApp({
      matchEvaluationsRepository: createEvaluationRepository(),
      async fetchSharedProfile() {
        return {
          userId: "usr_local_dev",
          riotPuuid: null
        };
      }
    });

    const response = await request(app)
      .get("/api/matches/recent/evaluations")
      .set("Authorization", `Bearer ${token()}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("BAD_REQUEST");
  });
});
