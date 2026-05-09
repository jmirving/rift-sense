import express from "express";

import { buildSharedProfileIdentity, resolveSharedProfile } from "../auth/shared-profile.js";

function buildAccountUrl(portalBaseUrl) {
  if (typeof portalBaseUrl !== "string" || !portalBaseUrl.trim()) {
    return "";
  }

  try {
    return new URL("/account", portalBaseUrl).toString();
  } catch {
    return "";
  }
}

export function createSessionRouter({ config, fetchSharedProfile }) {
  const router = express.Router();

  router.get("/", async (request, response) => {
    const authenticated = Boolean(request.identity?.id);
    const sharedProfile = authenticated
      ? await resolveSharedProfile({
          request,
          config,
          fetchSharedProfileImpl: fetchSharedProfile
        })
      : null;
    const riot = sharedProfile ? buildSharedProfileIdentity(sharedProfile) : request.identity?.riot ?? null;

    response.json({
      authEnabled: config.auth.enabled,
      authenticated,
      user: authenticated
        ? {
            id: request.identity.id,
            displayName: request.identity.displayName ?? null,
            email: request.identity.email ?? null,
            riot,
            profile: sharedProfile
          }
        : null,
      accountUrl: buildAccountUrl(config.auth.portalBaseUrl),
      portalBaseUrl: config.auth.portalBaseUrl,
      manualTokenEntryAvailable: Boolean(config.auth.allowManualTokenEntry)
    });
  });

  return router;
}
