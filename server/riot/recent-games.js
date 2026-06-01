const DEFAULT_MATCH_COUNT = 8;

const QUEUE_LABELS = new Map([
  [400, "Normal Draft"],
  [420, "Ranked Solo/Duo"],
  [430, "Normal Blind"],
  [440, "Ranked Flex"],
  [450, "ARAM"],
  [700, "Clash"]
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
    matchCount: Number.isInteger(config?.riot?.matchCount) ? config.riot.matchCount : DEFAULT_MATCH_COUNT
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

export function normalizeRecentGame(matchPayload, riotPuuid) {
  const info = matchPayload?.info ?? null;
  const metadata = matchPayload?.metadata ?? null;
  const participant = Array.isArray(info?.participants)
    ? info.participants.find((entry) => entry?.puuid === riotPuuid)
    : null;

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

function buildUnavailableResult(code, message) {
  return {
    status: "unavailable",
    code,
    sourceLabel: "Riot account linked",
    message,
    games: []
  };
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

export async function resolveRecentGames({
  identity,
  profile,
  config,
  fetchImpl = fetch
}) {
  const riotPuuid = normalizeString(profile?.riotPuuid ?? identity?.riot?.puuid);
  if (!riotPuuid) {
    return {
      status: "not-linked",
      code: "riot-account-not-linked",
      sourceLabel: "No Riot account linked",
      message: "Link a Riot account in Nexus to pull recent games.",
      games: []
    };
  }

  const recentGamesConfig = buildRecentGamesConfig(config);
  if (!recentGamesConfig.apiKey) {
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
    const matchIds = await fetchJson(idsUrl, { headers }, fetchImpl);
    if (!Array.isArray(matchIds) || matchIds.length === 0) {
      return {
        status: "available",
        code: "ok",
        sourceLabel: "Riot recent games",
        message: "No recent games found for the linked Riot account.",
        games: []
      };
    }

    const settledMatches = await Promise.allSettled(
      matchIds.map((matchId) =>
        fetchJson(
          `https://${recentGamesConfig.routingRegion}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}`,
          { headers },
          fetchImpl
        )
      )
    );

    const games = settledMatches
      .filter((result) => result.status === "fulfilled")
      .map((result) => normalizeRecentGame(result.value, riotPuuid))
      .filter(Boolean);

    if (games.length === 0) {
      return buildUnavailableResult(
        "riot-match-data-unavailable",
        "Riot account linked. Recent games could not be loaded right now."
      );
    }

    return {
      status: "available",
      code: "ok",
      sourceLabel: "Riot recent games",
      message: "Recent games loaded from Riot.",
      games
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

  if (goalTitle === "Die Less") {
    if (Number(game.deaths ?? 0) > 0) {
      score += 12;
      reasons.push("contains deaths to review");
    } else {
      score -= 4;
      reasons.push("no deaths to review");
    }
  }

  return {
    score,
    reasons,
    queueBucket: queueBucketValue
  };
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
      kda: `${game.kills}/${game.deaths}/${game.assists}`,
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
