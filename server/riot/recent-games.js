import { resolveParticipantPerspective } from "./participant-perspective.js";
import { parseDeathReviewEvidence } from "./death-review.js";
import { parseFightParticipationEvidence } from "./fight-participation.js";
import { parseLanePressureEvidence } from "./lane-pressure.js";
import { parseObjectiveSetupExitEvidence } from "./objective-setup-exit.js";
import { parseTempoConversionEvidence } from "./tempo-conversion.js";
import { parseVisionInformationEvidence } from "./vision-information.js";

export const RECENT_MATCH_LOOKUP_LIMIT = 10;
export const MAX_NEW_MATCHES_TO_QUEUE_PER_REFRESH = 5;
const inFlightMatchPreparations = new Set();

const QUEUE_LABELS = new Map([
  [400, "Normal Draft"],
  [420, "Ranked Solo/Duo"],
  [430, "Normal Blind"],
  [440, "Ranked Flex"],
  [450, "ARAM"],
  [700, "Clash"]
]);

const GOAL_RELEVANT_DETERMINISTIC_TAGS = new Set([
  "death_count",
  "multi_enemy_collapse_candidate",
  "objective_window_candidate",
  "objective_setup_death_candidate",
  "objective_exit_death_candidate",
  "level_up_all_in_candidate",
  "isolated_forward_death_candidate"
]);

function normalizeString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeRole(value) {
  const role = normalizeString(value)?.toUpperCase() ?? null;
  if (!role) {
    return null;
  }

  if (role === "BOTTOM") {
    return "ADC";
  }

  if (["TOP", "JUNGLE", "MID", "ADC", "SUPPORT", "UTILITY"].includes(role)) {
    return role === "UTILITY" ? "SUPPORT" : role;
  }

  return null;
}

function buildRecentGamesConfig(config) {
  return {
    apiKey: normalizeString(config?.riot?.apiKey),
    routingRegion: normalizeString(config?.riot?.routingRegion) ?? "americas",
    platformRegion: normalizeString(config?.riot?.platformRegion) ?? "na1",
    matchCount: Number.isInteger(config?.riot?.matchCount) ? config.riot.matchCount : RECENT_MATCH_LOOKUP_LIMIT,
    matchDataMaxAgeMs: Number.isFinite(config?.riot?.matchDataMaxAgeMs)
      ? config.riot.matchDataMaxAgeMs
      : null
  };
}

function queueLabel(queueId) {
  return QUEUE_LABELS.get(queueId) ?? `Queue ${queueId}`;
}

function queueBucket(queueId, rawMetadata) {
  if ([420, 440].includes(queueId)) {
    return "ranked";
  }
  if (queueId === 700) {
    return "clash";
  }
  if (queueId === 450) {
    return "aram";
  }

  const gameMode = normalizeString(rawMetadata?.info?.gameMode)?.toUpperCase() ?? "";
  if (gameMode === "ARAM") {
    return "aram";
  }

  const queueName = normalizeString(rawMetadata?.info?.queueName)?.toLowerCase() ?? "";
  if (queueName.includes("scrim") || queueName.includes("tournament")) {
    return "competitive";
  }

  return "normal";
}

function isoDate(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return null;
  }

  return new Date(timestamp).toISOString();
}

function resultLabel(win) {
  return win ? "Win" : "Loss";
}

function resultFromRecord(record) {
  if (typeof record?.win === "boolean") {
    return resultLabel(record.win);
  }

  return normalizeString(record?.result);
}

function normalizeNumberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function kdaFromParts({ kills, deaths, assists, fallback = null } = {}) {
  const normalizedFallback = normalizeString(fallback);
  if (normalizedFallback) {
    return normalizedFallback;
  }

  if ([kills, deaths, assists].every((value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)))) {
    return `${Number(kills)}/${Number(deaths)}/${Number(assists)}`;
  }

  return null;
}

function gameHasMatchSummary(game) {
  return Boolean(game?.matchId && game?.championName && game?.queueLabel && game?.result && (game?.kda ?? kdaFromParts(game)));
}

function perspectiveParseStatus(game) {
  return normalizeString(game?.sourceMetadata?.parseStatus ?? game?.parseStatus);
}

function gameHasFailedPreparation(game) {
  return perspectiveParseStatus(game) === "parse_failed";
}

function computeCsPerMinute(participant, durationSeconds) {
  const seconds = Number(durationSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }

  const totalCs =
    Number(participant?.totalMinionsKilled ?? 0) +
    Number(participant?.neutralMinionsKilled ?? 0);
  const value = totalCs / (seconds / 60);
  return Number.isFinite(value) ? Number(value.toFixed(1)) : null;
}

function computeCsPerMinuteFromRecord(record) {
  if (Number.isFinite(Number(record?.csPerMinute))) {
    return Number(record.csPerMinute);
  }

  const totalCs = Number(record?.totalMinionsKilled ?? 0) + Number(record?.neutralMinionsKilled ?? 0);
  const durationSeconds = Number(record?.duration ?? record?.gameDurationSeconds ?? 0);
  if (!Number.isFinite(totalCs) || totalCs <= 0 || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return null;
  }

  return Number((totalCs / (durationSeconds / 60)).toFixed(1));
}

function inferRole(participant) {
  const teamPosition = normalizeRole(participant?.teamPosition);
  if (teamPosition) {
    return { role: teamPosition, roleConfidence: "high" };
  }

  const individualPosition = normalizeRole(participant?.individualPosition);
  if (individualPosition) {
    return { role: individualPosition, roleConfidence: "medium" };
  }

  const lane = normalizeRole(participant?.lane);
  if (lane) {
    return { role: lane, roleConfidence: "low" };
  }

  return { role: null, roleConfidence: "low" };
}

function findParticipant(matchPayload, riotPuuid) {
  return Array.isArray(matchPayload?.info?.participants)
    ? matchPayload.info.participants.find((entry) => entry?.puuid === riotPuuid) ?? null
    : null;
}

export function normalizeRecentGame(matchPayload, riotPuuid) {
  const info = matchPayload?.info ?? null;
  const metadata = matchPayload?.metadata ?? null;
  const participant = findParticipant(matchPayload, riotPuuid);

  if (!participant || !metadata?.matchId) {
    return null;
  }

  const durationSeconds = Number(info?.gameDuration ?? 0);
  const { role, roleConfidence } = inferRole(participant);

  return {
    matchId: metadata.matchId,
    playedAt: isoDate(info?.gameEndTimestamp ?? info?.gameStartTimestamp),
    queueId: Number(info?.queueId ?? 0),
    queueLabel: queueLabel(Number(info?.queueId ?? 0)),
    championId: Number.isFinite(Number(participant?.championId)) ? Number(participant.championId) : null,
    championName: normalizeString(participant?.championName),
    role,
    roleConfidence,
    result: resultLabel(Boolean(participant?.win)),
    kills: Number(participant?.kills ?? 0),
    deaths: Number(participant?.deaths ?? 0),
    assists: Number(participant?.assists ?? 0),
    csPerMinute: computeCsPerMinute(participant, durationSeconds),
    gameDurationSeconds: durationSeconds > 0 ? durationSeconds : null,
    sourceMetadata: {
      queueBucket: queueBucket(Number(info?.queueId ?? 0), matchPayload),
      raw: {
        gameMode: info?.gameMode ?? null,
        teamPosition: participant?.teamPosition ?? null,
        individualPosition: participant?.individualPosition ?? null
      }
    }
  };
}

function recentGameFromPerspectiveCard(card) {
  const record = card?.record ?? {};
  const matchId = normalizeString(card?.matchId ?? record.matchId);
  if (!matchId) {
    return null;
  }

  const queueId = Number(record.queueId ?? 0);
  const durationSeconds = Number(record.duration ?? record.gameDurationSeconds ?? 0);
  const { role, roleConfidence } = inferRole(record);
  const kills = normalizeNumberOrNull(record.kills);
  const deaths = normalizeNumberOrNull(record.deaths);
  const assists = normalizeNumberOrNull(record.assists);

  return {
    matchId,
    playedAt: isoDate(record.gameEnd ?? record.gameStart ?? record.gameCreation),
    queueId: Number.isFinite(queueId) ? queueId : 0,
    queueLabel: normalizeString(record.queueLabel) ?? (Number.isFinite(queueId) && queueId > 0 ? queueLabel(queueId) : null),
    championId: Number.isFinite(Number(record.championId)) ? Number(record.championId) : null,
    championName: normalizeString(record.championName),
    role,
    roleConfidence,
    result: resultFromRecord(record),
    kills,
    deaths,
    assists,
    kda: kdaFromParts({ kills, deaths, assists, fallback: record.kda }),
    csPerMinute: computeCsPerMinuteFromRecord(record),
    gameDurationSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : null,
    sourceMetadata: {
      queueBucket: queueBucket(Number.isFinite(queueId) ? queueId : 0, record),
      parseStatus: normalizeString(record.parseStatus),
      perspectiveUpdatedAt: card.updatedAt ?? record.updatedAt ?? null
    },
    evaluationStatus: "not_evaluated",
    evaluationVersion: null,
    evaluationSummary: null,
    evaluationDeaths: []
  };
}

function recentGameFromDiscoveredMatchId(matchId) {
  const normalizedMatchId = normalizeString(matchId);
  if (!normalizedMatchId) {
    return null;
  }

  return {
    matchId: normalizedMatchId,
    playedAt: null,
    queueId: 0,
    queueLabel: null,
    championId: null,
    championName: null,
    role: null,
    roleConfidence: "low",
    result: null,
    kills: null,
    deaths: null,
    assists: null,
    kda: null,
    csPerMinute: null,
    gameDurationSeconds: null,
    sourceMetadata: {
      queueBucket: "unknown",
      parseStatus: "discovered"
    },
    evaluationStatus: "not_evaluated",
    evaluationVersion: null,
    evaluationSummary: null,
    evaluationDeaths: []
  };
}

function buildUnavailableResult(code, message) {
  return {
    status: code === "riot-config-missing" || code === "riot-auth-failed"
      ? "riot_access_not_configured"
      : "recent_games_unavailable",
    code,
    sourceLabel: "Riot account linked",
    message,
    games: [],
    readyCount: 0,
    preparingCount: 0,
    failedCount: 0
  };
}

export function deriveRecentGamesStatus({
  riotPuuid,
  apiKey,
  matchIdsKnown,
  readyCount = 0,
  preparingCount = 0,
  failedCount = 0,
  unavailable = false
}) {
  if (!riotPuuid) {
    return "riot_account_not_linked";
  }
  if (!apiKey) {
    return "riot_access_not_configured";
  }
  if (unavailable) {
    return failedCount > 0 ? "parse_failed_retry_available" : "recent_games_unavailable";
  }
  if (!matchIdsKnown) {
    return "checking_recent_games";
  }
  if (readyCount > 0 && preparingCount > 0) {
    return "some_games_ready";
  }
  if (readyCount > 0) {
    return "all_recent_games_ready";
  }
  if (preparingCount > 0) {
    return "games_found_parsing";
  }
  if (failedCount > 0) {
    return "parse_failed_retry_available";
  }
  return "recent_games_unavailable";
}

function parseMatchEvidence(matchPayload, matchTimeline, perspective) {
  if (!matchTimeline?.info?.frames || !perspective?.participantId) {
    return [];
  }

  return [
    ...parseDeathReviewEvidence({ matchSummary: matchPayload, matchTimeline, perspective }),
    ...parseFightParticipationEvidence({ matchSummary: matchPayload, matchTimeline, perspective }),
    ...parseObjectiveSetupExitEvidence({ matchSummary: matchPayload, matchTimeline, perspective }),
    ...parseTempoConversionEvidence({ matchSummary: matchPayload, matchTimeline, perspective }),
    ...parseLanePressureEvidence({ matchSummary: matchPayload, matchTimeline, perspective }),
    ...parseVisionInformationEvidence({ matchSummary: matchPayload, matchTimeline, perspective })
  ];
}

async function fetchJson(url, options, fetchImpl) {
  const response = await fetchImpl(url, options);

  if (!response.ok) {
    const error = new Error(`Request failed with ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

async function savePerspective(
  riotMatchesRepository,
  matchPayload,
  matchTimeline,
  riotPuuid,
  parseStatus,
  parseStatusReason = null,
  timing = null
) {
  const matchId = normalizeString(matchPayload?.metadata?.matchId);
  if (!matchId) {
    return;
  }

  const resolved = resolveParticipantPerspective(matchPayload, matchTimeline, riotPuuid);
  const info = matchPayload?.info ?? {};
  const participant = Array.isArray(info?.participants)
    ? info.participants.find((entry) => entry?.puuid === riotPuuid) ?? null
    : null;
  const parsedEvidence = resolved.ok
    ? parseMatchEvidence(matchPayload, matchTimeline, { ...resolved.value, matchId })
    : [];
  const finalParseStatus = resolved.ok && parseStatus === "raw_data_available" ? "parsed" : parseStatus;
  const perspective = resolved.ok
    ? {
        ...resolved.value,
        queueId: Number.isFinite(Number(info?.queueId)) ? Number(info.queueId) : null,
        championId: Number.isFinite(Number(participant?.championId)) ? Number(participant.championId) : null,
        win: typeof participant?.win === "boolean" ? participant.win : null,
        kills: Number.isFinite(Number(participant?.kills)) ? Number(participant.kills) : null,
        deaths: Number.isFinite(Number(participant?.deaths)) ? Number(participant.deaths) : null,
        assists: Number.isFinite(Number(participant?.assists)) ? Number(participant.assists) : null,
        totalMinionsKilled: Number.isFinite(Number(participant?.totalMinionsKilled)) ? Number(participant.totalMinionsKilled) : null,
        neutralMinionsKilled: Number.isFinite(Number(participant?.neutralMinionsKilled)) ? Number(participant.neutralMinionsKilled) : null,
        matchId,
        parseStatus: finalParseStatus,
        parseStatusReason,
        parsedEvidence
      }
    : {
        matchId,
        puuid: riotPuuid,
        participantId: null,
        championName: null,
        teamId: null,
        teamPosition: null,
        individualPosition: null,
        gameCreation: null,
        gameStart: null,
        gameEnd: null,
        duration: null,
        parseStatus: "parse_failed",
        parseStatusReason: resolved.error.code
      };

  if (perspective) {
    await riotMatchesRepository?.saveUserMatchPerspective?.(perspective);
    timing?.log("recent_games_perspective_saved", "success", {
      matchId,
      parseStatus: perspective.parseStatus,
      parseStatusReason: perspective.parseStatusReason ?? null,
      summaryReady: Boolean(perspective.championName && perspective.queueId && typeof perspective.win === "boolean" && perspective.kills !== null && perspective.deaths !== null && perspective.assists !== null)
    });
  }
}

async function resolveStoredMatch({ matchId, riotPuuid, riotMatchesRepository, recentGamesConfig, timing }) {
  if (!riotMatchesRepository) {
    return null;
  }

  const rawRecord = await riotMatchesRepository.getRawMatchData(matchId);
  const isFresh = rawRecord
    ? await riotMatchesRepository.hasFreshRawMatchData(matchId, {
        maxAgeMs: recentGamesConfig.matchDataMaxAgeMs
      })
    : false;

  if (!isFresh) {
    return null;
  }

  await savePerspective(riotMatchesRepository, rawRecord.summaryJson, rawRecord.timelineJson, riotPuuid, "raw_data_available", null, timing);
  return rawRecord.summaryJson;
}

function prepareMatchesInBackground({ matchIds, riotPuuid, headers, fetchImpl, recentGamesConfig, riotMatchesRepository, timing }) {
  const queuedMatchIds = [];
  for (const matchId of matchIds) {
    if (queuedMatchIds.length >= MAX_NEW_MATCHES_TO_QUEUE_PER_REFRESH) {
      break;
    }

    const key = `${riotPuuid}:${matchId}`;
    if (!inFlightMatchPreparations.has(key)) {
      inFlightMatchPreparations.add(key);
      queuedMatchIds.push(matchId);
    }
  }

  if (queuedMatchIds.length === 0) {
    return [];
  }

  Promise.allSettled(
    queuedMatchIds.map((matchId) =>
      fetchAndStoreMatch({
        matchId,
        riotPuuid,
        headers,
        fetchImpl,
        recentGamesConfig,
        riotMatchesRepository,
        timing
      })
    )
  )
    .catch(() => {})
    .finally(() => {
      queuedMatchIds.forEach((matchId) => inFlightMatchPreparations.delete(`${riotPuuid}:${matchId}`));
    });

  return queuedMatchIds;
}

async function fetchAndStoreMatch({ matchId, riotPuuid, headers, fetchImpl, recentGamesConfig, riotMatchesRepository, timing }) {
  let summary;
  try {
    summary = await fetchJson(
      `https://${recentGamesConfig.routingRegion}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}`,
      { headers },
      fetchImpl
    );
  } catch (error) {
    await riotMatchesRepository?.saveUserMatchPerspective?.({
      matchId,
      puuid: riotPuuid,
      participantId: null,
      championName: null,
      teamId: null,
      teamPosition: null,
      individualPosition: null,
      gameCreation: null,
      gameStart: null,
      gameEnd: null,
      duration: null,
      parseStatus: "parse_failed",
      parseStatusReason: error?.status ? `raw_match_fetch_failed_${error.status}` : "raw_match_fetch_failed"
    });
    timing?.log("recent_games_match_prepare_failed", "error", {
      matchId,
      stage: "raw_match",
      status: error?.status ?? null
    });
    throw error;
  }

  let timeline = null;
  let parseStatus = "fetching_timeline";
  let parseStatusReason = null;
  try {
    timeline = await fetchJson(
      `https://${recentGamesConfig.routingRegion}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}/timeline`,
      { headers },
      fetchImpl
    );
    parseStatus = "raw_data_available";
  } catch (error) {
    parseStatus = "parse_failed";
    parseStatusReason = "missing_timeline";
  }

  if (riotMatchesRepository && timeline) {
    await riotMatchesRepository.saveRawMatchData({
      matchId: summary?.metadata?.matchId ?? matchId,
      summaryJson: summary,
      timelineJson: timeline
    });
    timing?.log("recent_games_raw_match_saved", "success", {
      matchId: summary?.metadata?.matchId ?? matchId
    });
  }

  await savePerspective(riotMatchesRepository, summary, timeline, riotPuuid, parseStatus, parseStatusReason, timing);
  if (parseStatus === "parse_failed") {
    timing?.log("recent_games_match_prepare_failed", "error", {
      matchId: summary?.metadata?.matchId ?? matchId,
      stage: "timeline",
      reason: parseStatusReason
    });
  }
  return summary;
}

export async function resolveRecentGames({
  identity,
  profile,
  config,
  riotMatchesRepository,
  fetchImpl = fetch,
  timing,
  readMode = "full"
}) {
  const riotPuuid = normalizeString(profile?.riotPuuid ?? identity?.riot?.puuid);
  if (!riotPuuid) {
    timing?.log("recent_games_identity", "skipped", { reason: "riot_puuid_missing" });
    return {
      status: "riot_account_not_linked",
      code: "riot-account-not-linked",
      sourceLabel: "No Riot account linked",
      message: "Link a Riot account in Nexus to pull recent games.",
      games: [],
      readyCount: 0,
      preparingCount: 0,
      failedCount: 0
    };
  }

  const recentGamesConfig = buildRecentGamesConfig(config);
  if (!recentGamesConfig.apiKey) {
    timing?.log("recent_games_fetch_ids", "skipped", { reason: "riot_api_key_missing" });
    return buildUnavailableResult(
      "riot-config-missing",
      "Riot account linked. Recent games are unavailable until RiftSense Riot access is configured."
    );
  }

  const headers = {
    "X-Riot-Token": recentGamesConfig.apiKey,
    Accept: "application/json"
  };

  const idsUrl =
    `https://${recentGamesConfig.routingRegion}.api.riotgames.com/lol/match/v5/matches/by-puuid/` +
    `${encodeURIComponent(riotPuuid)}/ids?start=0&count=${recentGamesConfig.matchCount}`;

  try {
    const matchIds = await (timing
      ? timing.time("recent_games_fetch_ids", () => fetchJson(idsUrl, { headers }, fetchImpl))
      : fetchJson(idsUrl, { headers }, fetchImpl));
    if (!Array.isArray(matchIds) || matchIds.length === 0) {
      timing?.log("recent_games_db_read", "skipped", { reason: "no_match_ids" });
      return {
        status: "recent_games_unavailable",
        code: "no-recent-games",
        sourceLabel: "Riot recent games",
        message: "No recent games found for the linked Riot account.",
        games: [],
        readyCount: 0,
        preparingCount: 0,
        failedCount: 0
      };
    }

    if (riotMatchesRepository) {
      if (readMode === "cards" && riotMatchesRepository.listRecentGameCardsForUser) {
        const storedCards = await (timing
          ? timing.time("recent_games_db_read", () => riotMatchesRepository.listRecentGameCardsForUser({
              puuid: riotPuuid,
              matchIds,
              limit: recentGamesConfig.matchCount
            }), { matchCount: matchIds.length, readMode })
          : riotMatchesRepository.listRecentGameCardsForUser({
              puuid: riotPuuid,
              matchIds,
              limit: recentGamesConfig.matchCount
            }));
        const games = storedCards
          .map(recentGameFromPerspectiveCard)
          .filter(Boolean);
        const gamesByMatchId = new Map(games.map((game) => [game.matchId, game]));
        const gamesWithDiscovered = matchIds
          .map((matchId) => gamesByMatchId.get(matchId) ?? recentGameFromDiscoveredMatchId(matchId))
          .filter(Boolean);
        const summaryReadyGames = games.filter(gameHasMatchSummary);
        const failedGames = games.filter(gameHasFailedPreparation);
        const preparationNeededMatchIds = matchIds.filter((matchId) => {
          const game = gamesByMatchId.get(matchId);
          return !game || (!gameHasMatchSummary(game) && !gameHasFailedPreparation(game));
        });

        const queuedMatchIds = prepareMatchesInBackground({
          matchIds: preparationNeededMatchIds,
          riotPuuid,
          headers,
          fetchImpl,
          recentGamesConfig,
          riotMatchesRepository,
          timing
        });
        timing?.log("recent_games_backfill_queue", queuedMatchIds.length > 0 ? "success" : "skipped", {
          discoveredMatchIds: matchIds,
          queuedMatchIds,
          queuedCount: queuedMatchIds.length,
          missingCount: matchIds.filter((matchId) => !gamesByMatchId.has(matchId)).length,
          incompleteCount: games.length - summaryReadyGames.length - failedGames.length,
          failedCount: failedGames.length,
          summaryReadyCount: summaryReadyGames.length,
          parseStatuses: games.map((game) => ({
            matchId: game.matchId,
            parseStatus: perspectiveParseStatus(game),
            summaryReady: gameHasMatchSummary(game)
          }))
        });

        return {
          status: deriveRecentGamesStatus({
            riotPuuid,
            apiKey: recentGamesConfig.apiKey,
            matchIdsKnown: true,
            readyCount: summaryReadyGames.length,
            preparingCount: queuedMatchIds.length,
            failedCount: failedGames.length
          }),
          code: "ok",
          sourceLabel: "Riot recent games",
          message: games.length > 0
            ? "Recent games loaded from cache while newer matches are prepared."
            : "Recent games found. Match details are being prepared.",
          games: gamesWithDiscovered,
          readyCount: summaryReadyGames.length,
          summaryReadyCount: summaryReadyGames.length,
          preparingCount: queuedMatchIds.length,
          failedCount: failedGames.length,
          discoveredCount: matchIds.length
        };
      }

      const storedMatches = await (timing
        ? timing.time("recent_games_db_read", () => Promise.all(
            matchIds.map(async (matchId) => ({
              matchId,
              summary: await resolveStoredMatch({
                matchId,
                riotPuuid,
                riotMatchesRepository,
                recentGamesConfig,
                timing
              })
            }))
          ), { matchCount: matchIds.length })
        : Promise.all(
            matchIds.map(async (matchId) => ({
              matchId,
              summary: await resolveStoredMatch({
                matchId,
                riotPuuid,
                riotMatchesRepository,
                recentGamesConfig
              })
            }))
          ));
      const missingMatchIds = storedMatches
        .filter((entry) => !entry.summary)
        .map((entry) => entry.matchId);
      const queuedMatchIds = missingMatchIds.slice(0, MAX_NEW_MATCHES_TO_QUEUE_PER_REFRESH);
      const games = storedMatches
        .map((entry) => entry.summary)
        .filter(Boolean)
        .map((summary) => normalizeRecentGame(summary, riotPuuid))
        .filter(Boolean);

      const actuallyQueuedMatchIds = prepareMatchesInBackground({
        matchIds: queuedMatchIds,
        riotPuuid,
        headers,
        fetchImpl,
        recentGamesConfig,
        riotMatchesRepository,
        timing
      });
      timing?.log("recent_games_backfill_queue", actuallyQueuedMatchIds.length > 0 ? "success" : "skipped", {
        discoveredMatchIds: matchIds,
        queuedMatchIds: actuallyQueuedMatchIds,
        queuedCount: actuallyQueuedMatchIds.length,
        missingCount: missingMatchIds.length
      });

      return {
        status: deriveRecentGamesStatus({
          riotPuuid,
          apiKey: recentGamesConfig.apiKey,
          matchIdsKnown: true,
          readyCount: games.length,
          preparingCount: actuallyQueuedMatchIds.length
        }),
        code: "ok",
        sourceLabel: "Riot recent games",
        message: games.length > 0
          ? "Recent games loaded from cache while newer matches are prepared."
          : "Recent games found. Match details are being prepared.",
        games,
        readyCount: games.length,
        summaryReadyCount: games.length,
        preparingCount: actuallyQueuedMatchIds.length,
        failedCount: 0,
        discoveredCount: matchIds.length
      };
    }

    const settledMatches = await (timing
      ? timing.time("recent_games_fetch_match_details", () => Promise.allSettled(
          matchIds.map(async (matchId) =>
            (await resolveStoredMatch({
              matchId,
              riotPuuid,
              riotMatchesRepository,
              recentGamesConfig,
              timing
            })) ??
            fetchAndStoreMatch({
              matchId,
              riotPuuid,
              headers,
              fetchImpl,
              recentGamesConfig,
              riotMatchesRepository,
              timing
            })
          )
        ), { matchCount: matchIds.length })
      : Promise.allSettled(
          matchIds.map(async (matchId) =>
            (await resolveStoredMatch({
              matchId,
              riotPuuid,
              riotMatchesRepository,
              recentGamesConfig,
              timing
            })) ??
            fetchAndStoreMatch({
              matchId,
              riotPuuid,
              headers,
              fetchImpl,
              recentGamesConfig,
              riotMatchesRepository,
              timing
            })
          )
        ));

    const games = settledMatches
      .filter((result) => result.status === "fulfilled")
      .map((result) => normalizeRecentGame(result.value, riotPuuid))
      .filter(Boolean);

    if (games.length === 0) {
      return {
        ...buildUnavailableResult(
          "riot-match-data-unavailable",
          "Riot account linked. Recent games could not be loaded right now."
        ),
        status: "parse_failed_retry_available",
        failedCount: settledMatches.filter((result) => result.status === "rejected").length
      };
    }

    return {
      status: "all_recent_games_ready",
      code: "ok",
      sourceLabel: "Riot recent games",
      message: "Recent games loaded from Riot.",
      games,
      readyCount: games.length,
      preparingCount: 0,
      failedCount: settledMatches.filter((result) => result.status === "rejected").length,
      discoveredCount: matchIds.length
    };
  } catch (error) {
    return buildUnavailableResult(
      error?.status === 403 ? "riot-auth-failed" : "riot-fetch-failed",
      "Riot account linked. Recent games are temporarily unavailable."
    );
  }
}

function toTimestamp(value) {
  const time = Date.parse(value ?? "");
  return Number.isFinite(time) ? time : null;
}

function describeQueue(queueBucketValue) {
  if (queueBucketValue === "ranked") {
    return "ranked queue";
  }
  if (queueBucketValue === "clash") {
    return "Clash";
  }
  if (queueBucketValue === "competitive") {
    return "competitive-style queue";
  }
  if (queueBucketValue === "normal") {
    return "normal queue";
  }
  return "low-confidence queue";
}

function scoreOneGame(game, { activeSince, preferredRole, now, goalTitle }) {
  let score = 0;
  const reasons = [];
  const queueBucketValue = game?.sourceMetadata?.queueBucket ?? "normal";
  const playedAtTimestamp = toTimestamp(game.playedAt);
  const activeSinceTimestamp = toTimestamp(activeSince ? `${activeSince}T00:00:00.000Z` : null);
  const evaluationSummary = game?.evaluationSummary ?? null;
  const evaluationDeathCount = Number(evaluationSummary?.deathCount ?? game.deaths ?? 0);
  const normalizedGoalTitle = normalizeString(goalTitle)?.toLowerCase() ?? "";
  const deathGoal = ["die less", "death", "positioning"].some((term) => normalizedGoalTitle.includes(term));
  const goalRelevantTagCount = deterministicSignalEntries(game).reduce(
    (total, entry) => total + Number(entry.count ?? 0),
    0
  );

  if (evaluationSummary) {
    score += 35;
    reasons.push("evaluation ready");
  }

  if (playedAtTimestamp && activeSinceTimestamp && playedAtTimestamp >= activeSinceTimestamp) {
    score += 30;
    reasons.push("after goal start");
  } else if (playedAtTimestamp && activeSinceTimestamp) {
    score -= 15;
    reasons.push("before goal start");
  }

  if (preferredRole && game.role === preferredRole) {
    score += 25;
    reasons.push(`${preferredRole} role match`);
  } else if (preferredRole && game.role && game.role !== preferredRole) {
    score -= 10;
    reasons.push("off-role");
  } else if (!game.role) {
    score -= 4;
    reasons.push("role uncertain");
  }

  if (queueBucketValue === "ranked") {
    score += 20;
    reasons.push("ranked queue");
  } else if (queueBucketValue === "clash" || queueBucketValue === "competitive") {
    score += 18;
    reasons.push(describeQueue(queueBucketValue));
  } else if (queueBucketValue === "normal") {
    score += 5;
    reasons.push("normal queue");
  } else if (queueBucketValue === "aram") {
    score -= 100;
    reasons.push("ARAM");
  }

  if (playedAtTimestamp) {
    const ageDays = Math.max(0, Math.floor((now.getTime() - playedAtTimestamp) / 86400000));
    if (ageDays <= 3) {
      score += 15;
      reasons.push("very recent");
    } else if (ageDays <= 7) {
      score += 10;
      reasons.push("recent");
    } else if (ageDays <= 14) {
      score += 5;
      reasons.push("still recent");
    }
  }

  if (Number(game.gameDurationSeconds ?? 0) >= 900) {
    score += 5;
  }
  if (game.csPerMinute !== null) {
    score += 3;
  }

  if (deathGoal) {
    if (evaluationDeathCount > 0) {
      score += 30 + Math.min(evaluationDeathCount, 10);
      reasons.push("contains deaths to review");
    } else {
      score -= 18;
    }
  }

  if (goalRelevantTagCount > 0) {
    score += Math.min(goalRelevantTagCount * 8, 32);
    reasons.push(`${goalRelevantTagCount} goal-relevant ${goalRelevantTagCount === 1 ? "signal" : "signals"}`);
  }

  return {
    score,
    reasons,
    queueBucket: queueBucketValue
  };
}

function deterministicSignalEntries(game) {
  const evaluationSummary = game?.evaluationSummary ?? null;
  const entries = [];
  const deathCount = Number(evaluationSummary?.deathCount ?? game?.deaths ?? 0);

  if (Number.isFinite(deathCount) && deathCount > 0) {
    entries.push({ tag: "death_count", count: deathCount, label: `${deathCount} ${deathCount === 1 ? "death" : "deaths"}` });
  }

  for (const entry of evaluationSummary?.topTags ?? []) {
    const tag = normalizeString(entry?.tag);
    const count = Number(entry?.count ?? 0);
    if (tag === "death_count") {
      continue;
    }
    if (!tag || !GOAL_RELEVANT_DETERMINISTIC_TAGS.has(tag) || !Number.isFinite(count) || count <= 0) {
      continue;
    }
    entries.push({
      tag,
      count,
      label: `${count} ${tag.replaceAll("_", " ")}${count === 1 ? "" : "s"}`
    });
  }

  return entries;
}

function hasUsefulDeterministicSignals(game) {
  const evaluationSummary = game?.evaluationSummary ?? null;
  if (game?.evaluationStatus !== "current" || !evaluationSummary) {
    return false;
  }

  return deterministicSignalEntries(game).length > 0;
}

function hasReviewCandidateSummary(game) {
  return Boolean(game?.matchId && game?.queueLabel && game?.result && (game?.kda ?? kdaFromParts(game)));
}

function confidenceLabel(score) {
  if (score >= 70) {
    return "high";
  }
  if (score >= 40) {
    return "medium";
  }
  return "low";
}

export function scoreRecentGames({
  games,
  goal,
  profile,
  now = new Date()
}) {
  const preferredRole = normalizeRole(profile?.primaryRole ?? goal?.role);
  const scoredGames = (games ?? []).map((game) => {
    const scored = scoreOneGame(game, {
      activeSince: goal?.activeSince ?? null,
      preferredRole,
      now,
      goalTitle: goal?.title ?? null
    });

    return {
      ...game,
      champion: game.championName ?? `Champion ${game.championId ?? "Unknown"}`,
      kda: game.kda ?? kdaFromParts(game),
      confidenceLabel: confidenceLabel(scored.score),
      relevanceReason: scored.reasons.join(" · "),
      relevanceScore: scored.score,
      sourceLabel: "Riot recent games",
      queueBucket: scored.queueBucket
    };
  });

  const preferredGames = scoredGames.filter((game) => game.queueBucket !== "aram");
  const candidatePool = preferredGames.length > 0 ? preferredGames : scoredGames;

  return candidatePool
    .sort((left, right) => right.relevanceScore - left.relevanceScore)
    .map(({ queueBucket, sourceMetadata, ...game }) => game);
}

export function selectReviewCandidate({ candidateGames, goal, profile } = {}) {
  const game = (candidateGames ?? []).find((candidateGame) =>
    hasUsefulDeterministicSignals(candidateGame) && hasReviewCandidateSummary(candidateGame)
  ) ?? null;
  if (!game) {
    return null;
  }

  const preferredRole = normalizeRole(profile?.primaryRole ?? goal?.role);
  const topDeterministicSignals = deterministicSignalEntries(game).slice(0, 3);
  const activeGoalTitle = normalizeString(goal?.title);
  const goalRelevance = activeGoalTitle
    ? `${activeGoalTitle}${preferredRole ? ` · ${preferredRole}` : ""}`
    : preferredRole
      ? `${preferredRole} profile`
      : null;
  const selectionReason = game.relevanceReason
    ? `Selected for ${game.relevanceReason}.`
    : "Selected from recent reviewable games.";

  return {
    matchId: game.matchId,
    playedAt: game.playedAt ?? null,
    champion: game.champion ?? game.championName ?? null,
    championName: game.championName ?? game.champion ?? null,
    result: game.result ?? null,
    kda: game.kda ?? kdaFromParts(game),
    kills: game.kills ?? null,
    deaths: game.deaths ?? null,
    assists: game.assists ?? null,
    queueLabel: game.queueLabel ?? null,
    role: game.role ?? null,
    confidenceLabel: game.confidenceLabel ?? "low",
    evaluationStatus: game.evaluationStatus ?? "not_evaluated",
    evaluationSummary: game.evaluationSummary ?? null,
    topDeterministicSignals,
    selectionReason,
    goalRelevance,
    relevanceReason: game.relevanceReason ?? null
  };
}
