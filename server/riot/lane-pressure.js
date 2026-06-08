const PARSER_VERSION = "lane-pressure-0";
const PRE_14_MS = 14 * 60_000;
const PRESSURE_CS_DELTA = 10;
const PRESSURE_XP_DELTA = 350;
const PRESSURE_GOLD_DELTA = 450;
const DEATH_TO_PLATE_WINDOW_MS = 90_000;

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

function normalizeRole(value) {
  const role = normalizeString(value)?.toUpperCase() ?? null;
  if (!role) {
    return null;
  }
  if (role === "UTILITY") {
    return "SUPPORT";
  }
  if (role === "BOTTOM") {
    return "BOTTOM";
  }
  if (["TOP", "JUNGLE", "MIDDLE", "MID", "SUPPORT"].includes(role)) {
    return role === "MID" ? "MIDDLE" : role;
  }
  return null;
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
  return normalizeRole(participant?.teamPosition) ?? normalizeRole(participant?.individualPosition) ?? normalizeRole(participant?.lane);
}

function resolveLaneOpponent(participantIndex, participantId, playerTeamId) {
  const player = participantIndex.get(participantId);
  const role = participantRole(player);
  if (!role || role === "JUNGLE") {
    return null;
  }

  return [...participantIndex.values()].find((candidate) =>
    normalizeNumber(candidate?.teamId) !== playerTeamId && participantRole(candidate) === role
  ) ?? null;
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

function frameCs(participantFrame) {
  return (
    normalizeNumber(participantFrame?.minionsKilled) ??
    0
  ) + (
    normalizeNumber(participantFrame?.jungleMinionsKilled) ??
    0
  );
}

function frameSummary(frame, participantId) {
  const participantFrame = frame?.participantFrames?.[String(participantId)] ?? null;
  if (!participantFrame) {
    return null;
  }

  return {
    participantId,
    timestamp: normalizeNumber(frame?.timestamp) ?? 0,
    minute: Math.floor((normalizeNumber(frame?.timestamp) ?? 0) / 60_000),
    cs: frameCs(participantFrame),
    xp: normalizeNumber(participantFrame?.xp) ?? 0,
    totalGold: normalizeNumber(participantFrame?.totalGold) ?? 0,
    level: normalizeNumber(participantFrame?.level) ?? 0
  };
}

function laneTypeForRole(role) {
  if (role === "TOP") {
    return "TOP_LANE";
  }
  if (role === "MIDDLE") {
    return "MID_LANE";
  }
  if (role === "BOTTOM" || role === "SUPPORT") {
    return "BOT_LANE";
  }
  return null;
}

function eventOwnerTeam(event, participantIndex) {
  const killerTeam = participantTeam(participantIndex, normalizeNumber(event.killerId));
  if (killerTeam) {
    return killerTeam;
  }
  const participantOwnerTeam = participantTeam(participantIndex, normalizeNumber(event.participantId));
  if (participantOwnerTeam) {
    return participantOwnerTeam;
  }
  const turretTeamId = normalizeNumber(event.teamId);
  return turretTeamId ? [...new Set([...participantIndex.values()].map((participant) => normalizeNumber(participant?.teamId)).filter(Boolean))]
    .find((teamId) => teamId !== turretTeamId) ?? null : null;
}

function eventSummary(event) {
  return {
    eventId: event.__eventId,
    type: event.type,
    timestamp: event.timestamp,
    participantId: normalizeNumber(event.participantId),
    killerId: normalizeNumber(event.killerId),
    victimId: normalizeNumber(event.victimId),
    teamId: normalizeNumber(event.teamId),
    laneType: normalizeString(event.laneType)
  };
}

function pushTag(tags, id, confidence, params = {}) {
  if (!tags.some((tag) => tag.id === id)) {
    tags.push({ id, confidence, params });
  }
}

function buildDeltaTags(delta, playerPlateCount) {
  const tags = [];

  if (delta.csDelta >= PRESSURE_CS_DELTA) {
    pushTag(tags, "lane_cs_lead", 0.8, { csDelta: delta.csDelta });
  } else if (delta.csDelta <= -PRESSURE_CS_DELTA) {
    pushTag(tags, "lane_cs_deficit", 0.8, { csDelta: delta.csDelta });
  }

  if (delta.xpDelta >= PRESSURE_XP_DELTA || delta.levelDelta > 0) {
    pushTag(tags, "xp_lead", 0.75, { xpDelta: delta.xpDelta, levelDelta: delta.levelDelta });
  } else if (delta.xpDelta <= -PRESSURE_XP_DELTA || delta.levelDelta < 0) {
    pushTag(tags, "xp_deficit", 0.75, { xpDelta: delta.xpDelta, levelDelta: delta.levelDelta });
  }

  const hasPressure = delta.csDelta >= PRESSURE_CS_DELTA || delta.xpDelta >= PRESSURE_XP_DELTA || delta.goldDelta >= PRESSURE_GOLD_DELTA || delta.levelDelta > 0;
  if (hasPressure && playerPlateCount > 0) {
    pushTag(tags, "plate_conversion", 0.75, { platesTaken: playerPlateCount });
  } else if (hasPressure) {
    pushTag(tags, "pressure_without_conversion", 0.65, { platesTaken: playerPlateCount });
    pushTag(tags, "crash_or_reset_possible", 0.55, { reason: "early_lane_lead_without_plate_event" });
  }

  return tags;
}

export function parseLanePressureEvidence({
  matchSummary,
  matchTimeline,
  perspective,
  parsedAt = new Date().toISOString()
}) {
  const participantId = normalizeNumber(perspective?.participantId);
  const puuid = normalizeString(perspective?.puuid);
  const matchId = normalizeString(perspective?.matchId) ?? normalizeString(matchSummary?.metadata?.matchId);
  const participantIndex = buildParticipantIndex(matchSummary);
  const playerTeamId = normalizeNumber(perspective?.teamId) ?? participantTeam(participantIndex, participantId);
  const opponent = resolveLaneOpponent(participantIndex, participantId, playerTeamId);
  const opponentId = normalizeNumber(opponent?.participantId);
  const playerRole = participantRole(participantIndex.get(participantId));
  const laneType = laneTypeForRole(playerRole);

  if (!participantId || !opponentId || !puuid || !matchId || !playerTeamId || !matchTimeline?.info?.frames) {
    return [];
  }

  const events = flattenTimelineEvents(matchTimeline).filter((event) => event.timestamp <= PRE_14_MS);
  const lanePlates = events.filter((event) =>
    event.type === "TURRET_PLATE_DESTROYED" && (!laneType || normalizeString(event.laneType) === laneType)
  );
  const playerPlates = lanePlates.filter((event) => eventOwnerTeam(event, participantIndex) === playerTeamId).map(eventSummary);
  const enemyPlates = lanePlates.filter((event) => eventOwnerTeam(event, participantIndex) !== playerTeamId).map(eventSummary);
  const deaths = events.filter((event) => event.type === "CHAMPION_KILL" && [participantId, opponentId].includes(normalizeNumber(event.victimId)));
  const playerDeaths = deaths.filter((event) => normalizeNumber(event.victimId) === participantId).map(eventSummary);
  const opponentDeaths = deaths.filter((event) => normalizeNumber(event.victimId) === opponentId).map(eventSummary);
  const playerPlateLossesAfterDeath = enemyPlates.filter((plate) =>
    playerDeaths.some((death) => plate.timestamp > death.timestamp && plate.timestamp <= death.timestamp + DEATH_TO_PLATE_WINDOW_MS)
  );
  const repeatGankDeaths = playerDeaths.filter((death) => {
    const killer = participantIndex.get(death.killerId);
    return participantRole(killer) === "JUNGLE";
  });
  const frames = normalizeArray(matchTimeline.info.frames)
    .filter((frame) => (normalizeNumber(frame?.timestamp) ?? 0) > 0 && (normalizeNumber(frame?.timestamp) ?? 0) <= PRE_14_MS)
    .map((frame) => {
      const player = frameSummary(frame, participantId);
      const laneOpponent = frameSummary(frame, opponentId);
      if (!player || !laneOpponent) {
        return null;
      }
      return {
        minute: player.minute,
        timestamp: player.timestamp,
        player,
        opponent: laneOpponent,
        deltas: {
          csDelta: player.cs - laneOpponent.cs,
          xpDelta: player.xp - laneOpponent.xp,
          goldDelta: player.totalGold - laneOpponent.totalGold,
          levelDelta: player.level - laneOpponent.level
        }
      };
    })
    .filter(Boolean);

  return frames.map((frame, index) => {
    const tags = buildDeltaTags(frame.deltas, playerPlates.length);
    if (playerPlateLossesAfterDeath.length > 0) {
      pushTag(tags, "plate_loss_after_death", 0.8, { plateEventIds: playerPlateLossesAfterDeath.map((event) => event.eventId) });
    }
    if (repeatGankDeaths.length >= 2) {
      pushTag(tags, "repeat_gank_same_lane", 0.7, { deathEventIds: repeatGankDeaths.map((event) => event.eventId) });
    }

    return {
      id: `${matchId}:${puuid}:lane_pressure:${frame.timestamp}:${index}`,
      matchId,
      puuid,
      participantId,
      championName: normalizeString(perspective?.championName) ?? normalizeString(participantIndex.get(participantId)?.championName),
      playerRole: normalizeString(perspective?.teamPosition) ?? normalizeString(perspective?.individualPosition),
      category: "lane_pressure",
      timestamp: frame.timestamp,
      windowStart: 0,
      windowEnd: PRE_14_MS,
      tags,
      facts: {
        minute: frame.minute,
        opponentParticipantId: opponentId,
        opponentChampionName: normalizeString(opponent?.championName),
        laneType,
        deltas: frame.deltas,
        platesTaken: playerPlates,
        platesLost: enemyPlates,
        playerDeathsInLaneWindow: playerDeaths,
        opponentDeathsInLaneWindow: opponentDeaths
      },
      reviewQuestions: [],
      confidence: tags.length > 0 ? 0.75 : 0.6,
      sourceEventIds: [],
      createdAt: parsedAt,
      parserVersion: PARSER_VERSION
    };
  });
}
