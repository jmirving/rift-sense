import express from "express";

import { buildSharedProfileIdentity, resolveSharedProfile } from "../auth/shared-profile.js";
import { badRequest, notFound } from "../errors.js";
import { createTimingContext } from "../observability/timing.js";
import {
  DETERMINISTIC_MATCH_EVALUATOR_VERSION,
  ensureRecentMatchEvaluations,
  summarizeMatchEvaluation,
  summarizeMatchEvaluationDeaths
} from "../riot/match-evaluator.js";

function normalizeString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeLimit(value) {
  const limit = Number(value);
  return Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 10;
}

const REVIEW_STATUSES = new Set(["confirmed", "dismissed", "unsure"]);
const CAUSE_CATEGORIES = new Set([
  "walked_without_cover",
  "outnumbered_fight",
  "stayed_too_long",
  "objective_setup_mistake",
  "mechanics_misplay",
  "team_fight_already_lost",
  "not_preventable",
  "other"
]);

function normalizeInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function normalizeReviewStatus(value) {
  const status = normalizeString(value);
  return REVIEW_STATUSES.has(status) ? status : null;
}

function normalizeCauseCategory(value) {
  const category = normalizeString(value);
  if (!category) {
    return null;
  }
  return CAUSE_CATEGORIES.has(category) ? category : null;
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

const QUEUE_LABELS = new Map([
  [400, "Normal Draft"],
  [420, "Ranked Solo/Duo"],
  [430, "Normal Blind"],
  [440, "Ranked Flex"],
  [450, "ARAM"],
  [700, "Clash"]
]);

function queueLabel(queueId) {
  const number = Number(queueId);
  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }
  return QUEUE_LABELS.get(number) ?? `Queue ${number}`;
}

function resultLabel(win) {
  return typeof win === "boolean" ? (win ? "Win" : "Loss") : null;
}

function roleFromRecord(record, summary = {}) {
  return normalizeString(summary.role) ??
    normalizeString(summary.teamPosition) ??
    normalizeString(record?.teamPosition) ??
    normalizeString(record?.individualPosition) ??
    normalizeString(record?.lane);
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

function reviewSummaryFields(record, evaluation) {
  const summary = evaluation?.summaryJson ?? {};
  const queueId = summary.queueId ?? record?.queueId ?? null;
  const win = typeof summary.win === "boolean" ? summary.win : record?.win;

  return {
    championName: summary.championName ?? record?.championName ?? null,
    queueId,
    queueLabel: summary.queueLabel ?? record?.queueLabel ?? queueLabel(queueId),
    gameCreation: summary.gameCreation ?? record?.gameCreation ?? null,
    playedAt: summary.playedAt ?? record?.playedAt ?? record?.gameEnd ?? null,
    result: summary.result ?? record?.result ?? resultLabel(win),
    kills: summary.kills ?? record?.kills ?? null,
    deaths: summary.deaths ?? record?.deaths ?? null,
    assists: summary.assists ?? record?.assists ?? null,
    role: roleFromRecord(record, summary),
    lane: summary.lane ?? record?.lane ?? null
  };
}

function toApiMatchReview(review, reviewedMoments = []) {
  const evaluation = review.evaluation;
  const tagsJson = evaluation?.tagsJson ?? null;

  return {
    matchId: review.matchId,
    evaluationStatus: evaluation ? "current" : "not_evaluated",
    evaluationVersion: evaluation?.evaluationVersion ?? DETERMINISTIC_MATCH_EVALUATOR_VERSION,
    matchSummary: reviewSummaryFields(review.perspectiveRecord, evaluation),
    evaluationSummary: evaluation ? summarizeMatchEvaluation(evaluation) : null,
    deathEvents: evaluation ? summarizeMatchEvaluationDeaths(evaluation) : [],
    deterministicTagCounts: tagsJson?.counts ?? tagsJson?.deathTagCounts ?? null,
    reviewedMoments,
    sourceTimestamps: {
      sourceRawMatchUpdatedAt: evaluation?.sourceRawMatchUpdatedAt ?? null,
      sourcePerspectiveUpdatedAt: evaluation?.sourcePerspectiveUpdatedAt ?? review.sourcePerspectiveUpdatedAt ?? null,
      evaluatedAt: evaluation?.updatedAt ?? null
    }
  };
}

export function createMatchEvaluationsRouter({
  config,
  fetchSharedProfile,
  matchEvaluationsRepository
}) {
  const router = express.Router();

  router.get("/:matchId/evaluation", config.requireAuth, async (request, response) => {
    const matchId = normalizeString(request.params.matchId);
    if (!matchId) {
      throw badRequest("Match ID required.");
    }

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

    const review = await matchEvaluationsRepository.getPersistedMatchReview({
      matchId,
      puuid,
      evaluationVersion: DETERMINISTIC_MATCH_EVALUATOR_VERSION
    });

    if (!review) {
      throw notFound("Match review not found.");
    }

    const reviewedMoments = matchEvaluationsRepository.listReviewedMomentsForMatch
      ? await matchEvaluationsRepository.listReviewedMomentsForMatch({
          userId: request.identity.id,
          matchId
        })
      : [];

    response.json(toApiMatchReview(review, reviewedMoments));
  });

  router.put("/:matchId/reviewed-moments", config.requireAuth, async (request, response) => {
    const matchId = normalizeString(request.params.matchId);
    if (!matchId) {
      throw badRequest("Match ID required.");
    }
    if (!matchEvaluationsRepository.saveReviewedMoment) {
      throw badRequest("Reviewed moment persistence is unavailable.");
    }

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

    const review = await matchEvaluationsRepository.getPersistedMatchReview({
      matchId,
      puuid,
      evaluationVersion: DETERMINISTIC_MATCH_EVALUATOR_VERSION
    });

    if (!review) {
      throw notFound("Match review not found.");
    }

    const deathIndex = normalizeInteger(request.body?.deathIndex);
    const signalId = normalizeString(request.body?.signalId);
    const status = normalizeReviewStatus(request.body?.status);
    const deathTimestampSeconds = normalizeInteger(request.body?.deathTimestampSeconds);
    const causeCategory = normalizeCauseCategory(request.body?.causeCategory);

    if (!deathIndex || deathIndex < 1) {
      throw badRequest("Death index required.");
    }
    if (!signalId) {
      throw badRequest("Detected signal ID required.");
    }
    if (!status) {
      throw badRequest("Review status must be confirmed, dismissed, or unsure.");
    }
    if (request.body?.causeCategory && !causeCategory) {
      throw badRequest("Unsupported cause category.");
    }

    const reviewedMoment = await matchEvaluationsRepository.saveReviewedMoment({
      userId: request.identity.id,
      matchId,
      puuid,
      deathIndex,
      deathTimestampSeconds,
      signalId,
      status,
      causeCategory
    });

    response.json({ reviewedMoment });
  });

  router.get("/recent/evaluations", config.requireAuth, async (request, response) => {
    const timing = createTimingContext({
      route: "recent_match_evaluations",
      request,
      enabled: config.perfLoggingEnabled
    });
    const routeTimer = timing.startTimer();

    try {
      const sharedProfile = await timing.time("resolve_shared_profile", () => resolveSharedProfile({
        request,
        config,
        fetchSharedProfileImpl: fetchSharedProfile
      }));
      const riotIdentity = sharedProfile ? buildSharedProfileIdentity(sharedProfile) : request.identity?.riot ?? null;
      const puuid = normalizeString(riotIdentity?.puuid);

      if (!puuid) {
        timing.log("match_evaluation_read_ensure_backfill", "skipped", { reason: "riot_puuid_missing" });
        throw badRequest("Linked Riot account required.");
      }

      const result = await timing.time("match_evaluation_read_ensure_backfill", () => ensureRecentMatchEvaluations({
        puuid,
        limit: normalizeLimit(request.query.limit),
        evaluationVersion: DETERMINISTIC_MATCH_EVALUATOR_VERSION,
        repository: matchEvaluationsRepository,
        timing
      }));

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
      timing.log("route", "success", { durationMs: routeTimer.elapsedMs() });
    } catch (error) {
      timing.log("route", "failure", {
        durationMs: routeTimer.elapsedMs(),
        errorName: error?.name ?? "Error"
      });
      throw error;
    }
  });

  return router;
}
