import { unauthorized } from "../errors.js";
import { extractCookieValue } from "./cookies.js";
import { verifyAccessToken } from "./tokens.js";

function extractBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== "string") {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}

function extractCookieToken(cookieHeader, config) {
  return (
    extractCookieValue(cookieHeader, config.auth.sessionCookieName) ??
    extractCookieValue(cookieHeader, "nexus_access_token")
  );
}

function extractAccessToken(request, config) {
  return (
    extractBearerToken(request.headers.authorization) ??
    extractCookieToken(request.headers.cookie, config)
  );
}

function normalizePayload(payload) {
  const subjectId = typeof payload?.sub === "string" ? payload.sub.trim() : "";
  if (!subjectId) {
    throw unauthorized("Invalid authentication token.");
  }

  return {
    subjectId,
    issuer: typeof payload?.iss === "string" ? payload.iss : "",
    audience: payload?.aud,
    claims: payload
  };
}

function buildIdentity(auth) {
  const claims = auth.claims ?? {};
  const riotClaims = claims.riot && typeof claims.riot === "object" ? claims.riot : claims;
  const puuid = typeof riotClaims?.puuid === "string" ? riotClaims.puuid.trim() : "";

  return {
    id: auth.subjectId,
    displayName: typeof claims?.displayName === "string" ? claims.displayName : null,
    email: typeof claims?.email === "string" ? claims.email : null,
    riot: puuid
      ? {
          puuid,
          gameName: typeof riotClaims?.gameName === "string" ? riotClaims.gameName : null,
          tagLine: typeof riotClaims?.tagLine === "string" ? riotClaims.tagLine : null,
          platformRegion: typeof riotClaims?.platformRegion === "string" ? riotClaims.platformRegion : null,
          routingRegion: typeof riotClaims?.routingRegion === "string" ? riotClaims.routingRegion : null,
          verifiedAt: typeof riotClaims?.verifiedAt === "string" ? riotClaims.verifiedAt : null
        }
      : null
  };
}

export function createRequireAuth(config) {
  return function requireAuth(request, _response, next) {
    if (!config.auth.enabled) {
      next();
      return;
    }

    try {
      const token = extractAccessToken(request, config);
      if (!token) {
        throw unauthorized("Missing shared access token.");
      }

      const payload = verifyAccessToken(token, config);
      request.auth = normalizePayload(payload);
      request.identity = buildIdentity(request.auth);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function createOptionalAuth(config) {
  return function optionalAuth(request, _response, next) {
    if (!config.auth.enabled) {
      next();
      return;
    }

    try {
      const token = extractAccessToken(request, config);
      if (!token) {
        next();
        return;
      }

      const payload = verifyAccessToken(token, config);
      request.auth = normalizePayload(payload);
      request.identity = buildIdentity(request.auth);
      next();
    } catch {
      next();
    }
  };
}
