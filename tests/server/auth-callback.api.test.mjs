import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../../server/app.js";
import { loadConfig } from "../../server/config.js";
import {
  createInMemoryAssetStore,
  createInMemoryContentItemsRepository,
  createInMemoryUserHomesRepository
} from "./test-repositories.mjs";

async function createTestApp({ redeemLaunchGrant, fetchSharedProfile } = {}) {
  const config = loadConfig({
    NODE_ENV: "test",
    PORT: "0",
    DATABASE_URL: "postgres://test:test@localhost:5432/riftsense_test",
    RIFTSENSE_DEMO_USER_ID: "usr_demo_home",
    NEXUS_AUTH_ENABLED: "true",
    NEXUS_JWT_SECRET: "test-secret",
    NEXUS_AUTH_ISSUER: "nexus",
    NEXUS_AUTH_AUDIENCE: "riftsense",
    NEXUS_EXCHANGE_URL: "http://nexus.test/api/auth/exchange",
    NEXUS_RIFTSENSE_EXCHANGE_SECRET: "exchange-secret",
    NEXUS_PORTAL_BASE_URL: "http://127.0.0.1:3000"
  });

  const contentItemsRepository = createInMemoryContentItemsRepository();
  const userHomesRepository = createInMemoryUserHomesRepository();
  const assetStore = createInMemoryAssetStore();

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
    }
  });

  await userHomesRepository.saveUserHome({
    id: "usr_local_dev",
    profile: {
      displayName: "Authenticated User",
      teamName: "Dev Team",
      primaryRole: "Mid",
      focusArea: "Objective setup"
    }
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
    redeemLaunchGrant,
    fetchSharedProfile
  });
}

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
            },
            profile: {
              userId: "usr_local_dev",
              riotGameName: "3nderWiggin",
              riotTagline: "NA1",
              riotPuuid: "puuid_local_dev_3nderwiggin",
              primaryRole: "ADC",
              secondaryRoles: ["Support"],
              preferredTeamId: null,
              activeTeamId: null
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
    expect(homeResponse.body.home.user.profile.riotPuuid).toBe("puuid_local_dev_3nderwiggin");
    expect(homeResponse.body.home.user.riot.puuid).toBe("puuid_local_dev_3nderwiggin");
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
