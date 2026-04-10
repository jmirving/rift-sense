import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

import jwt from "jsonwebtoken";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../../server/app.js";
import { loadConfig } from "../../server/config.js";
import { createContentItemsRepository } from "../../server/repositories/content-items.js";
import { createUserHomesRepository } from "../../server/repositories/user-homes.js";
import { createLocalAssetStore } from "../../server/storage/local-assets.js";

const tempDirectories = [];

async function createTestApp({ authEnabled = false } = {}) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "rift-sense-home-api-"));
  tempDirectories.push(tempRoot);

  const config = loadConfig({
    NODE_ENV: "test",
    PORT: "0",
    RIFTSENSE_STORAGE_ROOT: tempRoot,
    RIFTSENSE_DEMO_USER_ID: "usr_demo_home",
    NEXUS_AUTH_ENABLED: authEnabled ? "true" : "false",
    NEXUS_JWT_SECRET: "test-secret",
    NEXUS_AUTH_ISSUER: "nexus",
    NEXUS_AUTH_AUDIENCE: "riftsense"
  });

  const contentItemsRepository = createContentItemsRepository({
    contentItemsDir: config.contentItemsDir
  });
  const userHomesRepository = createUserHomesRepository({
    userHomesDir: config.userHomesDir
  });
  const assetStore = createLocalAssetStore({
    assetsDir: config.assetsDir
  });

  await contentItemsRepository.initialize();
  await userHomesRepository.initialize();
  await assetStore.initialize();

  await contentItemsRepository.saveContentItem({
    id: "cnt_home_video",
    title: "Wave Control Basics",
    description: "Published video used by the home dashboard.",
    contentType: "video",
    sourceType: "external_url",
    status: "published",
    topicTags: ["macro"],
    patchSensitive: false,
    grouping: null,
    asset: {
      kind: "external-link",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      provider: "youtube"
    },
    viewer: null,
    createdAt: "2026-03-27T00:00:00.000Z",
    updatedAt: "2026-03-27T00:00:00.000Z",
    publishedAt: "2026-03-27T00:00:00.000Z",
    archivedAt: null
  });

  await userHomesRepository.saveUserHome({
    id: "usr_demo_home",
    profile: {
      displayName: "Demo User",
      teamName: "Demo Team",
      primaryRole: "Support",
      focusArea: "Review setup habits"
    },
    focusBoard: {
      greeting: "Demo home",
      todayGoal: {
        title: "Study one setup clip",
        summary: "Look at one clip before queueing.",
        progressLabel: "1 of 2 complete"
      },
      progress: {
        todayPercent: 50,
        weeklyPercent: 25,
        monthlyPercent: 10
      },
      weeklyGoals: [],
      monthlyGoals: [],
      recentGameStats: []
    },
    coachFeed: {
      headline: "Demo coach feed",
      sections: [
        {
          title: "Priority",
          description: "Open next",
          items: [
            {
              id: "itm_demo_video",
              contentItemId: "cnt_home_video",
              emphasis: "coach",
              actionLabel: "Watch now"
            }
          ]
        }
      ]
    },
    continueLearning: [
      {
        id: "continue_demo_video",
        contentItemId: "cnt_home_video",
        progressLabel: "Resume at 02:10"
      }
    ]
  });

  await userHomesRepository.saveUserHome({
    id: "usr_local_dev",
    profile: {
      displayName: "Authenticated User",
      teamName: "Dev Team",
      primaryRole: "Mid",
      focusArea: "Objective setup"
    },
    focusBoard: {
      greeting: "Authenticated home",
      todayGoal: {
        title: "Review objective setup",
        summary: "Open the clip and note one setup mistake.",
        progressLabel: "2 of 3 complete"
      },
      progress: {
        todayPercent: 66,
        weeklyPercent: 40,
        monthlyPercent: 20
      },
      weeklyGoals: [],
      monthlyGoals: [],
      recentGameStats: []
    },
    coachFeed: {
      headline: "Auth coach feed",
      sections: []
    },
    continueLearning: []
  });

  return createApp({
    config,
    contentItemsRepository,
    userHomesRepository,
    assetStore,
    previewService: {
      async ensureDeckPreview(item) {
        return item;
      }
    }
  });
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("home API", () => {
  it("returns the demo home when no user is authenticated", async () => {
    const app = await createTestApp();

    const response = await request(app).get("/api/home");

    expect(response.status).toBe(200);
    expect(response.body.home.user.id).toBe("usr_demo_home");
    expect(response.body.home.user.source).toBe("demo");
    expect(response.body.home.coachFeed.sections[0].items[0].linkedContent.href).toBe("/content/cnt_home_video");
  });

  it("returns the authenticated user's home when Nexus auth is enabled", async () => {
    const app = await createTestApp({ authEnabled: true });
    const token = jwt.sign(
      { sub: "usr_local_dev", iss: "nexus", aud: "riftsense" },
      "test-secret",
      { algorithm: "HS256", expiresIn: "1h" }
    );

    const response = await request(app)
      .get("/api/home")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.home.user.id).toBe("usr_local_dev");
    expect(response.body.home.user.source).toBe("authenticated");
    expect(response.body.home.focusBoard.todayGoal.title).toBe("Review objective setup");
  });
});
