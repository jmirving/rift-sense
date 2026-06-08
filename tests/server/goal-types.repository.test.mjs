import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { seedSystemGoalTypes } from "../../server/goal-types/system-goal-types.js";
import { createGoalTypesRepository } from "../../server/repositories/goal-types.js";

const tempDirectories = [];

async function createRepository() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "rift-sense-goal-types-"));
  tempDirectories.push(tempRoot);

  const repository = createGoalTypesRepository({
    goalTypesDir: path.resolve(tempRoot, "goal-types")
  });
  await repository.initialize();

  return repository;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe("goal types repository", () => {
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

  it("does not create active user goals when seeding goal types", async () => {
    const repository = await createRepository();

    await seedSystemGoalTypes(repository);

    const goalTypes = await repository.listGoalTypes();

    expect(goalTypes.some((goalType) => goalType.activeGoalInstances)).toBe(false);
    expect(goalTypes.some((goalType) => goalType.userId)).toBe(false);
    expect(goalTypes.some((goalType) => goalType.active)).toBe(false);
  });
});
