import { afterEach, expect, it } from "vitest";

import { createRiotMatchesRepository } from "../../server/repositories/riot-matches.js";
import { createMigratedPool, describeWithPostgres, dropSchema } from "./postgres-test-utils.mjs";

const databases = [];

async function createRepository() {
  const database = await createMigratedPool();
  databases.push(database);
  const repository = createRiotMatchesRepository(database);
  await repository.initialize();
  return repository;
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(({ pool, schema }) => dropSchema(pool, schema)));
});

describeWithPostgres("riot matches repository", () => {
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

    await expect(repository.getRawMatchData("NA1_1")).resolves.toMatchObject({
      matchId: "NA1_1",
      summaryJson: { version: 2 },
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-02T00:00:00.000Z"
    });
  });

  it("deduplicates and merges user perspectives by matchId and puuid", async () => {
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
        championName: "Jinx",
        parseStatus: "raw_data_available"
      },
      { now: new Date("2026-06-02T00:00:00.000Z") }
    );

    await expect(repository.getUserMatchPerspective("NA1_1", "puuid_1")).resolves.toMatchObject({
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
