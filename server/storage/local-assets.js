import path from "node:path";
import { promises as fs } from "node:fs";

import { ensureDirectory, removePath } from "./fs.js";

function sanitizeFilename(filename) {
  return String(filename ?? "upload")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "upload";
}

export function createLocalAssetStore({ assetsDir }) {
  async function initialize() {
    await ensureDirectory(assetsDir);
  }

  async function saveUploadedFile({ contentId, file }) {
    const itemAssetDir = path.resolve(assetsDir, contentId);
    await ensureDirectory(itemAssetDir);

    const filename = sanitizeFilename(file.originalname);
    const assetPath = path.resolve(itemAssetDir, filename);

    await fs.writeFile(assetPath, file.buffer);

    return {
      kind: "uploaded-file",
      originalFilename: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      storagePath: assetPath
    };
  }

  async function removeAssetForItem(contentId) {
    await removePath(path.resolve(assetsDir, contentId));
  }

  return {
    initialize,
    saveUploadedFile,
    removeAssetForItem
  };
}

