import express from "express";

import { buildSharedProfileIdentity, resolveSharedProfile } from "../auth/shared-profile.js";
import { buildHomePayload } from "./home-response.js";

function buildAuthenticatedEmptyHome(userId, identity) {
  // TODO: Replace this minimal first-run state with a dedicated guided setup page.
  return {
    id: userId,
    profile: {
      displayName: identity?.displayName ?? "RiftSense Player",
      teamName: null,
      primaryRole: null,
      focusArea: "Setup needed"
    },
    setupGuide: {
      status: "setup-needed",
      title: "Setup needed",
      summary: "RiftSense does not have goal or team focus setup for this account yet.",
      href: "/onboarding",
      label: "Open setup"
    },
    goalDashboard: {
      activePersonalGoal: {
        title: null,
        scope: "Personal",
        role: null,
        status: "pending",
        goalStatus: "Setup needed",
        goalStatusTrend: "unknown",
        trend: "Unknown",
        trendKey: "unknown",
        confidence: "No setup yet",
        progressSummary: "Create an initial goal setup to start collecting review evidence.",
        weeklyTargets: [],
        monthlyTargets: [],
        signals: [],
        evidenceSource: {
          summary: "No goal setup yet.",
          confidence: "No reviewed games yet",
          confidenceTrend: "unknown",
          totalEvents: 0,
          sourceBreakdown: []
        }
      },
      todaysAction: {
        title: "Complete setup",
        estimatedMinutes: 10,
        href: "/onboarding",
        ctaLabel: "Open setup",
        steps: [
          "Choose a primary role.",
          "Select one personal goal.",
          "Save the first active dashboard setup."
        ]
      },
      activeTeamFocus: {
        title: "No team focus configured",
        practiceTopic: "",
        assignedReview: "",
        assignment: "Choose setup to add a team focus.",
        signals: [],
        checklist: [],
        nextTeamAction: null,
        evidenceSource: {
          summary: "No team focus setup yet.",
          confidence: "No reviewed team evidence yet",
          confidenceTrend: "unknown",
          totalEvents: 0,
          sourceBreakdown: []
        },
        headlineSignal: null
      },
      recentInsights: [],
      suggestedNextSteps: [
        {
          id: "setup-riftsense-home",
          title: "Save setup",
          type: "setup",
          estimatedMinutes: 10,
          summary: "Create your first goal and team focus setup.",
          reason: "RiftSense needs an initial setup before it can score games against your goals.",
          label: "Setup",
          href: "/onboarding",
          source: "setup",
          priority: "high"
        }
      ]
    }
  };
}

function buildPublicHomePayload() {
  return {
    user: {
      id: null,
      source: "public",
      profile: {
        primaryRole: null,
        secondaryRoles: [],
        riotGameName: null,
        riotTagline: null,
        riotPuuid: null,
        preferredTeamId: null,
        activeTeamId: null
      },
      riot: null
    },
    publicEntry: {
      title: "RiftSense",
      summary: "Review goals, recent games, and team focus from a Nexus-authenticated League workflow.",
      signInHref: "/#session-login-form",
      signInLabel: "Continue with Nexus",
      aboutHref: "/about",
      demoHref: "/demo"
    },
    goalDashboard: null
  };
}

async function resolveAuthenticatedHomeRecord({ request, userHomesRepository }) {
  const resolvedUserId = request.identity.id;
  const matchedHome = await userHomesRepository.getUserHome(resolvedUserId);
  const home = matchedHome ?? buildAuthenticatedEmptyHome(resolvedUserId, request.identity);
  return {
    resolvedUserId,
    effectiveUserId: resolvedUserId,
    home
  };
}

export function createHomeRouter({
  config,
  userHomesRepository,
  contentItemsRepository,
  fetchSharedProfile,
  resolveRecentGames,
  riotMatchesRepository,
  fetchImpl
}) {
  const router = express.Router();

  router.get("/", async (request, response) => {
    if (!request.identity?.id) {
      response.json({
        home: buildPublicHomePayload()
      });
      return;
    }

    const { effectiveUserId, home } = await resolveAuthenticatedHomeRecord({
      request,
      userHomesRepository
    });
    const sharedProfile = await resolveSharedProfile({
      request,
      config,
      fetchSharedProfileImpl: fetchSharedProfile
    });
    const identity = {
      ...request.identity,
      riot: sharedProfile ? buildSharedProfileIdentity(sharedProfile) : request.identity?.riot ?? null,
      profile: sharedProfile
    };

    response.json({
      home: await buildHomePayload({
        home,
        effectiveUserId,
        source: "authenticated",
        contentItemsRepository,
        identity,
        config,
        fetchImpl,
        resolveRecentGames,
        riotMatchesRepository
      })
    });
  });

  return router;
}
