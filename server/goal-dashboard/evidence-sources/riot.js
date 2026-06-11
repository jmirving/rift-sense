import {
  resolveRecentGames as defaultResolveRecentGames,
  scoreRecentGames,
  selectReviewCandidate
} from "../../riot/recent-games.js";
import {
  DETERMINISTIC_MATCH_EVALUATOR_VERSION
} from "../../riot/match-evaluator.js";

function normalizeRiotIdentity(identity, profile) {
  const puuid = typeof profile?.riotPuuid === "string" && profile.riotPuuid.trim()
    ? profile.riotPuuid.trim()
    : typeof identity?.riot?.puuid === "string" && identity.riot.puuid.trim()
      ? identity.riot.puuid.trim()
      : "";

  if (!puuid) {
    return null;
  }

  return {
    puuid,
    gameName: typeof profile?.riotGameName === "string" ? profile.riotGameName : null,
    tagLine: typeof profile?.riotTagline === "string" ? profile.riotTagline : null
  };
}

function mapConfidenceLabel(label) {
  if (label === "high") {
    return "High confidence";
  }
  if (label === "medium") {
    return "Medium confidence";
  }
  return "Low confidence";
}

function buildNoRiotLinkedEvidence() {
  return {
    status: "riot_account_not_linked",
    title: "Riot account not linked",
    summary: "Link a Riot account in Nexus to pull recent games for this goal.",
    confidence: "Setup needed",
    sourceLabel: "No Riot account linked",
    candidateGames: []
  };
}

function buildSeededDemoEvidence() {
  const candidateGames = [
    {
      matchId: "NA1_DEMO_001",
      playedAt: "2026-05-08T02:00:00Z",
      queueLabel: "Ranked Solo/Duo",
      champion: "Caitlyn",
      championName: "Caitlyn",
      role: "ADC",
      result: "Loss",
      kda: "3/6/5",
      kills: 3,
      deaths: 6,
      assists: 5,
      csPerMinute: 7.1,
      gameDurationSeconds: 1920,
      confidenceLabel: "medium",
      relevanceReason: "ADC ranked game after goal start",
      sourceLabel: "Seeded demo",
      evaluationStatus: "current",
      evaluationSummary: {
        deathCount: 6,
        topTags: [{ tag: "multi_enemy_collapse_candidate", count: 2 }],
        reviewSignals: ["6 deaths", "2 multi-enemy collapse candidates"]
      }
    },
    {
      matchId: "NA1_DEMO_002",
      playedAt: "2026-05-07T23:15:00Z",
      queueLabel: "Ranked Flex",
      champion: "Jinx",
      championName: "Jinx",
      role: "ADC",
      result: "Win",
      kda: "7/2/8",
      kills: 7,
      deaths: 2,
      assists: 8,
      csPerMinute: 8.4,
      gameDurationSeconds: 2040,
      confidenceLabel: "medium",
      relevanceReason: "Role-matched flex game inside the 7-day window",
      sourceLabel: "Seeded demo"
    },
    {
      matchId: "NA1_DEMO_003",
      playedAt: "2026-05-06T21:40:00Z",
      queueLabel: "Normal Draft",
      champion: "Ashe",
      championName: "Ashe",
      role: "ADC",
      result: "Loss",
      kda: "4/5/9",
      kills: 4,
      deaths: 5,
      assists: 9,
      csPerMinute: 6.9,
      gameDurationSeconds: 1875,
      confidenceLabel: "low",
      relevanceReason: "Low-confidence ADC baseline game",
      sourceLabel: "Seeded demo"
    }
  ];

  return {
    status: "seeded-demo",
    title: "3 relevant ADC games found",
    summary: "Based on 3 ranked ADC games since this goal started.",
    confidence: "Medium confidence",
    sourceLabel: "Seeded demo",
    candidateGames,
    reviewCandidate: selectReviewCandidate({ candidateGames, goal: { title: "Die Less", role: "ADC" }, profile: { primaryRole: "ADC" } })
  };
}

function statusTitle(status, readyCount) {
  return {
    riot_access_not_configured: "Riot access not configured",
    checking_recent_games: "Checking recent games",
    recent_games_unavailable: "Recent games unavailable",
    games_found_parsing: "Preparing recent games",
    some_games_ready: `${readyCount} ${readyCount === 1 ? "game" : "games"} ready`,
    all_recent_games_ready: `${readyCount} ${readyCount === 1 ? "game" : "games"} ready`,
    parse_failed_retry_available: "Recent game parsing failed"
  }[status] ?? "Recent games unavailable";
}

function readinessSummary(recentGamesResult, fallbackMessage) {
  const readyCount = Number(recentGamesResult.readyCount ?? recentGamesResult.games?.length ?? 0);
  const preparingCount = Number(recentGamesResult.preparingCount ?? 0);
  const readiness = `${readyCount} ${readyCount === 1 ? "game" : "games"} ready · ${preparingCount} ${preparingCount === 1 ? "game" : "games"} still being prepared`;

  if (["some_games_ready", "games_found_parsing"].includes(recentGamesResult.status)) {
    return readiness;
  }
  if (recentGamesResult.status === "all_recent_games_ready") {
    return `${readyCount} ${readyCount === 1 ? "game is" : "games are"} ready.`;
  }

  return fallbackMessage;
}

function buildUnavailableEvidence(riotIdentity, recentGamesResult) {
  const handle = riotIdentity.gameName && riotIdentity.tagLine
    ? `${riotIdentity.gameName}#${riotIdentity.tagLine}`
    : "Linked Riot account";
  const readyCount = Number(recentGamesResult.readyCount ?? recentGamesResult.games?.length ?? 0);

  return {
    status: recentGamesResult.status,
    title: statusTitle(recentGamesResult.status, readyCount),
    summary: readinessSummary(recentGamesResult, `${handle} is linked. ${recentGamesResult.message}`),
    confidence: "Pending",
    sourceLabel: recentGamesResult.sourceLabel ?? "Riot account linked",
    candidateGames: [],
    readyCount,
    preparingCount: Number(recentGamesResult.preparingCount ?? 0),
    failedCount: Number(recentGamesResult.failedCount ?? 0)
  };
}

function buildAvailableEvidence(candidateGames, recentGamesResult, { goal, profile } = {}) {
  const topConfidence = candidateGames[0]?.confidenceLabel ?? "low";
  const sourceLabel = candidateGames[0]?.sourceLabel ?? "Riot recent games";
  const readyCount = Number(recentGamesResult.readyCount ?? candidateGames.length);
  const preparingCount = Number(recentGamesResult.preparingCount ?? 0);
  const status = recentGamesResult.status ?? (preparingCount > 0 ? "some_games_ready" : "all_recent_games_ready");

  return {
    status,
    title: statusTitle(status, readyCount),
    summary: readinessSummary(
      { ...recentGamesResult, readyCount, preparingCount },
      candidateGames.length > 0
        ? "Recent games are ready for review."
        : "Recent games were found, but none scored as strong candidates yet."
    ),
    confidence: mapConfidenceLabel(topConfidence),
    sourceLabel,
    candidateGames,
    reviewCandidate: selectReviewCandidate({ candidateGames, goal, profile }),
    readyCount,
    preparingCount,
    failedCount: Number(recentGamesResult.failedCount ?? 0)
  };
}

function runTimed(timing, step, fn) {
  return timing ? timing.time(step, fn) : fn();
}

function withoutEvaluation(game) {
  return {
    ...game,
    evaluationStatus: game.evaluationStatus ?? "not_evaluated",
    evaluationVersion: game.evaluationVersion ?? DETERMINISTIC_MATCH_EVALUATOR_VERSION,
    evaluationSummary: game.evaluationSummary ?? null,
    evaluationDeaths: game.evaluationDeaths ?? []
  };
}

async function mergeEvaluationEvidence({ recentGamesResult, puuid, matchEvaluationsRepository, timing }) {
  if (!matchEvaluationsRepository || !puuid) {
    timing?.log("match_evaluation_summary_read", "skipped", {
      reason: matchEvaluationsRepository ? "puuid_missing" : "repository_missing"
    });
    return {
      ...recentGamesResult,
      games: (recentGamesResult.games ?? []).map(withoutEvaluation)
    };
  }

  if (!matchEvaluationsRepository.listRecentEvaluationSummariesForUser) {
    timing?.log("match_evaluation_summary_read", "skipped", { reason: "summary_reader_missing" });
    return {
      ...recentGamesResult,
      games: (recentGamesResult.games ?? []).map(withoutEvaluation)
    };
  }

  const matchIds = (recentGamesResult.games ?? []).map((game) => game.matchId).filter(Boolean);
  const evaluations = await matchEvaluationsRepository.listRecentEvaluationSummariesForUser({
    puuid,
    matchIds,
    limit: Math.max(10, matchIds.length),
    evaluationVersion: DETERMINISTIC_MATCH_EVALUATOR_VERSION,
  });
  const byMatchId = new Map(evaluations.map((evaluation) => [evaluation.matchId, evaluation]));
  const existingGames = recentGamesResult.games ?? [];
  const mergedGames = existingGames.map((game) => {
    const evaluation = byMatchId.get(game.matchId);
    if (!evaluation) {
      return withoutEvaluation(game);
    }
    return {
      ...game,
      evaluationStatus: evaluation.evaluationStatus,
      evaluationVersion: evaluation.evaluationVersion,
      evaluationSummary: evaluation.evaluationSummary,
      evaluationDeaths: []
    };
  });

  return {
    ...recentGamesResult,
    games: mergedGames,
    readyCount: Math.max(Number(recentGamesResult.readyCount ?? 0), mergedGames.length)
  };
}

export async function applyRiotEvidenceToDashboard({
  goalDashboard,
  identity,
  source,
  demoVariant = "default",
  profile,
  config,
  fetchImpl,
  riotMatchesRepository,
  matchEvaluationsRepository,
  resolveRecentGames = defaultResolveRecentGames,
  timing
}) {
  if (!goalDashboard?.activePersonalGoal) {
    return goalDashboard;
  }

  let riotEvidence;

  if (source === "demo" && demoVariant === "adc") {
    riotEvidence = buildSeededDemoEvidence();
  } else if (source === "demo" && demoVariant === "no-riot-linked") {
    riotEvidence = buildNoRiotLinkedEvidence();
  } else {
    const riotIdentity = normalizeRiotIdentity(identity, profile);
    if (!riotIdentity) {
      timing?.log("resolve_recent_games", "skipped", { reason: "riot_identity_missing" });
      timing?.log("match_evaluation_summary_read", "skipped", { reason: "riot_identity_missing" });
      riotEvidence = buildNoRiotLinkedEvidence();
    } else {
      let recentGamesResult = await runTimed(timing, "resolve_recent_games", () => resolveRecentGames({
        identity,
        profile,
        config,
        riotMatchesRepository,
        fetchImpl,
        timing,
        readMode: "cards"
      })).catch(() => ({
        status: "recent_games_unavailable",
        sourceLabel: "Riot account linked",
        message: "Riot account linked. Recent games are temporarily unavailable.",
        games: [],
        readyCount: 0,
        preparingCount: 0,
        failedCount: 0
      }));
      recentGamesResult = await runTimed(timing, "match_evaluation_summary_read", () => mergeEvaluationEvidence({
        recentGamesResult,
        puuid: riotIdentity.puuid,
        matchEvaluationsRepository,
        timing
      })).catch(() => recentGamesResult);

      const candidateGames = await runTimed(timing, "score_recent_games", () => scoreRecentGames({
        games: recentGamesResult.games,
        goal: goalDashboard.activePersonalGoal,
        profile
      }));

      if (candidateGames.length === 0) {
        riotEvidence = buildUnavailableEvidence(riotIdentity, recentGamesResult);
      } else {
        riotEvidence = buildAvailableEvidence(candidateGames, recentGamesResult, {
          goal: goalDashboard.activePersonalGoal,
          profile
        });
      }
    }
  }

  return {
    ...goalDashboard,
    activePersonalGoal: {
      ...goalDashboard.activePersonalGoal,
      role: profile?.primaryRole ?? goalDashboard.activePersonalGoal.role,
      riotEvidence
    }
  };
}
