import { randomUUID } from "node:crypto";

import { badRequest } from "./errors.js";
import { parseOptionalInteger, parseOptionalString, requireEnum, requireNonEmptyString, requireValidUrl } from "./http/validation.js";
import { resolveViewerForAsset } from "./viewers.js";

export const CONTENT_TYPES = ["document", "deck", "video"];
export const SOURCE_TYPES = ["upload", "external_url"];
export const CONTENT_STATUSES = ["draft", "published", "archived"];
export const ALLOWED_UPLOAD_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain"
];

export function normalizeTopicTags(value) {
  const parts = Array.isArray(value) ? value : String(value ?? "").split(",");

  return [...new Set(
    parts
      .map((item) => String(item ?? "").trim().toLowerCase())
      .filter(Boolean)
  )];
}

function parseBooleanFlag(value) {
  return ["true", "1", "on", "yes"].includes(String(value ?? "").trim().toLowerCase());
}

function resolveExternalProvider(url) {
  const hostname = new URL(url).hostname.toLowerCase();
  if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) {
    return "youtube";
  }

  if (hostname.includes("docs.google.com")) {
    return "google";
  }

  return "external";
}

function buildGrouping(body) {
  const groupKey = parseOptionalString(body.groupKey);
  const groupLabel = parseOptionalString(body.groupLabel);
  const order = parseOptionalInteger(body.groupOrder, "groupOrder");

  if (!groupKey && !groupLabel && order === null) {
    return null;
  }

  return {
    groupKey,
    groupLabel,
    order
  };
}

export function assertAllowedUpload(file) {
  if (!file) {
    return;
  }

  if (!ALLOWED_UPLOAD_MIME_TYPES.includes(file.mimetype)) {
    throw badRequest("Unsupported upload type.", {
      allowedMimeTypes: ALLOWED_UPLOAD_MIME_TYPES
    });
  }
}

export function buildAssetInput({ body, file, existingItem = null }) {
  const sourceType = requireEnum(
    body.sourceType ?? existingItem?.sourceType,
    "sourceType",
    SOURCE_TYPES
  );

  if (sourceType === "upload") {
    if (file) {
      assertAllowedUpload(file);
      return {
        sourceType,
        asset: {
          kind: "pending-upload"
        }
      };
    }

    if (existingItem?.asset?.kind === "uploaded-file") {
      return {
        sourceType,
        asset: existingItem.asset
      };
    }

    throw badRequest("Expected an uploaded file for sourceType 'upload'.");
  }

  const url = requireValidUrl(body.externalUrl ?? existingItem?.asset?.url, "externalUrl");
  return {
    sourceType,
    asset: {
      kind: "external-link",
      url,
      provider: resolveExternalProvider(url)
    }
  };
}

export function buildContentItemRecord({ body, file, existingItem = null, now = new Date().toISOString() }) {
  const source = buildAssetInput({ body, file, existingItem });
  const status = requireEnum(body.status ?? existingItem?.status ?? "draft", "status", CONTENT_STATUSES);
  const record = {
    id: existingItem?.id ?? `cnt_${randomUUID()}`,
    title: requireNonEmptyString(body.title ?? existingItem?.title, "title"),
    description: requireNonEmptyString(body.description ?? existingItem?.description, "description"),
    contentType: requireEnum(
      body.contentType ?? existingItem?.contentType,
      "contentType",
      CONTENT_TYPES
    ),
    sourceType: source.sourceType,
    status,
    topicTags: normalizeTopicTags(body.topicTags ?? existingItem?.topicTags),
    patchSensitive: parseBooleanFlag(body.patchSensitive),
    grouping: buildGrouping({
      groupKey: body.groupKey ?? existingItem?.grouping?.groupKey,
      groupLabel: body.groupLabel ?? existingItem?.grouping?.groupLabel,
      groupOrder: body.groupOrder ?? existingItem?.grouping?.order
    }),
    asset: source.asset,
    viewer: null,
    createdAt: existingItem?.createdAt ?? now,
    updatedAt: now,
    publishedAt: existingItem?.publishedAt ?? null,
    archivedAt: existingItem?.archivedAt ?? null
  };

  if (status === "published") {
    ensurePublishable(record);
    record.publishedAt = existingItem?.publishedAt ?? now;
    record.archivedAt = null;
  } else if (status === "archived") {
    record.archivedAt = now;
  }

  return record;
}

export function attachViewer(record) {
  return {
    ...record,
    viewer: resolveViewerForAsset(record.asset)
  };
}

export function ensurePublishable(record) {
  const errors = [];

  if (!record.title) {
    errors.push("title");
  }
  if (!record.description) {
    errors.push("description");
  }
  if (!record.contentType) {
    errors.push("contentType");
  }
  if (!record.sourceType) {
    errors.push("sourceType");
  }
  if (!Array.isArray(record.topicTags) || record.topicTags.length === 0) {
    errors.push("topicTags");
  }
  if (!record.asset) {
    errors.push("asset");
  }
  if (record.sourceType === "external_url" && !record.asset?.url) {
    errors.push("externalUrl");
  }

  if (errors.length > 0) {
    throw badRequest("Content item is not eligible for publication.", {
      missingFields: errors
    });
  }
}

