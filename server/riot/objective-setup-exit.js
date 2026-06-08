const PARSER_VERSION = "objective-setup-exit-0";
const DEFAULT_SETUP_WINDOW_MS = 90_000;
const DEFAULT_EXIT_WINDOW_MS = 60_000;

const OBJECTIVE_TYPES = new Set(["DRAGON", "RIFTHERALD", "BARON_NASHOR"]);
const WARD_EVENT_TYPES = new Set(["WARD_PLACED", "WARD_KILL"]);

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

function objectiveKind(event) {
  const monsterType = normalizeString(event.monsterType)?.toUpperCase() ?? "";
  const monsterSubType = normalizeString(event.monsterSubType)?.toUpperCase() ?? "";
  const combined = `${monsterType} ${monsterSubType}`;

  if (combined.includes("ELDER")) {
    return { type: "elder", subtype: normalizeString(event.monsterSubType) ?? "ELDER_DRAGON" };
  }
  if (monsterType === "DRAGON") {
    return { type: "dragon", subtype: normalizeString(event.monsterSubType) };
  }
  if (combined.includes("HERALD")) {
    return { type: "herald", subtype: normalizeString(event.monsterSubType) };
  }
  if (combined.includes("BARON")) {
    return { type: "baron", subtype: normalizeString(event.monsterSubType) };
  }

  return null;
}

function isTrackedObjective(event) {
  if (event.type !== "ELITE_MONSTER_KILL") {
    return false;
  }
  const monsterType = normalizeString(event.monsterType)?.toUpperCase() ?? "";
  const monsterSubType = normalizeString(event.monsterSubType)?.toUpperCase() ?? "";
  return OBJECTIVE_TYPES.has(monsterType) || monsterSubType.includes("ELDER") || monsterType.includes("HERALD");
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

  if (event.type === "BUILDING_KILL" || event.type === "TURRET_PLATE_DESTROYED") {
    return opposingTeamId(participantIndex, normalizeNumber(event.teamId));
  }

  return normalizeNumber(event.teamId);
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
    assistingParticipantIds: normalizeArray(event.assistingParticipantIds),
    teamId: normalizeNumber(event.teamId),
    monsterType: normalizeString(event.monsterType),
    monsterSubType: normalizeString(event.monsterSubType),
    buildingType: normalizeString(event.buildingType),
    towerType: normalizeString(event.towerType),
    laneType: normalizeString(event.laneType),
    wardType: normalizeString(event.wardType),
    position: normalizePosition(event.position)
  };
}

function findPriorFrame(matchTimeline, timestamp) {
  return normalizeArray(matchTimeline?.info?.frames)
    .filter((entry) => (normalizeNumber(entry?.timestamp) ?? -1) <= timestamp)
    .sort((a, b) => (normalizeNumber(b?.timestamp) ?? 0) - (normalizeNumber(a?.timestamp) ?? 0))[0] ?? null;
}

function participantFrameSummary(frame, participantId, participantIndex, playerTeamId) {
  const participantFrame = frame?.participantFrames?.[String(participantId)] ?? null;
  const teamId = participantTeam(participantIndex, participantId);

  if (!participantFrame || !teamId) {
    return null;
  }

  return {
    participantId,
    teamId,
    teamSide: teamId === playerTeamId ? "player" : "enemy",
    championName: normalizeString(participantIndex.get(participantId)?.championName),
    position: normalizePosition(participantFrame.position),
    level: normalizeNumber(participantFrame.level),
    currentGold: normalizeNumber(participantFrame.currentGold),
    totalGold: normalizeNumber(participantFrame.totalGold)
  };
}

function teamPositionSummaries(frame, participantIndex, playerTeamId) {
  if (!frame?.participantFrames) {
    return [];
  }

  return [...participantIndex.keys()]
    .map((participantId) => participantFrameSummary(frame, participantId, participantIndex, playerTeamId))
    .filter((summary) => summary?.position);
}

function deathSummary(event, participantIndex, playerTeamId) {
  const victimId = normalizeNumber(event.victimId);
  const victimTeamId = participantTeam(participantIndex, victimId);
  return {
    ...eventSummary(event),
    victimTeamId,
    teamSide: victimTeamId === playerTeamId ? "player" : "enemy",
    isPlayerDeath: false
  };
}

function structureSummary(event, participantIndex, playerTeamId) {
  const ownerTeamId = eventOwnerTeam(event, participantIndex);
  return ownerTeamId
    ? {
        ...eventSummary(event),
        teamId: ownerTeamId,
        teamSide: ownerTeamId === playerTeamId ? "player" : "enemy"
      }
    : null;
}

function pushTag(tags, id, confidence, params = {}) {
  if (!tags.some((tag) => tag.id === id)) {
    tags.push({ id, confidence, params });
  }
}

function buildTags({ objective, securedByPlayerTeam, setupPresent, playerDeathsAfter, allyDeathsAfter, enemyCrossMapGains, setupDeaths }) {
  const tags = [];
  const playerTeamDeathsAfter = [...playerDeathsAfter, ...allyDeathsAfter];

  pushTag(tags, setupPresent ? "objective_setup_present" : "objective_setup_missing", setupPresent ? 0.75 : 0.7, {
    objectiveEventId: objective.eventId
  });

  if (securedByPlayerTeam && playerTeamDeathsAfter.length === 0 && enemyCrossMapGains.length === 0) {
    pushTag(tags, "objective_taken_cleanly", 0.85, { objectiveEventId: objective.eventId });
  }

  if (securedByPlayerTeam && (playerTeamDeathsAfter.length > 0 || enemyCrossMapGains.length > 0)) {
    pushTag(tags, "objective_taken_but_exit_failed", 0.85, {
      objectiveEventId: objective.eventId,
      deathEventIds: playerTeamDeathsAfter.map((event) => event.eventId),
      enemyGainEventIds: enemyCrossMapGains.map((event) => event.eventId)
    });
  }

  if (!securedByPlayerTeam && setupDeaths.some((event) => event.teamSide === "player")) {
    pushTag(tags, "objective_contested_and_lost", 0.75, {
      objectiveEventId: objective.eventId,
      playerTeamDeathEventIds: setupDeaths.filter((event) => event.teamSide === "player").map((event) => event.eventId)
    });
  }

  if (enemyCrossMapGains.length > 0) {
    pushTag(tags, "enemy_objective_crossmap_trade", 0.8, {
      objectiveEventId: objective.eventId,
      enemyGainEventIds: enemyCrossMapGains.map((event) => event.eventId)
    });
  }

  if (["baron", "elder"].includes(objective.type) && playerTeamDeathsAfter.length > 0) {
    pushTag(tags, "post_major_objective_death", 0.9, {
      objectiveEventId: objective.eventId,
      deathEventIds: playerTeamDeathsAfter.map((event) => event.eventId)
    });
  }

  return tags;
}

/**
 * Emits deterministic objective_setup_exit evidence for dragon, Herald, Baron, and Elder kills.
 */
export function parseObjectiveSetupExitEvidence({
  matchSummary,
  matchTimeline,
  perspective,
  parsedAt = new Date().toISOString(),
  setupWindowMs = DEFAULT_SETUP_WINDOW_MS,
  exitWindowMs = DEFAULT_EXIT_WINDOW_MS
}) {
  const participantId = normalizeNumber(perspective?.participantId);
  const puuid = normalizeString(perspective?.puuid);
  const matchId = normalizeString(perspective?.matchId) ?? normalizeString(matchSummary?.metadata?.matchId);
  const participantIndex = buildParticipantIndex(matchSummary);
  const playerTeamId = normalizeNumber(perspective?.teamId) ?? participantTeam(participantIndex, participantId);
  const setupWindow = Number.isFinite(setupWindowMs) && setupWindowMs > 0 ? setupWindowMs : DEFAULT_SETUP_WINDOW_MS;
  const exitWindow = Number.isFinite(exitWindowMs) && exitWindowMs > 0 ? exitWindowMs : DEFAULT_EXIT_WINDOW_MS;

  if (!participantId || !puuid || !matchId || !playerTeamId || !matchTimeline?.info?.frames) {
    return [];
  }

  const events = flattenTimelineEvents(matchTimeline);
  const objectives = events.filter(isTrackedObjective);

  return objectives.map((objectiveEvent, objectiveIndex) => {
    const objective = objectiveKind(objectiveEvent);
    const securingTeamId = eventOwnerTeam(objectiveEvent, participantIndex);
    const securedByPlayerTeam = securingTeamId === playerTeamId;
    const setupStart = objectiveEvent.timestamp - setupWindow;
    const exitEnd = objectiveEvent.timestamp + exitWindow;
    const setupEvents = events.filter((event) => event.timestamp >= setupStart && event.timestamp < objectiveEvent.timestamp);
    const exitEvents = events.filter((event) => event.timestamp > objectiveEvent.timestamp && event.timestamp <= exitEnd);
    const priorFrame = findPriorFrame(matchTimeline, objectiveEvent.timestamp);
    const playerPriorFrame = participantFrameSummary(priorFrame, participantId, participantIndex, playerTeamId);
    const teamPositionsBeforeObjective = teamPositionSummaries(priorFrame, participantIndex, playerTeamId);
    const setupDeaths = setupEvents
      .filter((event) => event.type === "CHAMPION_KILL")
      .map((event) => deathSummary(event, participantIndex, playerTeamId));
    const exitDeaths = exitEvents
      .filter((event) => event.type === "CHAMPION_KILL")
      .map((event) => deathSummary(event, participantIndex, playerTeamId))
      .map((event) => ({ ...event, isPlayerDeath: event.victimId === participantId }));
    const playerDeathsAfter = exitDeaths.filter((event) => event.isPlayerDeath);
    const allyDeathsAfter = exitDeaths.filter((event) => event.teamSide === "player" && !event.isPlayerDeath);
    const enemyDeathsAfter = exitDeaths.filter((event) => event.teamSide === "enemy");
    const structuresTakenAfter = exitEvents
      .filter((event) => event.type === "BUILDING_KILL")
      .map((event) => structureSummary(event, participantIndex, playerTeamId))
      .filter(Boolean);
    const enemyCrossMapGains = securedByPlayerTeam
      ? structuresTakenAfter.filter((event) => event.teamSide === "enemy")
      : structuresTakenAfter.filter((event) => event.teamSide === "player");
    const wardsInSetup = setupEvents.filter((event) => WARD_EVENT_TYPES.has(event.type)).map(eventSummary);
    const setupPresent = Boolean(playerPriorFrame?.position || teamPositionsBeforeObjective.length > 0 || setupDeaths.length > 0 || wardsInSetup.length > 0);
    const objectiveSummary = {
      ...eventSummary(objectiveEvent),
      type: objective?.type ?? "unknown",
      subtype: objective?.subtype ?? normalizeString(objectiveEvent.monsterSubType),
      eventType: objectiveEvent.type,
      securingTeamId,
      teamSide: securedByPlayerTeam ? "player" : "enemy"
    };
    const tags = buildTags({
      objective: objectiveSummary,
      securedByPlayerTeam,
      setupPresent,
      playerDeathsAfter,
      allyDeathsAfter,
      enemyCrossMapGains,
      setupDeaths
    });

    return {
      id: `${matchId}:${puuid}:objective_setup_exit:${objectiveEvent.timestamp}:${objectiveIndex}`,
      matchId,
      puuid,
      participantId,
      championName: normalizeString(perspective?.championName) ?? normalizeString(participantIndex.get(participantId)?.championName),
      playerRole: normalizeString(perspective?.teamPosition) ?? normalizeString(perspective?.individualPosition),
      category: "objective_setup_exit",
      timestamp: objectiveEvent.timestamp,
      windowStart: setupStart,
      windowEnd: exitEnd,
      tags,
      facts: {
        objective: objectiveSummary,
        setupWindow: { start: setupStart, end: objectiveEvent.timestamp, durationMs: setupWindow },
        exitWindow: { start: objectiveEvent.timestamp, end: exitEnd, durationMs: exitWindow },
        deathsBeforeObjective: setupDeaths,
        playerPositionBeforeObjective: playerPriorFrame,
        teamPositionsBeforeObjective,
        wardsInSetup,
        playerDeathsAfterObjective: playerDeathsAfter,
        allyDeathsAfterObjective: allyDeathsAfter,
        enemyDeathsAfterObjective: enemyDeathsAfter,
        structuresTakenAfterObjective: structuresTakenAfter,
        enemyCrossMapGains,
        exitResult: securedByPlayerTeam
          ? playerDeathsAfter.length > 0 || allyDeathsAfter.length > 0 || enemyCrossMapGains.length > 0
            ? "exit_failed"
            : "clean"
          : "enemy_secured"
      },
      reviewQuestions: [],
      confidence: 0.8,
      sourceEventIds: [objectiveEvent.__eventId],
      createdAt: parsedAt,
      parserVersion: PARSER_VERSION
    };
  });
}
