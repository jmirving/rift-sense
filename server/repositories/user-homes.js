import path from "node:path";
import { promises as fs } from "node:fs";

import { ensureDirectory, fileExists } from "../storage/fs.js";

function userHomeFilePath(userHomesDir, userId) {
  return path.resolve(userHomesDir, `${userId}.json`);
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export function createUserHomesRepository({ userHomesDir }) {
  async function initialize() {
    await ensureDirectory(userHomesDir);
  }

  async function getUserHome(userId) {
    const filePath = userHomeFilePath(userHomesDir, userId);
    if (!(await fileExists(filePath))) {
      return null;
    }

    return readJson(filePath);
  }

  async function saveUserHome(record) {
    await ensureDirectory(userHomesDir);
    await fs.writeFile(
      userHomeFilePath(userHomesDir, record.id),
      `${JSON.stringify(record, null, 2)}\n`
    );
    return record;
  }

  async function listUserHomes() {
    await ensureDirectory(userHomesDir);
    const entries = await fs.readdir(userHomesDir);
    return Promise.all(
      entries
        .filter((entry) => entry.endsWith(".json"))
        .map((entry) => readJson(path.resolve(userHomesDir, entry)))
    );
  }

  return {
    initialize,
    getUserHome,
    saveUserHome,
    listUserHomes
  };
}
