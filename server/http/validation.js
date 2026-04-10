import { badRequest } from "../errors.js";

export function requireObject(value, fieldName = "body") {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw badRequest(`Expected ${fieldName} to be a JSON object.`);
  }
  return value;
}

export function requireNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw badRequest(`Expected '${fieldName}' to be a non-empty string.`);
  }
  return value.trim();
}

export function requireEnum(value, fieldName, allowedValues) {
  const normalized = requireNonEmptyString(value, fieldName);
  if (!allowedValues.includes(normalized)) {
    throw badRequest(`Expected '${fieldName}' to be one of: ${allowedValues.join(", ")}.`);
  }
  return normalized;
}

export function parseOptionalString(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : "";
}

export function parseOptionalInteger(value, fieldName) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed)) {
    throw badRequest(`Expected '${fieldName}' to be an integer.`);
  }
  return parsed;
}

export function requireValidUrl(value, fieldName = "url") {
  const urlText = requireNonEmptyString(value, fieldName);
  let parsed;
  try {
    parsed = new URL(urlText);
  } catch {
    throw badRequest(`Expected '${fieldName}' to be a valid URL.`);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw badRequest(`Expected '${fieldName}' to use http or https.`);
  }

  return parsed.toString();
}

