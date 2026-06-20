import { afterEach, expect, it } from "vitest";

import { createMatchEvaluationsRepository } from "../../server/repositories/match-evaluations.js";
import { createRiotMatchesRepository } from "../../server/repositories/riot-matches.js";
import {
  DETERMINISTIC_MATCH_EVALUATOR_VERSION,
  evaluatePersistedMatch,
  evaluateRecentPersistedMatchesForUser
} from "../../server/riot/match-evaluator.js";
import { createMigratedPool, describeWithPostgres, dropSchema } from "./postgres-test-utils.mjs";

const databases = [];

async function createRepositories() {
  const database = await createMigratedPool();
  databases.push(database);
  const riotRepository = createRiotMatchesRepository(database);
  const evaluationRepository = createMatchEvaluationsRepository(database);
  await riotRepository.initialize();
  await evaluationRepository.initialize();
  return { riotRepository, evaluationRepository };
}

function summary() {
  return {
    metadata: { matchId: "NA1_050" },
    info: {
      queueId: 420,
      gameCreation: 1_780_000_000_000,
      gameDuration: 1800,
      participants: [
        {
          puuid: "puuid_1",
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
          puuid: "puuid_6",
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
  };
}

function timeline() {
  return {
    metadata: { matchId: "NA1_050" },
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
  };
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(({ pool, schema }) => dropSchema(pool, schema)));
});

describeWithPostgres("match evaluations repository", () => {
  it("saves, reloads, and reruns evaluations idempotently", async () => {
    const { riotRepository, evaluationRepository } = await createRepositories();

    await riotRepository.saveRawMatchData({
      matchId: "NA1_050",
      summaryJson: summary(),
      timelineJson: timeline(),
      now: new Date("2026-06-01T00:00:00.000Z")
    });
    await riotRepository.saveUserMatchPerspective(
      {
        matchId: "NA1_050",
        puuid: "puuid_1",
        participantId: 1,
        championName: "Ahri",
        teamId: 100,
        teamPosition: "MIDDLE"
      },
      { now: new Date("2026-06-01T00:01:00.000Z") }
    );

    const first = await evaluatePersistedMatch({
      matchId: "NA1_050",
      puuid: "puuid_1",
      repository: evaluationRepository,
      now: new Date("2026-06-02T00:00:00.000Z")
    });
    const second = await evaluatePersistedMatch({
      matchId: "NA1_050",
      puuid: "puuid_1",
      repository: evaluationRepository,
      now: new Date("2026-06-03T00:00:00.000Z")
    });

    expect(first).toMatchObject({
      matchId: "NA1_050",
      puuid: "puuid_1",
      evaluationVersion: DETERMINISTIC_MATCH_EVALUATOR_VERSION,
      sourceRawMatchUpdatedAt: "2026-06-01T00:00:00.000Z",
      sourcePerspectiveUpdatedAt: "2026-06-01T00:01:00.000Z",
      tagsJson: {
        counts: {
          death_count: 1,
          solo_death_candidate: 1
        }
      },
      createdAt: "2026-06-02T00:00:00.000Z",
      updatedAt: "2026-06-02T00:00:00.000Z"
    });
    expect(second.createdAt).toBe("2026-06-02T00:00:00.000Z");
    expect(second.updatedAt).toBe("2026-06-03T00:00:00.000Z");
    expect(second.deathsJson).toEqual(first.deathsJson);

    await expect(
      evaluationRepository.getMatchEvaluation({
        matchId: "NA1_050",
        puuid: "puuid_1",
        evaluationVersion: DETERMINISTIC_MATCH_EVALUATOR_VERSION
      })
    ).resolves.toMatchObject({
      matchId: "NA1_050",
      puuid: "puuid_1",
      deathsJson: first.deathsJson
    });
  });

  it("evaluates recent persisted matches for a user", async () => {
    const { riotRepository, evaluationRepository } = await createRepositories();

    await riotRepository.saveRawMatchData({
      matchId: "NA1_050",
      summaryJson: summary(),
      timelineJson: timeline()
    });
    await riotRepository.saveUserMatchPerspective({
      matchId: "NA1_050",
      puuid: "puuid_1",
      participantId: 1,
      championName: "Ahri",
      teamId: 100
    });

    const result = await evaluateRecentPersistedMatchesForUser({
      puuid: "puuid_1",
      limit: 5,
      repository: evaluationRepository,
      now: new Date("2026-06-02T00:00:00.000Z")
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      matchId: "NA1_050",
      puuid: "puuid_1",
      evaluationVersion: "deterministic-v2"
    });
  });

  it("persists reviewed moment states and lists confirmed evidence only", async () => {
    const { evaluationRepository } = await createRepositories();

    await evaluationRepository.saveReviewedMoment({
      userId: "usr_1",
      matchId: "NA1_050",
      puuid: "puuid_1",
      deathIndex: 1,
      deathTimestampSeconds: 60,
      signalId: "solo_death_candidate",
      status: "confirmed",
      causeCategory: "walked_without_cover"
    }, { now: new Date("2026-06-03T00:00:00.000Z") });
    await evaluationRepository.saveReviewedMoment({
      userId: "usr_1",
      matchId: "NA1_050",
      puuid: "puuid_1",
      deathIndex: 1,
      deathTimestampSeconds: 60,
      signalId: "objective_window_candidate",
      status: "dismissed"
    }, { now: new Date("2026-06-03T00:01:00.000Z") });
    await evaluationRepository.saveReviewedMoment({
      userId: "usr_1",
      matchId: "NA1_050",
      puuid: "puuid_1",
      deathIndex: 2,
      deathTimestampSeconds: 120,
      signalId: "death_count",
      status: "unsure"
    }, { now: new Date("2026-06-03T00:02:00.000Z") });

    await evaluationRepository.saveReviewedMoment({
      userId: "usr_1",
      matchId: "NA1_050",
      puuid: "puuid_1",
      deathIndex: 1,
      deathTimestampSeconds: 60,
      signalId: "solo_death_candidate",
      status: "confirmed",
      causeCategory: "stayed_too_long"
    }, { now: new Date("2026-06-03T00:03:00.000Z") });

    await expect(evaluationRepository.listReviewedMomentsForMatch({
      userId: "usr_1",
      matchId: "NA1_050"
    })).resolves.toMatchObject([
      {
        userId: "usr_1",
        matchId: "NA1_050",
        deathIndex: 1,
        signalId: "objective_window_candidate",
        status: "dismissed"
      },
      {
        userId: "usr_1",
        matchId: "NA1_050",
        deathIndex: 1,
        signalId: "solo_death_candidate",
        status: "confirmed",
        causeCategory: "stayed_too_long",
        updatedAt: "2026-06-03T00:03:00.000Z"
      },
      {
        userId: "usr_1",
        matchId: "NA1_050",
        deathIndex: 2,
        signalId: "death_count",
        status: "unsure"
      }
    ]);

    await expect(evaluationRepository.listConfirmedReviewedMomentsForUser({
      userId: "usr_1"
    })).resolves.toMatchObject([
      {
        signalId: "solo_death_candidate",
        status: "confirmed",
        causeCategory: "stayed_too_long"
      }
    ]);

    await expect(evaluationRepository.listReviewedMomentSummariesForUserByMatch({
      userId: "usr_1",
      matchIds: ["NA1_050"]
    })).resolves.toMatchObject([
      {
        matchId: "NA1_050",
        reviewedMomentCount: 3,
        needsManualReviewCount: 2,
        triagedMomentCount: 2,
        lastReviewedAt: "2026-06-03T00:03:00.000Z"
      }
    ]);
  });
});
