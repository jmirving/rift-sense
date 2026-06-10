import express from "express";

import { buildSharedProfileIdentity, resolveSharedProfile } from "../auth/shared-profile.js";
import { badRequest } from "../errors.js";
import {
  DETERMINISTIC_MATCH_EVALUATOR_VERSION,
  ensureRecentMatchEvaluations,
  summarizeMatchEvaluationDeaths
} from "../riot/match-evaluator.js";

function normalizeString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeLimit(value) {
  const limit = Number(value);
  return Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 10;
}

function gameFieldsFromEvaluation(evaluation) {
  const summary = evaluation?.summaryJson ?? {};
  return {
    championName: summary.championName ?? null,
    queueId: summary.queueId ?? null,
    gameCreation: summary.gameCreation ?? null,
    win: summary.win ?? null,
    kills: summary.kills ?? null,
    deaths: summary.deaths ?? null,
    assists: summary.assists ?? null
  };
}

function gameFieldsFromPerspective(record) {
  return {
    championName: record?.championName ?? null,
    queueId: record?.queueId ?? null,
    gameCreation: record?.gameCreation ?? null,
    win: record?.win ?? null,
    kills: record?.kills ?? null,
    deaths: record?.deaths ?? null,
    assists: record?.assists ?? null
  };
}

function toApiMatch(match) {
  return {
    matchId: match.matchId,
    ...gameFieldsFromEvaluation(match.evaluation),
    evaluationStatus: match.evaluationStatus,
    evaluationVersion: match.evaluationVersion,
    evaluationSummary: match.evaluationSummary,
    evaluationDeaths: summarizeMatchEvaluationDeaths(match.evaluation)
  };
}

export function createMatchEvaluationsRouter({
  config,
  fetchSharedProfile,
  matchEvaluationsRepository
}) {
  const router = express.Router();

  router.get("/recent/evaluations", config.requireAuth, async (request, response) => {
    const sharedProfile = await resolveSharedProfile({
      request,
      config,
      fetchSharedProfileImpl: fetchSharedProfile
    });
    const riotIdentity = sharedProfile ? buildSharedProfileIdentity(sharedProfile) : request.identity?.riot ?? null;
    const puuid = normalizeString(riotIdentity?.puuid);

    if (!puuid) {
      throw badRequest("Linked Riot account required.");
    }

    const result = await ensureRecentMatchEvaluations({
      puuid,
      limit: normalizeLimit(request.query.limit),
      evaluationVersion: DETERMINISTIC_MATCH_EVALUATOR_VERSION,
      repository: matchEvaluationsRepository
    });

    response.json({
      evaluationVersion: DETERMINISTIC_MATCH_EVALUATOR_VERSION,
      summary: {
        evaluated: result.evaluated,
        cached: result.cached,
        skipped: result.skipped,
        failed: result.failed
      },
      games: result.matches.map((match) => {
        if (match.evaluation) {
          return toApiMatch(match);
        }

        return {
          matchId: match.matchId,
          ...gameFieldsFromPerspective(match.perspectiveRecord),
          evaluationStatus: match.evaluationStatus,
          evaluationVersion: match.evaluationVersion,
          evaluationSummary: null,
          evaluationDeaths: []
        };
      })
    });
  });

  return router;
}
