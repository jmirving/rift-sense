import {
  evaluateMatchFacts,
  summarizeMatchEvaluation
} from "../../server/riot/match-evaluator.js";

export const baseNow = new Date("2026-06-09T12:00:00.000Z");

const championByParticipantId = {
  1: "Ashe",
  2: "Leona",
  3: "Ahri",
  4: "Vi",
  5: "Gwen",
  6: "Jinx",
  7: "Nautilus",
  8: "LeeSin",
  9: "Renekton",
  10: "Taliyah"
};

export function participant(overrides = {}) {
  const participantId = overrides.participantId ?? 1;
  return {
    puuid: `puuid_${participantId}`,
    participantId,
    championName: championByParticipantId[participantId] ?? `Champion${participantId}`,
    teamId: participantId <= 5 ? 100 : 200,
    teamPosition: "MIDDLE",
    individualPosition: "MIDDLE",
    lane: "MIDDLE",
    win: false,
    kills: 1,
    deaths: 1,
    assists: 2,
    ...overrides
  };
}

export function summary(participants = [
  participant({ puuid: "target_puuid", participantId: 1, championName: "Ahri", teamId: 100 }),
  participant({ participantId: 6, championName: "Zed", teamId: 200 }),
  participant({ participantId: 7, championName: "LeeSin", teamId: 200 })
]) {
  return {
    metadata: { matchId: "NA1_050" },
    info: {
      queueId: 420,
      gameCreation: 1_780_000_000_000,
      gameDuration: 1800,
      participants
    }
  };
}

export function frame(timestamp, participantFramesOrLevels = {}, events = []) {
  return {
    timestamp,
    participantFrames: Object.fromEntries(
      Object.entries(participantFramesOrLevels).map(([participantId, value]) => {
        const participantFrame = typeof value === "object" && value !== null
          ? { participantId: Number(participantId), ...value }
          : { participantId: Number(participantId), level: value };
        return [participantId, participantFrame];
      })
    ),
    ...(events.length > 0 ? { events } : {})
  };
}

export function killEvent(overrides = {}) {
  return {
    type: "CHAMPION_KILL",
    timestamp: 120_000,
    victimId: 1,
    killerId: 6,
    assistingParticipantIds: [],
    ...overrides
  };
}

export function levelUpEvent(overrides = {}) {
  return {
    type: "LEVEL_UP",
    timestamp: 105_000,
    participantId: 6,
    level: 2,
    ...overrides
  };
}

export function objectiveKillEvent(overrides = {}) {
  return {
    type: "ELITE_MONSTER_KILL",
    timestamp: 330_000,
    monsterType: "DRAGON",
    killerId: 6,
    killerTeamId: 200,
    ...overrides
  };
}

function framesWithEvents(frames = [], events = []) {
  if (!events.length) return frames;
  if (!frames.length) return [frame(0, {}, events)];

  const sortedFrames = frames.map((entry) => ({ ...entry, events: [...(entry.events ?? [])] }));
  for (const event of events) {
    const target = sortedFrames.find((entry) => Number(entry.timestamp) >= Number(event.timestamp)) ??
      sortedFrames[sortedFrames.length - 1];
    target.events.push(event);
  }
  return sortedFrames;
}

export function evaluateScenario({
  participants = summary().info.participants,
  perspective = {},
  frames = [],
  events = [],
  puuid = "target_puuid",
  matchId = "NA1_050",
  activeGoalTitle = "Die Less"
} = {}) {
  const summaryJson = summary(participants);
  summaryJson.metadata.matchId = matchId;
  const target = participants.find((entry) => entry.puuid === puuid) ?? participants[0] ?? {};
  const perspectiveRecord = {
    matchId,
    puuid,
    participantId: target.participantId ?? 1,
    championName: target.championName,
    teamId: target.teamId,
    teamPosition: target.teamPosition,
    individualPosition: target.individualPosition,
    lane: target.lane,
    ...perspective
  };
  const evaluation = evaluateMatchFacts({
    matchId,
    puuid,
    summaryJson,
    timelineJson: { info: { frames: framesWithEvents(frames, events) } },
    perspectiveRecord,
    now: baseNow
  });
  const review = reviewFromEvaluation(evaluation, { activeGoalTitle });
  return { evaluation, review };
}

export function reviewFromEvaluation(evaluation, { activeGoalTitle = "Die Less", reviewedMoments = [] } = {}) {
  return {
    matchId: evaluation.matchId,
    activeGoal: { title: activeGoalTitle },
    activeGoalName: activeGoalTitle,
    matchSummary: evaluation.summaryJson,
    evaluationSummary: summarizeMatchEvaluation(evaluation),
    deathEvents: evaluation.deathsJson,
    deterministicTagCounts: evaluation.tagsJson?.counts ?? {},
    reviewedMoments,
    selectedMainReviewFocus: false
  };
}
