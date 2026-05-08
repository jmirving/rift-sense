import express from "express";

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

export function createSessionRouter({ config }) {
  const router = express.Router();

  router.get("/", (request, response) => {
    const authenticated = Boolean(request.identity?.id);

    response.json({
      authEnabled: config.auth.enabled,
      authenticated,
      user: authenticated
        ? {
            id: request.identity.id,
            displayName: request.identity.displayName ?? null,
            email: request.identity.email ?? null,
            riot: request.identity.riot ?? null
          }
        : null,
      accountUrl: buildAccountUrl(config.auth.portalBaseUrl),
      portalBaseUrl: config.auth.portalBaseUrl,
      manualTokenEntryAvailable: Boolean(config.auth.allowManualTokenEntry)
    });
  });

  return router;
}
