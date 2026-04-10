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

async function createTestApp({ redeemLaunchGrant } = {}) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "rift-sense-auth-callback-"));
  tempDirectories.push(tempRoot);

  const config = loadConfig({
    NODE_ENV: "test",
    PORT: "0",
    RIFTSENSE_STORAGE_ROOT: tempRoot,
    RIFTSENSE_DEMO_USER_ID: "usr_demo_home",
    NEXUS_AUTH_ENABLED: "true",
    NEXUS_JWT_SECRET: "test-secret",
    NEXUS_AUTH_ISSUER: "nexus",
    NEXUS_AUTH_AUDIENCE: "riftsense",
    NEXUS_EXCHANGE_URL: "http://nexus.test/api/auth/exchange",
    NEXUS_RIFTSENSE_EXCHANGE_SECRET: "exchange-secret",
    NEXUS_PORTAL_BASE_URL: "http://127.0.0.1:3000"
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

  await userHomesRepository.saveUserHome({
    id: "usr_demo_home",
    profile: {
      displayName: "Demo User",
      teamName: "Demo Team",
      primaryRole: "Support",
      focusArea: "Demo"
    },
    focusBoard: {
      greeting: "Demo home",
      todayGoal: {
        title: "Demo",
        summary: "Demo",
        progressLabel: "0 of 1 complete"
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
      headline: "Demo",
      sections: []
    },
    continueLearning: []
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
    },
    redeemLaunchGrant
  });
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe("hosted auth callback", () => {
  it("redeems the launch grant, sets the app cookie, and redirects into RiftSense", async () => {
    const app = await createTestApp({
      async redeemLaunchGrant() {
        const accessToken = jwt.sign(
          {
            sub: "usr_local_dev",
            iss: "nexus",
            aud: "riftsense",
            email: "localdev@nexus.test"
          },
          "test-secret",
          { algorithm: "HS256", expiresIn: "1h" }
        );

        return {
          ok: true,
          status: 200,
          payload: {
            accessToken,
            tokenType: "Bearer",
            returnTo: "/library",
            user: {
              userId: "usr_local_dev",
              email: "localdev@nexus.test",
              displayName: "Local Dev User"
            }
          }
        };
      }
    });

    const callbackResponse = await request(app).get("/auth/nexus/callback?grant=grant_123");

    expect(callbackResponse.status).toBe(303);
    expect(callbackResponse.headers.location).toBe("/library");
    expect(callbackResponse.headers["set-cookie"][0]).toContain("riftsense_access_token=");

    const homeResponse = await request(app)
      .get("/api/home")
      .set("Cookie", callbackResponse.headers["set-cookie"]);

    expect(homeResponse.status).toBe(200);
    expect(homeResponse.body.home.user.id).toBe("usr_local_dev");
    expect(homeResponse.body.home.user.source).toBe("authenticated");
  });

  it("returns an intentional error page when the grant is missing", async () => {
    const app = await createTestApp();

    const response = await request(app).get("/auth/nexus/callback");

    expect(response.status).toBe(400);
    expect(response.text).toContain("Hosted auth failed");
    expect(response.text).toContain("missing a launch grant");
  });

  it("returns an intentional error page when Nexus rejects the grant", async () => {
    const app = await createTestApp({
      async redeemLaunchGrant() {
        return {
          ok: false,
          status: 410,
          payload: {
            message: "Launch grant was already redeemed."
          }
        };
      }
    });

    const response = await request(app).get("/auth/nexus/callback?grant=grant_123");

    expect(response.status).toBe(410);
    expect(response.text).toContain("Hosted auth failed");
    expect(response.text).toContain("Launch grant was already redeemed.");
  });

  it("fails when the exchanged token is for the wrong audience", async () => {
    const app = await createTestApp({
      async redeemLaunchGrant() {
        const accessToken = jwt.sign(
          {
            sub: "usr_local_dev",
            iss: "nexus",
            aud: "draftengine"
          },
          "test-secret",
          { algorithm: "HS256", expiresIn: "1h" }
        );

        return {
          ok: true,
          status: 200,
          payload: {
            accessToken,
            tokenType: "Bearer",
            user: {
              userId: "usr_local_dev"
            }
          }
        };
      }
    });

    const response = await request(app).get("/auth/nexus/callback?grant=grant_123");

    expect(response.status).toBe(503);
    expect(response.text).toContain("Hosted auth failed");
  });
});
