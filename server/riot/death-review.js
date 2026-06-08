const PARSER_VERSION = "death-review-0";
const BEFORE_WINDOW_MS = 60_000;
const AFTER_WINDOW_MS = 30_000;

const TAG_QUESTIONS = new Map([
  ["low_hp_positioning", "Where was the player positioned in the prior frame at low HP?"],
  ["tower_damage_relevant", "How much tower damage contributed to this death?"],
  ["minion_damage_relevant", "How much minion damage contributed to this death?"],
  ["enemy_level_timing_before_death", "Which enemy level-up happened before the death?"],
  ["post_objective_map_shift", "Which pre-death objective or structure event changed the map state?"],
  ["lost_fight_stagger", "Which allied deaths happened before the player died?"],
  ["numbers_disadvantage_or_collapse", "How many nearby enemy-side events happened before the death?"],
  ["low_return_damage", "How much damage did the player return before dying?"],
  ["high_return_damage", "How much damage did the player return before dying?"]
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
  const participants = normalizeArray(matchSummary?.info?.participants);
  return new Map(
    participants
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

function findPriorFrame(matchTimeline, timestamp, participantId) {
  const frame = normalizeArray(matchTimeline?.info?.frames)
    .filter((entry) => (normalizeNumber(entry?.timestamp) ?? -1) <= timestamp)
    .sort((a, b) => (normalizeNumber(b?.timestamp) ?? 0) - (normalizeNumber(a?.timestamp) ?? 0))[0];
  const participantFrame = frame?.participantFrames?.[String(participantId)] ?? null;

  if (!participantFrame) {
    return null;
  }

  return {
    timestamp: normalizeNumber(frame?.timestamp),
    hp: normalizeNumber(participantFrame?.championStats?.currentHealth ?? participantFrame?.currentHealth),
    maxHp: normalizeNumber(participantFrame?.championStats?.maxHealth ?? participantFrame?.maxHealth),
    level: normalizeNumber(participantFrame?.level),
    position: normalizePosition(participantFrame?.position)
  };
}

function normalizePosition(position) {
  if (!position || typeof position !== "object") {
    return null;
  }

  const x = normalizeNumber(position.x);
  const y = normalizeNumber(position.y);
  return x === null || y === null ? null : { x, y };
}

function classifySource(entry, participantIndex, key = "participantId") {
  const participantId = normalizeNumber(entry?.[key]);
  if (participantId && participantIndex.has(participantId)) {
    return {
      type: "champion",
      key: `participant:${participantId}`,
      participantId,
      championName: normalizeString(participantIndex.get(participantId)?.championName)
    };
  }

  const rawType = normalizeString(entry?.type)?.toUpperCase() ?? "";
  const rawName = normalizeString(entry?.name)?.toUpperCase() ?? "";
  const source = `${rawType} ${rawName}`;

  if (source.includes("TOWER") || source.includes("TURRET")) {
    return { type: "tower", key: normalizeString(entry?.name) ?? "tower", sourceName: normalizeString(entry?.name) };
  }
  if (source.includes("MINION")) {
    return { type: "minion", key: normalizeString(entry?.name) ?? "minion", sourceName: normalizeString(entry?.name) };
  }
  if (
    source.includes("MONSTER") ||
    source.includes("DRAGON") ||
    source.includes("BARON") ||
    source.includes("HERALD") ||
    source.includes("HORDE") ||
    source.includes("ATAKHAN")
  ) {
    return { type: "monster", key: normalizeString(entry?.name) ?? "monster", sourceName: normalizeString(entry?.name) };
  }

  return { type: "unknown", key: normalizeString(entry?.name) ?? "unknown", sourceName: normalizeString(entry?.name) };
}

function damageAmount(entry) {
  return [
    entry?.basic,
    entry?.magicDamage,
    entry?.physicalDamage,
    entry?.trueDamage
  ].reduce((sum, value) => sum + (normalizeNumber(value) ?? 0), 0);
}

function summarizeDamage(entries, participantIndex, participantKey) {
  const groups = new Map();

  for (const entry of normalizeArray(entries)) {
    const source = classifySource(entry, participantIndex, participantKey);
    const current = groups.get(source.key) ?? {
      ...source,
      totalDamage: 0
    };
    current.totalDamage += damageAmount(entry);
    groups.set(source.key, current);
  }

  return [...groups.values()].filter((group) => group.totalDamage > 0);
}

function totalDamage(groups) {
  return groups.reduce((sum, group) => sum + group.totalDamage, 0);
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
    buildingType: normalizeString(event.buildingType),
    position: normalizePosition(event.position)
  };
}

function isEnemyParticipantEvent(event, participantIndex, userTeamId) {
  const participantId = normalizeNumber(event.participantId ?? event.killerId);
  const teamId = participantTeam(participantIndex, participantId);
  return teamId && userTeamId && teamId !== userTeamId;
}

function isAllyDeath(event, participantIndex, userTeamId, participantId) {
  if (event.type !== "CHAMPION_KILL") {
    return false;
  }
  const victimId = normalizeNumber(event.victimId);
  return victimId && victimId !== participantId && participantTeam(participantIndex, victimId) === userTeamId;
}

function buildTags({ damageReceived, damageDealt, priorFrame, nearbyEventsBefore, participantIndex, participantId }) {
  const tags = [];
  const receivedTotal = totalDamage(damageReceived);
  const dealtTotal = totalDamage(damageDealt);
  const userTeamId = participantTeam(participantIndex, participantId);
  const alliedDeathsBefore = nearbyEventsBefore.filter((event) => isAllyDeath(event, participantIndex, userTeamId, participantId));
  const enemyLevelUpsBefore = nearbyEventsBefore.filter(
    (event) => event.type === "CHAMPION_LEVEL_UP" && isEnemyParticipantEvent(event, participantIndex, userTeamId)
  );
  const mapStateEventsBefore = nearbyEventsBefore.filter((event) =>
    event.type === "ELITE_MONSTER_KILL" || event.type === "BUILDING_KILL"
  );
  const enemyCollapseEvents = nearbyEventsBefore.filter((event) =>
    event.type === "CHAMPION_KILL" && isEnemyParticipantEvent(event, participantIndex, userTeamId)
  );

  if (priorFrame?.hp !== null && priorFrame?.maxHp > 0 && priorFrame.hp / priorFrame.maxHp <= 0.35) {
    tags.push({
      id: "low_hp_positioning",
      confidence: 0.85,
      params: { hp: priorFrame.hp, maxHp: priorFrame.maxHp, hpPercent: Number((priorFrame.hp / priorFrame.maxHp).toFixed(3)) }
    });
  }

  const towerDamage = damageReceived.filter((group) => group.type === "tower").reduce((sum, group) => sum + group.totalDamage, 0);
  if (towerDamage > 0) {
    tags.push({ id: "tower_damage_relevant", confidence: 0.9, params: { towerDamage, totalDamageReceived: receivedTotal } });
  }

  const minionDamage = damageReceived.filter((group) => group.type === "minion").reduce((sum, group) => sum + group.totalDamage, 0);
  if (minionDamage >= 100 || (receivedTotal > 0 && minionDamage / receivedTotal >= 0.1)) {
    tags.push({ id: "minion_damage_relevant", confidence: 0.8, params: { minionDamage, totalDamageReceived: receivedTotal } });
  }

  if (enemyLevelUpsBefore.length > 0) {
    tags.push({
      id: "enemy_level_timing_before_death",
      confidence: 0.8,
      params: { eventIds: enemyLevelUpsBefore.map((event) => event.__eventId) }
    });
  }

  if (mapStateEventsBefore.length > 0) {
    tags.push({
      id: "post_objective_map_shift",
      confidence: 0.75,
      params: { eventIds: mapStateEventsBefore.map((event) => event.__eventId) }
    });
  }

  if (alliedDeathsBefore.length > 0) {
    tags.push({
      id: "lost_fight_stagger",
      confidence: 0.8,
      params: { alliedDeathEventIds: alliedDeathsBefore.map((event) => event.__eventId) }
    });
  }

  if (enemyCollapseEvents.length >= 2 || alliedDeathsBefore.length >= 2) {
    tags.push({
      id: "numbers_disadvantage_or_collapse",
      confidence: 0.75,
      params: { enemyEventCount: enemyCollapseEvents.length, alliedDeathsBefore: alliedDeathsBefore.length }
    });
  }

  if (receivedTotal > 0 && (dealtTotal < 150 || dealtTotal / receivedTotal <= 0.2)) {
    tags.push({ id: "low_return_damage", confidence: 0.8, params: { damageDealt: dealtTotal, damageReceived: receivedTotal } });
  } else if (receivedTotal > 0 && dealtTotal >= 300 && dealtTotal / receivedTotal >= 0.6) {
    tags.push({ id: "high_return_damage", confidence: 0.75, params: { damageDealt: dealtTotal, damageReceived: receivedTotal } });
  }

  return tags;
}

function reviewQuestions(tags) {
  return tags.map((tag) => TAG_QUESTIONS.get(tag.id)).filter(Boolean);
}

/**
 * Emits deterministic death_review evidence for deaths by the resolved participant.
 */
export function parseDeathReviewEvidence({ matchSummary, matchTimeline, perspective, parsedAt = new Date().toISOString() }) {
  const participantId = normalizeNumber(perspective?.participantId);
  const puuid = normalizeString(perspective?.puuid);
  const matchId = normalizeString(perspective?.matchId) ?? normalizeString(matchSummary?.metadata?.matchId);
  const participantIndex = buildParticipantIndex(matchSummary);

  if (!participantId || !puuid || !matchId || !matchTimeline?.info?.frames) {
    return [];
  }

  const events = flattenTimelineEvents(matchTimeline);
  const deaths = events.filter((event) => event.type === "CHAMPION_KILL" && normalizeNumber(event.victimId) === participantId);

  return deaths.map((death, deathIndex) => {
    const timestamp = death.timestamp;
    const nearbyEventsBefore = events.filter((event) => event.timestamp >= timestamp - BEFORE_WINDOW_MS && event.timestamp < timestamp);
    const nearbyEventsAfter = events.filter((event) => event.timestamp > timestamp && event.timestamp <= timestamp + AFTER_WINDOW_MS);
    const damageReceived = summarizeDamage(death.victimDamageReceived, participantIndex, "participantId");
    const damageDealt = summarizeDamage(death.victimDamageDealt, participantIndex, "participantId");
    const priorFrame = findPriorFrame(matchTimeline, timestamp, participantId);
    const tags = buildTags({ damageReceived, damageDealt, priorFrame, nearbyEventsBefore, participantIndex, participantId });

    return {
      id: `${matchId}:${puuid}:death_review:${timestamp}:${deathIndex}`,
      matchId,
      puuid,
      participantId,
      championName: normalizeString(perspective?.championName) ?? normalizeString(participantIndex.get(participantId)?.championName),
      playerRole: normalizeString(perspective?.teamPosition) ?? normalizeString(perspective?.individualPosition),
      category: "death_review",
      timestamp,
      windowStart: timestamp - BEFORE_WINDOW_MS,
      windowEnd: timestamp + AFTER_WINDOW_MS,
      tags,
      facts: {
        killerId: normalizeNumber(death.killerId),
        assistingParticipantIds: normalizeArray(death.assistingParticipantIds),
        position: normalizePosition(death.position),
        damageReceived,
        damageDealt,
        priorFrame,
        nearbyEventsBefore: nearbyEventsBefore.map(eventSummary),
        nearbyEventsAfter: nearbyEventsAfter.map(eventSummary)
      },
      reviewQuestions: reviewQuestions(tags),
      confidence: 0.85,
      sourceEventIds: [death.__eventId],
      createdAt: parsedAt,
      parserVersion: PARSER_VERSION
    };
  });
}
