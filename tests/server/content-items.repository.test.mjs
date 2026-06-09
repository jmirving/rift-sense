import { afterEach, expect, it } from "vitest";

import { createContentItemsRepository } from "../../server/repositories/content-items.js";
import { createMigratedPool, describeWithPostgres, dropSchema } from "./postgres-test-utils.mjs";

const databases = [];

async function createRepository() {
  const database = await createMigratedPool();
  databases.push(database);
  const repository = createContentItemsRepository(database);
  await repository.initialize();
  return repository;
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(({ pool, schema }) => dropSchema(pool, schema)));
});

describeWithPostgres("content items repository", () => {
  it("saves, gets, lists, filters, and deletes content items", async () => {
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

    await expect(repository.getContentItem("cnt_1")).resolves.toMatchObject({ id: "cnt_1" });
    await expect(repository.listContentItems({ status: "published" })).resolves.toMatchObject([
      { id: "cnt_2" }
    ]);
    await expect(repository.listContentItems({ contentType: "document" })).resolves.toMatchObject([
      { id: "cnt_1" }
    ]);
    await expect(repository.listContentItems({ topic: "macro" })).resolves.toMatchObject([
      { id: "cnt_1" }
    ]);

    await expect(repository.deleteContentItem("cnt_1")).resolves.toBe(true);
    await expect(repository.getContentItem("cnt_1")).resolves.toBeNull();
  });
});
