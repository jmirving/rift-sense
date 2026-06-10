import { describe, expect, it } from "vitest";

import {
  DETERMINISTIC_MATCH_EVALUATOR_VERSION,
  ensureRecentMatchEvaluations
} from "../../server/riot/match-evaluator.js";

function summary(matchId = "NA1_051") {
  return {
    metadata: { matchId },
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

function input(overrides = {}) {
  const matchId = overrides.matchId ?? "NA1_051";
  return {
    matchId,
    puuid: "puuid_1",
    summaryJson: summary(matchId),
    timelineJson: timeline(),
    perspectiveRecord: {
      matchId,
      puuid: "puuid_1",
      participantId: 1,
      championName: "Ahri",
      teamId: 100
    },
    sourceRawMatchUpdatedAt: "2026-06-01T00:00:00.000Z",
    sourcePerspectiveUpdatedAt: "2026-06-01T00:01:00.000Z",
    rawMatchMissing: false,
    ...overrides
  };
}

function currentEvaluation(matchInput, overrides = {}) {
  return {
    matchId: matchInput.matchId,
    puuid: matchInput.puuid,
    evaluationVersion: DETERMINISTIC_MATCH_EVALUATOR_VERSION,
    sourceRawMatchUpdatedAt: matchInput.sourceRawMatchUpdatedAt,
    sourcePerspectiveUpdatedAt: matchInput.sourcePerspectiveUpdatedAt,
    summaryJson: {
      matchId: matchInput.matchId,
      puuid: matchInput.puuid,
      championName: "Ahri",
      queueId: 420,
      gameCreation: 1_780_000_000_000,
      win: false,
      kills: 1,
      deaths: 1,
      assists: 2,
      evaluatedAt: "2026-06-02T00:00:00.000Z"
    },
    deathsJson: [{ deathIndex: 1 }],
    tagsJson: {
      counts: {
        death_count: 1,
        solo_death_candidate: 1
      }
    },
    updatedAt: "2026-06-02T00:00:00.000Z",
    ...overrides
  };
}

function repository({ inputs, evaluations = new Map(), failSaveFor = null }) {
  const saved = [];
  return {
    saved,
    async listRecentPersistedPerspectivesForUser({ puuid }) {
      return inputs.filter((entry) => entry.puuid === puuid);
    },
    async getMatchEvaluation({ matchId }) {
      return evaluations.get(matchId) ?? null;
    },
    async getPersistedMatchInput({ matchId, puuid }) {
      return inputs.find((entry) => entry.matchId === matchId && entry.puuid === puuid && !entry.rawMatchMissing) ?? null;
    },
    async saveMatchEvaluation(record) {
      if (record.matchId === failSaveFor) {
        throw new Error("save failed");
      }
      saved.push(record);
      const savedRecord = {
        ...record,
        createdAt: "2026-06-02T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z"
      };
      evaluations.set(record.matchId, savedRecord);
      return savedRecord;
    }
  };
}

describe("recent match evaluation backfill", () => {
  it("evaluates missing recent persisted matches", async () => {
    const repo = repository({ inputs: [input()] });

    const result = await ensureRecentMatchEvaluations({
      puuid: "puuid_1",
      repository: repo,
      now: new Date("2026-06-02T00:00:00.000Z")
    });

    expect(result.evaluated).toBe(1);
    expect(result.cached).toBe(0);
    expect(repo.saved).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({
      matchId: "NA1_051",
      status: "evaluated",
      evaluationStatus: "current",
      evaluationSummary: {
        deathCount: 1,
        topTags: [{ tag: "solo_death_candidate", count: 1 }]
      }
    });
  });

  it("uses cached current evaluations", async () => {
    const matchInput = input();
    const repo = repository({
      inputs: [matchInput],
      evaluations: new Map([[matchInput.matchId, currentEvaluation(matchInput)]])
    });

    const result = await ensureRecentMatchEvaluations({ puuid: "puuid_1", repository: repo });

    expect(result.cached).toBe(1);
    expect(result.evaluated).toBe(0);
    expect(repo.saved).toHaveLength(0);
    expect(result.matches[0].status).toBe("cached");
  });

  it("recomputes stale evaluations when source timestamps change", async () => {
    const matchInput = input({
      sourceRawMatchUpdatedAt: "2026-06-03T00:00:00.000Z"
    });
    const repo = repository({
      inputs: [matchInput],
      evaluations: new Map([[
        matchInput.matchId,
        currentEvaluation(matchInput, {
          sourceRawMatchUpdatedAt: "2026-06-01T00:00:00.000Z"
        })
      ]])
    });

    const result = await ensureRecentMatchEvaluations({
      puuid: "puuid_1",
      repository: repo,
      now: new Date("2026-06-04T00:00:00.000Z")
    });

    expect(result.evaluated).toBe(1);
    expect(repo.saved).toHaveLength(1);
    expect(result.matches[0].status).toBe("stale_recomputed");
  });

  it("skips missing raw matches gracefully", async () => {
    const repo = repository({
      inputs: [
        input({
          matchId: "NA1_missing_raw",
          summaryJson: null,
          timelineJson: null,
          sourceRawMatchUpdatedAt: null,
          rawMatchMissing: true
        })
      ]
    });

    const result = await ensureRecentMatchEvaluations({ puuid: "puuid_1", repository: repo });

    expect(result.skipped).toBe(1);
    expect(result.matches[0]).toMatchObject({
      matchId: "NA1_missing_raw",
      status: "skipped",
      reason: "missing_raw_match",
      evaluationStatus: "none",
      evaluationSummary: null
    });
  });

  it("reports failed evaluations without blocking the batch", async () => {
    const failing = input({ matchId: "NA1_fail" });
    const succeeding = input({ matchId: "NA1_ok" });
    const repo = repository({
      inputs: [failing, succeeding],
      failSaveFor: "NA1_fail"
    });

    const result = await ensureRecentMatchEvaluations({
      puuid: "puuid_1",
      repository: repo,
      now: new Date("2026-06-02T00:00:00.000Z")
    });

    expect(result.failed).toBe(1);
    expect(result.evaluated).toBe(1);
    expect(result.matches.map((match) => match.evaluationStatus)).toEqual(["failed", "current"]);
  });
});
