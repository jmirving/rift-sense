import path from "node:path";
import { promises as fs } from "node:fs";

import { ensureDirectory, fileExists } from "../storage/fs.js";

function fileKey(...parts) {
  return parts.map((part) => encodeURIComponent(String(part))).join("__");
}

function rawMatchFilePath(rawMatchesDir, matchId) {
  return path.resolve(rawMatchesDir, `${fileKey(matchId)}.json`);
}

function perspectiveFilePath(perspectivesDir, matchId, puuid) {
  return path.resolve(perspectivesDir, `${fileKey(matchId, puuid)}.json`);
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function isFreshRecord(record, { now = new Date(), maxAgeMs = null } = {}) {
  if (!record?.summaryJson || !record?.timelineJson) {
    return false;
  }

  if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
    return true;
  }

  const updatedAt = Date.parse(record.updatedAt ?? record.createdAt ?? "");
  return Number.isFinite(updatedAt) && now.getTime() - updatedAt <= maxAgeMs;
}

export function createRiotMatchesRepository({ rawMatchesDir, perspectivesDir }) {
  async function initialize() {
    await Promise.all([ensureDirectory(rawMatchesDir), ensureDirectory(perspectivesDir)]);
  }

  async function getRawMatchData(matchId) {
    const filePath = rawMatchFilePath(rawMatchesDir, matchId);
    if (!(await fileExists(filePath))) {
      return null;
    }
    return readJson(filePath);
  }

  async function saveRawMatchData({ matchId, summaryJson, timelineJson, now = new Date() }) {
    await ensureDirectory(rawMatchesDir);
    const existing = await getRawMatchData(matchId);
    const timestamp = now.toISOString();
    const record = {
      matchId,
      summaryJson,
      timelineJson,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp
    };

    await fs.writeFile(rawMatchFilePath(rawMatchesDir, matchId), `${JSON.stringify(record, null, 2)}\n`);
    return record;
  }

  async function getUserMatchPerspective(matchId, puuid) {
    const filePath = perspectiveFilePath(perspectivesDir, matchId, puuid);
    if (!(await fileExists(filePath))) {
      return null;
    }
    return readJson(filePath);
  }

  async function saveUserMatchPerspective(record, { now = new Date() } = {}) {
    await ensureDirectory(perspectivesDir);
    const existing = await getUserMatchPerspective(record.matchId, record.puuid);
    const timestamp = now.toISOString();
    const nextRecord = {
      ...existing,
      ...record,
      createdAt: existing?.createdAt ?? record.createdAt ?? timestamp,
      updatedAt: timestamp
    };

    await fs.writeFile(
      perspectiveFilePath(perspectivesDir, record.matchId, record.puuid),
      `${JSON.stringify(nextRecord, null, 2)}\n`
    );
    return nextRecord;
  }

  async function hasFreshRawMatchData(matchId, options) {
    return isFreshRecord(await getRawMatchData(matchId), options);
  }

  return {
    initialize,
    getRawMatchData,
    saveRawMatchData,
    hasFreshRawMatchData,
    getUserMatchPerspective,
    saveUserMatchPerspective
  };
}

