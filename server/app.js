import express from "express";
import path from "node:path";

import { createOptionalAuth, createRequireAuth } from "./auth/middleware.js";
import { createContentItemsRouter } from "./routes/content-items.js";
import { createAuthRouter } from "./routes/auth.js";
import { createDemoRouter } from "./routes/demo.js";
import { createHomeRouter } from "./routes/home.js";
import { createOnboardingRouter } from "./routes/onboarding.js";
import { createSessionRouter } from "./routes/session.js";
import { ApiError, badRequest, formatErrorResponse } from "./errors.js";

const clientRoutes = [
  "/",
  "/demo",
  "/demo/goals",
  "/demo/review",
  "/demo/training",
  "/demo/team",
  "/demo/onboarding",
  "/goals",
  "/onboarding",
  "/library",
  "/focus/today",
  "/focus/week",
  "/focus/month",
  "/drills",
  "/test",
  "/review",
  "/training",
  "/team",
  "/content/:id",
  "/curator/content",
  "/curator/content/new"
];

export function createApp({
  config,
  contentItemsRepository,
  userHomesRepository,
  assetStore,
  previewService,
  redeemLaunchGrant,
  authenticateWithNexusAccount
}) {
  const app = express();
  const requireAuth = createRequireAuth(config);
  const optionalAuth = createOptionalAuth(config);

  app.use(express.json());
  app.use(express.static(config.publicDir));
  app.use("/public", express.static(config.publicDir));
  app.use(optionalAuth);

  app.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.use(
    "/auth",
    createAuthRouter({
      config,
      redeemLaunchGrant,
      authenticateWithNexusAccount
    })
  );

  app.use("/api/session", createSessionRouter({ config }));

  app.use(
    "/api/home",
    createHomeRouter({
      config,
      userHomesRepository,
      contentItemsRepository
    })
  );

  app.use(
    "/api/demo",
    createDemoRouter({
      contentItemsRepository
    })
  );

  app.use(
    "/api/onboarding",
    createOnboardingRouter({
      config: {
        ...config,
        requireAuth
      },
      userHomesRepository
    })
  );

  app.use(
    "/api/content-items",
    createContentItemsRouter({
      config: {
        ...config,
        requireAuth
      },
      contentItemsRepository,
      assetStore,
      previewService
    })
  );

  clientRoutes.forEach((routePath) => {
    app.get(routePath, (_request, response) => {
      response.sendFile(path.resolve(config.publicDir, "index.html"));
    });
  });

  app.use((_request, _response, next) => {
    next(new ApiError(404, "NOT_FOUND", "Route not found."));
  });

  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
      const formatted = formatErrorResponse(badRequest("Invalid JSON payload."));
      response.status(formatted.status).json(formatted.body);
      return;
    }

    const formatted = formatErrorResponse(error);
    response.status(formatted.status).json(formatted.body);
  });

  return app;
}
