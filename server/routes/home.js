import express from "express";

import { normalizeGoalDashboard } from "../goal-dashboard.js";

function buildContentLink(item) {
  if (!item) {
    return null;
  }

  return {
    id: item.id,
    title: item.title,
    description: item.description,
    contentType: item.contentType,
    status: item.status,
    href: `/content/${item.id}`
  };
}

function normalizeMetric(metric) {
  return {
    label: metric.label,
    value: metric.value,
    trend: metric.trend ?? null,
    note: metric.note ?? null
  };
}

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

async function hydrateCoachSections(sections, contentItemsRepository) {
  return Promise.all(
    (sections ?? []).map(async (section) => {
      const items = await Promise.all(
        (section.items ?? []).map(async (item) => {
          const linkedContent = item.contentItemId
            ? await contentItemsRepository.getContentItem(item.contentItemId)
            : null;

          return {
            id: item.id,
            title: item.title ?? linkedContent?.title ?? "Untitled recommendation",
            summary: item.summary ?? linkedContent?.description ?? "",
            emphasis: item.emphasis ?? "coach",
            courseLabel: item.courseLabel ?? null,
            goalLabel: item.goalLabel ?? null,
            actionLabel: item.actionLabel ?? (linkedContent ? "Open item" : "Review"),
            href: item.href ?? (linkedContent ? `/content/${linkedContent.id}` : null),
            status: item.status ?? "active",
            linkedContent: buildContentLink(linkedContent)
          };
        })
      );

      return {
        title: section.title,
        description: section.description ?? "",
        items
      };
    })
  );
}

async function hydrateContinueLearning(items, contentItemsRepository) {
  return Promise.all(
    (items ?? []).map(async (item) => {
      const linkedContent = item.contentItemId
        ? await contentItemsRepository.getContentItem(item.contentItemId)
        : null;

      return {
        id: item.id,
        title: item.title ?? linkedContent?.title ?? "Untitled item",
        summary: item.summary ?? linkedContent?.description ?? "",
        progressLabel: item.progressLabel ?? "Not started",
        href: item.href ?? (linkedContent ? `/content/${linkedContent.id}` : null),
        linkedContent: buildContentLink(linkedContent)
      };
    })
  );
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
      home: {
        user: {
          id: effectiveUserId,
          source: isAuthenticatedHome ? "authenticated" : "demo",
          profile: home.profile
        },
        focusBoard: {
          ...home.focusBoard,
          recentGameStats: (home.focusBoard?.recentGameStats ?? []).map(normalizeMetric)
        },
        coachFeed: {
          headline: home.coachFeed?.headline ?? "",
          sections: await hydrateCoachSections(
            home.coachFeed?.sections ?? [],
            contentItemsRepository
          )
        },
        goalDashboard: normalizeGoalDashboard(home.goalDashboard),
        continueLearning: await hydrateContinueLearning(
          home.continueLearning ?? [],
          contentItemsRepository
        )
      }
    });
  });

  return router;
}
