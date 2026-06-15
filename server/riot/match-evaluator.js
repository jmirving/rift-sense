export const DETERMINISTIC_MATCH_EVALUATOR_VERSION = "deterministic-v2";

const OBJECTIVE_WINDOW_MS = 45_000;
const OBJECTIVE_SETUP_WINDOW_MS = 45_000;
const OBJECTIVE_EXIT_WINDOW_MS = 45_000;
const LEVEL_UP_WINDOW_MS = 20_000;
const NEARBY_PARTICIPANT_RADIUS = 2500;
const TAG_IDS = [
  "death_count",
  "solo_death_candidate",
  "multi_enemy_collapse_candidate",
  "objective_window_candidate",
  "objective_setup_death_candidate",
  "objective_exit_death_candidate",
  "enemy_level_up_recently_candidate",
  "level_up_all_in_candidate",
  "isolated_forward_death_candidate",
  "missing_timeline",
  "missing_participant"
];
const SUMMARY_TAGS = new Map([
  ["solo_death_candidate", "possible unsupported deaths"],
  ["multi_enemy_collapse_candidate", "multi-enemy collapse candidates"],
  ["objective_window_candidate", "objective-window candidates"],
  ["objective_setup_death_candidate", "objective setup death candidates"],
  ["objective_exit_death_candidate", "objective exit death candidates"],
  ["enemy_level_up_recently_candidate", "enemy level-up timing candidates"],
  ["level_up_all_in_candidate", "possible level-up all-ins"],
  ["isolated_forward_death_candidate", "isolated forward death candidates"],
  ["missing_timeline", "missing timeline"],
  ["missing_participant", "missing participant"]
]);

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

function objectiveSetupNearDeath(events, timestampMs) {
  return events.some((event) => (
    isObjectiveEvent(event) &&
    event.timestamp >= timestampMs &&
    event.timestamp - timestampMs <= OBJECTIVE_SETUP_WINDOW_MS
  ));
}

function objectiveExitNearDeath(events, timestampMs) {
  return events.some((event) => (
    isObjectiveEvent(event) &&
    event.timestamp <= timestampMs &&
    timestampMs - event.timestamp <= OBJECTIVE_EXIT_WINDOW_MS
  ));
}

function enemyLevelUpsNearDeath(events, timestampMs, enemyParticipantIds, participantIndex) {
  const enemyIds = new Set(enemyParticipantIds);
  return events
    .filter((event) => event?.type === "LEVEL_UP" || event?.type === "CHAMPION_LEVEL_UP")
    .map((event) => ({
      participantId: normalizeNumber(event?.participantId),
      timestampMs: normalizeNumber(event?.timestamp) ?? 0,
      level: normalizeNumber(event?.level)
    }))
    .filter(({ participantId, timestampMs: eventTimestampMs }) => (
      participantId !== null &&
      enemyIds.has(participantId) &&
      eventTimestampMs <= timestampMs &&
      timestampMs - eventTimestampMs <= LEVEL_UP_WINDOW_MS
    ))
    .map((event) => ({
      ...event,
      championName: championName(participantIndex, event.participantId),
      secondsBeforeDeath: Math.round((timestampMs - event.timestampMs) / 1000)
    }));
}

function findPriorLevel(frames, participantId, timestampMs) {
  const frame = normalizeArray(frames)
    .filter((entry) => (normalizeNumber(entry?.timestamp) ?? -1) <= timestampMs)
    .sort((left, right) => (normalizeNumber(right?.timestamp) ?? 0) - (normalizeNumber(left?.timestamp) ?? 0))[0];
  return normalizeNumber(frame?.participantFrames?.[String(participantId)]?.level);
}

function findFrameAtOrBefore(frames, timestampMs) {
  return normalizeArray(frames)
    .filter((entry) => (normalizeNumber(entry?.timestamp) ?? -1) <= timestampMs)
    .sort((left, right) => (normalizeNumber(right?.timestamp) ?? 0) - (normalizeNumber(left?.timestamp) ?? 0))[0] ?? null;
}

function nearbyParticipantsAtDeath({ frames, participantIndex, victimParticipantId, victimTeamId, timestampMs, position }) {
  if (!position || victimTeamId === null) {
    return null;
  }

  const frame = findFrameAtOrBefore(frames, timestampMs);
  const participantFrames = frame?.participantFrames;
  if (!participantFrames || typeof participantFrames !== "object") {
    return null;
  }

  let comparableParticipants = 0;
  const nearby = Object.values(participantFrames)
    .map((participantFrame) => {
      const participantId = normalizeNumber(participantFrame?.participantId);
      const participantPosition = normalizePosition(participantFrame?.position);
      const teamId = participantTeam(participantIndex, participantId);
      if (
        participantId === null ||
        participantId === victimParticipantId ||
        teamId === null ||
        !participantPosition
      ) {
        return null;
      }

      comparableParticipants += 1;
      const distance = Math.hypot(participantPosition.x - position.x, participantPosition.y - position.y);
      if (!Number.isFinite(distance) || distance > NEARBY_PARTICIPANT_RADIUS) {
        return null;
      }

      return {
        participantId,
        championName: championName(participantIndex, participantId),
        teamId,
        distance: Math.round(distance)
      };
    })
    .filter(Boolean);

  if (comparableParticipants === 0) {
    return null;
  }

  return {
    enemies: nearby.filter((entry) => entry.teamId !== victimTeamId),
    allies: nearby.filter((entry) => entry.teamId === victimTeamId)
  };
}

function zeroTagCounts() {
  return Object.fromEntries(TAG_IDS.map((tag) => [tag, 0]));
}

function sourceIsCurrent(evaluationTimestamp, sourceTimestamp) {
  if (!sourceTimestamp) {
    return true;
  }

  const evaluationTime = Date.parse(evaluationTimestamp ?? "");
  const sourceTime = Date.parse(sourceTimestamp ?? "");
  return Number.isFinite(evaluationTime) && Number.isFinite(sourceTime) && evaluationTime >= sourceTime;
}

function isCurrentEvaluation(evaluation, input) {
  return Boolean(evaluation) &&
    sourceIsCurrent(evaluation.sourceRawMatchUpdatedAt, input.sourceRawMatchUpdatedAt) &&
    sourceIsCurrent(evaluation.sourcePerspectiveUpdatedAt, input.sourcePerspectiveUpdatedAt);
}

function reviewSignalForTag(tag, count) {
  const label = SUMMARY_TAGS.get(tag) ?? tag.replaceAll("_", " ");
  if (count === 1 && label.endsWith("s")) {
    return `1 ${label.slice(0, -1)}`;
  }
  return `${count} ${label}`;
}

export function summarizeMatchEvaluation(evaluation) {
  if (!evaluation) {
    return null;
  }

  const counts = evaluation.tagsJson?.counts ?? evaluation.tagsJson?.deathTagCounts ?? {};
  const deathCount = Number(counts.death_count ?? evaluation.deathsJson?.length ?? 0);
  const topTags = Object.entries(counts)
    .filter(([tag, count]) => tag !== "death_count" && Number(count) > 0)
    .sort((left, right) => Number(right[1]) - Number(left[1]) || left[0].localeCompare(right[0]))
    .slice(0, 3)
    .map(([tag, count]) => ({ tag, count: Number(count) }));
  const reviewSignals = [
    `${deathCount} ${deathCount === 1 ? "death" : "deaths"}`,
    ...topTags.map(({ tag, count }) => reviewSignalForTag(tag, count))
  ];

  return {
    deathCount,
    topTags,
    reviewSignals,
    evaluatedAt: evaluation.summaryJson?.evaluatedAt ?? evaluation.updatedAt ?? null
  };
}

export function summarizeMatchEvaluationDeaths(evaluation) {
  return normalizeArray(evaluation?.deathsJson).map((death) => ({
    deathIndex: normalizeNumber(death?.deathIndex),
    timestampSeconds: normalizeNumber(death?.timestampSeconds),
    timestampMs: normalizeNumber(death?.timestampMs),
    killerChampionName: normalizeString(death?.killerChampionName),
    assistingChampionNames: normalizeArray(death?.assistingChampionNames).map(normalizeString).filter(Boolean),
    tags: normalizeArray(death?.tags).map(normalizeString).filter(Boolean),
    nearbyEnemyChampionNames: normalizeArray(death?.nearbyEnemyChampionNames).map(normalizeString).filter(Boolean),
    nearbyAllyChampionNames: normalizeArray(death?.nearbyAllyChampionNames).map(normalizeString).filter(Boolean),
    nearbyEnemyCount: normalizeNumber(death?.nearbyEnemyCount),
    nearbyAllyCount: normalizeNumber(death?.nearbyAllyCount),
    victimLevel: normalizeNumber(death?.victimLevel),
    killerLevel: normalizeNumber(death?.killerLevel),
    position: normalizePosition(death?.position)
  }));
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
    const position = normalizePosition(event?.position);
    const enemyLevelUpsBeforeDeath = enemyLevelUpsNearDeath(events, timestampMs, enemyParticipantsInvolved, participantIndex);
    const nearbyParticipants = nearbyParticipantsAtDeath({
      frames,
      participantIndex,
      victimParticipantId: participantId,
      victimTeamId,
      timestampMs,
      position
    });
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
    if (objectiveSetupNearDeath(events, timestampMs)) {
      tags.push("objective_setup_death_candidate");
    }
    if (objectiveExitNearDeath(events, timestampMs)) {
      tags.push("objective_exit_death_candidate");
    }
    if (enemyLevelUpsBeforeDeath.length > 0) {
      tags.push("enemy_level_up_recently_candidate");
      tags.push("level_up_all_in_candidate");
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
      position,
      victimLevel: findPriorLevel(frames, participantId, timestampMs),
      killerLevel: killerParticipantId === null ? null : findPriorLevel(frames, killerParticipantId, timestampMs),
      enemyParticipantsInvolved,
      enemyLevelUpsBeforeDeath,
      ...(nearbyParticipants ? {
        nearbyEnemyChampionNames: nearbyParticipants.enemies.map((entry) => entry.championName).filter(Boolean),
        nearbyAllyChampionNames: nearbyParticipants.allies.map((entry) => entry.championName).filter(Boolean),
        nearbyEnemyCount: nearbyParticipants.enemies.length,
        nearbyAllyCount: nearbyParticipants.allies.length
      } : {}),
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

export async function ensureRecentMatchEvaluations({
  puuid,
  limit = 10,
  evaluationVersion = DETERMINISTIC_MATCH_EVALUATOR_VERSION,
  repository,
  now = new Date(),
  timing
}) {
  const inputs = await (timing
    ? timing.time("match_evaluation_list_recent_inputs", () => (
        repository.listRecentPersistedPerspectivesForUser?.({ puuid, limit }) ??
        repository.listRecentPersistedMatchInputsForUser({ puuid, limit })
      ), { limit })
    : (
        repository.listRecentPersistedPerspectivesForUser?.({ puuid, limit }) ??
        repository.listRecentPersistedMatchInputsForUser({ puuid, limit })
      ));
  const matches = [];
  const summary = {
    evaluated: 0,
    cached: 0,
    skipped: 0,
    failed: 0,
    matches
  };

  for (const input of inputs) {
    const matchId = input.matchId;

    if (input.rawMatchMissing || !input.summaryJson) {
      summary.skipped += 1;
      matches.push({
        matchId,
        puuid: input.puuid,
        status: "skipped",
        reason: "missing_raw_match",
        evaluationStatus: "none",
        evaluationVersion,
        evaluationSummary: null,
        perspectiveRecord: input.perspectiveRecord
      });
      continue;
    }

    try {
      const existing = await (timing
        ? timing.time("match_evaluation_read", () => repository.getMatchEvaluation({ matchId, puuid: input.puuid, evaluationVersion }), { matchId })
        : repository.getMatchEvaluation({ matchId, puuid: input.puuid, evaluationVersion }));
      if (isCurrentEvaluation(existing, input)) {
        summary.cached += 1;
        matches.push({
          matchId,
          puuid: input.puuid,
          status: "cached",
          evaluationStatus: "current",
          evaluationVersion,
          evaluationSummary: summarizeMatchEvaluation(existing),
          perspectiveRecord: input.perspectiveRecord,
          evaluation: existing
        });
        continue;
      }

      const evaluation = await (timing
        ? timing.time("match_evaluation_ensure_backfill", () => evaluatePersistedMatch({
            matchId,
            puuid: input.puuid,
            evaluationVersion,
            repository,
            now
          }), { matchId })
        : evaluatePersistedMatch({
        matchId,
        puuid: input.puuid,
        evaluationVersion,
        repository,
        now
      }));

      summary.evaluated += 1;
      matches.push({
        matchId,
        puuid: input.puuid,
        status: existing ? "stale_recomputed" : "evaluated",
        evaluationStatus: "current",
        evaluationVersion,
        evaluationSummary: summarizeMatchEvaluation(evaluation),
        perspectiveRecord: input.perspectiveRecord,
        evaluation
      });
    } catch (error) {
      summary.failed += 1;
      matches.push({
        matchId,
        puuid: input.puuid,
        status: "failed",
        evaluationStatus: "failed",
        evaluationVersion,
        evaluationSummary: null,
        perspectiveRecord: input.perspectiveRecord,
        error: error?.message ?? "Evaluation failed."
      });
    }
  }

  return summary;
}
