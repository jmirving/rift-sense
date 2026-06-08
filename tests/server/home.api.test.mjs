import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

import jwt from "jsonwebtoken";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../../server/app.js";
import { loadConfig } from "../../server/config.js";
import { seedSystemGoalTypes } from "../../server/goal-types/system-goal-types.js";
import { createContentItemsRepository } from "../../server/repositories/content-items.js";
import { createGoalTypesRepository } from "../../server/repositories/goal-types.js";
import { createUserHomesRepository } from "../../server/repositories/user-homes.js";
import { createLocalAssetStore } from "../../server/storage/local-assets.js";

const tempDirectories = [];

async function createTestApp({ authEnabled = false, fetchSharedProfile, resolveRecentGames } = {}) {
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
  const goalTypesRepository = createGoalTypesRepository({
    goalTypesDir: config.goalTypesDir
  });
  const userHomesRepository = createUserHomesRepository({
    userHomesDir: config.userHomesDir
  });
  const assetStore = createLocalAssetStore({
    assetsDir: config.assetsDir
  });

  await contentItemsRepository.initialize();
  await goalTypesRepository.initialize();
  await seedSystemGoalTypes(goalTypesRepository);
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
    goalTypesRepository,
    userHomesRepository,
    assetStore,
    previewService: {
      async ensureDeckPreview(item) {
        return item;
      }
    },
    fetchSharedProfile,
    resolveRecentGames
  });
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("home API", () => {
  it("returns a public home payload when no user is authenticated", async () => {
    const app = await createTestApp();

    const response = await request(app).get("/api/home");

    expect(response.status).toBe(200);
    expect(response.body.home.user.id).toBeNull();
    expect(response.body.home.user.source).toBe("public");
    expect(response.body.home.publicEntry).toMatchObject({
      aboutHref: "/about",
      demoHref: "/demo"
    });
    expect(response.body.home.goalDashboard).toBeNull();
  });

  it("returns the public demo home from the dedicated demo endpoint", async () => {
    const app = await createTestApp();

    const response = await request(app).get("/api/demo/home");

    expect(response.status).toBe(200);
    expect(response.body.home.user.id).toBe("demo_public_dashboard");
    expect(response.body.home.user.source).toBe("demo");
    expect(response.body.home.user.profile.displayName).toBe("Public Demo Player");
    expect(
      response.body.home.goalDashboard.suggestedNextSteps.some(
        (step) => step.href === "/library?topic=laning"
      )
    ).toBe(false);
    expect(response.body.home.goalDashboard.activePersonalGoal.riotEvidence).toMatchObject({
      status: "no-riot-linked"
    });
  });

  it("returns the seeded Riot ADC demo variant", async () => {
    const app = await createTestApp();

    const response = await request(app).get("/api/demo/home/adc");

    expect(response.status).toBe(200);
    expect(response.body.home.goalDashboard.activePersonalGoal.riotEvidence.status).toBe("seeded-demo");
    expect(response.body.home.goalDashboard.activePersonalGoal.riotEvidence.candidateGames).toHaveLength(3);
  });

  it("returns the authenticated user's home when Nexus auth is enabled", async () => {
    const app = await createTestApp({
      authEnabled: true,
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
      }
    });
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
    expect(response.body.home.focusBoard).toBeUndefined();
    expect(response.body.home.goalDashboard.activePersonalGoal.title).toBe("Die Less");
    expect(response.body.home.goalDashboard.activePersonalGoal.evidenceSource.summary).toContain("Based on 5 signal events");
    expect(response.body.home.goalDashboard.activePersonalGoal.riotEvidence).toMatchObject({
      status: "riot-linked-unavailable"
    });
    expect(response.body.home.goalDashboard.activePersonalGoal.role).toBe("ADC");
    expect(response.body.home.user.profile.primaryRole).toBe("ADC");
    expect(response.body.home.user.profile.riotGameName).toBe("3nderWiggin");
    expect(response.body.home.user.profile.riotTagline).toBe("NA1");
    expect(response.body.home.user.profile.riotPuuid).toBe("puuid_local_dev_3nderwiggin");
  });

  it("returns an authenticated empty home instead of the demo home when no saved home exists", async () => {
    const app = await createTestApp({
      authEnabled: true,
      async fetchSharedProfile() {
        return {
          userId: "usr_new_auth",
          riotGameName: "FreshPlayer",
          riotTagline: "NA1",
          riotPuuid: null,
          primaryRole: null,
          secondaryRoles: []
        };
      }
    });
    const token = jwt.sign(
      { sub: "usr_new_auth", iss: "nexus", aud: "riftsense", displayName: "Fresh Player" },
      "test-secret",
      { algorithm: "HS256", expiresIn: "1h" }
    );

    const response = await request(app)
      .get("/api/home")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.home.user.id).toBe("usr_new_auth");
    expect(response.body.home.user.source).toBe("authenticated");
    expect(response.body.home.user.profile.riotGameName).toBe("FreshPlayer");
    expect(response.body.home.user.profile.primaryRole).toBeNull();
    expect(response.body.home.setupGuide).toMatchObject({
      status: "setup-needed",
      href: "/onboarding"
    });
    expect(response.body.home.goalDashboard.activePersonalGoal.goalStatus).toBe("Setup needed");
    expect(response.body.home.goalDashboard.todaysAction.href).toBe("/onboarding");
    expect(response.body.home.goalDashboard.activePersonalGoal.riotEvidence.status).toBe("no-riot-linked");
  });

  it("uses shared profile fields instead of local defaults when authenticated", async () => {
    const app = await createTestApp({
      authEnabled: true,
      async fetchSharedProfile() {
        return {
          userId: "usr_local_dev",
          riotGameName: "RoleSwap",
          riotTagline: "NA1",
          riotPuuid: null,
          primaryRole: null,
          secondaryRoles: ["Support"],
          preferredTeamId: "team-1",
          activeTeamId: "team-2"
        };
      }
    });
    const token = jwt.sign(
      { sub: "usr_local_dev", iss: "nexus", aud: "riftsense" },
      "test-secret",
      { algorithm: "HS256", expiresIn: "1h" }
    );

    const response = await request(app)
      .get("/api/home")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.home.user.profile.primaryRole).toBeNull();
    expect(response.body.home.user.profile.riotPuuid).toBeNull();
    expect(response.body.home.user.profile.riotGameName).toBe("RoleSwap");
    expect(response.body.home.user.profile.preferredTeamId).toBe("team-1");
    expect(response.body.home.goalDashboard.activePersonalGoal.riotEvidence.status).toBe("no-riot-linked");
  });

  it("returns setup state when Riot account is linked without a primary role", async () => {
    const app = await createTestApp({
      authEnabled: true,
      async fetchSharedProfile() {
        return {
          userId: "usr_local_dev",
          riotGameName: "3nderWiggin",
          riotTagline: "NA1",
          riotPuuid: "puuid_local_dev_3nderwiggin",
          primaryRole: null,
          secondaryRoles: ["Support"]
        };
      }
    });
    const token = jwt.sign(
      { sub: "usr_local_dev", iss: "nexus", aud: "riftsense" },
      "test-secret",
      { algorithm: "HS256", expiresIn: "1h" }
    );

    const response = await request(app)
      .get("/api/home")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.home.goalDashboard.activePersonalGoal.riotEvidence.status).toBe("riot-setup-needed");
    expect(response.body.home.user.profile.primaryRole).toBeNull();
  });

  it("returns linked-but-unavailable state when Riot retrieval cannot run", async () => {
    const app = await createTestApp({
      authEnabled: true,
      async fetchSharedProfile() {
        return {
          userId: "usr_local_dev",
          riotGameName: "3nderWiggin",
          riotTagline: "NA1",
          riotPuuid: "puuid_local_dev_3nderwiggin",
          primaryRole: "ADC",
          secondaryRoles: ["Support"]
        };
      },
      async resolveRecentGames() {
        return {
          status: "unavailable",
          sourceLabel: "Riot account linked",
          message: "Riot account linked. Recent games are temporarily unavailable.",
          games: []
        };
      }
    });
    const token = jwt.sign(
      { sub: "usr_local_dev", iss: "nexus", aud: "riftsense" },
      "test-secret",
      { algorithm: "HS256", expiresIn: "1h" }
    );

    const response = await request(app)
      .get("/api/home")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.home.goalDashboard.activePersonalGoal.riotEvidence.status).toBe("riot-linked-unavailable");
    expect(response.body.home.goalDashboard.activePersonalGoal.riotEvidence.sourceLabel).toBe("Riot account linked");
  });

  it("returns scored recent games for authenticated Riot-linked users", async () => {
    const app = await createTestApp({
      authEnabled: true,
      async fetchSharedProfile() {
        return {
          userId: "usr_local_dev",
          riotGameName: "3nderWiggin",
          riotTagline: "NA1",
          riotPuuid: "puuid_local_dev_3nderwiggin",
          primaryRole: "ADC",
          secondaryRoles: ["Support"]
        };
      },
      async resolveRecentGames() {
        return {
          status: "available",
          sourceLabel: "Riot recent games",
          message: "Recent games loaded from Riot.",
          games: [
            {
              matchId: "NA1_1",
              playedAt: "2026-06-08T05:00:00.000Z",
              queueId: 420,
              queueLabel: "Ranked Solo/Duo",
              championId: 202,
              championName: "Jhin",
              role: "ADC",
              roleConfidence: "high",
              result: "Loss",
              kills: 8,
              deaths: 5,
              assists: 6,
              csPerMinute: 8.1,
              gameDurationSeconds: 1860,
              sourceMetadata: { queueBucket: "ranked" }
            },
            {
              matchId: "NA1_2",
              playedAt: "2026-05-20T05:00:00.000Z",
              queueId: 430,
              queueLabel: "Normal Blind",
              championId: 103,
              championName: "Ahri",
              role: "MID",
              roleConfidence: "high",
              result: "Win",
              kills: 3,
              deaths: 0,
              assists: 8,
              csPerMinute: 7.2,
              gameDurationSeconds: 1720,
              sourceMetadata: { queueBucket: "normal" }
            }
          ]
        };
      }
    });
    const token = jwt.sign(
      { sub: "usr_local_dev", iss: "nexus", aud: "riftsense" },
      "test-secret",
      { algorithm: "HS256", expiresIn: "1h" }
    );

    const response = await request(app)
      .get("/api/home")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.home.goalDashboard.activePersonalGoal.riotEvidence.status).toBe("recent-games-ready");
    expect(response.body.home.goalDashboard.activePersonalGoal.riotEvidence.candidateGames[0]).toMatchObject({
      matchId: "NA1_1",
      championName: "Jhin",
      confidenceLabel: "high"
    });
    expect(response.body.home.goalDashboard.activePersonalGoal.riotEvidence.candidateGames[0].relevanceReason).toContain("ADC role match");
  });

  it("ignores authenticated identity on the dedicated demo endpoint", async () => {
    const app = await createTestApp({ authEnabled: true });
    const token = jwt.sign(
      { sub: "usr_local_dev", iss: "nexus", aud: "riftsense" },
      "test-secret",
      { algorithm: "HS256", expiresIn: "1h" }
    );

    const response = await request(app)
      .get("/api/demo/home")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.home.user.id).toBe("demo_public_dashboard");
    expect(response.body.home.user.source).toBe("demo");
    expect(response.body.home.user.profile.displayName).toBe("Public Demo Player");
  });

  it("serves the client app from the demo route", async () => {
    const app = await createTestApp();

    const response = await request(app).get("/demo");

    expect(response.status).toBe(200);
    expect(response.text).toContain('<div id="app"></div>');
    expect(response.text).toContain('<script type="module" src="/app/main.js"></script>');
  });

  it("serves the client app from the public root and about routes", async () => {
    const app = await createTestApp();

    const homeResponse = await request(app).get("/");
    const aboutResponse = await request(app).get("/about");

    expect(homeResponse.status).toBe(200);
    expect(homeResponse.text).toContain('<div id="app"></div>');
    expect(aboutResponse.status).toBe(200);
    expect(aboutResponse.text).toContain('<div id="app"></div>');
  });

  it("serves the client app from onboarding routes", async () => {
    const app = await createTestApp();

    const onboardingResponse = await request(app).get("/onboarding");
    const demoOnboardingResponse = await request(app).get("/demo/onboarding");

    expect(onboardingResponse.status).toBe(200);
    expect(onboardingResponse.text).toContain('<div id="app"></div>');
    expect(demoOnboardingResponse.status).toBe(200);
    expect(demoOnboardingResponse.text).toContain('<div id="app"></div>');
  });

  it("returns onboarding template options", async () => {
    const app = await createTestApp();

    const response = await request(app).get("/api/onboarding/options");

    expect(response.status).toBe(200);
    expect(response.body.templates.goalTemplates[0].id).toBe("goal-template-adc-die-less");
    expect(response.body.templates.teamFocusTemplates[0].id).toBe("team-focus-template-dragon-setup");
    expect(response.body.systemGoalTypes.map((goalType) => goalType.id)).toEqual([
      "death_review",
      "fight_participation",
      "lane_pressure_conversion",
      "map_state_safety",
      "objective_setup_exit",
      "tempo_conversion",
      "vision_information"
    ]);
    expect(response.body.systemGoalTypes[0]).toMatchObject({
      createdBySystem: true,
      isActiveOption: true,
      roleApplicability: ["ANY"]
    });
  });

  it("saves onboarding to the local demo user when auth is disabled", async () => {
    const app = await createTestApp();

    const saveResponse = await request(app)
      .post("/api/onboarding")
      .send({
        context: "both",
        role: "ADC",
        selectedGoalTemplateId: "goal-template-adc-die-less",
        selectedSignalIds: ["signal-known-danger-death", "signal-clean-disengage"],
        weeklyTargets: [
          {
            signalId: "signal-known-danger-death",
            targetValue: 0,
            label: "0 known gank deaths"
          }
        ],
        selectedActionTemplateId: "action-death-review-v1",
        selectedTeamFocusTemplateId: "team-focus-template-dragon-setup"
      });

    expect(saveResponse.status).toBe(201);
    expect(saveResponse.body.goalDashboard.activePersonalGoal.templateId).toBe("goal-template-adc-die-less");

    const homeResponse = await request(app).get("/api/home");
    expect(homeResponse.status).toBe(200);
    expect(homeResponse.body.home.user.source).toBe("public");
  });

  it("saves onboarding to the authenticated user when auth is enabled", async () => {
    const app = await createTestApp({ authEnabled: true });
    const token = jwt.sign(
      { sub: "usr_local_dev", iss: "nexus", aud: "riftsense" },
      "test-secret",
      { algorithm: "HS256", expiresIn: "1h" }
    );

    const saveResponse = await request(app)
      .post("/api/onboarding")
      .set("Authorization", `Bearer ${token}`)
      .send({
        context: "personal",
        role: "ADC",
        selectedGoalTemplateId: "goal-template-adc-die-less",
        selectedSignalIds: ["signal-known-danger-death"],
        weeklyTargets: [
          {
            signalId: "signal-known-danger-death",
            targetValue: 0
          }
        ],
        selectedActionTemplateId: "action-death-review-v1"
      });

    expect(saveResponse.status).toBe(201);

    const homeResponse = await request(app)
      .get("/api/home")
      .set("Authorization", `Bearer ${token}`);

    expect(homeResponse.status).toBe(200);
    expect(homeResponse.body.home.user.id).toBe("usr_local_dev");
    expect(homeResponse.body.home.user.source).toBe("authenticated");
    expect(homeResponse.body.home.goalDashboard.activePersonalGoal.id).toBe("active-goal-usr-local-dev-die-less");
    expect(homeResponse.body.home.goalDashboard.activeTeamFocus).toBeNull();
  });

  it("rejects invalid onboarding template IDs", async () => {
    const app = await createTestApp();

    const response = await request(app)
      .post("/api/onboarding")
      .send({
        context: "personal",
        role: "ADC",
        selectedGoalTemplateId: "missing-template"
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("BAD_REQUEST");
  });
});
