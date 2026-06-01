import jwt from "jsonwebtoken";

import { extractCookieValue } from "./cookies.js";

const PROFILE_CACHE_AUDIENCE = "riftsense-shared-profile";
const PROFILE_CACHE_COOKIE = "riftsense_shared_profile";

function normalizeSharedProfile(profile, userId = null) {
  const source = profile && typeof profile === "object" ? profile : {};
  const normalizeOptionalString = (value) =>
    typeof value === "string" && value.trim() ? value.trim() : null;

  return {
    userId: normalizeOptionalString(source.userId) ?? userId,
    riotGameName: normalizeOptionalString(source.riotGameName),
    riotTagline: normalizeOptionalString(source.riotTagline),
    riotPuuid: normalizeOptionalString(source.riotPuuid),
    primaryRole: normalizeOptionalString(source.primaryRole),
    secondaryRoles: Array.isArray(source.secondaryRoles)
      ? source.secondaryRoles.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim())
      : [],
    preferredTeamId: normalizeOptionalString(source.preferredTeamId),
    activeTeamId: normalizeOptionalString(source.activeTeamId)
  };
}

export function signSharedProfile(profile, userId, config) {
  return jwt.sign(
    normalizeSharedProfile(profile, userId),
    config.auth.jwtSecret,
    {
      algorithm: "HS256",
      issuer: config.auth.issuer,
      audience: PROFILE_CACHE_AUDIENCE,
      expiresIn: "12h",
      subject: userId
    }
  );
}

export function verifySharedProfile(token, userId, config) {
  try {
    const payload = jwt.verify(token, config.auth.jwtSecret, {
      algorithms: ["HS256"],
      issuer: config.auth.issuer,
      audience: PROFILE_CACHE_AUDIENCE,
      subject: userId
    });
    return normalizeSharedProfile(payload, userId);
  } catch {
    return null;
  }
}

export function readSharedProfileCookie(request, config) {
  const token = extractCookieValue(request.headers.cookie, PROFILE_CACHE_COOKIE);
  if (!token || !request.identity?.id || !config.auth.jwtSecret) {
    return null;
  }

  return verifySharedProfile(token, request.identity.id, config);
}

export function buildSharedProfileIdentity(profile) {
  const resolved = normalizeSharedProfile(profile);
  const puuid = typeof resolved.riotPuuid === "string" ? resolved.riotPuuid.trim() : "";

  return puuid
    ? {
        puuid,
        gameName: resolved.riotGameName,
        tagLine: resolved.riotTagline,
        platformRegion: null,
        routingRegion: null,
        verifiedAt: null
      }
    : null;
}

export async function fetchSharedProfile({
  config,
  accessToken,
  fetchImpl = fetch
}) {
  if (!config.auth.sharedProfileUrl || !accessToken) {
    return null;
  }

  const response = await fetchImpl(config.auth.sharedProfileUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json().catch(() => null);
  return payload?.profile ? normalizeSharedProfile(payload.profile) : null;
}

export async function resolveSharedProfile({
  request,
  config,
  fetchSharedProfileImpl = fetchSharedProfile
}) {
  if (!request.identity?.id) {
    return null;
  }

  const fromCookie = readSharedProfileCookie(request, config);
  if (fromCookie) {
    return fromCookie;
  }

  if (!request.accessToken) {
    return null;
  }

  try {
    return await fetchSharedProfileImpl({
      config,
      accessToken: request.accessToken
    });
  } catch {
    return null;
  }
}

export { PROFILE_CACHE_COOKIE };
