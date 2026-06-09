import { afterEach, expect, it } from "vitest";

import { createUserHomesRepository } from "../../server/repositories/user-homes.js";
import { createMigratedPool, describeWithPostgres, dropSchema } from "./postgres-test-utils.mjs";

const databases = [];

async function createRepository() {
  const database = await createMigratedPool();
  databases.push(database);
  const repository = createUserHomesRepository(database);
  await repository.initialize();
  return repository;
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(({ pool, schema }) => dropSchema(pool, schema)));
});

describeWithPostgres("user homes repository", () => {
  it("saves, gets, and lists user homes", async () => {
    const repository = await createRepository();

    await repository.saveUserHome({ id: "usr_2", profile: { displayName: "Two" } });
    await repository.saveUserHome({ id: "usr_1", profile: { displayName: "One" } });

    await expect(repository.getUserHome("usr_1")).resolves.toEqual({
      id: "usr_1",
      profile: { displayName: "One" }
    });
    await expect(repository.listUserHomes()).resolves.toEqual([
      { id: "usr_1", profile: { displayName: "One" } },
      { id: "usr_2", profile: { displayName: "Two" } }
    ]);
  });
});
