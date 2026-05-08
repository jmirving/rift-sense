import express from "express";

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
    focusBoard: {
      greeting: "Work on one clear improvement target today.",
      todayGoal: {
        title: "Pick a focus and begin a short study block",
        summary: "Use the library to choose one topic worth revisiting before queueing again.",
        progressLabel: "0 of 1 completed"
      },
      progress: {
        todayPercent: 0,
        weeklyPercent: 0,
        monthlyPercent: 0
      },
      weeklyGoals: [],
      monthlyGoals: [],
      recentGameStats: []
    },
    coachFeed: {
      headline: "No coach recommendations are configured for this user yet.",
      sections: []
    },
    goalDashboard: normalizeGoalDashboard(),
    continueLearning: []
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

export function createHomeRouter({ config, userHomesRepository, contentItemsRepository }) {
  const router = express.Router();

  router.get("/", async (request, response) => {
    const { resolvedUserId, effectiveUserId, home } = await resolveHomeRecord({
      request,
      config,
      userHomesRepository
    });
    const isAuthenticatedHome =
      Boolean(request.identity?.id) && request.identity.id === effectiveUserId;

    response.json({
      home: await buildHomePayload({
        home: {
          ...home,
          goalDashboard: normalizeGoalDashboard(home.goalDashboard)
        },
        effectiveUserId,
        source: isAuthenticatedHome ? "authenticated" : "demo",
        contentItemsRepository
      })
    });
  });

  return router;
}
