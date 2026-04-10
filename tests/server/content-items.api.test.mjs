import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

import jwt from "jsonwebtoken";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../../server/app.js";
import { loadConfig } from "../../server/config.js";
import { createContentItemsRepository } from "../../server/repositories/content-items.js";
import { createUserHomesRepository } from "../../server/repositories/user-homes.js";
import { createLocalAssetStore } from "../../server/storage/local-assets.js";

const tempDirectories = [];

async function createTestApp({ authEnabled = false, previewService = null } = {}) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "rift-sense-api-"));
  tempDirectories.push(tempRoot);

  const config = loadConfig({
    NODE_ENV: "test",
    PORT: "0",
    RIFTSENSE_STORAGE_ROOT: tempRoot,
    NEXUS_AUTH_ENABLED: authEnabled ? "true" : "false",
    NEXUS_JWT_SECRET: "test-secret",
    NEXUS_AUTH_ISSUER: "nexus",
    NEXUS_AUTH_AUDIENCE: "riftsense"
  });

  const contentItemsRepository = createContentItemsRepository({
    contentItemsDir: config.contentItemsDir
  });
  const userHomesRepository = createUserHomesRepository({
    userHomesDir: config.userHomesDir
  });
  const assetStore = createLocalAssetStore({
    assetsDir: config.assetsDir
  });

  await contentItemsRepository.initialize();
  await userHomesRepository.initialize();
  await assetStore.initialize();

  return createApp({
    config,
    contentItemsRepository,
    userHomesRepository,
    assetStore,
    previewService: previewService ?? {
      async ensureDeckPreview(item) {
        return item;
      }
    }
  });
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("content item API", () => {
  it("creates an uploaded content item and exposes its asset", async () => {
    const app = await createTestApp();

    const createResponse = await request(app)
      .post("/api/content-items")
      .field("title", "Wave Control Notes")
      .field("description", "PDF upload")
      .field("contentType", "document")
      .field("sourceType", "upload")
      .field("status", "draft")
      .field("topicTags", "laning, wave-management")
      .attach("file", Buffer.from("%PDF-1.4 test"), {
        filename: "wave-control.pdf",
        contentType: "application/pdf"
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.item.viewer.mode).toBe("pdf");
    expect(createResponse.body.item.asset.accessUrl).toContain("/api/content-items/");

    const assetResponse = await request(app).get(createResponse.body.item.asset.accessUrl);
    expect(assetResponse.status).toBe(200);
  });

  it("serves uploaded slide decks as downloadable assets", async () => {
    const app = await createTestApp();

    const createResponse = await request(app)
      .post("/api/content-items")
      .field("title", "Macro Deck")
      .field("description", "PPTX upload")
      .field("contentType", "deck")
      .field("sourceType", "upload")
      .field("status", "draft")
      .field("topicTags", "macro")
      .attach("file", Buffer.from("pptx-test"), {
        filename: "macro-deck.pptx",
        contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      });

    expect(createResponse.status).toBe(201);

    const assetResponse = await request(app).get(createResponse.body.item.asset.accessUrl);
    expect(assetResponse.status).toBe(200);
    expect(assetResponse.headers["content-type"]).toContain(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );
    expect(assetResponse.headers["content-disposition"]).toContain("attachment;");
  });

  it("generates and exposes a lazy pdf preview for uploaded slide decks", async () => {
    const app = await createTestApp({
      previewService: {
        async ensureDeckPreview(item) {
          const previewPath = path.join(
            path.dirname(item.asset.storagePath),
            "macro-deck.pdf"
          );

          await import("node:fs/promises").then(({ writeFile }) =>
            writeFile(previewPath, Buffer.from("%PDF-1.4 preview"))
          );

          return {
            ...item,
            asset: {
              ...item.asset,
              preview: {
                kind: "generated-pdf",
                mimeType: "application/pdf",
                storagePath: previewPath,
                generatedAt: new Date().toISOString()
              }
            }
          };
        }
      }
    });

    const createResponse = await request(app)
      .post("/api/content-items")
      .field("title", "Macro Deck")
      .field("description", "PPTX upload")
      .field("contentType", "deck")
      .field("sourceType", "upload")
      .field("status", "draft")
      .field("topicTags", "macro")
      .attach("file", Buffer.from("pptx-test"), {
        filename: "macro-deck.pptx",
        contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.item.asset.previewUrl).toContain("/preview");
    expect(createResponse.body.item.viewer.mode).toBe("deck-preview");

    const generateResponse = await request(app).post(
      `/api/content-items/${createResponse.body.item.id}/preview`
    );
    expect(generateResponse.status).toBe(200);
    expect(generateResponse.body.item.viewer.mode).toBe("pdf-preview");

    const previewResponse = await request(app).get(
      `/api/content-items/${createResponse.body.item.id}/preview`
    );
    expect(previewResponse.status).toBe(200);
    expect(previewResponse.headers["content-type"]).toContain("application/pdf");
  });

  it("rejects publication when required publish metadata is missing", async () => {
    const app = await createTestApp();

    const response = await request(app)
      .post("/api/content-items")
      .field("title", "Incomplete Video")
      .field("description", "Missing topics")
      .field("contentType", "video")
      .field("sourceType", "external_url")
      .field("status", "published")
      .field("externalUrl", "https://www.youtube.com/watch?v=abc123");

    expect(response.status).toBe(400);
    expect(response.body.error.details.missingFields).toContain("topicTags");
  });

  it("lists only published items when filtered by status and topic", async () => {
    const app = await createTestApp();

    await request(app)
      .post("/api/content-items")
      .field("title", "Published Video")
      .field("description", "Published item")
      .field("contentType", "video")
      .field("sourceType", "external_url")
      .field("status", "published")
      .field("topicTags", "macro")
      .field("externalUrl", "https://www.youtube.com/watch?v=abc123");

    await request(app)
      .post("/api/content-items")
      .field("title", "Draft Deck")
      .field("description", "Draft item")
      .field("contentType", "deck")
      .field("sourceType", "external_url")
      .field("status", "draft")
      .field("topicTags", "macro")
      .field("externalUrl", "https://docs.google.com/presentation/d/123/edit");

    const response = await request(app).get("/api/content-items?status=published&topic=macro");

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].title).toBe("Published Video");
  });

  it("deletes a content item", async () => {
    const app = await createTestApp();

    const createResponse = await request(app)
      .post("/api/content-items")
      .field("title", "Delete Me")
      .field("description", "Temporary item")
      .field("contentType", "video")
      .field("sourceType", "external_url")
      .field("status", "draft")
      .field("topicTags", "review")
      .field("externalUrl", "https://www.youtube.com/watch?v=abc123");

    const deleteResponse = await request(app).delete(`/api/content-items/${createResponse.body.item.id}`);
    expect(deleteResponse.status).toBe(204);

    const fetchResponse = await request(app).get(`/api/content-items/${createResponse.body.item.id}`);
    expect(fetchResponse.status).toBe(404);
  });

  it("requires auth for curator mutations when Nexus auth is enabled", async () => {
    const app = await createTestApp({ authEnabled: true });

    const unauthorizedResponse = await request(app)
      .post("/api/content-items")
      .field("title", "Secure Item")
      .field("description", "Needs auth")
      .field("contentType", "video")
      .field("sourceType", "external_url")
      .field("status", "draft")
      .field("topicTags", "macro")
      .field("externalUrl", "https://www.youtube.com/watch?v=abc123");

    expect(unauthorizedResponse.status).toBe(401);

    const token = jwt.sign(
      { sub: "usr_123", iss: "nexus", aud: "riftsense" },
      "test-secret",
      { algorithm: "HS256", expiresIn: "1h" }
    );

    const authorizedResponse = await request(app)
      .post("/api/content-items")
      .set("Authorization", `Bearer ${token}`)
      .field("title", "Secure Item")
      .field("description", "Needs auth")
      .field("contentType", "video")
      .field("sourceType", "external_url")
      .field("status", "draft")
      .field("topicTags", "macro")
      .field("externalUrl", "https://www.youtube.com/watch?v=abc123");

    expect(authorizedResponse.status).toBe(201);
  });
});
