import path from "node:path";
import { promises as fs } from "node:fs";

import { ensureDirectory, fileExists } from "../storage/fs.js";

function itemFilePath(contentItemsDir, id) {
  return path.resolve(contentItemsDir, `${id}.json`);
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export function createContentItemsRepository({ contentItemsDir }) {
  async function initialize() {
    await ensureDirectory(contentItemsDir);
  }

  async function getContentItem(id) {
    const filePath = itemFilePath(contentItemsDir, id);
    if (!(await fileExists(filePath))) {
      return null;
    }
    return readJson(filePath);
  }

  async function saveContentItem(record) {
    await ensureDirectory(contentItemsDir);
    await fs.writeFile(itemFilePath(contentItemsDir, record.id), `${JSON.stringify(record, null, 2)}\n`);
    return record;
  }

  async function listContentItems(filters = {}) {
    await ensureDirectory(contentItemsDir);
    const entries = await fs.readdir(contentItemsDir);
    const items = await Promise.all(
      entries
        .filter((entry) => entry.endsWith(".json"))
        .map((entry) => readJson(path.resolve(contentItemsDir, entry)))
    );

    return items
      .filter((item) => (filters.status ? item.status === filters.status : true))
      .filter((item) => (filters.contentType ? item.contentType === filters.contentType : true))
      .filter((item) =>
        filters.topic ? item.topicTags?.includes(String(filters.topic).trim().toLowerCase()) : true
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async function deleteContentItem(id) {
    const filePath = itemFilePath(contentItemsDir, id);
    if (await fileExists(filePath)) {
      await fs.unlink(filePath);
      return true;
    }
    return false;
  }

  return {
    initialize,
    getContentItem,
    saveContentItem,
    listContentItems,
    deleteContentItem
  };
}

