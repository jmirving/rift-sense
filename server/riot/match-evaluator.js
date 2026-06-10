export const DETERMINISTIC_MATCH_EVALUATOR_VERSION = "deterministic-v1";

const OBJECTIVE_WINDOW_MS = 45_000;
const LEVEL_UP_WINDOW_MS = 20_000;
const TAG_IDS = [
  "death_count",
  "solo_death_candidate",
  "multi_enemy_collapse_candidate",
  "objective_window_candidate",
  "enemy_level_up_recently_candidate",
  "missing_timeline",
  "missing_participant"
];

function normalizeString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizePosition(position) {
  if (!position || typeof position !== "object") {
    return null;
  }

  const x = normalizeNumber(position.x);
  const y = normalizeNumber(position.y);
  return x === null || y === null ? null : { x, y };
}

function inferRole(participant, perspective) {
  return normalizeString(participant?.teamPosition) ??
    normalizeString(participant?.individualPosition) ??
    normalizeString(participant?.lane) ??
    normalizeString(perspective?.teamPosition) ??
    normalizeString(perspective?.individualPosition);
}

function buildParticipantIndex(summaryJson) {
  const participants = normalizeArray(summaryJson?.info?.participants);
  const byId = new Map();
  const byPuuid = new Map();

  for (const participant of participants) {
    const participantId = normalizeNumber(participant?.participantId);
    const puuid = normalizeString(participant?.puuid);
    if (participantId !== null) {
      byId.set(participantId, participant);
    }
    if (puuid) {
      byPuuid.set(puuid, participant);
    }
  }

  return { participants, byId, byPuuid };
}

function flattenTimelineEvents(timelineJson) {
  return normalizeArray(timelineJson?.info?.frames)
    .flatMap((frame) => normalizeArray(frame?.events))
    .map((event, index) => ({
      ...event,
      __index: index,
      timestamp: normalizeNumber(event?.timestamp) ?? 0
    }))
    .sort((left, right) => left.timestamp - right.timestamp || left.__index - right.__index);
}

function timelineIsMissing(timelineJson) {
  const frames = timelineJson?.info?.frames;
  return !Array.isArray(frames) || frames.length === 0 || !frames.some((frame) => Array.isArray(frame?.events));
}

function participantTeam(participantIndex, participantId) {
  return normalizeNumber(participantIndex.byId.get(participantId)?.teamId);
}

function championName(participantIndex, participantId) {
  return normalizeString(participantIndex.byId.get(participantId)?.championName);
}

function enemyParticipantIdsForDeath(event, participantIndex, victimTeamId) {
  const ids = [
    normalizeNumber(event?.killerId),
    ...normalizeArray(event?.assistingParticipantIds).map(normalizeNumber)
  ];
  return [...new Set(ids)]
    .filter((participantId) => participantId !== null)
    .filter((participantId) => participantTeam(participantIndex, participantId) !== null)
    .filter((participantId) => participantTeam(participantIndex, participantId) !== victimTeamId);
}

function isObjectiveEvent(event) {
  if (event?.type === "BUILDING_KILL") {
    const buildingType = normalizeString(event?.buildingType)?.toUpperCase() ?? "";
    return buildingType.includes("TOWER") || buildingType.includes("TURRET") || buildingType.includes("INHIBITOR");
  }

  if (event?.type !== "ELITE_MONSTER_KILL") {
    return false;
  }

  const monsterType = normalizeString(event?.monsterType)?.toUpperCase() ?? "";
  const monsterSubType = normalizeString(event?.monsterSubType)?.toUpperCase() ?? "";
  return (
    monsterType.includes("DRAGON") ||
    monsterType.includes("BARON") ||
    monsterType.includes("RIFTHERALD") ||
    monsterType.includes("HORDE") ||
    monsterSubType.includes("ELDER")
  );
}

function objectiveNearDeath(events, timestampMs) {
  return events.some((event) => isObjectiveEvent(event) && Math.abs(event.timestamp - timestampMs) <= OBJECTIVE_WINDOW_MS);
}

function enemyLevelUpNearDeath(events, timestampMs, enemyParticipantIds) {
  const enemyIds = new Set(enemyParticipantIds);
  return events.some((event) => {
    if (event?.type !== "LEVEL_UP" && event?.type !== "CHAMPION_LEVEL_UP") {
      return false;
    }
    const participantId = normalizeNumber(event?.participantId);
    return (
      participantId !== null &&
      enemyIds.has(participantId) &&
      event.timestamp <= timestampMs &&
      timestampMs - event.timestamp <= LEVEL_UP_WINDOW_MS
    );
  });
}

function findPriorLevel(frames, participantId, timestampMs) {
  const frame = normalizeArray(frames)
    .filter((entry) => (normalizeNumber(entry?.timestamp) ?? -1) <= timestampMs)
    .sort((left, right) => (normalizeNumber(right?.timestamp) ?? 0) - (normalizeNumber(left?.timestamp) ?? 0))[0];
  return normalizeNumber(frame?.participantFrames?.[String(participantId)]?.level);
}

function zeroTagCounts() {
  return Object.fromEntries(TAG_IDS.map((tag) => [tag, 0]));
}

export function evaluateMatchFacts({
  matchId,
  puuid,
  summaryJson,
  timelineJson,
  perspectiveRecord,
  evaluationVersion = DETERMINISTIC_MATCH_EVALUATOR_VERSION,
  now = new Date()
}) {
  const participantIndex = buildParticipantIndex(summaryJson);
  const participant = participantIndex.byPuuid.get(puuid) ?? null;
  const participantId = normalizeNumber(participant?.participantId ?? perspectiveRecord?.participantId);
  const victimTeamId = normalizeNumber(participant?.teamId ?? perspectiveRecord?.teamId);
  const frames = normalizeArray(timelineJson?.info?.frames);
  const events = flattenTimelineEvents(timelineJson);
  const counts = zeroTagCounts();
  const matchTags = [];

  if (timelineIsMissing(timelineJson)) {
    counts.missing_timeline = 1;
    matchTags.push("missing_timeline");
  }
  if (!participant || participantId === null) {
    counts.missing_participant = 1;
    matchTags.push("missing_participant");
  }

  const deathEvents = participantId === null
    ? []
    : events.filter((event) => event?.type === "CHAMPION_KILL" && normalizeNumber(event?.victimId) === participantId);

  const deaths = deathEvents.map((event, index) => {
    const timestampMs = normalizeNumber(event?.timestamp) ?? 0;
    const killerParticipantId = normalizeNumber(event?.killerId);
    const assistingParticipantIds = normalizeArray(event?.assistingParticipantIds).map(normalizeNumber).filter((value) => value !== null);
    const enemyParticipantsInvolved = enemyParticipantIdsForDeath(event, participantIndex, victimTeamId);
    const tags = [];

    if (enemyParticipantsInvolved.length === 1) {
      tags.push("solo_death_candidate");
    }
    if (enemyParticipantsInvolved.length >= 2) {
      tags.push("multi_enemy_collapse_candidate");
    }
    if (objectiveNearDeath(events, timestampMs)) {
      tags.push("objective_window_candidate");
    }
    if (enemyLevelUpNearDeath(events, timestampMs, enemyParticipantsInvolved)) {
      tags.push("enemy_level_up_recently_candidate");
    }

    for (const tag of tags) {
      counts[tag] += 1;
    }

    return {
      deathIndex: index + 1,
      timestampMs,
      timestampSeconds: Math.floor(timestampMs / 1000),
      minute: Math.floor(timestampMs / 60_000),
      victimParticipantId: participantId,
      killerParticipantId,
      killerChampionName: killerParticipantId === null ? null : championName(participantIndex, killerParticipantId),
      assistingParticipantIds,
      assistingChampionNames: assistingParticipantIds.map((id) => championName(participantIndex, id)).filter(Boolean),
      position: normalizePosition(event?.position),
      victimLevel: findPriorLevel(frames, participantId, timestampMs),
      killerLevel: killerParticipantId === null ? null : findPriorLevel(frames, killerParticipantId, timestampMs),
      enemyParticipantsInvolved,
      tags
    };
  });

  counts.death_count = deaths.length;

  return {
    matchId,
    puuid,
    evaluationVersion,
    summaryJson: {
      matchId,
      puuid,
      championName: normalizeString(participant?.championName ?? perspectiveRecord?.championName),
      queueId: normalizeNumber(summaryJson?.info?.queueId),
      gameCreation: normalizeNumber(summaryJson?.info?.gameCreation),
      gameDuration: normalizeNumber(summaryJson?.info?.gameDuration ?? perspectiveRecord?.duration),
      win: typeof participant?.win === "boolean" ? participant.win : null,
      kills: normalizeNumber(participant?.kills),
      deaths: normalizeNumber(participant?.deaths),
      assists: normalizeNumber(participant?.assists),
      teamId: victimTeamId,
      participantId,
      role: inferRole(participant, perspectiveRecord),
      lane: normalizeString(participant?.lane),
      evaluatedAt: now.toISOString(),
      evaluationVersion
    },
    deathsJson: deaths,
    tagsJson: {
      counts,
      matchTags,
      deathTagCounts: counts
    }
  };
}

export async function evaluatePersistedMatch({
  matchId,
  puuid,
  evaluationVersion = DETERMINISTIC_MATCH_EVALUATOR_VERSION,
  repository,
  now = new Date()
}) {
  const input = await repository.getPersistedMatchInput({ matchId, puuid });
  if (!input) {
    return null;
  }

  const evaluation = evaluateMatchFacts({
    matchId: input.matchId,
    puuid: input.puuid,
    summaryJson: input.summaryJson,
    timelineJson: input.timelineJson,
    perspectiveRecord: input.perspectiveRecord,
    evaluationVersion,
    now
  });

  return repository.saveMatchEvaluation({
    ...evaluation,
    sourceRawMatchUpdatedAt: input.sourceRawMatchUpdatedAt,
    sourcePerspectiveUpdatedAt: input.sourcePerspectiveUpdatedAt
  }, { now });
}

export async function evaluateRecentPersistedMatchesForUser({
  puuid,
  limit = 10,
  evaluationVersion = DETERMINISTIC_MATCH_EVALUATOR_VERSION,
  repository,
  now = new Date()
}) {
  const inputs = await repository.listRecentPersistedMatchInputsForUser({ puuid, limit });
  const evaluations = [];

  for (const input of inputs) {
    evaluations.push(await evaluatePersistedMatch({
      matchId: input.matchId,
      puuid: input.puuid,
      evaluationVersion,
      repository,
      now
    }));
  }

  return evaluations.filter(Boolean);
}
