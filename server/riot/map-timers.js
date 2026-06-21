export const MAP_TIMER_RULES = {
  minions: {
    firstSpawnSeconds: 30
  },
  jungleCamps: {
    firstSpawnSeconds: 55,
    minorCampRespawnSeconds: 135,
    buffRespawnSeconds: 300
  },
  scuttle: {
    firstSpawnSeconds: 175,
    firstPairCount: 2,
    respawnAfterBothInitialDeadSeconds: 150,
    normalRespawnSeconds: 150
  },
  dragon: {
    firstSpawnSeconds: 300,
    respawnSeconds: 300
  },
  voidgrubs: {
    firstSpawnSeconds: 480,
    despawnsBeforeHerald: true
  },
  riftHerald: {
    firstSpawnSeconds: 900,
    despawnSeconds: 1185
  },
  baron: {
    firstSpawnSeconds: 1200,
    respawnSeconds: 360
  },
  elderDragon: {
    spawnsAfterFourthDragonSeconds: 300,
    respawnSeconds: 360,
    requiresDragonSoulState: true
  }
};

export const MAP_TIMER_WINDOWS = {
  setupWindowSeconds: 90,
  exitWindowSeconds: 60,
  contestWindowSeconds: 45,
  nearbyTimelineWindowSeconds: 30
};

const SECOND_MS = 1000;

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

function eventSeconds(event) {
  return (normalizeNumber(event?.timestamp) ?? 0) / SECOND_MS;
}

function secondsBetween(timestampMs, eventOrSpawnSeconds) {
  return Math.round(eventOrSpawnSeconds - (timestampMs / SECOND_MS));
}

function objectiveEventName(event) {
  const monsterType = normalizeString(event?.monsterType)?.toUpperCase() ?? "";
  const monsterSubType = normalizeString(event?.monsterSubType)?.toUpperCase() ?? "";
  if (monsterSubType.includes("ELDER")) return "Elder dragon";
  if (monsterType.includes("BARON")) return "Baron";
  if (monsterType.includes("DRAGON")) return "Dragon";
  if (monsterType.includes("HORDE")) return "Voidgrubs";
  if (monsterType.includes("RIFTHERALD")) return "Rift Herald";
  return "";
}

function isTrackedObjectiveEvent(event) {
  return event?.type === "ELITE_MONSTER_KILL" && objectiveEventName(event);
}

function relationForDelta(deltaSeconds) {
  if (deltaSeconds >= 0 && deltaSeconds <= MAP_TIMER_WINDOWS.setupWindowSeconds) return "setup";
  if (Math.abs(deltaSeconds) <= MAP_TIMER_WINDOWS.contestWindowSeconds) return "contest";
  if (deltaSeconds < 0 && Math.abs(deltaSeconds) <= MAP_TIMER_WINDOWS.exitWindowSeconds) return "exit";
  return "";
}

function stateFromSpawn({ objectiveName, timestampMs, spawnSeconds, source }) {
  const deltaSeconds = secondsBetween(timestampMs, spawnSeconds);
  const relation = relationForDelta(deltaSeconds);
  if (!relation) return null;
  return {
    supported: true,
    objectiveName,
    relation,
    secondsFromDeath: deltaSeconds,
    confidence: relation === "contest" ? "medium" : "low",
    source
  };
}

function lastKillBefore(events, objectiveName, timestampMs) {
  return normalizeArray(events)
    .filter((event) => isTrackedObjectiveEvent(event) && objectiveEventName(event) === objectiveName)
    .filter((event) => (normalizeNumber(event.timestamp) ?? 0) <= timestampMs)
    .sort((left, right) => (normalizeNumber(right.timestamp) ?? 0) - (normalizeNumber(left.timestamp) ?? 0))[0] ?? null;
}

function objectiveKillCountByTeam(events, timestampMs) {
  const counts = new Map();
  for (const event of normalizeArray(events)) {
    const name = objectiveEventName(event);
    if (name !== "Dragon" || (normalizeNumber(event.timestamp) ?? 0) > timestampMs) continue;
    const teamId = normalizeNumber(event.killerTeamId ?? event.teamId);
    if (teamId === null) continue;
    counts.set(teamId, (counts.get(teamId) ?? 0) + 1);
  }
  return counts;
}

function actualObjectiveState(events, timestampMs) {
  const windowMs = MAP_TIMER_WINDOWS.nearbyTimelineWindowSeconds * SECOND_MS;
  const event = normalizeArray(events)
    .filter(isTrackedObjectiveEvent)
    .filter((entry) => Math.abs((normalizeNumber(entry.timestamp) ?? 0) - timestampMs) <= windowMs)
    .sort((left, right) => Math.abs((normalizeNumber(left.timestamp) ?? 0) - timestampMs) - Math.abs((normalizeNumber(right.timestamp) ?? 0) - timestampMs))[0];
  if (!event) return null;

  const deltaSeconds = Math.round(((normalizeNumber(event.timestamp) ?? 0) - timestampMs) / SECOND_MS);
  return {
    supported: true,
    objectiveName: objectiveEventName(event),
    relation: deltaSeconds > 10 ? "setup" : deltaSeconds < -10 ? "exit" : "contest",
    secondsFromDeath: deltaSeconds,
    confidence: "high",
    source: "timeline_event"
  };
}

function timerObjectiveStates(events, timestampMs) {
  const seconds = timestampMs / SECOND_MS;
  const states = [];

  const dragonKill = lastKillBefore(events, "Dragon", timestampMs);
  const nextDragonSpawn = dragonKill
    ? eventSeconds(dragonKill) + MAP_TIMER_RULES.dragon.respawnSeconds
    : MAP_TIMER_RULES.dragon.firstSpawnSeconds;
  states.push(stateFromSpawn({ objectiveName: "Dragon", timestampMs, spawnSeconds: nextDragonSpawn, source: dragonKill ? "respawn_timer" : "spawn_timer" }));

  if (seconds >= MAP_TIMER_RULES.voidgrubs.firstSpawnSeconds - MAP_TIMER_WINDOWS.setupWindowSeconds &&
    seconds < MAP_TIMER_RULES.riftHerald.firstSpawnSeconds) {
    states.push(stateFromSpawn({
      objectiveName: "Voidgrubs",
      timestampMs,
      spawnSeconds: MAP_TIMER_RULES.voidgrubs.firstSpawnSeconds,
      source: "spawn_timer"
    }));
  }

  if (seconds >= MAP_TIMER_RULES.riftHerald.firstSpawnSeconds - MAP_TIMER_WINDOWS.setupWindowSeconds &&
    seconds <= MAP_TIMER_RULES.riftHerald.despawnSeconds) {
    states.push(stateFromSpawn({
      objectiveName: "Rift Herald",
      timestampMs,
      spawnSeconds: MAP_TIMER_RULES.riftHerald.firstSpawnSeconds,
      source: "spawn_timer"
    }));
  }

  const baronKill = lastKillBefore(events, "Baron", timestampMs);
  if (baronKill || seconds >= MAP_TIMER_RULES.baron.firstSpawnSeconds) {
    const nextBaronSpawn = baronKill
      ? eventSeconds(baronKill) + MAP_TIMER_RULES.baron.respawnSeconds
      : MAP_TIMER_RULES.baron.firstSpawnSeconds;
    states.push(stateFromSpawn({ objectiveName: "Baron", timestampMs, spawnSeconds: nextBaronSpawn, source: baronKill ? "respawn_timer" : "spawn_timer" }));
  }

  const dragonCounts = objectiveKillCountByTeam(events, timestampMs);
  const fourthDragonTeamId = [...dragonCounts.entries()].find(([, count]) => count >= 4)?.[0] ?? null;
  const fourthDragonEvent = fourthDragonTeamId === null ? null : normalizeArray(events)
    .filter((event) => objectiveEventName(event) === "Dragon")
    .filter((event) => normalizeNumber(event.killerTeamId ?? event.teamId) === fourthDragonTeamId)
    .filter((event) => (normalizeNumber(event.timestamp) ?? 0) <= timestampMs)
    .sort((left, right) => (normalizeNumber(left.timestamp) ?? 0) - (normalizeNumber(right.timestamp) ?? 0))[3] ?? null;
  if (fourthDragonEvent) {
    const elderKill = lastKillBefore(events, "Elder dragon", timestampMs);
    states.push(stateFromSpawn({
      objectiveName: "Elder dragon",
      timestampMs,
      spawnSeconds: elderKill
        ? eventSeconds(elderKill) + MAP_TIMER_RULES.elderDragon.respawnSeconds
        : eventSeconds(fourthDragonEvent) + MAP_TIMER_RULES.elderDragon.spawnsAfterFourthDragonSeconds,
      source: elderKill ? "respawn_timer" : "dragon_soul_state"
    }));
  }

  return states.filter(Boolean);
}

export function getObjectiveStateNearTimestamp(events, timestampMs) {
  const actual = actualObjectiveState(events, timestampMs);
  if (actual) return actual;

  return timerObjectiveStates(events, timestampMs)
    .sort((left, right) => Math.abs(left.secondsFromDeath) - Math.abs(right.secondsFromDeath))[0] ?? {
      supported: false,
      objectiveName: "",
      relation: "",
      secondsFromDeath: null,
      confidence: "low",
      source: ""
    };
}

function isRiverPosition(position) {
  if (!position) return false;
  const x = normalizeNumber(position.x);
  const y = normalizeNumber(position.y);
  if (x === null || y === null) return false;
  return Math.abs(x - y) <= 1800 && x >= 3500 && x <= 11_500 && y >= 3500 && y <= 11_500;
}

function jungleCampName(event) {
  const monsterType = normalizeString(event?.monsterType)?.toUpperCase() ?? "";
  if (monsterType.includes("SCUTTLE")) return "Scuttle";
  if (monsterType.includes("BLUE")) return "Blue buff";
  if (monsterType.includes("RED")) return "Red buff";
  if (monsterType.includes("KRUG")) return "Krugs";
  if (monsterType.includes("RAPTOR")) return "Raptors";
  if (monsterType.includes("WOLF")) return "Wolves";
  if (monsterType.includes("GROMP")) return "Gromp";
  return "";
}

function campRespawnSeconds(campName) {
  if (campName === "Blue buff" || campName === "Red buff") return MAP_TIMER_RULES.jungleCamps.buffRespawnSeconds;
  if (["Krugs", "Raptors", "Wolves", "Gromp"].includes(campName)) return MAP_TIMER_RULES.jungleCamps.minorCampRespawnSeconds;
  return null;
}

function scuttleRespawnState(events, timestampMs, deathSeconds) {
  const scuttleKills = normalizeArray(events)
    .map((event) => ({ event, campName: jungleCampName(event), timestamp: normalizeNumber(event?.timestamp) ?? 0 }))
    .filter(({ campName, timestamp }) => campName === "Scuttle" && timestamp <= timestampMs)
    .sort((left, right) => left.timestamp - right.timestamp);
  if (scuttleKills.length < MAP_TIMER_RULES.scuttle.firstPairCount) return null;

  const anchor = scuttleKills.length === MAP_TIMER_RULES.scuttle.firstPairCount
    ? scuttleKills[MAP_TIMER_RULES.scuttle.firstPairCount - 1].timestamp
    : scuttleKills[scuttleKills.length - 1].timestamp;
  const respawnSeconds = scuttleKills.length === MAP_TIMER_RULES.scuttle.firstPairCount
    ? MAP_TIMER_RULES.scuttle.respawnAfterBothInitialDeadSeconds
    : MAP_TIMER_RULES.scuttle.normalRespawnSeconds;
  const respawnDelta = Math.round(((anchor / SECOND_MS) + respawnSeconds) - deathSeconds);
  if (Math.abs(respawnDelta) > MAP_TIMER_WINDOWS.contestWindowSeconds) return null;

  return {
    supported: true,
    campName: "Scuttle",
    relation: respawnDelta >= 0 ? "respawning_soon" : "recent_respawn",
    secondsFromDeath: respawnDelta,
    confidence: "low",
    source: "respawn_timer"
  };
}

export function getCampStateNearTimestamp(events, timestampMs, options = {}) {
  const position = options.position ?? null;
  const role = normalizeString(options.role)?.toUpperCase() ?? "";
  const allowRiverContext = isRiverPosition(position) || role === "JUNGLE" || role === "UTILITY" || role === "SUPPORT";
  const deathSeconds = timestampMs / SECOND_MS;

  if (allowRiverContext) {
    const firstScuttleDelta = MAP_TIMER_RULES.scuttle.firstSpawnSeconds - deathSeconds;
    if (Math.abs(firstScuttleDelta) <= MAP_TIMER_WINDOWS.setupWindowSeconds) {
      return {
        supported: true,
        campName: "Scuttle",
        relation: firstScuttleDelta >= 0 ? "spawning_soon" : "recent_spawn",
        secondsFromDeath: Math.round(firstScuttleDelta),
        confidence: "low",
        source: "spawn_timer"
      };
    }
  }

  const campKill = normalizeArray(events)
    .filter((event) => event?.type === "JUNGLE_MONSTER_KILL" && jungleCampName(event))
    .filter((event) => Math.abs((normalizeNumber(event.timestamp) ?? 0) - timestampMs) <= MAP_TIMER_WINDOWS.nearbyTimelineWindowSeconds * SECOND_MS)
    .sort((left, right) => Math.abs((normalizeNumber(left.timestamp) ?? 0) - timestampMs) - Math.abs((normalizeNumber(right.timestamp) ?? 0) - timestampMs))[0];
  if (campKill) {
    return {
      supported: true,
      campName: jungleCampName(campKill),
      relation: "nearby_timeline",
      secondsFromDeath: Math.round(((normalizeNumber(campKill.timestamp) ?? 0) - timestampMs) / SECOND_MS),
      confidence: "medium",
      source: "timeline_event"
    };
  }

  const scuttleRespawn = allowRiverContext ? scuttleRespawnState(events, timestampMs, deathSeconds) : null;
  if (scuttleRespawn) return scuttleRespawn;

  const priorCampKill = normalizeArray(events)
    .map((event) => ({ event, campName: jungleCampName(event), timestamp: normalizeNumber(event?.timestamp) ?? 0 }))
    .filter(({ campName, timestamp }) => campName && timestamp <= timestampMs)
    .map((entry) => ({ ...entry, respawnSeconds: campRespawnSeconds(entry.campName) }))
    .filter(({ respawnSeconds }) => respawnSeconds !== null)
    .map((entry) => ({ ...entry, respawnDelta: Math.round(((entry.timestamp / SECOND_MS) + entry.respawnSeconds) - deathSeconds) }))
    .filter(({ respawnDelta }) => Math.abs(respawnDelta) <= MAP_TIMER_WINDOWS.contestWindowSeconds)
    .sort((left, right) => Math.abs(left.respawnDelta) - Math.abs(right.respawnDelta))[0];
  if (priorCampKill && (allowRiverContext || priorCampKill.campName !== "Scuttle")) {
    return {
      supported: true,
      campName: priorCampKill.campName,
      relation: priorCampKill.respawnDelta >= 0 ? "respawning_soon" : "recent_respawn",
      secondsFromDeath: priorCampKill.respawnDelta,
      confidence: "low",
      source: "respawn_timer"
    };
  }

  return {
    supported: false,
    campName: "",
    relation: "",
    secondsFromDeath: null,
    confidence: "low",
    source: ""
  };
}
