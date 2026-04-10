import path from "node:path";

import { loadConfig } from "../server/config.js";
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
  return [
    {
      id: "usr_local_guest",
      profile: {
        displayName: "Guest Player",
        teamName: "Demo Queue",
        primaryRole: "Flex",
        focusArea: "Wave control basics"
      },
      focusBoard: {
        greeting: "A simple personalized home should point you toward one concrete improvement target.",
        todayGoal: {
          title: "Review wave control before your next block",
          summary: "Spend 20 minutes on lane-state fundamentals, then queue with one reminder in mind: crash with purpose.",
          progressLabel: "1 of 3 tasks completed"
        },
        progress: {
          todayPercent: 34,
          weeklyPercent: 42,
          monthlyPercent: 19
        },
        weeklyGoals: [
          {
            title: "Laning review sessions",
            progressLabel: "2 of 4 complete",
            progressPercent: 50
          },
          {
            title: "Death review notes",
            progressLabel: "3 of 5 complete",
            progressPercent: 60
          }
        ],
        monthlyGoals: [
          {
            title: "Macro study blocks",
            progressLabel: "2 of 8 complete",
            progressPercent: 25
          }
        ],
        recentGameStats: [
          {
            label: "Last 5 games CS@10",
            value: "67.8",
            trend: "+4.2",
            note: "Trending up"
          },
          {
            label: "Early deaths",
            value: "2.1",
            trend: "-0.6",
            note: "Improving"
          },
          {
            label: "Vision score",
            value: "21.4",
            trend: "+2.8",
            note: "Still below target"
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
      ]
    },
    {
      id: "usr_local_dev",
      profile: {
        displayName: "Local Dev User",
        teamName: "RiftSense Dev Squad",
        primaryRole: "Mid",
        focusArea: "Mid-game map setups"
      },
      focusBoard: {
        greeting: "Authenticated users should feel the home page change around their current work, not just their identity.",
        todayGoal: {
          title: "Sharpen first Herald setup decisions",
          summary: "Review one setup clip, one note template, and track whether your early roam timing stays disciplined tonight.",
          progressLabel: "2 of 4 tasks completed"
        },
        progress: {
          todayPercent: 52,
          weeklyPercent: 68,
          monthlyPercent: 41
        },
        weeklyGoals: [
          {
            title: "Herald setup reps",
            progressLabel: "4 of 6 complete",
            progressPercent: 67
          },
          {
            title: "Review uploads",
            progressLabel: "3 of 4 complete",
            progressPercent: 75
          }
        ],
        monthlyGoals: [
          {
            title: "Macro quiz cadence",
            progressLabel: "5 of 10 complete",
            progressPercent: 50
          }
        ],
        recentGameStats: [
          {
            label: "Roam conversion",
            value: "61%",
            trend: "+7%",
            note: "Best this month"
          },
          {
            label: "Vision before objectives",
            value: "73%",
            trend: "+5%",
            note: "Good direction"
          },
          {
            label: "Unforced lane deaths",
            value: "1.4",
            trend: "-0.3",
            note: "Keep stable"
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
      ]
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
