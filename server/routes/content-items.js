import path from "node:path";
import { promises as fs } from "node:fs";

import express from "express";
import multer from "multer";

import { attachViewer, buildContentItemRecord, ensurePublishable } from "../content-items.js";
import { badRequest, notFound } from "../errors.js";
import { canGenerateDeckPreview } from "../previews.js";

function serializeContentItem(record) {
  const withViewer = attachViewer(record);
  if (withViewer.asset?.kind === "uploaded-file") {
    return {
      ...withViewer,
      asset: {
        ...withViewer.asset,
        accessUrl: `/api/content-items/${withViewer.id}/asset`,
        previewUrl:
          withViewer.asset.preview?.mimeType === "application/pdf" || canGenerateDeckPreview(withViewer.asset)
            ? `/api/content-items/${withViewer.id}/preview`
            : null,
        shareUrl: `/content/${withViewer.id}`
      }
    };
  }
  return {
    ...withViewer,
    shareUrl: `/content/${withViewer.id}`
  };
}

export function createContentItemsRouter({ config, contentItemsRepository, assetStore, previewService }) {
  const router = express.Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: config.maxUploadBytes
    }
  });
  const requireCuratorAuth = config.requireAuth;

  router.get("/", async (request, response) => {
    const items = await contentItemsRepository.listContentItems({
      status: request.query.status,
      contentType: request.query.contentType,
      topic: request.query.topic
    });

    response.json({
      items: items.map(serializeContentItem)
    });
  });

  router.get("/:id", async (request, response) => {
    const item = await contentItemsRepository.getContentItem(request.params.id);
    if (!item) {
      throw notFound("Content item not found.");
    }

    response.json({
      item: serializeContentItem(item)
    });
  });

  router.get("/:id/asset", async (request, response) => {
    const item = await contentItemsRepository.getContentItem(request.params.id);
    if (!item || item.asset?.kind !== "uploaded-file") {
      throw notFound("Asset not found.");
    }

    const assetPath = path.resolve(item.asset.storagePath);
    const fileBuffer = await fs.readFile(assetPath);
    const dispositionType = item.asset.mimeType === "application/pdf" ? "inline" : "attachment";

    response
      .type(item.asset.mimeType || path.extname(assetPath))
      .setHeader("Content-Disposition", `${dispositionType}; filename="${encodeURIComponent(item.asset.originalFilename)}"`)
      .send(fileBuffer);
  });

  router.get("/:id/preview", async (request, response) => {
    const item = await contentItemsRepository.getContentItem(request.params.id);
    if (!item || item.asset?.kind !== "uploaded-file" || item.asset.preview?.mimeType !== "application/pdf") {
      throw notFound("Preview not found.");
    }

    const previewPath = path.resolve(item.asset.preview.storagePath);
    const previewBuffer = await fs.readFile(previewPath);

    response
      .type("application/pdf")
      .setHeader("Content-Disposition", 'inline; filename="preview.pdf"')
      .send(previewBuffer);
  });

  router.post("/:id/preview", async (request, response) => {
    const item = await contentItemsRepository.getContentItem(request.params.id);
    if (!item) {
      throw notFound("Content item not found.");
    }

    const previewReadyItem = await previewService.ensureDeckPreview(item);
    const saved = await contentItemsRepository.saveContentItem({
      ...previewReadyItem,
      updatedAt: new Date().toISOString()
    });

    response.json({
      item: serializeContentItem(saved)
    });
  });

  router.post("/", requireCuratorAuth, upload.single("file"), async (request, response) => {
    const baseRecord = buildContentItemRecord({
      body: request.body,
      file: request.file
    });

    if (request.file) {
      baseRecord.asset = await assetStore.saveUploadedFile({
        contentId: baseRecord.id,
        file: request.file
      });
    }

    if (baseRecord.status === "published") {
      ensurePublishable(baseRecord);
    }

    const saved = await contentItemsRepository.saveContentItem(baseRecord);
    response.status(201).json({
      item: serializeContentItem(saved)
    });
  });

  router.put("/:id", requireCuratorAuth, upload.single("file"), async (request, response) => {
    const existingItem = await contentItemsRepository.getContentItem(request.params.id);
    if (!existingItem) {
      throw notFound("Content item not found.");
    }

    const nextRecord = buildContentItemRecord({
      body: request.body,
      file: request.file,
      existingItem
    });

    if (
      existingItem.asset?.kind === "uploaded-file" &&
      (request.file || nextRecord.sourceType !== "upload")
    ) {
      await assetStore.removeAssetForItem(existingItem.id);
    }

    if (request.file) {
      nextRecord.asset = await assetStore.saveUploadedFile({
        contentId: existingItem.id,
        file: request.file
      });
    }

    if (nextRecord.status === "published") {
      ensurePublishable(nextRecord);
    }

    const saved = await contentItemsRepository.saveContentItem(nextRecord);
    response.json({
      item: serializeContentItem(saved)
    });
  });

  router.post("/:id/publish", requireCuratorAuth, async (request, response) => {
    const item = await contentItemsRepository.getContentItem(request.params.id);
    if (!item) {
      throw notFound("Content item not found.");
    }

    const nextRecord = {
      ...item,
      status: "published",
      publishedAt: item.publishedAt ?? new Date().toISOString(),
      archivedAt: null,
      updatedAt: new Date().toISOString()
    };
    ensurePublishable(nextRecord);

    const saved = await contentItemsRepository.saveContentItem(nextRecord);
    response.json({
      item: serializeContentItem(saved)
    });
  });

  router.delete("/:id", requireCuratorAuth, async (request, response) => {
    const item = await contentItemsRepository.getContentItem(request.params.id);
    if (!item) {
      throw notFound("Content item not found.");
    }

    await contentItemsRepository.deleteContentItem(item.id);
    await assetStore.removeAssetForItem(item.id);

    response.status(204).end();
  });

  router.use((error, _request, _response, next) => {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      next(badRequest(`Upload exceeds ${config.maxUploadBytes} bytes.`));
      return;
    }
    next(error);
  });

  return router;
}
