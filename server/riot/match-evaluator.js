import {
  MAP_TIMER_RULES,
  MAP_TIMER_WINDOWS,
  getCampStateNearTimestamp,
  getObjectiveStateNearTimestamp
} from "./map-timers.js";

export const DETERMINISTIC_MATCH_EVALUATOR_VERSION = "deterministic-v2";

const LEVEL_UP_WINDOW_MS = 20_000;
const NEARBY_PARTICIPANT_RADIUS = 2500;
const LOCAL_FIGHT_RADIUS = 2500;
const LANE_PHASE_END_SECONDS = 14 * 60;
const MID_GAME_END_SECONDS = 25 * 60;
const TAG_IDS = [
  "death_count",
  "solo_death_candidate",
  "multi_enemy_collapse_candidate",
  "bot_lane_2v2_death",
  "bot_lane_2v1_punish",
  "bot_lane_gank",
  "bot_lane_roam",
  "top_lane_roam",
  "mid_lane_roam",
  "lane_roam_collapse",
  "bot_lane_collapse_unknown",
  "lane_gank_death",
  "outnumbered_known_enemy",
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
  ["multi_enemy_collapse_candidate", "possible multi-enemy collapse candidates"],
  ["bot_lane_2v2_death", "bot lane 2v2 deaths"],
  ["bot_lane_2v1_punish", "bot lane 2v1 punish deaths"],
  ["bot_lane_gank", "bot lane gank deaths"],
  ["bot_lane_roam", "bot lane roam deaths"],
  ["top_lane_roam", "top lane roam deaths"],
  ["mid_lane_roam", "mid lane roam deaths"],
  ["lane_roam_collapse", "lane roam/collapse deaths"],
  ["bot_lane_collapse_unknown", "bot lane collapse deaths"],
  ["lane_gank_death", "lane gank deaths"],
  ["outnumbered_known_enemy", "outnumbered deaths"],
  ["objective_window_candidate", "objective-window candidates"],
  ["objective_setup_death_candidate", "objective setup death candidates"],
  ["objective_exit_death_candidate", "objective exit death candidates"],
  ["enemy_level_up_recently_candidate", "level breakpoint candidates"],
  ["level_up_all_in_candidate", "level breakpoint candidates"],
  ["isolated_forward_death_candidate", "isolated forward death candidates"],
  ["missing_timeline", "missing timeline"],
  ["missing_participant", "missing participant"]
]);

export function getDeterministicMatchEvaluationInventory() {
  return {
    parserVersion: DETERMINISTIC_MATCH_EVALUATOR_VERSION,
    activeParsers: [
      "deterministic match evaluation",
      "death review",
      "fight participation",
      "objective setup and exit",
      "vision information",
      "lane pressure",
      "tempo conversion"
    ],
    emittedTags: [...TAG_IDS],
    phaseThresholds: {
      lanePhaseEndsAtSeconds: LANE_PHASE_END_SECONDS,
      midGameEndsAtSeconds: MID_GAME_END_SECONDS,
      note: "Game phase is derived from in-game timestamp: before 14:00 is lane phase, 14:00-24:59 is mid game, and 25:00+ is late game."
    },
    mapTimers: {
      rules: MAP_TIMER_RULES,
      windows: MAP_TIMER_WINDOWS
    }
  };
}

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

function countNoun(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
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

function teamSideFromTeamId(teamId) {
  const normalized = normalizeNumber(teamId);
  if (normalized === 100) return "blue";
  if (normalized === 200) return "red";
  return null;
}

function teamSideLabel(teamSide) {
  if (teamSide === "blue") return "You were blue side";
  if (teamSide === "red") return "You were red side";
  return null;
}

function championName(participantIndex, participantId) {
  return normalizeString(participantIndex.byId.get(participantId)?.championName);
}

function participantRole(participantIndex, participantId) {
  const participant = participantIndex.byId.get(participantId);
  return normalizeString(participant?.teamPosition ?? participant?.individualPosition ?? participant?.lane)?.toUpperCase() ?? null;
}

function participantSummary(participantIndex, participantId) {
  const participant = participantIndex.byId.get(participantId);
  if (!participant) return null;
  return {
    participantId,
    championName: championName(participantIndex, participantId),
    role: participantRole(participantIndex, participantId),
    teamId: participantTeam(participantIndex, participantId),
    teamSide: teamSideFromTeamId(participantTeam(participantIndex, participantId))
  };
}

function isBotLaneRole(role) {
  return role === "BOTTOM" || role === "UTILITY" || role === "SUPPORT";
}

function isLaneRoleFor(playerRole, enemyRole) {
  if (isBotLaneRole(playerRole)) {
    return isBotLaneRole(enemyRole);
  }
  return playerRole && enemyRole === playerRole;
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

function objectiveName(event) {
  if (event?.type === "BUILDING_KILL") {
    const buildingType = normalizeString(event?.buildingType)?.toUpperCase() ?? "";
    return buildingType.includes("INHIBITOR") ? "inhibitor" : "tower";
  }
  const monsterType = normalizeString(event?.monsterType)?.toUpperCase() ?? "";
  const monsterSubType = normalizeString(event?.monsterSubType)?.toUpperCase() ?? "";
  if (monsterType.includes("BARON")) return "Baron";
  if (monsterType.includes("DRAGON") || monsterSubType.includes("ELDER")) return monsterSubType.includes("ELDER") ? "Elder dragon" : "dragon";
  if (monsterType.includes("HORDE")) return "Voidgrubs";
  if (monsterType.includes("RIFTHERALD")) return "Rift Herald";
  return "objective";
}

function objectiveTeamLabel(event, victimTeamId) {
  const teamId = normalizeNumber(event?.killerTeamId ?? event?.teamId);
  if (teamId === null || victimTeamId === null) return null;
  return teamId === victimTeamId ? "allied" : "enemy";
}

function objectiveFactFromState(state, events, timestampMs, victimTeamId) {
  if (!state?.supported) return null;
  const event = events.find((entry) => (
    isObjectiveEvent(entry) &&
    objectiveName(entry).toLowerCase() === state.objectiveName.toLowerCase() &&
    Math.abs((normalizeNumber(entry.timestamp) ?? 0) - timestampMs) <= MAP_TIMER_WINDOWS.nearbyTimelineWindowSeconds * 1000
  ));
  return {
    name: state.objectiveName,
    eventType: event?.type ?? null,
    timestampMs: event ? normalizeNumber(event.timestamp) : null,
    secondsFromDeath: state.secondsFromDeath,
    timing: state.secondsFromDeath < 0 ? "before_death" : state.secondsFromDeath > 0 ? "after_death" : "at_death",
    reviewWindow: state.relation,
    teamId: event ? normalizeNumber(event?.killerTeamId ?? event?.teamId) : null,
    teamRelation: event ? objectiveTeamLabel(event, victimTeamId) : null,
    source: state.source,
    confidence: state.confidence
  };
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
    .filter(({ participantId, timestampMs: eventTimestampMs, level }) => (
      participantId !== null &&
      enemyIds.has(participantId) &&
      eventTimestampMs <= timestampMs &&
      timestampMs - eventTimestampMs <= LEVEL_UP_WINDOW_MS &&
      [2, 3, 6].includes(level)
    ))
    .map((event) => ({
      ...event,
      championName: championName(participantIndex, event.participantId),
      secondsBeforeDeath: Math.round((timestampMs - event.timestampMs) / 1000)
    }));
}

export function gamePhaseForTimestampSeconds(timestampSeconds) {
  const seconds = normalizeNumber(timestampSeconds) ?? 0;
  if (seconds < LANE_PHASE_END_SECONDS) return "lane_phase";
  if (seconds < MID_GAME_END_SECONDS) return "mid_game";
  return "late_game";
}

function fightShapeFromCounts(enemyCount, alliedNearbyCount) {
  const alliedCount = 1 + Math.max(0, normalizeNumber(alliedNearbyCount) ?? 0);
  const normalizedEnemyCount = Math.max(0, normalizeNumber(enemyCount) ?? 0);
  return {
    enemyCount: normalizedEnemyCount,
    alliedCount,
    notation: `${normalizedEnemyCount || "?"}v${alliedCount || "?"}`,
    label: fightShapeDisplayLabel(normalizedEnemyCount, alliedCount),
    helperText: `Fight shape: ${normalizedEnemyCount || "?"} ${normalizedEnemyCount === 1 ? "enemy" : "enemies"} vs ${alliedCount || "?"} ${alliedCount === 1 ? "ally" : "allies"}`
  };
}

function fightShapeDisplayLabel(enemyCount, alliedCount) {
  const enemy = normalizeNumber(enemyCount);
  const allied = normalizeNumber(alliedCount);
  if (enemy === null || allied === null) {
    return "Fight shape unknown";
  }
  if (enemy > allied) {
    return `Outnumbered: ${enemy} ${enemy === 1 ? "enemy" : "enemies"} vs ${allied} ${allied === 1 ? "ally" : "allies"}`;
  }
  if (enemy === allied) {
    return `Even fight: ${enemy} ${enemy === 1 ? "enemy" : "enemies"} vs ${allied} ${allied === 1 ? "ally" : "allies"}`;
  }
  return `Allied numbers advantage: ${enemy} ${enemy === 1 ? "enemy" : "enemies"} vs ${allied} ${allied === 1 ? "ally" : "allies"}`;
}

function lanePrefixForRole(role) {
  if (role === "TOP") return "top";
  if (role === "MIDDLE") return "mid";
  if (isBotLaneRole(role)) return "bot";
  return "lane";
}

function laneContextLabel(context, victimRole) {
  const lane = lanePrefixForRole(victimRole);
  const labels = {
    bot_lane_2v2_death: "2v2 lane death",
    bot_lane_2v1_punish: "2v1 bot-lane punish",
    bot_lane_gank: "Bot-lane gank",
    bot_lane_roam: "Bot-lane roam/collapse",
    top_lane_roam: "Top-lane roam/collapse",
    mid_lane_roam: "Mid-lane roam/collapse",
    lane_roam_collapse: `${lane === "lane" ? "Lane" : `${lane[0].toUpperCase()}${lane.slice(1)}-lane`} roam/collapse`,
    lane_gank_death: `${lane === "lane" ? "Lane" : `${lane[0].toUpperCase()}${lane.slice(1)}-lane`} gank`,
    bot_lane_collapse_unknown: "Bot-lane collapse"
  };
  return labels[context] ?? null;
}

function classifyLaneDeathContext({ victimRole, gamePhase, enemyParticipantsInvolved, nearbyParticipants, participantIndex }) {
  if (gamePhase !== "lane_phase") return null;
  const roles = enemyParticipantsInvolved.map((id) => participantRole(participantIndex, id)).filter(Boolean);
  const enemyCount = enemyParticipantsInvolved.length;
  const alliedNearbyCount = nearbyParticipants?.allies?.length ?? 0;
  const laneRoles = roles.filter((role) => isLaneRoleFor(victimRole, role));
  const nonLaneRoles = roles.filter((role) => !isLaneRoleFor(victimRole, role));
  const enemyJunglerInvolved = roles.includes("JUNGLE");
  const roamRoles = nonLaneRoles.filter((role) => role !== "JUNGLE");
  const roamRoleInvolved = roamRoles.length > 0;

  if (isBotLaneRole(victimRole)) {
    const lanePairInvolved = roles.includes("BOTTOM") && (roles.includes("UTILITY") || roles.includes("SUPPORT"));
    if (enemyJunglerInvolved && laneRoles.length > 0) return "bot_lane_gank";
    if (roamRoleInvolved && laneRoles.length > 0) return "bot_lane_roam";
    if (enemyCount === 2 && lanePairInvolved && alliedNearbyCount > 0) return "bot_lane_2v2_death";
    if (enemyCount === 2 && lanePairInvolved && alliedNearbyCount === 0) return "bot_lane_2v1_punish";
    if (enemyCount >= 3) return "bot_lane_collapse_unknown";
    return null;
  }

  if ((victimRole === "TOP" || victimRole === "MIDDLE") && enemyJunglerInvolved && laneRoles.length > 0) {
    return "lane_gank_death";
  }

  if ((victimRole === "TOP" || victimRole === "MIDDLE") && roamRoleInvolved && laneRoles.length > 0) {
    return victimRole === "TOP" ? "top_lane_roam" : "mid_lane_roam";
  }

  if (enemyCount > 1 && roamRoleInvolved) {
    return "lane_roam_collapse";
  }

  return null;
}

function positionDistance(left, right) {
  const leftPosition = normalizePosition(left);
  const rightPosition = normalizePosition(right);
  if (!leftPosition || !rightPosition) return null;
  const distance = Math.hypot(leftPosition.x - rightPosition.x, leftPosition.y - rightPosition.y);
  return Number.isFinite(distance) ? distance : null;
}

function killParticipantIds(event) {
  return new Set([
    normalizeNumber(event?.victimId),
    normalizeNumber(event?.killerId),
    ...normalizeArray(event?.assistingParticipantIds).map(normalizeNumber)
  ].filter((value) => value !== null));
}

function hasParticipantOverlap(left, right) {
  const leftIds = killParticipantIds(left);
  for (const id of killParticipantIds(right)) {
    if (leftIds.has(id)) return true;
  }
  return false;
}

function isSameLocalFight(reviewedEvent, candidateEvent) {
  if (reviewedEvent === candidateEvent) return true;
  const deltaMs = Math.abs((normalizeNumber(candidateEvent.timestamp) ?? 0) - (normalizeNumber(reviewedEvent.timestamp) ?? 0));
  if (deltaMs > 30_000) return false;
  const distance = positionDistance(reviewedEvent.position, candidateEvent.position);
  if (distance !== null) return distance <= LOCAL_FIGHT_RADIUS;
  return hasParticipantOverlap(reviewedEvent, candidateEvent) && deltaMs <= 15_000;
}

function outcomeLabel({ alliedDeathCount, enemyDeathCount, totalDeaths, deathOrder, deathsBeforeReviewed }) {
  if (totalDeaths >= 6) return "teamfight_death";
  if (deathOrder === "last" && deathsBeforeReviewed >= 3) return "stagger_death";
  if (enemyDeathCount > alliedDeathCount) return "won_fight_but_died";
  if (alliedDeathCount > enemyDeathCount && alliedDeathCount >= 2) return "lost_skirmish";
  if (alliedDeathCount === enemyDeathCount && totalDeaths >= 2) return "even_trade";
  return "pick_death";
}

function buildOutcomeContextFromKills({ kills, participantIndex, victimParticipantId, victimTeamId, scope }) {
  const alliedDeaths = kills.filter((event) => participantTeam(participantIndex, normalizeNumber(event.victimId)) === victimTeamId);
  const enemyDeaths = kills.filter((event) => {
    const teamId = participantTeam(participantIndex, normalizeNumber(event.victimId));
    return teamId !== null && victimTeamId !== null && teamId !== victimTeamId;
  });
  const reviewedIndex = kills.findIndex((event) => normalizeNumber(event.victimId) === victimParticipantId);
  const totalDeaths = kills.length;
  const alliedDeathCount = alliedDeaths.length;
  const enemyDeathCount = enemyDeaths.length;
  const deathOrder = reviewedIndex <= 0 ? "first" : reviewedIndex === totalDeaths - 1 ? "last" : "middle";
  const deathsBeforeReviewed = Math.max(0, reviewedIndex);
  const teamResult = enemyDeathCount > alliedDeathCount
    ? "won_by_death_count"
    : alliedDeathCount > enemyDeathCount
      ? "lost_by_death_count"
      : "traded_even";
  const label = outcomeLabel({ alliedDeathCount, enemyDeathCount, totalDeaths, deathOrder, deathsBeforeReviewed });
  const durationSeconds = totalDeaths > 1 ? Math.round((kills[totalDeaths - 1].timestamp - kills[0].timestamp) / 1000) : 0;

  return {
    scope,
    label,
    alliedDeaths: alliedDeathCount,
    enemyDeaths: enemyDeathCount,
    totalDeaths,
    playerDeathOrder: deathOrder,
    teamResult,
    durationSeconds,
    deathEventIds: kills.map((event) => `event-${event.__index}`)
  };
}

function buildLocalFightOutcomeContext({ events, timestampMs, participantIndex, victimParticipantId, victimTeamId }) {
  const windowStart = timestampMs - 15_000;
  const windowEnd = timestampMs + 30_000;
  const reviewedEvent = events.find((event) => (
    event?.type === "CHAMPION_KILL" &&
    normalizeNumber(event.victimId) === victimParticipantId &&
    event.timestamp === timestampMs
  ));
  const windowKills = events
    .filter((event) => event?.type === "CHAMPION_KILL" && event.timestamp >= windowStart && event.timestamp <= windowEnd)
    .sort((left, right) => left.timestamp - right.timestamp || left.__index - right.__index);
  const kills = reviewedEvent
    ? windowKills.filter((event) => isSameLocalFight(reviewedEvent, event))
    : windowKills.filter((event) => normalizeNumber(event.victimId) === victimParticipantId && event.timestamp === timestampMs);

  return buildOutcomeContextFromKills({
    kills,
    participantIndex,
    victimParticipantId,
    victimTeamId,
    scope: "local_fight"
  });
}

function buildNearbyDeathWindowContext({ events, timestampMs, participantIndex, victimParticipantId, victimTeamId, localFightOutcomeContext }) {
  const windowStart = timestampMs - 15_000;
  const windowEnd = timestampMs + 30_000;
  const localIds = new Set(localFightOutcomeContext?.deathEventIds ?? []);
  const kills = events
    .filter((event) => event?.type === "CHAMPION_KILL" && event.timestamp >= windowStart && event.timestamp <= windowEnd)
    .filter((event) => !localIds.has(`event-${event.__index}`))
    .sort((left, right) => left.timestamp - right.timestamp || left.__index - right.__index);
  const context = buildOutcomeContextFromKills({ kills, participantIndex, victimParticipantId, victimTeamId, scope: "nearby_timeline" });
  return {
    ...context,
    locality: "unclear"
  };
}

function fightOutcomeFact(context) {
  if (!context) return "";
  const alliedDeaths = normalizeNumber(context.alliedDeaths) ?? 0;
  const enemyDeaths = normalizeNumber(context.enemyDeaths) ?? 0;
  const totalDeaths = normalizeNumber(context.totalDeaths) ?? 0;
  if (totalDeaths <= 0) return "";
  const counts = `${countNoun(alliedDeaths, "allied death")}, ${countNoun(enemyDeaths, "enemy death")}`;
  if (context.label === "pick_death") return enemyDeaths > 0 ? `Outcome: pick — ${counts}` : "";
  if (context.label === "lost_skirmish") return `Outcome: lost local fight — ${counts}`;
  if (context.label === "even_trade") return `Outcome: local trade — ${counts}`;
  if (context.label === "won_fight_but_died") return `Outcome: won local fight but died — ${counts}`;
  if (context.label === "teamfight_death") return `Outcome: local teamfight — ${countNoun(totalDeaths, "total death")}`;
  if (context.label === "stagger_death") return `Outcome: stagger — ${counts}`;
  return `Outcome: ${counts}`;
}

function isMeaningfulMultiEnemyDeath({ enemyParticipantsInvolved, nearbyParticipants, participantIndex, victimParticipantId }) {
  const nearbyEnemyCount = nearbyParticipants?.enemies?.length ?? 0;
  if (enemyParticipantsInvolved.length >= 3 || nearbyEnemyCount >= 3) {
    return true;
  }

  if (enemyParticipantsInvolved.length < 2) {
    return false;
  }

  const victimRole = participantRole(participantIndex, victimParticipantId);
  const involvedRoles = enemyParticipantsInvolved.map((id) => participantRole(participantIndex, id));
  if (isBotLaneRole(victimRole) && involvedRoles.every(isBotLaneRole)) {
    return false;
  }

  return true;
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
    enemyParticipants: normalizeArray(death?.enemyParticipants).map((entry) => ({
      participantId: normalizeNumber(entry?.participantId),
      championName: normalizeString(entry?.championName),
      role: normalizeString(entry?.role),
      teamId: normalizeNumber(entry?.teamId),
      teamSide: normalizeString(entry?.teamSide)
    })),
    alliedParticipantsNearby: normalizeArray(death?.alliedParticipantsNearby).map((entry) => ({
      participantId: normalizeNumber(entry?.participantId),
      championName: normalizeString(entry?.championName),
      role: normalizeString(entry?.role),
      teamId: normalizeNumber(entry?.teamId),
      teamSide: normalizeString(entry?.teamSide),
      distance: normalizeNumber(entry?.distance)
    })),
    fightShape: death?.fightShape ? {
      enemyCount: normalizeNumber(death.fightShape.enemyCount),
      alliedCount: normalizeNumber(death.fightShape.alliedCount),
      notation: normalizeString(death.fightShape.notation),
      label: normalizeString(death.fightShape.label),
      helperText: normalizeString(death.fightShape.helperText)
    } : null,
    laneDeathContext: normalizeString(death?.laneDeathContext),
    laneDeathContextLabel: normalizeString(death?.laneDeathContextLabel),
    fightOutcomeContext: death?.fightOutcomeContext ? {
      scope: normalizeString(death.fightOutcomeContext.scope),
      label: normalizeString(death.fightOutcomeContext.label),
      alliedDeaths: normalizeNumber(death.fightOutcomeContext.alliedDeaths),
      enemyDeaths: normalizeNumber(death.fightOutcomeContext.enemyDeaths),
      totalDeaths: normalizeNumber(death.fightOutcomeContext.totalDeaths),
      playerDeathOrder: normalizeString(death.fightOutcomeContext.playerDeathOrder),
      teamResult: normalizeString(death.fightOutcomeContext.teamResult),
      durationSeconds: normalizeNumber(death.fightOutcomeContext.durationSeconds)
    } : null,
    localFightOutcomeContext: death?.localFightOutcomeContext ? {
      scope: normalizeString(death.localFightOutcomeContext.scope),
      label: normalizeString(death.localFightOutcomeContext.label),
      alliedDeaths: normalizeNumber(death.localFightOutcomeContext.alliedDeaths),
      enemyDeaths: normalizeNumber(death.localFightOutcomeContext.enemyDeaths),
      totalDeaths: normalizeNumber(death.localFightOutcomeContext.totalDeaths),
      playerDeathOrder: normalizeString(death.localFightOutcomeContext.playerDeathOrder),
      teamResult: normalizeString(death.localFightOutcomeContext.teamResult),
      durationSeconds: normalizeNumber(death.localFightOutcomeContext.durationSeconds)
    } : null,
    nearbyDeathWindowContext: death?.nearbyDeathWindowContext ? {
      scope: normalizeString(death.nearbyDeathWindowContext.scope),
      label: normalizeString(death.nearbyDeathWindowContext.label),
      alliedDeaths: normalizeNumber(death.nearbyDeathWindowContext.alliedDeaths),
      enemyDeaths: normalizeNumber(death.nearbyDeathWindowContext.enemyDeaths),
      totalDeaths: normalizeNumber(death.nearbyDeathWindowContext.totalDeaths),
      locality: normalizeString(death.nearbyDeathWindowContext.locality),
      durationSeconds: normalizeNumber(death.nearbyDeathWindowContext.durationSeconds)
    } : null,
    gamePhase: normalizeString(death?.gamePhase),
    gamePhaseLabel: normalizeString(death?.gamePhaseLabel),
    evidenceSections: death?.evidenceSections ? {
      knownFromData: normalizeArray(death.evidenceSections.knownFromData).map(normalizeString).filter(Boolean),
      replayCanAnswer: normalizeArray(death.evidenceSections.replayCanAnswer).map(normalizeString).filter(Boolean)
    } : null,
    objectiveFacts: normalizeArray(death?.objectiveFacts).map((entry) => ({
      name: normalizeString(entry?.name),
      eventType: normalizeString(entry?.eventType),
      timestampMs: normalizeNumber(entry?.timestampMs),
      secondsFromDeath: normalizeNumber(entry?.secondsFromDeath),
      timing: normalizeString(entry?.timing),
      reviewWindow: normalizeString(entry?.reviewWindow),
      teamId: normalizeNumber(entry?.teamId),
      teamRelation: normalizeString(entry?.teamRelation),
      source: normalizeString(entry?.source),
      confidence: normalizeString(entry?.confidence)
    })),
    objectiveState: death?.objectiveState ? {
      supported: Boolean(death.objectiveState.supported),
      objectiveName: normalizeString(death.objectiveState.objectiveName),
      relation: normalizeString(death.objectiveState.relation),
      secondsFromDeath: normalizeNumber(death.objectiveState.secondsFromDeath),
      confidence: normalizeString(death.objectiveState.confidence),
      source: normalizeString(death.objectiveState.source)
    } : null,
    campState: death?.campState ? {
      supported: Boolean(death.campState.supported),
      campName: normalizeString(death.campState.campName),
      relation: normalizeString(death.campState.relation),
      secondsFromDeath: normalizeNumber(death.campState.secondsFromDeath),
      confidence: normalizeString(death.campState.confidence),
      source: normalizeString(death.campState.source)
    } : null,
    enemyLevelUpsBeforeDeath: normalizeArray(death?.enemyLevelUpsBeforeDeath).map((event) => ({
      participantId: normalizeNumber(event?.participantId),
      timestampMs: normalizeNumber(event?.timestampMs),
      level: normalizeNumber(event?.level),
      championName: normalizeString(event?.championName),
      secondsBeforeDeath: normalizeNumber(event?.secondsBeforeDeath)
    })),
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
  const teamSide = teamSideFromTeamId(victimTeamId);
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
    const gamePhase = gamePhaseForTimestampSeconds(Math.floor(timestampMs / 1000));
    const victimRole = participantRole(participantIndex, participantId);
    const fightShape = fightShapeFromCounts(
      Math.max(enemyParticipantsInvolved.length, nearbyParticipants?.enemies?.length ?? 0),
      nearbyParticipants?.allies?.length ?? 0
    );
    const laneDeathContext = classifyLaneDeathContext({
      victimRole,
      gamePhase,
      enemyParticipantsInvolved,
      nearbyParticipants,
      participantIndex
    });
    const laneDeathContextLabel = laneContextLabel(laneDeathContext, victimRole);
    const localFightOutcomeContext = buildLocalFightOutcomeContext({
      events,
      timestampMs,
      participantIndex,
      victimParticipantId: participantId,
      victimTeamId
    });
    const nearbyDeathWindowContext = buildNearbyDeathWindowContext({
      events,
      timestampMs,
      participantIndex,
      victimParticipantId: participantId,
      victimTeamId,
      localFightOutcomeContext
    });
    const fightOutcomeContext = localFightOutcomeContext;
    const objectiveState = getObjectiveStateNearTimestamp(events, timestampMs);
    const objectiveFact = objectiveFactFromState(objectiveState, events, timestampMs, victimTeamId);
    const objectiveFacts = objectiveFact ? [objectiveFact] : [];
    const campState = getCampStateNearTimestamp(events, timestampMs, { position, role: victimRole });
    const tags = [];

    if (enemyParticipantsInvolved.length === 1) {
      tags.push("solo_death_candidate");
    }
    if (!laneDeathContext && isMeaningfulMultiEnemyDeath({ enemyParticipantsInvolved, nearbyParticipants, participantIndex, victimParticipantId: participantId })) {
      tags.push("multi_enemy_collapse_candidate");
    }
    if (laneDeathContext) {
      tags.push(laneDeathContext);
    }
    if (objectiveState.supported) {
      tags.push("objective_window_candidate");
    }
    if (objectiveState.supported && objectiveState.relation === "setup") {
      tags.push("objective_setup_death_candidate");
    }
    if (objectiveState.supported && objectiveState.relation === "exit") {
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
      victimRole,
      killerParticipantId,
      killerChampionName: killerParticipantId === null ? null : championName(participantIndex, killerParticipantId),
      assistingParticipantIds,
      assistingChampionNames: assistingParticipantIds.map((id) => championName(participantIndex, id)).filter(Boolean),
      position,
      victimLevel: findPriorLevel(frames, participantId, timestampMs),
      killerLevel: killerParticipantId === null ? null : findPriorLevel(frames, killerParticipantId, timestampMs),
      enemyParticipantsInvolved,
      enemyParticipants: enemyParticipantsInvolved.map((id) => participantSummary(participantIndex, id)).filter(Boolean),
      enemyLevelUpsBeforeDeath,
      fightShape,
      laneDeathContext,
      laneDeathContextLabel,
      fightOutcomeContext,
      localFightOutcomeContext,
      nearbyDeathWindowContext,
      gamePhase,
      gamePhaseLabel: gamePhase === "lane_phase" ? "Lane phase" : gamePhase === "mid_game" ? "Mid game" : "Late game",
      objectiveState,
      objectiveFacts,
      campState,
      evidenceSections: {
        knownFromData: [
          killerParticipantId === null ? null : `Killed by ${championName(participantIndex, killerParticipantId) ?? `participant ${killerParticipantId}`}`,
          assistingParticipantIds.length > 0 ? `Assisted by ${assistingParticipantIds.map((id) => championName(participantIndex, id) ?? `participant ${id}`).join(", ")}` : "No assists recorded",
          fightShape.helperText,
          fightOutcomeFact(localFightOutcomeContext),
          nearbyDeathWindowContext.totalDeaths > 0 ? `Nearby timeline: ${countNoun(nearbyDeathWindowContext.totalDeaths, "other death")} happened within 30s; not enough position data to confirm same fight.` : null,
          gamePhase === "lane_phase" ? "Phase: Lane phase" : `Phase: ${gamePhase === "mid_game" ? "Mid game" : "Late game"}`,
          objectiveFacts.length > 0 ? objectiveFacts.map((fact) => {
            const seconds = normalizeNumber(fact.secondsFromDeath) ?? 0;
            const name = fact.name ?? "Objective";
            if (fact.source === "timeline_event" && fact.teamRelation) {
              const timing = seconds < 0 ? `${Math.abs(seconds)}s before this death` : seconds > 0 ? `${seconds}s after this death` : "at this death";
              return `${fact.teamRelation === "enemy" ? "Enemy team" : "Allied team"} took ${name} ${timing}`;
            }
            if (seconds > 0) return `${name} spawned ${seconds}s after this death`;
            if (seconds < 0) return `${name} spawned ${Math.abs(seconds)}s before this death`;
            return `${name} timing was active at this death`;
          }).join("; ") : null,
          campState.supported ? `${campState.campName} ${campState.secondsFromDeath > 0 ? `spawning in ${campState.secondsFromDeath}s` : campState.secondsFromDeath < 0 ? `spawned ${Math.abs(campState.secondsFromDeath)}s before this death` : "timing was active at this death"}` : null
        ].filter(Boolean),
        replayCanAnswer: [
          laneDeathContext === "lane_gank_death" || laneDeathContext === "bot_lane_gank" ? "Was the gank path warded?" : null,
          laneDeathContext === "lane_gank_death" || laneDeathContext === "bot_lane_gank" ? "Did the enemy jungle show early enough to back off?" : null,
          laneDeathContext === "lane_gank_death" || laneDeathContext === "bot_lane_gank" ? "Were you already committed before the jungler arrived?" : null,
          laneDeathContext?.includes("roam") ? "Was the roam visible before the engage?" : null,
          objectiveState.supported && objectiveState.objectiveName === "Dragon" && objectiveState.relation === "setup" ? "Were you setting up bot river before dragon spawn, or was this just a lane fight?" : null,
          objectiveState.supported && objectiveState.relation === "contest" ? `Was the ${objectiveState.objectiveName} contest correct?` : null,
          objectiveState.supported && objectiveState.relation === "exit" ? `Was the ${objectiveState.objectiveName} fight already over when you stayed or walked forward?` : null,
          campState.supported && campState.campName === "Scuttle" ? "Was this river fight connected to first Scuttle spawn?" : null,
          campState.supported && campState.campName !== "Scuttle" ? "Was the enemy jungler pathing from a known camp timer?" : null
        ].filter(Boolean)
      },
      ...(nearbyParticipants ? {
        nearbyEnemyChampionNames: nearbyParticipants.enemies.map((entry) => entry.championName).filter(Boolean),
        nearbyAllyChampionNames: nearbyParticipants.allies.map((entry) => entry.championName).filter(Boolean),
        alliedParticipantsNearby: nearbyParticipants.allies.map((entry) => ({
          ...participantSummary(participantIndex, entry.participantId),
          distance: entry.distance
        })).filter(Boolean),
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
      teamSide,
      teamSideLabel: teamSideLabel(teamSide),
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
