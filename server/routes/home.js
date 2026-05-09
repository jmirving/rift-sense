import express from "express";

import { buildSharedProfileIdentity, resolveSharedProfile } from "../auth/shared-profile.js";
import { normalizeGoalDashboard } from "../goal-dashboard.js";
import { buildHomePayload } from "./home-response.js";

function buildFallbackHome(userId) {
  return {
    id: userId,
    profile: {
      displayName: "RiftSense Player",
      teamName: "Local Demo Squad",
      primaryRole: "Flex",
      focusArea: "Library orientation"
    },
    goalDashboard: normalizeGoalDashboard()
  };
}

async function resolveHomeRecord({ request, config, userHomesRepository }) {
  const resolvedUserId = request.identity?.id ?? config.demoUserId;
  const matchedHome =
    (await userHomesRepository.getUserHome(resolvedUserId)) ??
    (resolvedUserId !== config.demoUserId
      ? await userHomesRepository.getUserHome(config.demoUserId)
      : null);

  const home = matchedHome ?? buildFallbackHome(resolvedUserId);
  return {
    resolvedUserId,
    effectiveUserId: home.id ?? resolvedUserId,
    home
  };
}

export function createHomeRouter({
  config,
  userHomesRepository,
  contentItemsRepository,
  fetchSharedProfile
}) {
  const router = express.Router();

  router.get("/", async (request, response) => {
    const { resolvedUserId, effectiveUserId, home } = await resolveHomeRecord({
      request,
      config,
      userHomesRepository
    });
    const isAuthenticatedHome =
      Boolean(request.identity?.id) && request.identity.id === effectiveUserId;
    const sharedProfile = isAuthenticatedHome
      ? await resolveSharedProfile({
          request,
          config,
          fetchSharedProfileImpl: fetchSharedProfile
        })
      : null;
    const identity = isAuthenticatedHome
      ? {
          ...request.identity,
          riot: sharedProfile ? buildSharedProfileIdentity(sharedProfile) : request.identity?.riot ?? null,
          profile: sharedProfile
        }
      : request.identity;

    response.json({
      home: await buildHomePayload({
        home,
        effectiveUserId,
        source: isAuthenticatedHome ? "authenticated" : "demo",
        contentItemsRepository,
        identity
      })
    });
  });

  return router;
}
