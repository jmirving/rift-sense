const PARSER_VERSION = "vision-information-0";
const RECENT_VISION_WINDOW_MS = 90_000;
const PRE_14_MS = 14 * 60_000;
const WARD_EVENT_TYPES = new Set(["WARD_PLACED", "WARD_KILL"]);
const OBJECTIVE_TYPES = new Set(["DRAGON", "RIFTHERALD", "BARON_NASHOR"]);

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function eventId(event, index) {
  return normalizeString(event?.eventId) ?? `event-${index}`;
}

function buildParticipantIndex(matchSummary) {
  return new Map(
    normalizeArray(matchSummary?.info?.participants)
      .map((participant) => [normalizeNumber(participant?.participantId), participant])
      .filter(([participantId]) => participantId)
  );
}

function participantTeam(participantIndex, participantId) {
  return normalizeNumber(participantIndex.get(participantId)?.teamId);
}

function participantRole(participant) {
  const role = normalizeString(participant?.teamPosition) ?? normalizeString(participant?.individualPosition) ?? normalizeString(participant?.lane);
  const normalized = role?.toUpperCase() ?? null;
  if (normalized === "UTILITY") {
    return "SUPPORT";
  }
  if (normalized === "BOTTOM") {
    return "BOTTOM";
  }
  return normalized;
}

function flattenTimelineEvents(matchTimeline) {
  return normalizeArray(matchTimeline?.info?.frames)
    .flatMap((frame) => normalizeArray(frame?.events))
    .map((event, index) => ({
      ...event,
      __eventId: eventId(event, index),
      __index: index,
      timestamp: normalizeNumber(event?.timestamp) ?? 0
    }))
    .sort((a, b) => a.timestamp - b.timestamp || a.__index - b.__index);
}

function eventSummary(event) {
  return {
    eventId: event.__eventId,
    type: event.type,
    timestamp: event.timestamp,
    participantId: normalizeNumber(event.participantId),
    creatorId: normalizeNumber(event.creatorId),
    killerId: normalizeNumber(event.killerId),
    victimId: normalizeNumber(event.victimId),
    wardType: normalizeString(event.wardType),
    monsterType: normalizeString(event.monsterType),
    monsterSubType: normalizeString(event.monsterSubType)
  };
}

function isObjective(event) {
  if (event.type !== "ELITE_MONSTER_KILL") {
    return false;
  }
  const monsterType = normalizeString(event.monsterType)?.toUpperCase() ?? "";
  const monsterSubType = normalizeString(event.monsterSubType)?.toUpperCase() ?? "";
  return OBJECTIVE_TYPES.has(monsterType) || monsterSubType.includes("ELDER") || monsterType.includes("HERALD");
}

function isControlWard(event) {
  return normalizeString(event.wardType)?.toUpperCase().includes("CONTROL") ?? false;
}

function pushTag(tags, id, confidence, params = {}) {
  if (!tags.some((tag) => tag.id === id)) {
    tags.push({ id, confidence, params });
  }
}

function aggregateParticipantVision(participant) {
  return {
    wardsPlaced: normalizeNumber(participant?.wardsPlaced) ?? 0,
    wardsKilled: normalizeNumber(participant?.wardsKilled) ?? 0,
    detectorWardsPlaced: normalizeNumber(participant?.detectorWardsPlaced) ?? 0,
    visionWardsBoughtInGame: normalizeNumber(participant?.visionWardsBoughtInGame) ?? 0,
    visionScore: normalizeNumber(participant?.visionScore) ?? 0
  };
}

function recentTeamVisionEvents(events, participantIndex, playerTeamId, timestamp) {
  return events.filter((event) =>
    WARD_EVENT_TYPES.has(event.type) &&
    event.timestamp >= timestamp - RECENT_VISION_WINDOW_MS &&
    event.timestamp < timestamp &&
    (
      participantTeam(participantIndex, normalizeNumber(event.creatorId)) === playerTeamId ||
      participantTeam(participantIndex, normalizeNumber(event.killerId)) === playerTeamId
    )
  );
}

function isCarryPushFrame(frame, participantId) {
  const participantFrame = frame?.participantFrames?.[String(participantId)] ?? null;
  const position = participantFrame?.position;
  if (!position) {
    return false;
  }
  const x = normalizeNumber(position.x);
  const y = normalizeNumber(position.y);
  return x !== null && y !== null && x + y > 18_500;
}

export function parseVisionInformationEvidence({
  matchSummary,
  matchTimeline,
  perspective,
  parsedAt = new Date().toISOString()
}) {
  const participantId = normalizeNumber(perspective?.participantId);
  const puuid = normalizeString(perspective?.puuid);
  const matchId = normalizeString(perspective?.matchId) ?? normalizeString(matchSummary?.metadata?.matchId);
  const participantIndex = buildParticipantIndex(matchSummary);
  const player = participantIndex.get(participantId);
  const playerTeamId = normalizeNumber(perspective?.teamId) ?? participantTeam(participantIndex, participantId);

  if (!participantId || !puuid || !matchId || !playerTeamId || !matchTimeline?.info?.frames) {
    return [];
  }

  const events = flattenTimelineEvents(matchTimeline);
  const wardEvents = events.filter((event) => WARD_EVENT_TYPES.has(event.type));
  const playerWardEvents = wardEvents.filter((event) =>
    normalizeNumber(event.creatorId) === participantId || normalizeNumber(event.killerId) === participantId
  );
  const playerWardPlacedEvents = playerWardEvents.filter((event) => event.type === "WARD_PLACED");
  const playerWardKillEvents = playerWardEvents.filter((event) => event.type === "WARD_KILL");
  const summaryStats = aggregateParticipantVision(player);
  const tags = [];

  if (playerWardPlacedEvents.length <= 1 && summaryStats.wardsPlaced <= 1) {
    pushTag(tags, "low_vision_activity", 0.65, { wardPlacedEvents: playerWardPlacedEvents.length, wardsPlaced: summaryStats.wardsPlaced });
  }
  if (summaryStats.detectorWardsPlaced === 0 && summaryStats.visionWardsBoughtInGame === 0 && !playerWardPlacedEvents.some(isControlWard)) {
    pushTag(tags, "control_ward_missing", 0.6, {
      detectorWardsPlaced: summaryStats.detectorWardsPlaced,
      visionWardsBoughtInGame: summaryStats.visionWardsBoughtInGame
    });
  }
  if (playerWardKillEvents.length >= 2 || summaryStats.wardsKilled >= 2) {
    pushTag(tags, "vision_denial_success", 0.7, { wardKillEvents: playerWardKillEvents.length, wardsKilled: summaryStats.wardsKilled });
  }
  if (participantRole(player) === "SUPPORT" && (summaryStats.visionScore < 20 || summaryStats.wardsPlaced < 8)) {
    pushTag(tags, "support_vision_gap", 0.6, { visionScore: summaryStats.visionScore, wardsPlaced: summaryStats.wardsPlaced });
  }

  const aggregateEvidence = {
    id: `${matchId}:${puuid}:vision_information:summary`,
    matchId,
    puuid,
    participantId,
    championName: normalizeString(perspective?.championName) ?? normalizeString(player?.championName),
    playerRole: normalizeString(perspective?.teamPosition) ?? normalizeString(perspective?.individualPosition),
    category: "vision_information",
    timestamp: 0,
    windowStart: 0,
    windowEnd: normalizeNumber(matchSummary?.info?.gameDuration) ? normalizeNumber(matchSummary.info.gameDuration) * 1000 : null,
    tags,
    facts: {
      parserCaution: "Timeline ward events show recent activity, not full fog-of-war certainty.",
      summaryStats,
      playerWardEvents: playerWardEvents.map(eventSummary)
    },
    reviewQuestions: ["Which recent ward, sweep, or teammate information was available before the play?"],
    confidence: tags.length > 0 ? 0.65 : 0.55,
    sourceEventIds: playerWardEvents.map((event) => event.__eventId),
    createdAt: parsedAt,
    parserVersion: PARSER_VERSION
  };

  const objectiveEvidence = events.filter(isObjective).map((objective, index) => {
    const recentVision = recentTeamVisionEvents(events, participantIndex, playerTeamId, objective.timestamp);
    return {
      id: `${matchId}:${puuid}:vision_information:objective:${objective.timestamp}:${index}`,
      matchId,
      puuid,
      participantId,
      championName: aggregateEvidence.championName,
      playerRole: aggregateEvidence.playerRole,
      category: "vision_information",
      timestamp: objective.timestamp,
      windowStart: objective.timestamp - RECENT_VISION_WINDOW_MS,
      windowEnd: objective.timestamp,
      tags: recentVision.length === 0
        ? [{ id: "objective_without_recent_vision", confidence: 0.65, params: { objectiveEventId: objective.__eventId } }]
        : [],
      facts: {
        parserCaution: "No recent ward event means no recorded ward placement or denial in this window, not proven lack of vision.",
        objective: eventSummary(objective),
        recentTeamWardEvents: recentVision.map(eventSummary)
      },
      reviewQuestions: ["Check whether objective information came from wards, sweepers, lane state, or teammates."],
      confidence: recentVision.length === 0 ? 0.65 : 0.55,
      sourceEventIds: [objective.__eventId],
      createdAt: parsedAt,
      parserVersion: PARSER_VERSION
    };
  });

  const deathEvidence = events
    .filter((event) => event.type === "CHAMPION_KILL" && normalizeNumber(event.victimId) === participantId)
    .map((death, index) => {
      const recentVision = recentTeamVisionEvents(events, participantIndex, playerTeamId, death.timestamp);
      return {
        id: `${matchId}:${puuid}:vision_information:death:${death.timestamp}:${index}`,
        matchId,
        puuid,
        participantId,
        championName: aggregateEvidence.championName,
        playerRole: aggregateEvidence.playerRole,
        category: "vision_information",
        timestamp: death.timestamp,
        windowStart: death.timestamp - RECENT_VISION_WINDOW_MS,
        windowEnd: death.timestamp,
        tags: recentVision.length === 0
          ? [{ id: "death_after_no_recent_ward", confidence: 0.65, params: { deathEventId: death.__eventId } }]
          : [],
        facts: {
          parserCaution: "This flags missing recent ward events before the death; it does not prove the death was caused by vision.",
          death: eventSummary(death),
          recentTeamWardEvents: recentVision.map(eventSummary)
        },
        reviewQuestions: ["Review what information was available before this death."],
        confidence: recentVision.length === 0 ? 0.65 : 0.55,
        sourceEventIds: [death.__eventId],
        createdAt: parsedAt,
        parserVersion: PARSER_VERSION
      };
    });

  const carryPushEvidence = normalizeArray(matchTimeline.info.frames)
    .filter((frame) => (normalizeNumber(frame?.timestamp) ?? 0) > 0 && (normalizeNumber(frame?.timestamp) ?? 0) <= PRE_14_MS)
    .filter((frame) => ["BOTTOM", "MIDDLE", "TOP"].includes(participantRole(player)) && isCarryPushFrame(frame, participantId))
    .slice(0, 1)
    .map((frame) => {
      const timestamp = normalizeNumber(frame?.timestamp) ?? 0;
      const recentPlayerWard = playerWardPlacedEvents.some((event) => event.timestamp >= timestamp - RECENT_VISION_WINDOW_MS && event.timestamp < timestamp);
      return {
        id: `${matchId}:${puuid}:vision_information:push:${timestamp}`,
        matchId,
        puuid,
        participantId,
        championName: aggregateEvidence.championName,
        playerRole: aggregateEvidence.playerRole,
        category: "vision_information",
        timestamp,
        windowStart: timestamp - RECENT_VISION_WINDOW_MS,
        windowEnd: timestamp,
        tags: recentPlayerWard ? [] : [{ id: "carry_no_defensive_ward_before_push", confidence: 0.6, params: { timestamp } }],
        facts: {
          parserCaution: "Forward position plus no recent player ward event is a review prompt, not proof of unsafe vision.",
          recentPlayerWardEvents: playerWardPlacedEvents
            .filter((event) => event.timestamp >= timestamp - RECENT_VISION_WINDOW_MS && event.timestamp < timestamp)
            .map(eventSummary)
        },
        reviewQuestions: ["Check whether the push had defensive information from wards or teammates."],
        confidence: recentPlayerWard ? 0.55 : 0.6,
        sourceEventIds: [],
        createdAt: parsedAt,
        parserVersion: PARSER_VERSION
      };
    });

  return [aggregateEvidence, ...objectiveEvidence, ...deathEvidence, ...carryPushEvidence];
}
