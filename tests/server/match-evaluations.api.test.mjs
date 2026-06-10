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
    evaluationVersion: "deterministic-v1",
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
    async saveMatchEvaluation() {
      throw new Error("current evaluation should not be recomputed");
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
      evaluationVersion: "deterministic-v1",
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
          evaluationVersion: "deterministic-v1",
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
