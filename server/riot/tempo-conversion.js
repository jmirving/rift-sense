const PARSER_VERSION = "tempo-conversion-0";
const DEFAULT_POST_WINDOW_MS = 90_000;

const TRIGGER_TYPES = new Set([
  "CHAMPION_KILL",
  "ELITE_MONSTER_KILL",
  "BUILDING_KILL",
  "TURRET_PLATE_DESTROYED"
]);

const CONVERSION_TYPES = new Set([
  "ELITE_MONSTER_KILL",
  "BUILDING_KILL",
  "TURRET_PLATE_DESTROYED"
]);

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

function teamsFromParticipants(participantIndex) {
  return [...new Set([...participantIndex.values()].map((participant) => normalizeNumber(participant?.teamId)).filter(Boolean))];
}

function opposingTeamId(participantIndex, teamId) {
  return teamsFromParticipants(participantIndex).find((candidate) => candidate !== teamId) ?? null;
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

function normalizePosition(position) {
  if (!position || typeof position !== "object") {
    return null;
  }

  const x = normalizeNumber(position.x);
  const y = normalizeNumber(position.y);
  return x === null || y === null ? null : { x, y };
}

function eventSummary(event) {
  return {
    eventId: event.__eventId,
    type: event.type,
    timestamp: event.timestamp,
    participantId: normalizeNumber(event.participantId),
    killerId: normalizeNumber(event.killerId),
    victimId: normalizeNumber(event.victimId),
    assistingParticipantIds: normalizeArray(event.assistingParticipantIds),
    teamId: normalizeNumber(event.teamId),
    monsterType: normalizeString(event.monsterType),
    monsterSubType: normalizeString(event.monsterSubType),
    buildingType: normalizeString(event.buildingType),
    towerType: normalizeString(event.towerType),
    laneType: normalizeString(event.laneType),
    position: normalizePosition(event.position)
  };
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

  if (event.type === "BUILDING_KILL") {
    return opposingTeamId(participantIndex, normalizeNumber(event.teamId));
  }

  return normalizeNumber(event.teamId);
}

function isConversion(event) {
  return CONVERSION_TYPES.has(event.type);
}

function conversionKind(event) {
  if (event.type === "ELITE_MONSTER_KILL") {
    return "objective";
  }
  if (event.type === "BUILDING_KILL") {
    return "structure";
  }
  if (event.type === "TURRET_PLATE_DESTROYED") {
    return "plate";
  }
  return "unknown";
}

function isBaron(event) {
  return `${normalizeString(event.monsterType) ?? ""} ${normalizeString(event.monsterSubType) ?? ""}`
    .toUpperCase()
    .includes("BARON");
}

function playerParticipated(event, participantId) {
  if (normalizeNumber(event.killerId) === participantId || normalizeNumber(event.participantId) === participantId) {
    return true;
  }

  return normalizeArray(event.assistingParticipantIds).map(normalizeNumber).includes(participantId);
}

function gainSummary(event, ownerTeamId, playerTeamId) {
  return {
    ...eventSummary(event),
    teamId: ownerTeamId,
    teamSide: ownerTeamId === playerTeamId ? "player" : "enemy",
    gainType: conversionKind(event)
  };
}

function pushTag(tags, id, confidence, params = {}) {
  if (!tags.some((tag) => tag.id === id)) {
    tags.push({ id, confidence, params });
  }
}

function classifyConversion({ trigger, playerGains, enemyGains, playerDeaths }) {
  if (playerGains.length > 0 && enemyGains.length === 0 && playerDeaths.length === 0) {
    return "clean";
  }
  if (enemyGains.length > 0 || playerDeaths.length > 0) {
    return "tempo_back";
  }
  if (playerGains.length === 0) {
    return "neutral";
  }
  return trigger ? "neutral" : "unknown";
}

function buildTags({ trigger, playerGains, enemyGains, playerDeaths, participantId }) {
  const tags = [];
  const playerGainIds = playerGains.map((event) => event.eventId);
  const enemyGainIds = enemyGains.map((event) => event.eventId);
  const playerDeathIds = playerDeaths.map((event) => event.eventId);
  const playerGained = playerGains.length > 0;
  const playerDied = playerDeaths.length > 0;
  const enemyGained = enemyGains.length > 0;

  if (playerGained && !playerDied && !enemyGained) {
    pushTag(tags, "clean_conversion", 0.85, { playerGainEventIds: playerGainIds });
  }

  if (!playerGained && (playerDied || enemyGained)) {
    pushTag(tags, "failed_conversion", 0.8, { playerDeathEventIds: playerDeathIds, enemyGainEventIds: enemyGainIds });
  }

  if (playerGained && playerDied) {
    pushTag(tags, "overstay_after_conversion", 0.75, { playerGainEventIds: playerGainIds, playerDeathEventIds: playerDeathIds });
    pushTag(tags, "tempo_spent_but_stayed", 0.75, { playerGainEventIds: playerGainIds, playerDeathEventIds: playerDeathIds });
  }

  if (trigger.type === "ELITE_MONSTER_KILL" && playerDied) {
    pushTag(tags, "objective_into_death", 0.85, { objectiveEventId: trigger.__eventId, playerDeathEventIds: playerDeathIds });
  }

  if (trigger.type === "CHAMPION_KILL" && !playerGained) {
    pushTag(tags, "kill_into_no_plate", 0.7, { triggerEventId: trigger.__eventId });
  }

  if (trigger.type === "TURRET_PLATE_DESTROYED" && playerDied) {
    pushTag(tags, "plate_into_bad_reset", 0.75, { plateEventId: trigger.__eventId, playerDeathEventIds: playerDeathIds });
  }

  if (trigger.type === "ELITE_MONSTER_KILL" && isBaron(trigger) && playerDied) {
    pushTag(tags, "baron_exit_failure", 0.9, { baronEventId: trigger.__eventId, playerDeathEventIds: playerDeathIds });
  }

  if (trigger.type === "BUILDING_KILL" && normalizeString(trigger.buildingType) === "TOWER_BUILDING" && playerDied) {
    pushTag(tags, "tower_take_into_collapse", 0.85, { towerEventId: trigger.__eventId, playerDeathEventIds: playerDeathIds });
  }

  if (enemyGained) {
    pushTag(tags, "enemy_crossmap_trade", 0.8, { enemyGainEventIds: enemyGainIds });
  }

  if (playerDied && normalizeNumber(trigger.killerId) !== participantId) {
    pushTag(tags, "reset_window_missed", 0.65, { playerDeathEventIds: playerDeathIds });
  }

  return tags;
}

/**
 * Emits deterministic tempo_conversion evidence for map gains after trigger events.
 */
export function parseTempoConversionEvidence({
  matchSummary,
  matchTimeline,
  perspective,
  parsedAt = new Date().toISOString(),
  postWindowMs = DEFAULT_POST_WINDOW_MS
}) {
  const participantId = normalizeNumber(perspective?.participantId);
  const puuid = normalizeString(perspective?.puuid);
  const matchId = normalizeString(perspective?.matchId) ?? normalizeString(matchSummary?.metadata?.matchId);
  const participantIndex = buildParticipantIndex(matchSummary);
  const playerTeamId = normalizeNumber(perspective?.teamId) ?? participantTeam(participantIndex, participantId);
  const windowMs = Number.isFinite(postWindowMs) && postWindowMs > 0 ? postWindowMs : DEFAULT_POST_WINDOW_MS;

  if (!participantId || !puuid || !matchId || !playerTeamId || !matchTimeline?.info?.frames) {
    return [];
  }

  const events = flattenTimelineEvents(matchTimeline);
  const triggers = events.filter((event) => TRIGGER_TYPES.has(event.type));

  return triggers.map((trigger, triggerIndex) => {
    const triggerTeamId = eventOwnerTeam(trigger, participantIndex);
    const windowEvents = events.filter((event) => event.timestamp > trigger.timestamp && event.timestamp <= trigger.timestamp + windowMs);
    const gains = windowEvents
      .filter(isConversion)
      .map((event) => {
        const ownerTeamId = eventOwnerTeam(event, participantIndex);
        return ownerTeamId ? gainSummary(event, ownerTeamId, playerTeamId) : null;
      })
      .filter(Boolean);
    const playerGains = gains.filter((event) => event.teamSide === "player");
    const enemyGains = gains.filter((event) => event.teamSide === "enemy");
    const playerDeaths = windowEvents
      .filter((event) => event.type === "CHAMPION_KILL" && participantTeam(participantIndex, normalizeNumber(event.victimId)) === playerTeamId)
      .map(eventSummary);
    const tags = triggerTeamId === playerTeamId
      ? buildTags({ trigger, playerGains, enemyGains, playerDeaths, participantId })
      : enemyGains.length > 0
        ? [{ id: "enemy_crossmap_trade", confidence: 0.7, params: { enemyGainEventIds: enemyGains.map((event) => event.eventId) } }]
        : [];

    return {
      id: `${matchId}:${puuid}:tempo_conversion:${trigger.timestamp}:${triggerIndex}`,
      matchId,
      puuid,
      participantId,
      championName: normalizeString(perspective?.championName) ?? normalizeString(participantIndex.get(participantId)?.championName),
      playerRole: normalizeString(perspective?.teamPosition) ?? normalizeString(perspective?.individualPosition),
      category: "tempo_conversion",
      timestamp: trigger.timestamp,
      windowStart: trigger.timestamp,
      windowEnd: trigger.timestamp + windowMs,
      tags,
      facts: {
        trigger: {
          ...eventSummary(trigger),
          teamId: triggerTeamId,
          teamSide: triggerTeamId === playerTeamId ? "player" : "enemy",
          playerParticipated: playerParticipated(trigger, participantId)
        },
        playerTeamGains: playerGains,
        enemyTeamGains: enemyGains,
        playerDeathsAfterTrigger: playerDeaths,
        objectiveStructureConversions: gains,
        enemyCrossMapTrades: enemyGains,
        conversionResult: triggerTeamId === playerTeamId
          ? classifyConversion({ trigger, playerGains, enemyGains, playerDeaths })
          : "enemy_trigger"
      },
      reviewQuestions: [],
      confidence: 0.8,
      sourceEventIds: [trigger.__eventId],
      createdAt: parsedAt,
      parserVersion: PARSER_VERSION
    };
  });
}
