import { describe, expect, it } from "vitest";

import { resolveParticipantPerspective } from "../../server/riot/participant-perspective.js";

describe("riot participant perspective resolver", () => {
  it("resolves participant metadata for a requested PUUID", () => {
    const result = resolveParticipantPerspective(
      {
        metadata: {
          matchId: "NA1_1"
        },
        info: {
          gameCreation: 1780000000000,
          gameStartTimestamp: 1780000010000,
          gameEndTimestamp: 1780001810000,
          gameDuration: 1800,
          participants: [
            {
              puuid: "puuid_1",
              participantId: 4,
              championName: "Ashe",
              teamId: 100,
              teamPosition: "BOTTOM",
              individualPosition: "BOTTOM"
            }
          ]
        }
      },
      null,
      "puuid_1"
    );

    expect(result).toEqual({
      ok: true,
      value: {
        matchId: "NA1_1",
        puuid: "puuid_1",
        participantId: 4,
        championName: "Ashe",
        teamId: 100,
        teamPosition: "BOTTOM",
        individualPosition: "BOTTOM",
        gameCreation: 1780000000000,
        gameStart: 1780000010000,
        gameEnd: 1780001810000,
        duration: 1800
      }
    });
  });

  it("can read participantId from timeline metadata when summary omits it", () => {
    const result = resolveParticipantPerspective(
      {
        metadata: {
          matchId: "NA1_1"
        },
        info: {
          participants: [
            {
              puuid: "puuid_1",
              championName: "Ashe"
            }
          ]
        }
      },
      {
        metadata: {
          participants: [
            {
              puuid: "puuid_1",
              participantId: 7
            }
          ]
        }
      },
      "puuid_1"
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        puuid: "puuid_1",
        participantId: 7
      }
    });
  });

  it("returns a structured error when the participant is missing", () => {
    const result = resolveParticipantPerspective(
      {
        metadata: {
          matchId: "NA1_1"
        },
        info: {
          participants: [
            {
              puuid: "puuid_2",
              participantId: 5
            }
          ]
        }
      },
      null,
      "puuid_1"
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "participant_not_found",
        message: "Participant was not found for the requested PUUID."
      }
    });
  });

  it("returns a structured error when summary is missing", () => {
    expect(resolveParticipantPerspective(null, null, "puuid_1")).toEqual({
      ok: false,
      error: {
        code: "missing_summary",
        message: "Match summary is required."
      }
    });
  });

  it("returns a structured error for invalid summary shape", () => {
    expect(resolveParticipantPerspective({ metadata: { matchId: "NA1_1" } }, null, "puuid_1")).toEqual({
      ok: false,
      error: {
        code: "invalid_match_shape",
        message: "Match summary must include info.participants."
      }
    });
  });
});
