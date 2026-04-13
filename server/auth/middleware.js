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
  return {
    id: auth.subjectId,
    displayName: typeof auth.claims?.displayName === "string" ? auth.claims.displayName : null,
    email: typeof auth.claims?.email === "string" ? auth.claims.email : null
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
