import jwt from "jsonwebtoken";

import { unauthorized } from "../errors.js";

export function verifyAccessToken(token, config) {
  if (!config.auth.enabled || !config.auth.jwtSecret) {
    throw unauthorized("Authentication is not configured.");
  }

  try {
    return jwt.verify(token, config.auth.jwtSecret, {
      algorithms: ["HS256"],
      issuer: config.auth.issuer,
      audience: config.auth.audience
    });
  } catch {
    throw unauthorized("Invalid authentication token.");
  }
}

