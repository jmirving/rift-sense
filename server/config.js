import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(serverDir, "..");

function parsePort(value, defaultValue = 3000) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue;
}

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function normalizeUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }

  try {
    return new URL(value.trim()).toString();
  } catch {
    return "";
  }
}

function deriveAppLoginUrl(env, portalBaseUrl) {
  const explicit = normalizeUrl(env.NEXUS_APP_LOGIN_URL ?? "");
  if (explicit) {
    return explicit;
  }

  if (!portalBaseUrl) {
    return "";
  }

  try {
    return new URL("/api/auth/app-login", portalBaseUrl).toString();
  } catch {
    return "";
  }
}

function deriveSharedProfileUrl(env, portalBaseUrl) {
  const explicit = normalizeUrl(env.NEXUS_SHARED_PROFILE_URL ?? "");
  if (explicit) {
    return explicit;
  }

  if (!portalBaseUrl) {
    return "";
  }

  try {
    return new URL("/api/me/profile", portalBaseUrl).toString();
  } catch {
    return "";
  }
}

export function loadConfig(env = process.env) {
  const storageRoot = path.resolve(projectRoot, env.RIFTSENSE_STORAGE_ROOT ?? "storage");
  const maxUploadBytes = Number.parseInt(String(env.RIFTSENSE_MAX_UPLOAD_BYTES ?? ""), 10);
  const authEnabled = parseBoolean(env.NEXUS_AUTH_ENABLED ?? "");
  const portalBaseUrl = normalizeUrl(env.NEXUS_PORTAL_BASE_URL ?? "http://127.0.0.1:3000");

  return {
    nodeEnv: env.NODE_ENV ?? "development",
    port: parsePort(env.PORT),
    projectRoot,
    publicDir: path.resolve(projectRoot, "public"),
    storageRoot,
    contentItemsDir: path.resolve(storageRoot, "content-items"),
    userHomesDir: path.resolve(storageRoot, "user-homes"),
    assetsDir: path.resolve(storageRoot, "assets"),
    demoUserId: env.RIFTSENSE_DEMO_USER_ID ?? "usr_local_guest",
    maxUploadBytes:
      Number.isInteger(maxUploadBytes) && maxUploadBytes > 0 ? maxUploadBytes : 25 * 1024 * 1024,
    auth: {
      enabled: authEnabled,
      issuer: env.NEXUS_AUTH_ISSUER ?? "nexus",
      audience: env.NEXUS_AUTH_AUDIENCE ?? "riftsense",
      jwtSecret:
        typeof env.NEXUS_APP_SIGNING_SECRET === "string" && env.NEXUS_APP_SIGNING_SECRET.trim()
          ? env.NEXUS_APP_SIGNING_SECRET.trim()
          : typeof env.NEXUS_JWT_SECRET === "string"
            ? env.NEXUS_JWT_SECRET.trim()
            : "",
      sessionCookieName: env.RIFTSENSE_SESSION_COOKIE_NAME ?? "riftsense_access_token",
      exchangeUrl: normalizeUrl(env.NEXUS_EXCHANGE_URL ?? ""),
      exchangeSecret:
        typeof env.NEXUS_RIFTSENSE_EXCHANGE_SECRET === "string" && env.NEXUS_RIFTSENSE_EXCHANGE_SECRET.trim()
          ? env.NEXUS_RIFTSENSE_EXCHANGE_SECRET.trim()
          : typeof env.RIFTSENSE_EXCHANGE_SECRET === "string"
            ? env.RIFTSENSE_EXCHANGE_SECRET.trim()
            : "",
      portalBaseUrl,
      appLoginUrl: deriveAppLoginUrl(env, portalBaseUrl),
      sharedProfileUrl: deriveSharedProfileUrl(env, portalBaseUrl),
      allowManualTokenEntry: env.NODE_ENV !== "production"
    }
  };
}
