import path from "node:path";
import { promises as fs } from "node:fs";

import { ensureDirectory, fileExists } from "../storage/fs.js";

function goalTypeFilePath(goalTypesDir, id) {
  return path.resolve(goalTypesDir, `${id}.json`);
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export function createGoalTypesRepository({ goalTypesDir }) {
  async function initialize() {
    await ensureDirectory(goalTypesDir);
  }

  async function getGoalType(id) {
    const filePath = goalTypeFilePath(goalTypesDir, id);
    if (!(await fileExists(filePath))) {
      return null;
    }

    return readJson(filePath);
  }

  async function saveGoalType(record) {
    await ensureDirectory(goalTypesDir);
    await fs.writeFile(
      goalTypeFilePath(goalTypesDir, record.id),
      `${JSON.stringify(record, null, 2)}\n`
    );
    return record;
  }

  async function listGoalTypes(filters = {}) {
    await ensureDirectory(goalTypesDir);
    const entries = await fs.readdir(goalTypesDir);
    const goalTypes = await Promise.all(
      entries
        .filter((entry) => entry.endsWith(".json"))
        .map((entry) => readJson(path.resolve(goalTypesDir, entry)))
    );

    return goalTypes
      .filter((goalType) =>
        filters.activeOption === undefined
          ? true
          : goalType.isActiveOption === filters.activeOption
      )
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  return {
    initialize,
    getGoalType,
    saveGoalType,
    listGoalTypes
  };
}
