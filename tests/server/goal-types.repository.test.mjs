import { afterEach, expect, it } from "vitest";

import { seedSystemGoalTypes } from "../../server/goal-types/system-goal-types.js";
import { createGoalTypesRepository } from "../../server/repositories/goal-types.js";
import { createMigratedPool, describeWithPostgres, dropSchema } from "./postgres-test-utils.mjs";

const databases = [];

async function createRepository() {
  const database = await createMigratedPool();
  databases.push(database);
  const repository = createGoalTypesRepository(database);
  await repository.initialize();
  return repository;
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(({ pool, schema }) => dropSchema(pool, schema)));
});

describeWithPostgres("goal types repository", () => {
  it("seeds parser evidence system goal types idempotently", async () => {
    const repository = await createRepository();

    await seedSystemGoalTypes(repository);
    await seedSystemGoalTypes(repository);

    const goalTypes = await repository.listGoalTypes();

    expect(goalTypes).toHaveLength(7);
    expect(goalTypes.map((goalType) => goalType.id)).toEqual([
      "death_review",
      "fight_participation",
      "lane_pressure_conversion",
      "map_state_safety",
      "objective_setup_exit",
      "tempo_conversion",
      "vision_information"
    ]);
    expect(new Set(goalTypes.map((goalType) => goalType.id)).size).toBe(goalTypes.length);
    expect(goalTypes.every((goalType) => goalType.createdBySystem)).toBe(true);
    expect(goalTypes.every((goalType) => goalType.roleApplicability.includes("ANY"))).toBe(true);
    expect(goalTypes.every((goalType) => goalType.evidenceCategories.length > 0)).toBe(true);
    expect(goalTypes.every((goalType) => goalType.tagSubscriptions.length > 0)).toBe(true);
    expect(goalTypes.every((goalType) => goalType.defaultReviewQuestions.length > 0)).toBe(true);
  });

  it("filters active goal type options", async () => {
    const repository = await createRepository();

    await repository.saveGoalType({ id: "active", isActiveOption: true });
    await repository.saveGoalType({ id: "inactive", isActiveOption: false });

    await expect(repository.listGoalTypes({ activeOption: true })).resolves.toEqual([
      { id: "active", isActiveOption: true }
    ]);
  });
});
