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
    expect(response.body.home.focusBoard).toBeUndefined();
    expect(response.body.home.coachFeed).toBeUndefined();
    expect(response.body.home.continueLearning).toBeUndefined();
    expect(response.body.home.goalDashboard.activePersonalGoal.title).toBe("Die Less");
    expect(response.body.home.goalDashboard.activePersonalGoal.templateId).toBe("goal-template-adc-die-less");
    expect(response.body.home.goalDashboard.activePersonalGoal.weeklyTargets[0]).toMatchObject({
      signalId: "signal-bad-2v2-death",
      status: "on-track"
    });
    expect(response.body.home.goalDashboard.activeTeamFocus.title).toBe("Dragon Setup");
    expect(response.body.home.goalDashboard.todaysAction.title).toBe("Review last game deaths");
    expect(response.body.home.goalDashboard.todaysAction.templateId).toBe("action-death-review-v1");
    expect(response.body.home.goalDashboard.recentInsights.length).toBeGreaterThan(0);
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
    expect(response.body.home.focusBoard).toBeUndefined();
    expect(response.body.home.goalDashboard.activePersonalGoal.title).toBe("Die Less");
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
    expect(homeResponse.body.home.goalDashboard.activePersonalGoal.signals.map((signal) => signal.id)).toEqual([
      "signal-known-danger-death",
      "signal-clean-disengage"
    ]);
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
