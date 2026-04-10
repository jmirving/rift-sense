import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { createContentItemsRepository } from "../../server/repositories/content-items.js";

const tempDirectories = [];

async function createRepository() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "rift-sense-repo-"));
  tempDirectories.push(tempRoot);

  const repository = createContentItemsRepository({
    contentItemsDir: path.resolve(tempRoot, "content-items")
  });
  await repository.initialize();

  return repository;
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("content items repository", () => {
  it("saves and filters content items", async () => {
    const repository = await createRepository();

    await repository.saveContentItem({
      id: "cnt_1",
      title: "Draft",
      description: "Draft item",
      contentType: "document",
      sourceType: "external_url",
      status: "draft",
      topicTags: ["macro"],
      updatedAt: "2026-03-25T00:00:00.000Z"
    });

    await repository.saveContentItem({
      id: "cnt_2",
      title: "Published",
      description: "Published item",
      contentType: "deck",
      sourceType: "external_url",
      status: "published",
      topicTags: ["laning"],
      updatedAt: "2026-03-26T00:00:00.000Z"
    });

    const published = await repository.listContentItems({ status: "published" });
    const byTopic = await repository.listContentItems({ topic: "macro" });

    expect(published).toHaveLength(1);
    expect(published[0].id).toBe("cnt_2");
    expect(byTopic).toHaveLength(1);
    expect(byTopic[0].id).toBe("cnt_1");
  });
});

