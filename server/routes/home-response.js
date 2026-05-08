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

export async function buildHomePayload({
  home,
  effectiveUserId,
  source,
  contentItemsRepository
}) {
  return {
    user: {
      id: effectiveUserId,
      source,
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
  };
}
