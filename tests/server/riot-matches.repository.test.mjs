import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { createRiotMatchesRepository } from "../../server/repositories/riot-matches.js";

const tempDirectories = [];

async function createRepository() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "rift-sense-riot-repo-"));
  tempDirectories.push(tempRoot);

  const repository = createRiotMatchesRepository({
    rawMatchesDir: path.resolve(tempRoot, "raw"),
    perspectivesDir: path.resolve(tempRoot, "perspectives")
  });
  await repository.initialize();

  return repository;
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("riot matches repository", () => {
  it("deduplicates raw match data by matchId", async () => {
    const repository = await createRepository();

    await repository.saveRawMatchData({
      matchId: "NA1_1",
      summaryJson: { metadata: { matchId: "NA1_1" }, version: 1 },
      timelineJson: { metadata: { matchId: "NA1_1" }, frames: [] },
      now: new Date("2026-06-01T00:00:00.000Z")
    });
    await repository.saveRawMatchData({
      matchId: "NA1_1",
      summaryJson: { metadata: { matchId: "NA1_1" }, version: 2 },
      timelineJson: { metadata: { matchId: "NA1_1" }, frames: [{ timestamp: 1 }] },
      now: new Date("2026-06-02T00:00:00.000Z")
    });

    const stored = await repository.getRawMatchData("NA1_1");
    expect(stored).toMatchObject({
      matchId: "NA1_1",
      summaryJson: { version: 2 },
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-02T00:00:00.000Z"
    });
  });

  it("deduplicates user perspectives by matchId and puuid", async () => {
    const repository = await createRepository();

    await repository.saveUserMatchPerspective(
      {
        matchId: "NA1_1",
        puuid: "puuid_1",
        participantId: 1,
        championName: "Ashe",
        teamId: 100,
        teamPosition: "BOTTOM",
        parseStatus: "discovered"
      },
      { now: new Date("2026-06-01T00:00:00.000Z") }
    );
    await repository.saveUserMatchPerspective(
      {
        matchId: "NA1_1",
        puuid: "puuid_1",
        participantId: 1,
        championName: "Jinx",
        teamId: 100,
        teamPosition: "BOTTOM",
        parseStatus: "raw_data_available"
      },
      { now: new Date("2026-06-02T00:00:00.000Z") }
    );

    const stored = await repository.getUserMatchPerspective("NA1_1", "puuid_1");
    expect(stored).toMatchObject({
      matchId: "NA1_1",
      puuid: "puuid_1",
      participantId: 1,
      championName: "Jinx",
      teamId: 100,
      teamPosition: "BOTTOM",
      parseStatus: "raw_data_available",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-02T00:00:00.000Z"
    });
  });

  it("treats complete raw records as fresh unless max age expires", async () => {
    const repository = await createRepository();

    await repository.saveRawMatchData({
      matchId: "NA1_1",
      summaryJson: { metadata: { matchId: "NA1_1" } },
      timelineJson: { metadata: { matchId: "NA1_1" } },
      now: new Date("2026-06-01T00:00:00.000Z")
    });

    await expect(repository.hasFreshRawMatchData("NA1_1")).resolves.toBe(true);
    await expect(
      repository.hasFreshRawMatchData("NA1_1", {
        now: new Date("2026-06-01T00:01:00.000Z"),
        maxAgeMs: 30_000
      })
    ).resolves.toBe(false);
  });
});

