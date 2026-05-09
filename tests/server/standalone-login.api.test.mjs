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

async function createTestApp({ authenticateWithNexusAccount, fetchSharedProfile } = {}) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "rift-sense-standalone-login-"));
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
    authenticateWithNexusAccount,
    fetchSharedProfile
  });
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe("standalone RiftSense login", () => {
  it("reports RiftSense standalone access before login", async () => {
    const app = await createTestApp();

    const response = await request(app).get("/api/session");

    expect(response.status).toBe(200);
    expect(response.body.authEnabled).toBe(true);
    expect(response.body.authenticated).toBe(false);
    expect(response.body.accountUrl).toContain("/account");
    expect(response.body.manualTokenEntryAvailable).toBe(true);
  });

  it("signs in through Nexus canonical auth and establishes a RiftSense session", async () => {
    const app = await createTestApp({
      async fetchSharedProfile() {
        return {
          userId: "usr_local_dev",
          riotGameName: "3nderWiggin",
          riotTagline: "NA1",
          riotPuuid: "puuid_local_dev_3nderwiggin",
          primaryRole: "ADC",
          secondaryRoles: ["Support"],
          preferredTeamId: null,
          activeTeamId: null
        };
      },
      async authenticateWithNexusAccount() {
        const accessToken = jwt.sign(
          {
            sub: "usr_local_dev",
            iss: "nexus",
            aud: "riftsense",
            email: "localdev@nexus.test",
            displayName: "Local Dev User"
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
              userId: "usr_local_dev",
              email: "localdev@nexus.test",
              displayName: "Local Dev User"
            }
          }
        };
      }
    });

    const loginResponse = await request(app)
      .post("/auth/login")
      .set("Accept", "application/json")
      .send({ email: "localdev@nexus.test", password: "topsecret123" });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.authenticated).toBe(true);
    expect(loginResponse.headers["set-cookie"][0]).toContain("riftsense_access_token=");

    const sessionResponse = await request(app)
      .get("/api/session")
      .set("Cookie", loginResponse.headers["set-cookie"]);

    expect(sessionResponse.status).toBe(200);
    expect(sessionResponse.body.authenticated).toBe(true);
    expect(sessionResponse.body.user.id).toBe("usr_local_dev");
    expect(sessionResponse.body.user.displayName).toBe("Local Dev User");
    expect(sessionResponse.body.user.profile.riotPuuid).toBe("puuid_local_dev_3nderwiggin");
    expect(sessionResponse.body.user.riot.puuid).toBe("puuid_local_dev_3nderwiggin");

    const homeResponse = await request(app)
      .get("/api/home")
      .set("Cookie", loginResponse.headers["set-cookie"]);

    expect(homeResponse.status).toBe(200);
    expect(homeResponse.body.home.user.id).toBe("usr_local_dev");
    expect(homeResponse.body.home.user.source).toBe("authenticated");
    expect(homeResponse.body.home.user.profile.riotPuuid).toBe("puuid_local_dev_3nderwiggin");
  });

  it("surfaces invalid standalone credentials intentionally", async () => {
    const app = await createTestApp({
      async authenticateWithNexusAccount() {
        return {
          ok: false,
          status: 401,
          payload: {
            message: "Invalid email or password."
          }
        };
      }
    });

    const response = await request(app)
      .post("/auth/login")
      .set("Accept", "application/json")
      .send({ email: "localdev@nexus.test", password: "wrong-pass" });

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe("Invalid email or password.");
  });

  it("clears the RiftSense session cookie on standalone logout", async () => {
    const app = await createTestApp();

    const response = await request(app)
      .post("/auth/logout")
      .set("Accept", "application/json");

    expect(response.status).toBe(204);
    expect(response.headers["set-cookie"][0]).toContain("riftsense_access_token=");
    expect(response.headers["set-cookie"][0]).toContain("Max-Age=0");
  });
});
