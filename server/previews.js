import path from "node:path";
import { spawn } from "node:child_process";

import { ApiError, badRequest } from "./errors.js";
import { fileExists } from "./storage/fs.js";

export const CONVERTIBLE_DECK_MIME_TYPES = [
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"
];

export function canGenerateDeckPreview(asset) {
  return asset?.kind === "uploaded-file" && CONVERTIBLE_DECK_MIME_TYPES.includes(asset.mimeType);
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
    });
  });
}

function buildPreviewMetadata(storagePath, now = new Date().toISOString()) {
  return {
    kind: "generated-pdf",
    mimeType: "application/pdf",
    storagePath,
    generatedAt: now
  };
}

export function createPreviewService() {
  async function ensureDeckPreview(item) {
    if (!canGenerateDeckPreview(item?.asset)) {
      throw badRequest("This asset does not support in-app deck preview generation.");
    }

    if (item.asset.preview?.storagePath && (await fileExists(item.asset.preview.storagePath))) {
      return {
        ...item,
        asset: {
          ...item.asset,
          preview: item.asset.preview
        }
      };
    }

    const sourcePath = path.resolve(item.asset.storagePath);
    const outputDir = path.dirname(sourcePath);
    const outputPath = path.resolve(
      outputDir,
      `${path.basename(sourcePath, path.extname(sourcePath))}.pdf`
    );

    let lastError = null;

    for (const command of ["soffice", "libreoffice"]) {
      try {
        await runCommand(command, [
          "--headless",
          "--convert-to",
          "pdf",
          "--outdir",
          outputDir,
          sourcePath
        ]);

        if (await fileExists(outputPath)) {
          return {
            ...item,
            asset: {
              ...item.asset,
              preview: buildPreviewMetadata(outputPath)
            }
          };
        }
      } catch (error) {
        if (error?.code === "ENOENT") {
          lastError = error;
          continue;
        }

        lastError = error;
        break;
      }
    }

    throw new ApiError(
      503,
      "PREVIEW_UNAVAILABLE",
      "In-app slide preview is unavailable on this deployment. Download the original deck or use the share link instead.",
      lastError ? { reason: lastError.message } : undefined
    );
  }

  return {
    ensureDeckPreview
  };
}
