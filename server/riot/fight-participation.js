const PARSER_VERSION = "fight-participation-0";
const DEFAULT_CLUSTER_WINDOW_MS = 15_000;
const DEFAULT_PRESENT_DISTANCE = 2_500;
const DEFAULT_ABSENT_DISTANCE = 4_000;
const DEFAULT_ISOLATED_DISTANCE = 3_500;
const DEFAULT_LATE_GRACE_MS = 5_000;

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

function distance(a, b) {
  if (!a || !b) {
    return null;
  }

  return Number(Math.hypot(a.x - b.x, a.y - b.y).toFixed(1));
}

function center(positions) {
  const valid = positions.filter(Boolean);
  if (valid.length === 0) {
    return null;
  }

  return {
    x: Number((valid.reduce((sum, position) => sum + position.x, 0) / valid.length).toFixed(1)),
    y: Number((valid.reduce((sum, position) => sum + position.y, 0) / valid.length).toFixed(1))
  };
}

function nearestFrame(matchTimeline, timestamp) {
  return normalizeArray(matchTimeline?.info?.frames)
    .map((frame) => ({
      frame,
      timestamp: normalizeNumber(frame?.timestamp),
      delta: Math.abs((normalizeNumber(frame?.timestamp) ?? 0) - timestamp)
    }))
    .filter((entry) => entry.timestamp !== null)
    .sort((a, b) => a.delta - b.delta || a.timestamp - b.timestamp)[0]?.frame ?? null;
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
    currentHealth: normalizeNumber(participantFrame?.championStats?.currentHealth ?? participantFrame?.currentHealth),
    maxHealth: normalizeNumber(participantFrame?.championStats?.maxHealth ?? participantFrame?.maxHealth)
  };
}

function eventSummary(event, participantIndex, playerTeamId) {
  const killerId = normalizeNumber(event.killerId);
  const victimId = normalizeNumber(event.victimId);
  const killerTeamId = participantTeam(participantIndex, killerId);
  const victimTeamId = participantTeam(participantIndex, victimId);

  return {
    eventId: event.__eventId,
    type: event.type,
    timestamp: event.timestamp,
    killerId,
    victimId,
    assistingParticipantIds: normalizeArray(event.assistingParticipantIds).map(normalizeNumber).filter(Boolean),
    killerTeamId,
    victimTeamId,
    killingTeamSide: killerTeamId === playerTeamId ? "player" : "enemy",
    victimTeamSide: victimTeamId === playerTeamId ? "player" : "enemy",
    position: normalizePosition(event.position)
  };
}

function damageAmount(entry) {
  return [
    entry?.basic,
    entry?.magicDamage,
    entry?.physicalDamage,
    entry?.trueDamage
  ].reduce((sum, value) => sum + (normalizeNumber(value) ?? 0), 0);
}

function playerDamageForDeath(event, participantId) {
  if (normalizeNumber(event.victimId) === participantId) {
    return normalizeArray(event.victimDamageDealt).reduce((sum, entry) => sum + damageAmount(entry), 0);
  }

  return normalizeArray(event.victimDamageReceived)
    .filter((entry) => normalizeNumber(entry?.participantId) === participantId)
    .reduce((sum, entry) => sum + damageAmount(entry), 0);
}

function playerDamageReceivedForDeath(event, participantId) {
  if (normalizeNumber(event.victimId) !== participantId) {
    return 0;
  }

  return normalizeArray(event.victimDamageReceived).reduce((sum, entry) => sum + damageAmount(entry), 0);
}

function clusterChampionKills(events, windowMs) {
  const kills = events.filter((event) => event.type === "CHAMPION_KILL");
  const clusters = [];

  for (const kill of kills) {
    const current = clusters[clusters.length - 1];
    const previous = current?.[current.length - 1] ?? null;

    if (previous && kill.timestamp - previous.timestamp <= windowMs) {
      current.push(kill);
    } else {
      clusters.push([kill]);
    }
  }

  return clusters.filter((cluster) => cluster.length >= 2);
}

function countByTeam(events, participantIndex, key) {
  return events.reduce((counts, event) => {
    const teamId = participantTeam(participantIndex, normalizeNumber(event[key]));
    if (teamId) {
      counts[String(teamId)] = (counts[String(teamId)] ?? 0) + 1;
    }
    return counts;
  }, {});
}

function participantIdsInFight(events) {
  return [...new Set(events.flatMap((event) => [
    normalizeNumber(event.killerId),
    normalizeNumber(event.victimId),
    ...normalizeArray(event.assistingParticipantIds).map(normalizeNumber)
  ]).filter(Boolean))];
}

function playerParticipated(event, participantId) {
  return normalizeNumber(event.killerId) === participantId ||
    normalizeArray(event.assistingParticipantIds).map(normalizeNumber).includes(participantId);
}

function buildPositionFacts({ matchTimeline, cluster, participantId, participantIndex, playerTeamId }) {
  const start = cluster[0].timestamp;
  const end = cluster[cluster.length - 1].timestamp;
  const mid = start + ((end - start) / 2);
  const startFrame = nearestFrame(matchTimeline, start);
  const endFrame = nearestFrame(matchTimeline, end);
  const nearestFightFrame = nearestFrame(matchTimeline, mid);
  const fightParticipantIds = participantIdsInFight(cluster);
  const fightFramePositions = fightParticipantIds
    .map((id) => participantFrameSummary(nearestFightFrame, id, participantIndex, playerTeamId)?.position)
    .filter(Boolean);
  const fightEventPositions = cluster.map((event) => normalizePosition(event.position)).filter(Boolean);
  const fightCenter = center(fightFramePositions.length > 0 ? fightFramePositions : fightEventPositions);
  const playerNearestFrame = participantFrameSummary(nearestFightFrame, participantId, participantIndex, playerTeamId);
  const playerStartFrame = participantFrameSummary(startFrame, participantId, participantIndex, playerTeamId);
  const playerEndFrame = participantFrameSummary(endFrame, participantId, participantIndex, playerTeamId);
  const allyPositions = [...participantIndex.keys()]
    .filter((id) => id !== participantId && participantTeam(participantIndex, id) === playerTeamId)
    .map((id) => participantFrameSummary(nearestFightFrame, id, participantIndex, playerTeamId)?.position)
    .filter(Boolean);
  const allyCenter = center(allyPositions);
  const nearestAllyDistance = allyPositions
    .map((position) => distance(playerNearestFrame?.position, position))
    .filter((value) => value !== null)
    .sort((a, b) => a - b)[0] ?? null;

  return {
    playerPositionAtStart: playerStartFrame,
    playerPositionAtEnd: playerEndFrame,
    nearestFrameTimestamp: normalizeNumber(nearestFightFrame?.timestamp),
    fightCenter,
    playerDistanceFromFightCenter: distance(playerNearestFrame?.position, fightCenter),
    allyCenterAtNearestFrame: allyCenter,
    playerDistanceFromAllyCenter: distance(playerNearestFrame?.position, allyCenter),
    nearestAllyDistance
  };
}

function pushTag(tags, id, confidence, params = {}) {
  if (!tags.some((tag) => tag.id === id)) {
    tags.push({ id, confidence, params });
  }
}

function buildTags({
  cluster,
  participantId,
  playerTeamId,
  killsByTeam,
  deathsByTeam,
  playerKillOrAssistEvents,
  playerDeathEvents,
  priorPlayerDeaths,
  positionFacts,
  playerDamage,
  thresholds
}) {
  const tags = [];
  const participated = playerKillOrAssistEvents.length > 0;
  const playerDied = playerDeathEvents.length > 0;
  const firstParticipation = [...playerKillOrAssistEvents, ...playerDeathEvents]
    .map((event) => event.timestamp)
    .sort((a, b) => a - b)[0] ?? null;
  const playerTeamKills = killsByTeam[String(playerTeamId)] ?? 0;
  const playerTeamDeaths = deathsByTeam[String(playerTeamId)] ?? 0;
  const enemyDeaths = Object.entries(deathsByTeam)
    .filter(([teamId]) => Number(teamId) !== playerTeamId)
    .reduce((sum, [, count]) => sum + count, 0);

  if (participated || playerDied || (positionFacts.playerDistanceFromFightCenter !== null && positionFacts.playerDistanceFromFightCenter <= thresholds.presentDistance)) {
    pushTag(tags, "present_for_fight", 0.85, {
      playerKillOrAssistEventIds: playerKillOrAssistEvents.map((event) => event.__eventId),
      playerDeathEventIds: playerDeathEvents.map((event) => event.__eventId),
      distanceFromFightCenter: positionFacts.playerDistanceFromFightCenter
    });
  } else if (positionFacts.playerDistanceFromFightCenter !== null && positionFacts.playerDistanceFromFightCenter >= thresholds.absentDistance) {
    pushTag(tags, "absent_from_fight", 0.85, { distanceFromFightCenter: positionFacts.playerDistanceFromFightCenter });
  }

  if (firstParticipation !== null && firstParticipation - cluster[0].timestamp > thresholds.lateGraceMs) {
    pushTag(tags, "late_to_fight", 0.75, {
      firstParticipationTimestamp: firstParticipation,
      fightStart: cluster[0].timestamp
    });
  }

  if (priorPlayerDeaths.length > 0 || (playerDeathEvents[0] === cluster[0] && !participated && cluster.length > 1)) {
    pushTag(tags, "died_before_fight", 0.9, {
      deathEventIds: priorPlayerDeaths.length > 0
        ? priorPlayerDeaths.map((event) => event.__eventId)
        : playerDeathEvents.map((event) => event.__eventId)
    });
  }

  if (participated && firstParticipation === cluster[cluster.length - 1].timestamp && playerTeamKills > 0 && playerTeamDeaths === 0) {
    pushTag(tags, "cleaned_up_after_fight", 0.75, {
      playerParticipationEventIds: playerKillOrAssistEvents.map((event) => event.__eventId)
    });
  }

  if (playerDied && playerTeamDeaths > enemyDeaths && playerDamage.totalDealt >= 800) {
    pushTag(tags, "high_damage_losing_fight", 0.8, {
      playerDamageDealt: playerDamage.totalDealt,
      playerTeamDeaths,
      enemyDeaths
    });
  }

  if (playerDied && playerDamage.totalReceived > 0 && (playerDamage.totalDealt < 150 || playerDamage.totalDealt / playerDamage.totalReceived <= 0.2)) {
    pushTag(tags, "low_damage_death", 0.85, {
      playerDamageDealt: playerDamage.totalDealt,
      playerDamageReceived: playerDamage.totalReceived
    });
  }

  if (participated && playerTeamKills > 0 && enemyDeaths > 0 && positionFacts.playerPositionAtStart?.position && positionFacts.playerPositionAtEnd?.position) {
    pushTag(tags, "front_to_back_participation_possible", 0.65, {
      playerKillOrAssistEventIds: playerKillOrAssistEvents.map((event) => event.__eventId)
    });
  }

  if (
    positionFacts.playerDistanceFromAllyCenter !== null &&
    positionFacts.playerDistanceFromAllyCenter >= thresholds.isolatedDistance &&
    (positionFacts.nearestAllyDistance === null || positionFacts.nearestAllyDistance >= thresholds.presentDistance)
  ) {
    pushTag(tags, "isolated_from_team", 0.8, {
      distanceFromAllyCenter: positionFacts.playerDistanceFromAllyCenter,
      nearestAllyDistance: positionFacts.nearestAllyDistance
    });
  }

  return tags;
}

/**
 * Emits deterministic fight_participation evidence for clustered champion kills.
 */
export function parseFightParticipationEvidence({
  matchSummary,
  matchTimeline,
  perspective,
  parsedAt = new Date().toISOString(),
  clusterWindowMs = DEFAULT_CLUSTER_WINDOW_MS,
  presentDistance = DEFAULT_PRESENT_DISTANCE,
  absentDistance = DEFAULT_ABSENT_DISTANCE,
  isolatedDistance = DEFAULT_ISOLATED_DISTANCE,
  lateGraceMs = DEFAULT_LATE_GRACE_MS
}) {
  const participantId = normalizeNumber(perspective?.participantId);
  const puuid = normalizeString(perspective?.puuid);
  const matchId = normalizeString(perspective?.matchId) ?? normalizeString(matchSummary?.metadata?.matchId);
  const participantIndex = buildParticipantIndex(matchSummary);
  const playerTeamId = normalizeNumber(perspective?.teamId) ?? participantTeam(participantIndex, participantId);
  const windowMs = Number.isFinite(clusterWindowMs) && clusterWindowMs > 0 ? clusterWindowMs : DEFAULT_CLUSTER_WINDOW_MS;

  if (!participantId || !puuid || !matchId || !playerTeamId || !matchTimeline?.info?.frames) {
    return [];
  }

  const events = flattenTimelineEvents(matchTimeline);
  const clusters = clusterChampionKills(events, windowMs);

  return clusters.map((cluster, clusterIndex) => {
    const start = cluster[0].timestamp;
    const end = cluster[cluster.length - 1].timestamp;
    const playerKillOrAssistEvents = cluster.filter((event) => playerParticipated(event, participantId));
    const playerDeathEvents = cluster.filter((event) => normalizeNumber(event.victimId) === participantId);
    const priorPlayerDeaths = events.filter((event) =>
      event.type === "CHAMPION_KILL" &&
      normalizeNumber(event.victimId) === participantId &&
      event.timestamp < start &&
      event.timestamp >= start - windowMs
    );
    const killsByTeam = countByTeam(cluster, participantIndex, "killerId");
    const deathsByTeam = countByTeam(cluster, participantIndex, "victimId");
    const positionFacts = buildPositionFacts({ matchTimeline, cluster, participantId, participantIndex, playerTeamId });
    const playerDamageByDeathEvent = cluster
      .map((event) => ({
        eventId: event.__eventId,
        timestamp: event.timestamp,
        playerDamageDealt: playerDamageForDeath(event, participantId),
        playerDamageReceived: playerDamageReceivedForDeath(event, participantId)
      }))
      .filter((entry) => entry.playerDamageDealt > 0 || entry.playerDamageReceived > 0);
    const playerDamage = {
      totalDealt: playerDamageByDeathEvent.reduce((sum, event) => sum + event.playerDamageDealt, 0),
      totalReceived: playerDamageByDeathEvent.reduce((sum, event) => sum + event.playerDamageReceived, 0),
      byDeathEvent: playerDamageByDeathEvent
    };
    const tags = buildTags({
      cluster,
      participantId,
      playerTeamId,
      killsByTeam,
      deathsByTeam,
      playerKillOrAssistEvents,
      playerDeathEvents,
      priorPlayerDeaths,
      positionFacts,
      playerDamage,
      thresholds: { presentDistance, absentDistance, isolatedDistance, lateGraceMs }
    });

    return {
      id: `${matchId}:${puuid}:fight_participation:${start}:${clusterIndex}`,
      matchId,
      puuid,
      participantId,
      championName: normalizeString(perspective?.championName) ?? normalizeString(participantIndex.get(participantId)?.championName),
      playerRole: normalizeString(perspective?.teamPosition) ?? normalizeString(perspective?.individualPosition),
      category: "fight_participation",
      timestamp: start,
      windowStart: start,
      windowEnd: end,
      tags,
      facts: {
        fight: {
          start,
          end,
          durationMs: end - start,
          clusterWindowMs: windowMs,
          killEventCount: cluster.length
        },
        killEvents: cluster.map((event) => eventSummary(event, participantIndex, playerTeamId)),
        killsByTeam,
        deathsByTeam,
        playerGotKillOrAssist: playerKillOrAssistEvents.length > 0,
        playerKillOrAssistEventIds: playerKillOrAssistEvents.map((event) => event.__eventId),
        playerDied: playerDeathEvents.length > 0,
        playerDeathEventIds: playerDeathEvents.map((event) => event.__eventId),
        priorPlayerDeathEventIds: priorPlayerDeaths.map((event) => event.__eventId),
        positions: positionFacts,
        playerDamage
      },
      reviewQuestions: [],
      confidence: 0.8,
      sourceEventIds: cluster.map((event) => event.__eventId),
      createdAt: parsedAt,
      parserVersion: PARSER_VERSION
    };
  });
}
