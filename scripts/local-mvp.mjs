import path from "node:path";

import { loadConfig } from "../server/config.js";
import { buildDefaultGoalDashboard } from "../server/goal-dashboard.js";
import { createContentItemsRepository } from "../server/repositories/content-items.js";
import { createUserHomesRepository } from "../server/repositories/user-homes.js";
import { startServer } from "../server/index.js";

const DEFAULT_STORAGE_ROOT = ".local/storage";
const DEFAULT_AUTH_SECRET = "riftsense-local-dev-secret";

function buildEnv() {
  const argv = new Set(process.argv.slice(2));
  const authEnabled = argv.has("--auth");

  return {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV ?? "development",
    PORT: process.env.PORT ?? "3000",
    RIFTSENSE_STORAGE_ROOT: process.env.RIFTSENSE_STORAGE_ROOT ?? DEFAULT_STORAGE_ROOT,
    NEXUS_AUTH_ENABLED:
      process.env.NEXUS_AUTH_ENABLED ?? (authEnabled ? "true" : "false"),
    NEXUS_AUTH_ISSUER: process.env.NEXUS_AUTH_ISSUER ?? "nexus",
    NEXUS_AUTH_AUDIENCE: process.env.NEXUS_AUTH_AUDIENCE ?? "riftsense",
    NEXUS_JWT_SECRET:
      process.env.NEXUS_JWT_SECRET ??
      (authEnabled ? DEFAULT_AUTH_SECRET : "")
  };
}

function buildSeedItems(now) {
  return [
    {
      id: "cnt_seed_youtube_basics",
      title: "Wave Control Basics",
      description: "Starter YouTube lesson for lane state management.",
      contentType: "video",
      sourceType: "external_url",
      status: "published",
      topicTags: ["wave-management", "laning"],
      patchSensitive: true,
      grouping: {
        groupKey: "fundamentals",
        groupLabel: "Fundamentals",
        order: 1
      },
      asset: {
        kind: "external-link",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        provider: "youtube"
      },
      viewer: null,
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
      archivedAt: null
    },
    {
      id: "cnt_seed_google_doc",
      title: "Practice Review Template",
      description: "Google Doc template for post-block review notes.",
      contentType: "document",
      sourceType: "external_url",
      status: "published",
      topicTags: ["review", "team-process"],
      patchSensitive: false,
      grouping: {
        groupKey: "operations",
        groupLabel: "Operations",
        order: 1
      },
      asset: {
        kind: "external-link",
        url: "https://docs.google.com/document/d/1k0example/edit",
        provider: "google"
      },
      viewer: null,
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
      archivedAt: null
    },
    {
      id: "cnt_seed_draft_only",
      title: "Patch 15.x Mid Lane Notes",
      description: "Draft content item showing curator-only state.",
      contentType: "deck",
      sourceType: "external_url",
      status: "draft",
      topicTags: ["mid-lane", "patch-notes"],
      patchSensitive: true,
      grouping: {
        groupKey: "meta-updates",
        groupLabel: "Meta Updates",
        order: 1
      },
      asset: {
        kind: "external-link",
        url: "https://docs.google.com/presentation/d/1k0example/edit",
        provider: "google"
      },
      viewer: null,
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
      archivedAt: null
    }
  ];
}

function buildSeedUserHomes() {
  const goalDashboard = buildDefaultGoalDashboard();

  return [
    {
      id: "usr_local_guest",
      profile: {
        displayName: "Guest Player",
        teamName: "Demo Queue",
        primaryRole: "ADC",
        focusArea: "Die Less"
      },
      focusBoard: {
        greeting: "Work on one clear improvement target today.",
        todayGoal: {
          title: "Review last game deaths",
          summary: "Tag each death against the active Die Less goal before queueing again.",
          progressLabel: "5-minute review ready"
        },
        progress: {
          todayPercent: 0,
          weeklyPercent: 42,
          monthlyPercent: 28
        },
        weeklyGoals: [
          {
            title: "No 2v2 deaths",
            progressLabel: "Active weekly target",
            progressPercent: 60
          },
          {
            title: "No known gank/roam deaths",
            progressLabel: "1 tagged this week",
            progressPercent: 35
          }
        ],
        monthlyGoals: [
          {
            title: "Build matchup-specific trading knowledge",
            progressLabel: "ADC lane phase focus",
            progressPercent: 28
          }
        ],
        recentGameStats: [
          {
            label: "Known-danger deaths",
            value: "1",
            trend: "Needs attention",
            note: "Enemy threat was visible first"
          },
          {
            label: "Bad trade reads",
            value: "2",
            trend: "Needs attention",
            note: "Pre-6 all-in risk"
          },
          {
            label: "Clean disengages",
            value: "2",
            trend: "Positive",
            note: "Respected danger"
          }
        ]
      },
      coachFeed: {
        headline: "The coach surface should mix immediate study work with team emphasis, not bury the user in analysis.",
        sections: [
          {
            title: "Recommended",
            description: "",
            items: [
              {
                id: "coach_wave_control",
                contentItemId: "cnt_seed_youtube_basics",
                summary: "Rewatch the first segment and write down two wave states you misread this week.",
                emphasis: "coach",
                courseLabel: "Laning Course",
                goalLabel: "Monthly Goal",
                actionLabel: "Watch now"
              },
              {
                id: "coach_review_template",
                contentItemId: "cnt_seed_google_doc",
                summary: "Use this after your next scrim block so your notes stay consistent.",
                emphasis: "coach",
                courseLabel: "Review Process",
                goalLabel: "Weekly Goal",
                actionLabel: "Open template"
              }
            ]
          },
          {
            title: "Team Focus",
            description: "Shared team priorities.",
            items: [
              {
                id: "team_focus_midgame",
                title: "This week: cleaner first-reset timing",
                summary: "Team emphasis item. This would later resolve from shared coaching plans or assignments.",
                emphasis: "team",
                actionLabel: "Review focus",
                href: "/library"
              }
            ]
          }
        ]
      },
      continueLearning: [
        {
          id: "continue_wave_control",
          contentItemId: "cnt_seed_youtube_basics",
          progressLabel: "Resume at 06:20"
        }
      ],
      goalDashboard
    },
    {
      id: "usr_local_dev",
      profile: {
        displayName: "Local Dev User",
        teamName: "RiftSense Dev Squad",
        primaryRole: "ADC",
        focusArea: "Die Less"
      },
      focusBoard: {
        greeting: "Authenticated users should feel the home page change around their current work, not just their identity.",
        todayGoal: {
          title: "Review last game deaths",
          summary: "Tag each death against the active Die Less goal before queueing again.",
          progressLabel: "5-minute review ready"
        },
        progress: {
          todayPercent: 0,
          weeklyPercent: 42,
          monthlyPercent: 28
        },
        weeklyGoals: [
          {
            title: "No 2v2 deaths",
            progressLabel: "Active weekly target",
            progressPercent: 60
          },
          {
            title: "No known gank/roam deaths",
            progressLabel: "1 tagged this week",
            progressPercent: 35
          }
        ],
        monthlyGoals: [
          {
            title: "Build matchup-specific trading knowledge",
            progressLabel: "ADC lane phase focus",
            progressPercent: 28
          }
        ],
        recentGameStats: [
          {
            label: "Known-danger deaths",
            value: "1",
            trend: "Needs attention",
            note: "Enemy threat was visible first"
          },
          {
            label: "Bad trade reads",
            value: "2",
            trend: "Needs attention",
            note: "Pre-6 all-in risk"
          },
          {
            label: "Clean disengages",
            value: "2",
            trend: "Positive",
            note: "Respected danger"
          }
        ]
      },
      coachFeed: {
        headline: "This authenticated view shows the shape of a future user-specific home without requiring live Nexus profile or assignment services.",
        sections: [
          {
            title: "Recommended",
            description: "",
            items: [
              {
                id: "dev_wave_video",
                contentItemId: "cnt_seed_youtube_basics",
                summary: "Focus on how tempo is preserved through the crash and reset cycle.",
                emphasis: "coach",
                courseLabel: "Laning Course",
                goalLabel: "Monthly Goal",
                actionLabel: "Watch clip"
              }
            ]
          },
          {
            title: "Team Focus",
            description: "Shared team reminders for this block.",
            items: [
              {
                id: "dev_team_focus",
                title: "Prep objective setups in reviews",
                summary: "This slot is where team-level assignments or linked quizzes would land once those systems exist.",
                emphasis: "team",
                actionLabel: "See library",
                href: "/library"
              }
            ]
          }
        ]
      },
      continueLearning: [
        {
          id: "continue_template",
          contentItemId: "cnt_seed_google_doc",
          progressLabel: "Reviewed today"
        }
      ],
      goalDashboard
    }
  ];
}

async function seedStorageIfEmpty(env) {
  const config = loadConfig(env);
  const repository = createContentItemsRepository({
    contentItemsDir: config.contentItemsDir
  });
  const userHomesRepository = createUserHomesRepository({
    userHomesDir: config.userHomesDir
  });
  await repository.initialize();
  await userHomesRepository.initialize();

  const existingItems = await repository.listContentItems();
  let seededContent = false;
  if (existingItems.length === 0) {
    const now = new Date().toISOString();
    const seedItems = buildSeedItems(now);
    for (const item of seedItems) {
      await repository.saveContentItem(item);
    }
    seededContent = true;
  }

  const existingUserHomes = await userHomesRepository.listUserHomes();
  let seededUserHomes = false;
  if (existingUserHomes.length === 0) {
    const seedUserHomes = buildSeedUserHomes();
    for (const userHome of seedUserHomes) {
      await userHomesRepository.saveUserHome(userHome);
    }
    seededUserHomes = true;
  }

  return {
    config,
    seededContent,
    seededUserHomes
  };
}

const env = buildEnv();
const { config, seededContent, seededUserHomes } = await seedStorageIfEmpty(env);

console.log(`RiftSense local MVP storage: ${path.relative(process.cwd(), config.storageRoot)}`);
console.log(`RiftSense local MVP auth enabled: ${config.auth.enabled ? "yes" : "no"}`);
if (seededContent) {
  console.log("Seeded sample content for local exploration.");
}
if (seededUserHomes) {
  console.log("Seeded personalized home data for local exploration.");
}
if (config.auth.enabled) {
  console.log("Run 'npm run local:token' to mint a compatible local dev token.");
}

await startServer(env);
