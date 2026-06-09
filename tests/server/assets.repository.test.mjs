import { afterEach, expect, it } from "vitest";

import { createPostgresAssetStore } from "../../server/storage/postgres-assets.js";
import { createMigratedPool, describeWithPostgres, dropSchema } from "./postgres-test-utils.mjs";

const databases = [];

async function createAssetStore() {
  const database = await createMigratedPool();
  databases.push(database);
  const assetStore = createPostgresAssetStore(database);
  await assetStore.initialize();
  return assetStore;
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(({ pool, schema }) => dropSchema(pool, schema)));
});

describeWithPostgres("Postgres asset store", () => {
  it("saves, gets, and deletes uploaded assets", async () => {
    const assetStore = await createAssetStore();
    const descriptor = await assetStore.saveUploadedFile({
      contentId: "cnt_asset",
      file: {
        originalname: "notes.pdf",
        mimetype: "application/pdf",
        size: 8,
        buffer: Buffer.from("pdf-test")
      }
    });

    expect(descriptor).toEqual({
      kind: "uploaded-file",
      originalFilename: "notes.pdf",
      mimeType: "application/pdf",
      sizeBytes: 8,
      storageKey: "cnt_asset"
    });
    await expect(assetStore.getAssetForItem("cnt_asset")).resolves.toMatchObject({
      originalFilename: "notes.pdf",
      mimeType: "application/pdf",
      sizeBytes: 8,
      bytes: Buffer.from("pdf-test")
    });

    await assetStore.removeAssetForItem("cnt_asset");
    await expect(assetStore.getAssetForItem("cnt_asset")).resolves.toBeNull();
  });
});
