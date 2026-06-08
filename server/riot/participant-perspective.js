function normalizeString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function error(code, message) {
  return {
    ok: false,
    error: {
      code,
      message
    }
  };
}

function findTimelineParticipantId(matchTimeline, puuid) {
  const participants = matchTimeline?.metadata?.participants;
  if (!Array.isArray(participants)) {
    return null;
  }

  const participant = participants.find((entry) => entry?.puuid === puuid);
  return normalizeNumber(participant?.participantId);
}

/**
 * @typedef {Object} ParticipantPerspective
 * @property {string|null} matchId
 * @property {string} puuid
 * @property {number} participantId
 * @property {string|null} championName
 * @property {number|null} teamId
 * @property {string|null} teamPosition
 * @property {string|null} individualPosition
 * @property {number|null} gameCreation
 * @property {number|null} gameStart
 * @property {number|null} gameEnd
 * @property {number|null} duration
 */

/**
 * @param {unknown} matchSummary
 * @param {unknown} matchTimeline
 * @param {string} puuid
 * @returns {{ ok: true, value: ParticipantPerspective } | { ok: false, error: { code: "missing_summary" | "participant_not_found" | "invalid_match_shape", message: string } }}
 */
export function resolveParticipantPerspective(matchSummary, matchTimeline, puuid) {
  if (!matchSummary) {
    return error("missing_summary", "Match summary is required.");
  }

  const summary = normalizeObject(matchSummary);
  const info = normalizeObject(summary?.info);
  if (!summary || !info || !Array.isArray(info.participants)) {
    return error("invalid_match_shape", "Match summary must include info.participants.");
  }

  const normalizedPuuid = normalizeString(puuid);
  if (!normalizedPuuid) {
    return error("invalid_match_shape", "PUUID is required.");
  }

  const participant = info.participants.find((entry) => entry?.puuid === normalizedPuuid);
  if (!participant) {
    return error("participant_not_found", "Participant was not found for the requested PUUID.");
  }

  const participantId = normalizeNumber(participant?.participantId) ?? findTimelineParticipantId(matchTimeline, normalizedPuuid);
  if (!participantId) {
    return error("invalid_match_shape", "Participant is missing a valid participantId.");
  }

  return {
    ok: true,
    value: {
      matchId: normalizeString(summary?.metadata?.matchId),
      puuid: normalizedPuuid,
      participantId,
      championName: normalizeString(participant?.championName),
      teamId: normalizeNumber(participant?.teamId),
      teamPosition: normalizeString(participant?.teamPosition),
      individualPosition: normalizeString(participant?.individualPosition),
      gameCreation: normalizeNumber(info?.gameCreation),
      gameStart: normalizeNumber(info?.gameStartTimestamp),
      gameEnd: normalizeNumber(info?.gameEndTimestamp),
      duration: normalizeNumber(info?.gameDuration)
    }
  };
}
