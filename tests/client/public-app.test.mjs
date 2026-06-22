// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildMatchReviewPlan, fightShapeDisplayLabel, mapDeathPositionToZone, renderApp } from "../../public/app/app.js";

function mockJsonResponse(body) {
  return {
    ok: true,
    status: 200,
    async json() {
      return body;
    }
  };
}

function mockJsonError(message, status = 401) {
  return {
    ok: false,
    status,
    async json() {
      return { error: { message } };
    }
  };
}

function setupOptionsFixture() {
  return {
    templates: {
      goalTemplates: [{
        id: "die-less",
        title: "Die Less",
        description: "Reduce avoidable deaths.",
        defaultSignalIds: ["solo-death"],
        suggestedWeeklyTargets: [{ signalId: "solo-death", targetValue: 2, label: "Review solo deaths" }],
        defaultActionIds: ["review-deaths"]
      }],
      signalTemplates: [{ id: "solo-death", title: "Solo deaths", description: "Deaths without reliable cover." }],
      actionTemplates: [{ id: "review-deaths", title: "Review deaths", linkedGoalTemplateIds: ["die-less"] }],
      teamFocusTemplates: [{
        id: "dragon-setup",
        title: "Dragon setup",
        description: "Coordinate setup before dragon.",
        defaultChecklist: ["Group before spawn"]
      }]
    }
  };
}

async function flushAsyncWork() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("public app routes", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    document.body.className = "";
    window.localStorage.clear();
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {}
    }));
    vi.restoreAllMocks();
  });

  it("routes unauthenticated root visits to the dedicated auth shell", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/session") {
        return mockJsonResponse({
          authEnabled: true,
          authenticated: false,
          user: null,
          accountUrl: "",
          portalBaseUrl: "",
          manualTokenEntryAvailable: false
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/");

    await renderApp(document.querySelector("#app"));

    expect(window.location.pathname).toBe("/login");
    expect(document.querySelector(".auth-page-shell")).not.toBeNull();
    expect(document.querySelector("#nav-drawer")).toBeNull();
    expect(document.querySelectorAll("#session-login-form")).toHaveLength(1);
    expect(document.body.textContent).toContain("Sign in to review.");
    expect(document.body.textContent).not.toContain("Turn recent games into goal-linked review work");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/session", expect.any(Object));
  });

  it("does not emit client perf logs by default", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/session") {
        return mockJsonResponse({
          authEnabled: true,
          authenticated: false,
          user: null,
          accountUrl: "",
          portalBaseUrl: "",
          manualTokenEntryAvailable: false
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/");

    await renderApp(document.querySelector("#app"));

    expect(info).not.toHaveBeenCalled();
  });

  it("emits client perf logs when enabled in localStorage", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    window.localStorage.setItem("riftsense.perfLogging", "true");
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/session") {
        return mockJsonResponse({
          authEnabled: true,
          authenticated: false,
          user: null,
          accountUrl: "",
          portalBaseUrl: "",
          manualTokenEntryAvailable: false
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/");

    await renderApp(document.querySelector("#app"));

    expect(info).toHaveBeenCalledWith("[RiftSense perf]", expect.objectContaining({
      event: "perf_timing",
      step: "client_request",
      outcome: "success",
      durationMs: expect.any(Number)
    }));
  });

  it("renders the public about route without loading authenticated home state", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/session") {
        return mockJsonResponse({
          authEnabled: true,
          authenticated: false,
          user: null,
          accountUrl: "",
          portalBaseUrl: "",
          manualTokenEntryAvailable: false
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/about");

    await renderApp(document.querySelector("#app"));

    expect(document.body.textContent).toContain("RiftSense is a goal-driven League review workspace");
    expect(document.querySelector('a[href="/demo"]')).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/session", expect.any(Object));
  });

  it("renders the unauthenticated sign-in route in a dedicated auth shell", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/session") {
        return mockJsonResponse({
          authEnabled: true,
          authenticated: false,
          user: null,
          accountUrl: "/account",
          portalBaseUrl: "",
          manualTokenEntryAvailable: false
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/login");

    await renderApp(document.querySelector("#app"));

    expect(document.querySelector(".auth-page-shell")).not.toBeNull();
    expect(document.querySelector("#nav-drawer")).toBeNull();
    expect(document.querySelector(".session-card")).toBeNull();
    expect(document.body.textContent).toContain("Sign in to review.");
    expect(document.body.textContent).toContain("Use your Nexus account to open recent games, active goals, and review work.");
    expect(document.body.textContent).toContain("Account");
    expect(document.body.textContent).toContain("Shared Nexus profile");
    expect(document.body.textContent).toContain("Continue with your Nexus credentials.");
    expect(document.body.textContent).toContain("Need account help? Open Nexus account access");
    expect(document.body.textContent).toContain("New here? What is RiftSense?");
    expect(document.body.textContent).toContain("Want the guided path first? Open demo flow");
    expect(document.querySelector('input[name="email"]')).not.toBeNull();
    expect(document.querySelector('input[name="password"]')).not.toBeNull();
    expect(document.querySelector('button[type="submit"]')?.textContent).toBe("Sign in to RiftSense");
    expect(document.body.textContent).not.toContain("Continue in RiftSense");
  });

  it("submits Nexus credentials from the dedicated auth shell and preserves loading and error states", async () => {
    let resolveLogin;
    const loginResponse = new Promise((resolve) => {
      resolveLogin = resolve;
    });
    const fetchMock = vi.fn((url, options) => {
      if (url === "/api/session") {
        return Promise.resolve(mockJsonResponse({
          authEnabled: true,
          authenticated: false,
          user: null,
          accountUrl: "",
          portalBaseUrl: "",
          manualTokenEntryAvailable: false
        }));
      }

      if (url === "/auth/login") {
        return loginResponse;
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/login");

    await renderApp(document.querySelector("#app"));

    document.querySelector('input[name="email"]').value = "player@nexus.test";
    document.querySelector('input[name="password"]').value = "secret";
    document.querySelector("#session-login-form").dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    await flushAsyncWork();

    const submitButton = document.querySelector('button[type="submit"]');
    expect(submitButton.disabled).toBe(true);
    expect(submitButton.textContent).toBe("Signing In...");
    expect(fetchMock).toHaveBeenCalledWith("/auth/login", expect.objectContaining({
      method: "POST",
      skipStoredToken: true,
      body: JSON.stringify({ email: "player@nexus.test", password: "secret" })
    }));

    resolveLogin(mockJsonError("Invalid Nexus credentials."));
    await flushAsyncWork();

    expect(submitButton.disabled).toBe(false);
    expect(submitButton.textContent).toBe("Sign in to RiftSense");
    expect(document.querySelector("#session-login-status").textContent).toBe("Invalid Nexus credentials.");
  });

  it("keeps root, about, and demo links reachable from the auth shell", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/session") {
        return mockJsonResponse({
          authEnabled: true,
          authenticated: false,
          user: null,
          accountUrl: "",
          portalBaseUrl: "",
          manualTokenEntryAvailable: false
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/login");

    await renderApp(document.querySelector("#app"));

    expect(document.querySelector('.wordmark[href="/"]')).not.toBeNull();
    expect(document.querySelector('.auth-help-links a[href="/about"]')).not.toBeNull();
    expect(document.querySelector('.auth-help-links a[href="/demo"]')).not.toBeNull();
  });

  it("routes signed-in users away from login into the authenticated app shell", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/session") {
        return mockJsonResponse({
          authEnabled: true,
          authenticated: true,
          user: { id: "usr_1", displayName: "Nexus Player" },
          accountUrl: "",
          portalBaseUrl: "",
          manualTokenEntryAvailable: false
        });
      }

      if (url === "/api/home") {
        return mockJsonResponse({
          home: {
            user: { id: "usr_1", source: "authenticated", profile: { primaryRole: "ADC" } },
            goalDashboard: {}
          }
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/login");

    await renderApp(document.querySelector("#app"));

    expect(window.location.pathname).toBe("/");
    expect(document.querySelector(".auth-page-shell")).toBeNull();
    expect(document.querySelector("#nav-drawer")).not.toBeNull();
    expect(document.body.textContent).toContain("Dashboard");
  });

  it("keeps authenticated root visits on the dashboard", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/session") {
        return mockJsonResponse({
          authEnabled: true,
          authenticated: true,
          user: { id: "usr_1", displayName: "Nexus Player" },
          accountUrl: "",
          portalBaseUrl: "",
          manualTokenEntryAvailable: false
        });
      }

      if (url === "/api/home") {
        return mockJsonResponse({
          home: {
            user: { id: "usr_1", source: "authenticated", profile: { primaryRole: "ADC" } },
            goalDashboard: {}
          }
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/");

    await renderApp(document.querySelector("#app"));

    expect(window.location.pathname).toBe("/");
    expect(document.querySelector(".auth-page-shell")).toBeNull();
    expect(document.querySelector("#nav-drawer")).not.toBeNull();
    expect(document.body.textContent).toContain("Dashboard");
    expect(fetchMock).toHaveBeenCalledWith("/api/home", expect.any(Object));
  });

  it("shows consolidated authenticated navigation and compact account footer", async () => {
    const longName = "3nderWiggin#NA1-with-a-very-long-visible-riot-id";
    const longEmail = "jirving0311+very-long-test-account@example.com";
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/session") {
        return mockJsonResponse({
          authEnabled: true,
          authenticated: true,
          user: { id: "usr_1", displayName: longName, email: longEmail },
          accountUrl: "/account",
          portalBaseUrl: "",
          manualTokenEntryAvailable: false
        });
      }

      if (url === "/api/home") {
        return mockJsonResponse({
          home: {
            user: { id: "usr_1", source: "authenticated", profile: { primaryRole: "ADC" } },
            setupGuide: { status: "setup-needed", title: "Setup needed", summary: "Choose a goal.", href: "/goals", label: "View Goals" },
            goalDashboard: {
              activePersonalGoal: { title: "Die Less", riotEvidence: {} },
              activeTeamFocus: {},
              suggestedNextSteps: [
                { title: "Goal setup", summary: "Pick a goal.", href: "/onboarding", label: "Start onboarding" },
                { title: "Team Focus", summary: "Team seed.", href: "/team", label: "Open team focus" },
                { title: "Library", summary: "Evidence history.", href: "/library", label: "Open library" }
              ]
            }
          }
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/");

    await renderApp(document.querySelector("#app"));

    const navText = document.querySelector("#nav-drawer")?.textContent ?? "";
    expect(navText).toContain("Dashboard");
    expect(navText).toContain("Review");
    expect(navText).toContain("Setup");
    expect(navText).toContain("Team Focus");
    expect(navText).toContain("Library");
    expect(navText).toContain("Training");
    expect(navText).toContain("Under construction");
    expect(navText).not.toContain("Goals");
    expect(navText).not.toContain("Onboarding");
    expect(document.querySelector('.side-nav-link[href="/"]')?.textContent).toContain("Dashboard");
    expect(document.querySelector('.side-nav-link[href="/review"]')?.textContent).toContain("Review");
    expect(document.querySelector('.side-nav-link[href="/setup"]')?.textContent).toContain("Setup");
    expect(document.querySelectorAll('.side-nav-link[href="/goals"], .side-nav-link[href="/onboarding"]')).toHaveLength(0);
    expect(document.querySelectorAll('.side-nav-link[href="/team"], .side-nav-link[href="/team-focus"], .side-nav-link[href="/library"], .side-nav-link[href="/training"]')).toHaveLength(0);
    expect(document.querySelector('.panel-slim a[href="/setup"]')?.textContent).toBe("Open setup");
    expect([...document.querySelectorAll('a[href="/setup"]')].some((link) => link.textContent.includes("Edit setup") || link.textContent.includes("Open setup"))).toBe(true);
    expect(document.querySelectorAll('a[href="/goals"], a[href="/onboarding"], a[href="/team"], a[href="/team-focus"], a[href="/library"], a[href="/training"]')).toHaveLength(0);
    expect(document.body.textContent).not.toContain("View Goals");
    expect(document.body.textContent).not.toContain("Start onboarding");
    expect(document.body.textContent).not.toContain("Open team focus");
    expect(document.body.textContent).not.toContain("Open library");
    for (const label of ["Team Focus", "Library", "Training"]) {
      const item = [...document.querySelectorAll(".side-nav-link.is-disabled")].find((entry) => entry.textContent.includes(label));
      expect(item).toBeTruthy();
      expect(item.getAttribute("aria-disabled")).toBe("true");
      expect(item.getAttribute("href")).toBeNull();
      expect(item.textContent).toContain("Under construction");
      const beforePath = window.location.pathname;
      item.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      item.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      expect(window.location.pathname).toBe(beforePath);
    }
    expect(document.querySelector(".session-footer")).not.toBeNull();
    expect(document.querySelector(".session-footer-name")?.textContent).toBe(longName);
    expect(document.querySelector(".session-footer-email")?.textContent).toBe(longEmail);
    expect(document.querySelector(".session-footer-name")?.classList.contains("session-footer-name")).toBe(true);
    expect(document.querySelector(".session-footer-email")?.classList.contains("session-footer-email")).toBe(true);
    expect(document.querySelector(".session-card.panel")).toBeNull();
    expect(document.querySelector("#session-logout-button")?.textContent).toBe("Sign out");
    expect(document.querySelector('.session-footer-link[href="/account"]')?.textContent).toBe("Open Nexus");
  });

  it("renders Setup as the canonical configuration page", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/session") {
        return mockJsonResponse({
          authEnabled: true,
          authenticated: true,
          user: { id: "usr_1", displayName: "Nexus Player" },
          accountUrl: "",
          portalBaseUrl: "",
          manualTokenEntryAvailable: false
        });
      }

      if (url === "/api/onboarding/options") {
        return mockJsonResponse(setupOptionsFixture());
      }

      if (url === "/api/home") {
        return mockJsonResponse({
          home: {
            user: {
              id: "usr_1",
              source: "authenticated",
              profile: {
                primaryRole: "Bot",
                riotGameName: "3nderWiggin",
                riotTagline: "NA1",
                riotPuuid: "puuid_1"
              }
            },
            goalDashboard: {
              activePersonalGoal: {
                title: "Die Less",
                role: "Bot",
                scope: "personal",
                riotEvidence: {
                  discoveredCount: 3,
                  evaluationReadyCount: 2,
                  candidateGames: [{ matchId: "NA1_ready" }]
                }
              },
              activeTeamFocus: {
                title: "Dragon setup",
                assignment: "Should bot wave be dropped before dragon?"
              }
            }
          }
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    window.history.pushState({}, "", "/setup");
    await renderApp(document.querySelector("#app"));
    expect(window.location.pathname).toBe("/setup");
    expect(document.body.textContent).toContain("Setup");
    expect(document.body.textContent).toContain("Personal focus");
    expect(document.body.textContent).toContain("Die Less");
    expect(document.body.textContent).toContain("Bot · personal");
    expect(document.body.textContent).toContain("Review setup");
    expect(document.body.textContent).toContain("Nexus/Riot identity: 3nderWiggin#NA1");
    expect(document.body.textContent).toContain("Recent games: 3 available");
    expect(document.body.textContent).toContain("Review-ready games: 2 available");
    expect(document.querySelector('.action-row a[href="/review"]')?.textContent).toContain("Go to Review");
    expect(document.body.textContent).toContain("Team focus seed");
    expect(document.body.textContent).toContain("Dragon setup");
    expect(document.body.textContent).toContain("Should bot wave be dropped before dragon?");
    expect(document.body.textContent).toContain("Team Focus is under construction; this setup value is saved as a seed for later team workflows.");
    expect(document.body.textContent).toContain("Save setup");
    expect(document.body.textContent).not.toContain("Goal Settings");
    expect(document.body.textContent).not.toContain("Dashboard Preview");
    expect(document.body.textContent).not.toContain("Choose team focus");
  });

  it("keeps old Goals and Onboarding URLs as Setup compatibility only", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/session") {
        return mockJsonResponse({
          authEnabled: true,
          authenticated: true,
          user: { id: "usr_1", displayName: "Nexus Player" },
          accountUrl: "",
          portalBaseUrl: "",
          manualTokenEntryAvailable: false
        });
      }

      if (url === "/api/onboarding/options") {
        return mockJsonResponse(setupOptionsFixture());
      }

      if (url === "/api/home") {
        return mockJsonResponse({
          home: {
            user: { id: "usr_1", source: "authenticated", profile: { primaryRole: "Bot" } },
            goalDashboard: { activePersonalGoal: { title: "Die Less", role: "Bot", scope: "personal", riotEvidence: {} }, activeTeamFocus: { title: "Dragon setup" } }
          }
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    window.history.pushState({}, "", "/goals");
    await renderApp(document.querySelector("#app"));
    expect(document.body.textContent).toContain("Personal focus");
    expect(document.querySelectorAll('a[href="/goals"], a[href="/onboarding"]')).toHaveLength(0);

    document.body.innerHTML = '<div id="app"></div>';
    window.history.pushState({}, "", "/onboarding");
    await renderApp(document.querySelector("#app"));
    expect(document.body.textContent).toContain("Personal focus");
    expect(document.querySelectorAll('a[href="/goals"], a[href="/onboarding"]')).toHaveLength(0);
  });

  it("renders Review as the canonical queue instead of a placeholder", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/session") {
        return mockJsonResponse({
          authEnabled: true,
          authenticated: true,
          user: { id: "usr_1" },
          accountUrl: "",
          portalBaseUrl: "",
          manualTokenEntryAvailable: false
        });
      }

      if (url === "/api/home") {
        return mockJsonResponse({
          home: {
            user: { id: "usr_1", source: "authenticated", profile: { primaryRole: "ADC" } },
            goalDashboard: {
              activePersonalGoal: {
                title: "Die Less",
                riotEvidence: {
                  candidateGames: [{
                    matchId: "NA1_ready",
                    championName: "Jhin",
                    queueLabel: "Ranked Solo/Duo",
                    result: "Loss",
                    kda: "1/5/3",
                    evaluationStatus: "current",
                    evaluationSummary: { deathCount: 5, reviewSignals: ["5 deaths"] }
                  }]
                }
              }
            }
          }
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/review");

    await renderApp(document.querySelector("#app"));

    expect(document.body.textContent).toContain("Review queue");
    expect(document.body.textContent).toContain("Games ready for review");
    expect(document.body.textContent).toContain("Jhin · Loss");
    expect(document.querySelector('a[href="/review?matchId=NA1_ready"]')?.textContent).toContain("Review");
    expect(document.body.textContent).not.toContain("Choose a recent game from the dashboard");
    expect(document.body.textContent).not.toContain("Review workflows will land here");
  });

  it("marks Training, Team Focus, and Library as immature without making them look complete", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/session") {
        return mockJsonResponse({
          authEnabled: true,
          authenticated: true,
          user: { id: "usr_1" },
          accountUrl: "",
          portalBaseUrl: "",
          manualTokenEntryAvailable: false
        });
      }

      if (url === "/api/home") {
        return mockJsonResponse({
          home: {
            user: { id: "usr_1", source: "authenticated", profile: { primaryRole: "ADC" } },
            goalDashboard: { activePersonalGoal: { title: "Die Less", riotEvidence: {} }, activeTeamFocus: { title: "Dragon setup" }, recentInsights: [] }
          }
        });
      }

      if (url.startsWith("/api/content-items?")) {
        return mockJsonResponse({ items: [] });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    window.history.pushState({}, "", "/training");
    await renderApp(document.querySelector("#app"));
    expect(document.body.textContent).toContain("Training - Under construction");
    expect(document.body.textContent).toContain("Training uses confirmed patterns");
    expect(document.body.textContent).not.toContain("ADC trading check");

    document.body.innerHTML = '<div id="app"></div>';
    window.history.pushState({}, "", "/team");
    await renderApp(document.querySelector("#app"));
    expect(document.body.textContent).toContain("Team Focus");
    expect(document.body.textContent).toContain("Team Focus is seeded from setup until reviewed game evidence updates it.");
    expect(document.querySelector('.team-focus-panel a[href="/setup"]')?.textContent).toContain("Edit setup");

    document.body.innerHTML = '<div id="app"></div>';
    window.history.pushState({}, "", "/library");
    await renderApp(document.querySelector("#app"));
    expect(document.body.textContent).toContain("Evidence history");
    expect(document.body.textContent).toContain("Library fills as you review games.");
    expect(document.body.textContent).toContain("Under construction");
  });

  it("renders partial Riot parser readiness without hiding ready games", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/session") {
        return mockJsonResponse({
          authEnabled: true,
          authenticated: true,
          user: { id: "usr_1" },
          accountUrl: "",
          portalBaseUrl: "",
          manualTokenEntryAvailable: false
        });
      }

      if (url === "/api/home") {
        return mockJsonResponse({
          home: {
            user: {
              id: "usr_1",
              source: "authenticated",
              profile: { primaryRole: "ADC" }
            },
            goalDashboard: {
              activePersonalGoal: {
                title: "Die Less",
                scope: "Personal",
                role: "ADC",
                goalStatus: "Needs review",
                goalStatusTrend: "unknown",
                trend: "Unknown",
                trendKey: "unknown",
                confidence: "Low sample",
                progressSummary: "",
                weeklyTargets: [],
                signals: [],
                evidenceSource: {},
                riotEvidence: {
                  status: "some_games_ready",
                  title: "1 game ready",
                  summary: "1 game ready · 2 games still being prepared",
                  confidence: "High confidence",
                  sourceLabel: "Riot recent games",
                  readyCount: 1,
                  preparingCount: 2,
                  reviewCandidate: {
                    matchId: "NA1_1",
                    championName: "Jhin",
                    queueLabel: "Ranked Solo/Duo",
                    result: "Loss",
                    kda: "8/5/6",
                    selectionReason: "Selected for ADC role match.",
                    goalRelevance: "Die Less · ADC",
                    topDeterministicSignals: [
                      { tag: "death_count", count: 5, label: "5 deaths" },
                      { tag: "multi_enemy_collapse_candidate", count: 2, label: "2 multi-enemy collapse candidates" }
                    ],
                    evaluationStatus: "current",
                    evaluationSummary: {
                      deathCount: 5,
                      reviewSignals: [
                        "5 deaths",
                        "2 multi-enemy collapse candidates",
                        "1 objective-window candidate"
                      ]
                    }
                  },
                  candidateGames: [
                    {
                      matchId: "NA1_1",
                      championName: "Jhin",
                      queueLabel: "Ranked Solo/Duo",
                      result: "Loss",
                      kda: "8/5/6",
                      csPerMinute: 8.1,
                      relevanceReason: "ADC role match",
                      confidenceLabel: "high",
                      evaluationStatus: "current",
                      evaluationSummary: {
                        deathCount: 5,
                        reviewSignals: [
                          "5 deaths",
                          "2 multi-enemy collapse candidates",
                          "1 objective-window candidate"
                        ]
                      },
                      evaluationDeaths: [
                        {
                          timestampSeconds: 494,
                          killerChampionName: "LeBlanc",
                          assistingChampionNames: ["Briar"],
                          tags: ["multi_enemy_collapse_candidate"]
                        }
                      ]
                    },
                    {
                      matchId: "NA1_2",
                      championName: "Ashe",
                      queueLabel: "Normal Draft",
                      result: "Win",
                      kda: "2/0/7",
                      csPerMinute: 7.4,
                      relevanceReason: "no deaths to review",
                      confidenceLabel: "medium",
                      evaluationStatus: "current",
                      evaluationSummary: {
                        deathCount: 0,
                        reviewSignals: ["0 deaths"]
                      },
                      evaluationDeaths: []
                    },
                    {
                      matchId: "NA1_3",
                      championName: "Ahri",
                      queueLabel: "Ranked Solo/Duo",
                      result: "Loss",
                      kda: "4/4/5",
                      csPerMinute: 7.1,
                      relevanceReason: "evaluation pending",
                      confidenceLabel: "low",
                      evaluationStatus: "none",
                      evaluationSummary: null,
                      evaluationDeaths: []
                    }
                  ]
                }
              },
              todaysAction: { title: "Review deaths", href: "/review", ctaLabel: "Start review" },
              activeTeamFocus: { title: "Team setup", evidenceSource: {} },
              recentInsights: [],
              suggestedNextSteps: []
            }
          }
        });
      }

      if (url === "/api/home") {
        return mockJsonResponse({
          home: {
            user: { id: "usr_1", source: "authenticated", profile: { primaryRole: "ADC" } },
            goalDashboard: { activePersonalGoal: { title: "Die Less", riotEvidence: {} } }
          }
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/");

    await renderApp(document.querySelector("#app"));

    expect(document.body.textContent).toContain("2 evaluated games available");
    expect(document.body.textContent).toContain("Sorted by recency.");
    expect(document.body.textContent).toContain("Evaluations are being prepared.");
    expect(document.body.textContent).toContain("Review your latest game");
    expect(document.body.textContent).toContain("Review this game");
    expect(document.body.textContent).toContain("Waiting for review");
    expect(document.body.textContent).toContain("Refresh recent games");
    expect(document.body.textContent).toContain("No reviewed games yet");
    expect(document.body.textContent).toContain("Evidence progress");
    expect(document.body.textContent).toContain("0 games reviewed");
    expect(document.body.textContent).toContain("Weekly targets not ready yet");
    expect(document.body.textContent).toContain("Under construction");
    expect(document.body.textContent).toContain("Not connected to this assessment yet");
    expect(document.body.textContent).not.toContain("Insights will appear after you review games.");
    expect(document.body.textContent).not.toContain("Seeded from onboarding. Not updated from reviewed games yet.");
    expect(document.body.textContent).not.toContain("On track");
    expect(document.body.textContent).toContain("Active Goal");
    expect(document.body.textContent).toContain("Die Less");
    expect(document.body.textContent).toContain("Jhin · Loss");
    expect(document.body.textContent).toContain("Ranked Solo/Duo · 8/5/6 KDA");
    expect(document.body.textContent).toContain("5 review moments");
    expect(document.body.textContent).not.toContain("candidate");
    expect(document.body.textContent).not.toContain("raw signal counts");
    expect(document.body.textContent).not.toContain("08:14");
    expect(document.body.textContent).not.toContain("killed by LeBlanc, assisted by Briar");
    expect(document.body.textContent).not.toContain("Summary ready");
    expect(document.body.textContent).not.toContain("Review preparation:");
    expect(document.body.textContent).not.toContain("High confidence");
    expect(document.body.textContent).not.toContain("current");
    expect(document.body.textContent).not.toContain("SECRET_TIMELINE_EVENT");
    expect(document.body.textContent).not.toContain("SECRET_MATCH_JSON");
    expect(document.querySelector(".primary-action-panel a.button")?.getAttribute("href")).toBe("/review?matchId=NA1_1");
    expect(document.querySelector(".game-evidence-actions .status-badge")?.getAttribute("title")).toBe("No review moments in this game have been triaged yet.");
    expect([...document.querySelectorAll('a[href="/review?matchId=NA1_1"]')].some((link) =>
      link.textContent.includes("Review")
    )).toBe(true);
    expect(document.querySelectorAll(".review-candidate-panel")).toHaveLength(0);
    expect(document.querySelector("#nav-drawer")).not.toBeNull();
  });

  it("activates evidence progress and weekly targets only when reviewed evidence exists", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/session") {
        return mockJsonResponse({
          authEnabled: true,
          authenticated: true,
          user: { id: "usr_1" },
          accountUrl: "",
          portalBaseUrl: "",
          manualTokenEntryAvailable: false
        });
      }

      if (url === "/api/home") {
        return mockJsonResponse({
          home: {
            user: { id: "usr_1", source: "authenticated", profile: { primaryRole: "Bot" } },
            goalDashboard: {
              reviewedGameCount: 2,
              activePersonalGoal: {
                title: "Die Less",
                scope: "personal",
                role: "Bot",
                goalStatus: "Evidence started",
                goalStatusTrend: "positive",
                reviewedGameCount: 2,
                weeklyTargets: [
                  { label: "Review lane deaths", currentValue: 1, targetValue: 3, statusLabel: "In progress", trend: "watch" }
                ],
                signals: [{ label: "Lane deaths", value: 2, trend: "watch" }],
                riotEvidence: { candidateGames: [] }
              },
              todaysAction: {},
              activeTeamFocus: { title: "Dragon Setup", assignment: "Review wave before dragon." },
              recentInsights: [{ title: "Lane deaths before recall", summary: "Two reviewed games matched this pattern." }],
              suggestedNextSteps: []
            }
          }
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/");

    await renderApp(document.querySelector("#app"));

    expect(document.body.textContent).toContain("2 games reviewed");
    expect(document.body.textContent).toContain("Weekly targets ready");
    expect(document.body.textContent).toContain("Review lane deaths");
    expect(document.body.textContent).toContain("Lane deaths before recall");
    expect(document.body.textContent).not.toContain("Weekly targets unlock after your first reviewed game.");
    expect(document.body.textContent).not.toContain("reviewed_moment_events");
  });

  it("refreshes recent games and renders no-new-games feedback", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/session") {
        return mockJsonResponse({
          authEnabled: true,
          authenticated: true,
          user: { id: "usr_1" },
          accountUrl: "",
          portalBaseUrl: "",
          manualTokenEntryAvailable: false
        });
      }

      if (url === "/api/home") {
        return mockJsonResponse({
          home: {
            user: { id: "usr_1", source: "authenticated", profile: { primaryRole: "ADC" } },
            goalDashboard: {
              activePersonalGoal: {
                title: "Die Less",
                role: "ADC",
                evidenceSource: {},
                riotEvidence: {
                  status: "all_recent_games_ready",
                  discoveredCount: 1,
                  summaryReadyCount: 1,
                  evaluationReadyCount: 1,
                  candidateGames: [
                    {
                      matchId: "NA1_1",
                      championName: "Jhin",
                      queueLabel: "Ranked Solo/Duo",
                      result: "Loss",
                      kda: "1/2/3",
                      evaluationStatus: "current",
                      evaluationSummary: { deathCount: 2, reviewSignals: ["2 deaths"] }
                    }
                  ]
                }
              },
              todaysAction: {},
              activeTeamFocus: {},
              recentInsights: [],
              suggestedNextSteps: []
            }
          }
        });
      }

      if (url === "/api/home/recent-games/refresh") {
        return mockJsonResponse({
          status: "ok",
          newCount: 0,
          riotEvidence: {
            status: "all_recent_games_ready",
            discoveredCount: 1,
            summaryReadyCount: 1,
            evaluationReadyCount: 1
          }
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/");

    await renderApp(document.querySelector("#app"));
    document.querySelector("[data-refresh-recent-games]").click();
    expect(document.body.textContent).toContain("Checking recent games...");
    await flushAsyncWork();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/home/recent-games/refresh",
      expect.objectContaining({ method: "POST", credentials: "same-origin" })
    );
    expect(document.body.textContent).toContain("No new games found.");
  });

  it("renders a preparing next review state when no evaluated game exists", async () => {
    let homeRequests = 0;
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/session") {
        return mockJsonResponse({
          authEnabled: true,
          authenticated: true,
          user: { id: "usr_1" },
          accountUrl: "",
          portalBaseUrl: "",
          manualTokenEntryAvailable: false
        });
      }

      if (url === "/api/home") {
        homeRequests += 1;
        return mockJsonResponse({
          home: {
            user: { id: "usr_1", source: "authenticated", profile: { primaryRole: "ADC" } },
            goalDashboard: {
              activePersonalGoal: {
                title: "Die Less",
                role: "ADC",
                evidenceSource: {},
                riotEvidence: {
                  status: "all_recent_games_ready",
                  title: "10 games ready",
                  summary: "10 games ready",
                  readyCount: 10,
                  preparingCount: 0,
                  discoveredCount: 10,
                  summaryReadyCount: 1,
                  evaluationReadyCount: homeRequests > 1 ? 1 : 0,
                  evaluationPendingCount: homeRequests > 1 ? 0 : 1,
                  candidateGames: [
                    {
                      matchId: "NA1_pending",
                      championName: "Jhin",
                      queueLabel: "Ranked Solo/Duo",
                      result: "Loss",
                      kda: "4/3/5",
                      evaluationStatus: homeRequests > 1 ? "current" : "not_evaluated",
                      evaluationSummary: homeRequests > 1
                        ? {
                            deathCount: 3,
                            reviewSignals: ["3 deaths"],
                            topTags: [{ tag: "death_count", count: 3 }]
                          }
                        : null
                    }
                  ],
                  reviewCandidate: homeRequests > 1
                    ? {
                        matchId: "NA1_pending",
                        championName: "Jhin",
                        queueLabel: "Ranked Solo/Duo",
                        result: "Loss",
                        kda: "4/3/5",
                        evaluationStatus: "current",
                        evaluationSummary: {
                          deathCount: 3,
                          reviewSignals: ["3 deaths"],
                          topTags: [{ tag: "death_count", count: 3 }]
                        },
                        topDeterministicSignals: [{ tag: "death_count", count: 3, label: "3 deaths" }]
                      }
                    : null
                }
              },
              todaysAction: {},
              activeTeamFocus: {},
              recentInsights: [],
              suggestedNextSteps: []
            }
          }
        });
      }

      if (url === "/api/matches/recent/evaluations?limit=3") {
        return mockJsonResponse({
          evaluationVersion: "deterministic-v2",
          summary: {
            evaluated: 1,
            cached: 0,
            skipped: 0,
            failed: 0
          },
          games: [
            {
              matchId: "NA1_pending",
              evaluationStatus: "current",
              evaluationSummary: {
                deathCount: 3,
                reviewSignals: ["3 deaths"]
              },
              evaluationDeaths: []
            }
          ]
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/");

    await renderApp(document.querySelector("#app"));

    expect(document.body.textContent).toContain("No review ready");
    expect(document.body.textContent).toContain("Match summaries are ready. Evaluations are pending.");
    expect(document.body.textContent).toContain("Evaluations are being prepared.");
    expect(document.body.textContent).toContain("Recent games are still being prepared.");
    expect(document.body.textContent).not.toContain("10 games ready");
    expect(document.body.textContent).not.toContain("Review this game");
    expect(document.querySelector('a[href="/review?matchId=NA1_pending"]')).toBeNull();

    await flushAsyncWork();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/matches/recent/evaluations?limit=3",
      expect.objectContaining({ credentials: "same-origin" })
    );
    expect(homeRequests).toBe(2);
    expect(document.body.textContent).toContain("1 evaluated game available");
    expect(document.body.textContent).toContain("Review this game");
    expect(document.body.textContent).toContain("3 review moments");
  });

  it("renders preparing game state instead of fabricated review metadata", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/session") {
        return mockJsonResponse({
          authEnabled: true,
          authenticated: true,
          user: { id: "usr_1" },
          accountUrl: "",
          portalBaseUrl: "",
          manualTokenEntryAvailable: false
        });
      }

      if (url === "/api/home") {
        return mockJsonResponse({
          home: {
            user: { id: "usr_1", source: "authenticated", profile: { primaryRole: "ADC" } },
            goalDashboard: {
              activePersonalGoal: {
                title: "Die Less",
                role: "ADC",
                evidenceSource: {},
                riotEvidence: {
                  status: "all_recent_games_ready",
                  title: "10 games ready",
                  summary: "10 games ready",
                  readyCount: 10,
                  discoveredCount: 10,
                  candidateGames: [
                    {
                      matchId: "NA1_incomplete",
                      championName: "Jhin",
                      evaluationStatus: "current",
                      evaluationSummary: {
                        deathCount: 3,
                        reviewSignals: ["3 deaths"]
                      }
                    }
                  ],
                  reviewCandidate: null
                }
              },
              todaysAction: {},
              activeTeamFocus: {},
              recentInsights: [],
              suggestedNextSteps: []
            }
          }
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/");

    await renderApp(document.querySelector("#app"));

    expect(document.body.textContent).toContain("Jhin · Evaluation pending");
    expect(document.body.textContent).toContain("Match summaries are being prepared.");
    expect(document.body.textContent).not.toContain("10 games discovered");
    expect(document.body.textContent).not.toContain("0 match summaries ready");
    expect(document.body.textContent).not.toContain("10 match summaries preparing");
    expect(document.body.textContent).not.toContain("Unknown queue");
    expect(document.body.textContent).not.toContain("Unknown result");
    expect(document.body.textContent).not.toContain("0/0/0");
    expect(document.body.textContent).not.toContain("10 games ready");
    expect(document.body.textContent).not.toContain("Review this game");
    expect(document.querySelector('a[href="/review?matchId=NA1_incomplete"]')).toBeNull();
    expect(document.body.textContent).toContain("Evaluation pending");
  });

  it("renders newly discovered recent games without changing the next review", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/session") {
        return mockJsonResponse({
          authEnabled: true,
          authenticated: true,
          user: { id: "usr_1" },
          accountUrl: "",
          portalBaseUrl: "",
          manualTokenEntryAvailable: false
        });
      }

      if (url === "/api/home") {
        return mockJsonResponse({
          home: {
            user: { id: "usr_1", source: "authenticated", profile: { primaryRole: "ADC" } },
            goalDashboard: {
              activePersonalGoal: {
                title: "Die Less",
                role: "ADC",
                evidenceSource: {},
                riotEvidence: {
                  status: "all_recent_games_ready",
                  discoveredCount: 4,
                  summaryReadyCount: 3,
                  evaluationReadyCount: 1,
                  recentGames: [
                    {
                      matchId: "NA1_new_partial",
                      championName: "Kai'Sa",
                      evaluationStatus: "not_evaluated"
                    },
                    {
                      matchId: "NA1_review_candidate",
                      championName: "Jhin",
                      queueLabel: "Ranked Solo/Duo",
                      result: "Loss",
                      kda: "3/5/4",
                      evaluationStatus: "current",
                      evaluationSummary: { deathCount: 5, reviewSignals: ["5 deaths"] }
                    },
                    {
                      matchId: "NA1_visible_3",
                      championName: "Ashe",
                      queueLabel: "Ranked Solo/Duo",
                      result: "Win",
                      kda: "4/1/8",
                      evaluationStatus: "not_evaluated"
                    },
                    {
                      matchId: "NA1_visible_4",
                      championName: "Caitlyn",
                      queueLabel: "Ranked Solo/Duo",
                      result: "Loss",
                      kda: "2/3/6",
                      evaluationStatus: "not_evaluated"
                    }
                  ],
                  candidateGames: [
                    {
                      matchId: "NA1_review_candidate",
                      championName: "Jhin",
                      queueLabel: "Ranked Solo/Duo",
                      result: "Loss",
                      kda: "3/5/4",
                      relevanceReason: "evaluation ready · ADC role match",
                      evaluationStatus: "current",
                      evaluationSummary: { deathCount: 5, reviewSignals: ["5 deaths"] }
                    }
                  ],
                  reviewCandidate: {
                    matchId: "NA1_review_candidate",
                    championName: "Jhin",
                    queueLabel: "Ranked Solo/Duo",
                    result: "Loss",
                    kda: "3/5/4",
                    evaluationStatus: "current",
                    evaluationSummary: { deathCount: 5, reviewSignals: ["5 deaths"] },
                    topDeterministicSignals: [{ tag: "death_count", count: 5, label: "5 deaths" }],
                    selectionReason: "Selected for evaluation ready · ADC role match."
                  }
                }
              },
              todaysAction: {},
              activeTeamFocus: {},
              recentInsights: [],
              suggestedNextSteps: []
            }
          }
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/");

    await renderApp(document.querySelector("#app"));

    expect(document.body.textContent).toContain("Review your latest game");
    expect(document.body.textContent).not.toContain("Selected for evaluation ready");
    expect([...document.querySelectorAll('a[href="/review?matchId=NA1_review_candidate"]')].some((link) =>
      link.textContent.includes("Review")
    )).toBe(true);
    expect(document.body.textContent).toContain("Recent Games");
    expect(document.body.textContent).toContain("Kai'Sa · Evaluation pending");
    expect(document.body.textContent).toContain("Caitlyn · Loss");
    expect(document.querySelector('a[href="/review?matchId=NA1_new_partial"]')).toBeNull();
  });

  it("renders server-owned initial assessment progress and reviewed recent-game status", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/session") {
        return mockJsonResponse({
          authEnabled: true,
          authenticated: true,
          user: { id: "usr_1" },
          accountUrl: "",
          portalBaseUrl: "",
          manualTokenEntryAvailable: false
        });
      }
      if (url === "/api/home") {
        const candidateGames = [
          { matchId: "NA1_done", championName: "Caitlyn", result: "Loss", queueLabel: "Ranked Solo/Duo", kda: "2/4/5", evaluationStatus: "current", evaluationSummary: { deathCount: 4 }, triagedMomentCount: 4, totalReviewMomentCount: 4, reviewStatus: "triaged", lastReviewedAt: "2026-06-09T02:00:00.000Z" },
          { matchId: "NA1_manual", championName: "Jinx", result: "Loss", queueLabel: "Ranked Solo/Duo", kda: "1/2/3", evaluationStatus: "current", evaluationSummary: { deathCount: 2 }, triagedMomentCount: 2, needsManualReviewCount: 1, totalReviewMomentCount: 2, reviewStatus: "needs_manual_review" },
          { matchId: "NA1_next", championName: "Ashe", result: "Win", queueLabel: "Ranked Solo/Duo", kda: "4/1/8", evaluationStatus: "current", evaluationSummary: { deathCount: 1 }, totalReviewMomentCount: 1, reviewStatus: "not_started" }
        ];
        return mockJsonResponse({
          home: {
            user: { id: "usr_1", source: "authenticated", profile: { primaryRole: "ADC" } },
            goalDashboard: {
              activePersonalGoal: {
                title: "Improve teamfight deaths",
                role: "ADC",
                goalStatus: "Needs attention",
                goalStatusTrend: "needs-attention",
                evidenceSource: {},
                weeklyTargets: [{ label: "0 known gank deaths", currentValue: 1, targetValue: 0, statusLabel: "Missed", trend: "needs-attention" }],
                riotEvidence: {
                  status: "all_recent_games_ready",
                  summaryReadyCount: 3,
                  evaluationReadyCount: 3,
                  recentGames: candidateGames,
                  candidateGames,
                  initialAssessment: {
                    target: 3,
                    completedMatchIds: ["NA1_done", "NA1_manual"],
                    completedCount: 2,
                    nextMatchId: "NA1_next",
                    assessmentComplete: false,
                    candidateGames
                  }
                }
              },
              todaysAction: {},
              activeTeamFocus: {},
              recentInsights: [{ title: "Known threat is the main leak", summary: "Old copy should not render during assessment." }],
              suggestedNextSteps: []
            }
          }
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/");

    await renderApp(document.querySelector("#app"));

    expect(document.body.textContent).toContain("2 of 3 games reviewed");
    expect(document.body.textContent).toContain("Initial assessment: 2/3 reviewed");
    expect(document.body.textContent).not.toContain("Needs attention");
    expect(document.body.textContent).toContain("Review one more game to finish the baseline.");
    expect(document.body.textContent).toContain("Recommended next review");
    expect(document.body.textContent).toContain("Ashe · Win");
    expect(document.body.textContent).toContain("Ranked Solo/Duo · 4/1/8 KDA · 1 review moment");
    expect(document.body.textContent).toContain("Why this game: Next unreviewed assessment game.");
    expect(document.body.textContent).not.toContain("highest-priority");
    expect(document.querySelector('a[href="/review?matchId=NA1_next"]')?.textContent).toBe("Review this game");
    expect(document.querySelector('a[href="#review-ready-games"]')?.textContent).toBe("Choose a different game");
    expect(document.body.textContent).not.toContain("Review queue");
    const initialAssessmentPanel = document.querySelector(".initial-assessment-panel");
    expect(initialAssessmentPanel?.textContent).not.toContain("Caitlyn · Loss");
    expect(initialAssessmentPanel?.textContent).not.toContain("Jinx · Loss");
    expect(document.body.textContent).toContain("Caitlyn · Loss");
    expect(document.body.textContent).toContain("2/4/5");
    expect(document.body.textContent).toContain("4 review moments");
    expect(document.body.textContent).toContain("Jinx · Loss");
    expect(document.body.textContent).toContain("2 review moments");
    expect(document.body.textContent).toContain("Ashe · Win");
    expect(document.body.textContent).toContain("1 review moment");
    expect(document.body.textContent).toContain("Triaged");
    expect(document.body.textContent).toContain("Needs manual review");
    expect(document.body.textContent).toContain("Next review");
    expect([...document.querySelectorAll(".status-badge")].some((badge) =>
      badge.getAttribute("title") === "Recommended next game to continue the initial assessment."
    )).toBe(true);
    expect(document.body.textContent).toContain("Early signal preview");
    expect(document.body.textContent).toContain("Early target preview");
    expect(document.body.textContent).toContain("Based on 2 reviewed games. Final targets unlock after the initial assessment.");
    expect(document.body.textContent).toContain("Not connected to this assessment yet");
    expect(document.body.textContent).toContain("Personal initial assessment does not update this yet.");
    expect(document.body.textContent).not.toContain("0 known gank deaths");
    expect(document.body.textContent).not.toContain("Known threat is the main leak");
    expect(document.body.textContent).not.toContain("Updated from reviewed evidence");
    expect(document.querySelector(".dashboard-home-layout > .dashboard-main-column .riot-evidence-panel")).not.toBeNull();
    expect(document.querySelector(".dashboard-home-layout > .dashboard-context-column .team-focus-panel")).not.toBeNull();
  });

  it("renders failed recent-game preparation as an actionable status", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/session") {
        return mockJsonResponse({
          authEnabled: true,
          authenticated: true,
          user: { id: "usr_1" },
          accountUrl: "",
          portalBaseUrl: "",
          manualTokenEntryAvailable: false
        });
      }

      if (url === "/api/home") {
        return mockJsonResponse({
          home: {
            user: { id: "usr_1", source: "authenticated", profile: { primaryRole: "ADC" } },
            goalDashboard: {
              activePersonalGoal: {
                title: "Die Less",
                role: "ADC",
                evidenceSource: {},
                riotEvidence: {
                  status: "parse_failed_retry_available",
                  title: "Recent game parsing failed",
                  summary: "1 game discovered · 0 match summaries ready · 0 evaluations ready · 0 evaluations pending · 1 preparation failed",
                  readyCount: 0,
                  preparingCount: 0,
                  failedCount: 1,
                  discoveredCount: 1,
                  candidateGames: [],
                  reviewCandidate: null
                }
              },
              todaysAction: {},
              activeTeamFocus: {},
              recentInsights: [],
              suggestedNextSteps: []
            }
          }
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/");

    await renderApp(document.querySelector("#app"));

    expect(document.body.textContent).toContain("Match preparation failed. Retry available.");
    expect(document.body.textContent).toContain("Some evaluations failed.");
    expect(document.body.textContent).not.toContain("1 game discovered");
    expect(document.body.textContent).not.toContain("0 match summaries ready");
    expect(document.body.textContent).not.toContain("1 preparation failed");
    expect(document.body.textContent).not.toContain("Preparation details");
  });

  it("preserves matchId on demo Review links", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/demo/home") {
        return mockJsonResponse({
          home: {
            user: { id: null, source: "demo", profile: {} },
            goalDashboard: {
              activePersonalGoal: {
                title: "Die Less",
                riotEvidence: {
                  reviewCandidate: {
                    matchId: "NA1_demo",
                    championName: "Jinx",
                    queueLabel: "Ranked Solo/Duo",
                    result: "Loss",
                    kda: "3/4/8",
                    topDeterministicSignals: [{ tag: "death_count", count: 4, label: "4 deaths" }],
                    evaluationStatus: "current",
                    evaluationSummary: { deathCount: 4, reviewSignals: ["4 deaths"] }
                  },
                  candidateGames: [
                    {
                      matchId: "NA1_demo",
                      championName: "Jinx",
                      queueLabel: "Ranked Solo/Duo",
                      result: "Loss",
                      kda: "3/4/8",
                      confidenceLabel: "high"
                    }
                  ]
                }
              },
              todaysAction: {},
              activeTeamFocus: {},
              recentInsights: [],
              suggestedNextSteps: []
            }
          }
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/demo");

    await renderApp(document.querySelector("#app"));

    expect(document.body.textContent).toContain("Review your latest game");
    expect([...document.querySelectorAll('a[href="/demo/review?matchId=NA1_demo"]')].some((link) =>
      link.textContent.includes("Review")
    )).toBe(true);
  });

  it("renders a review landing state without matchId", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/session") {
        return mockJsonResponse({
          authEnabled: true,
          authenticated: true,
          user: { id: "usr_1" },
          accountUrl: "",
          portalBaseUrl: "",
          manualTokenEntryAvailable: false
        });
      }

      if (url === "/api/home") {
        return mockJsonResponse({
          home: {
            user: { id: "usr_1", source: "authenticated", profile: { primaryRole: "ADC" } },
            goalDashboard: { activePersonalGoal: { title: "Die Less", riotEvidence: {} } }
          }
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/review");

    await renderApp(document.querySelector("#app"));

    expect(document.body.textContent).toContain("Review queue");
    expect(document.body.textContent).toContain("No review-ready games yet");
    expect(document.querySelector('.button[href="/setup"]')?.textContent).toContain("Edit setup");
  });

  it("renders a review priority and death facts for a multi-death evaluated match", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/session") {
        return mockJsonResponse({
          authEnabled: true,
          authenticated: true,
          user: { id: "usr_1" },
          accountUrl: "",
          portalBaseUrl: "",
          manualTokenEntryAvailable: false
        });
      }

      if (url === "/api/matches/NA1_1/evaluation") {
        return mockJsonResponse({
          matchId: "NA1_1",
          activeGoalName: "Die Less",
          evaluationStatus: "current",
          evaluationVersion: "deterministic-v2",
          matchSummary: {
            championName: "Jhin",
            queueLabel: "Ranked Solo/Duo",
            result: "Loss",
            kills: 8,
            deaths: 5,
            assists: 6,
            role: "ADC"
          },
          evaluationSummary: {
            deathCount: 5,
            reviewSignals: ["5 deaths", "2 multi-enemy collapse candidates"]
          },
          deathEvents: [
            {
              timestampSeconds: 494,
              killerChampionName: "LeBlanc",
              assistingChampionNames: ["Briar"],
              tags: ["multi_enemy_collapse_candidate"],
              victimLevel: 8,
              killerLevel: 9
            },
            {
              timestampSeconds: 600,
              killerChampionName: "Briar",
              assistingChampionNames: ["LeBlanc"],
              tags: ["multi_enemy_collapse_candidate", "objective_window_candidate"],
              victimLevel: 9,
              killerLevel: 10
            }
          ],
          deterministicTagCounts: {
            death_count: 5,
            multi_enemy_collapse_candidate: 2,
            objective_window_candidate: 1
          },
          timelineJson: { secret: "SECRET_TIMELINE_EVENT" },
          rawMatchJson: { secret: "SECRET_MATCH_JSON" }
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/review?matchId=NA1_1");

    await renderApp(document.querySelector("#app"));

    expect(document.body.textContent).toContain("Jhin · Loss · Ranked Solo/Duo");
    expect(document.body.textContent).toContain("8/5/6 KDA");
    expect(document.body.textContent).toContain("Goal: Die Less · 0 of 2 reviewed");
    expect(document.body.textContent).not.toContain("Match Summary");
    expect(document.body.textContent).toContain("Main Review");
    expect(document.body.textContent).toContain("Complete Death Review");
    expect(document.body.textContent).toContain("All 2 deaths");
    expect(document.body.textContent).toContain("Death 1 · 08:14");
    expect(document.body.textContent).toContain("Death 2 · 10:00");
    expect(document.body.textContent).toContain("Review takeaway");
    expect(document.body.textContent).toContain("Evidence");
    expect(document.body.textContent).toContain("Walked forward with missing enemies");
    expect(document.querySelectorAll("[data-main-review]")).toHaveLength(1);
    expect(document.querySelectorAll("[data-death-review-item]")).toHaveLength(2);
    expect(document.querySelectorAll("[data-death-review-item] .review-factor-option").length).toBeGreaterThan(0);
    expect(document.querySelectorAll("[data-death-review-item] .review-factor-intro")).toHaveLength(2);
    expect(document.querySelectorAll("[data-death-review-item] .review-factor-intro h5")[0]?.textContent).toBe("What type of death was this?");
    expect(document.querySelectorAll("[data-death-review-item] .review-factor-intro p")[0]?.textContent).toBe("Pick the pattern that best matches the replay. Use “Other pattern not listed” if the generated options are wrong.");
    expect(document.querySelector(".review-factor-grid")).toBeTruthy();
    expect(document.querySelector(".review-factor-option input")?.type).toBe("radio");
    expect(document.querySelector(".technical-evidence")?.hasAttribute("open")).toBe(false);
    expect(document.body.textContent).not.toContain("Detected Signals");
    expect(document.body.textContent).not.toContain("Observed pattern");
    expect(document.body.textContent).not.toContain("candidate");
    expect(document.body.textContent).not.toContain("raw signal counts");
    expect(document.body.textContent).toContain("Technical evidence");
    expect(document.body.textContent).not.toContain("Debug evidence");
    expect(document.body.textContent).toContain("08:14");
    expect(document.body.textContent).toContain("Killed by LeBlanc, assisted by Briar");
    expect(document.body.textContent).toContain("Detected signals: Walked forward with missing enemies");
    expect(document.body.textContent).toContain("Victim level 8");
    expect(document.body.textContent).not.toContain("Raw deterministic facts");
    expect(document.body.textContent).not.toContain("Raw signal counts");
    expect(document.body.textContent).not.toContain("SECRET_TIMELINE_EVENT");
    expect(document.body.textContent).not.toContain("SECRET_MATCH_JSON");
  });

  it("renders every death with uncertainty status and consistent pattern items", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/session") {
        return mockJsonResponse({
          authEnabled: true,
          authenticated: true,
          user: { id: "usr_1" },
          accountUrl: "",
          portalBaseUrl: "",
          manualTokenEntryAvailable: false
        });
      }

      if (url === "/api/matches/NA1_four/evaluation") {
        return mockJsonResponse({
          matchId: "NA1_four",
          activeGoalName: "Die Less",
          evaluationStatus: "current",
          evaluationVersion: "deterministic-v2",
          matchSummary: {
            championName: "Caitlyn",
            queueLabel: "Ranked Solo/Duo",
            result: "Win",
            kills: 4,
            deaths: 4,
            assists: 12,
            role: "ADC"
          },
          evaluationSummary: { deathCount: 4 },
          deathEvents: [
            {
              deathIndex: 1,
              timestampSeconds: 420,
              killerChampionName: "Annie",
              tags: ["solo_death_candidate"],
              nearbyAllyChampionNames: ["Lulu"]
            },
            {
              deathIndex: 2,
              timestampSeconds: 721,
              killerChampionName: "Lee Sin",
              tags: ["multi_enemy_collapse_candidate"],
              nearbyEnemyCount: 2,
              nearbyEnemyChampionNames: ["Lee Sin", "Jinx"]
            },
            {
              deathIndex: 3,
              timestampSeconds: 990,
              killerChampionName: "Jinx",
              tags: ["objective_window_candidate"]
            },
            {
              deathIndex: 4,
              timestampSeconds: 1200,
              killerChampionName: "Annie",
              tags: ["death_count"]
            }
          ],
          deterministicTagCounts: {
            death_count: 4,
            solo_death_candidate: 1,
            multi_enemy_collapse_candidate: 1,
            objective_window_candidate: 1
          },
          reviewedMoments: []
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/review?matchId=NA1_four");

    await renderApp(document.querySelector("#app"));

    expect(document.body.textContent).toContain("Caitlyn · Win · Ranked Solo/Duo");
    expect(document.body.textContent).toContain("ADC · 4/4/12 KDA · Goal: Die Less · 0 of 4 reviewed");
    expect(document.querySelectorAll("[data-main-review]")).toHaveLength(1);
    expect(document.querySelector(".review-page-grid")).not.toBeNull();
    expect(document.querySelector(".review-progress-rail .review-checklist-panel")).not.toBeNull();
    expect(document.querySelectorAll("[data-death-review-item]")).toHaveLength(4);
    expect(document.body.textContent).toContain("Death 4 · 20:00");
    expect(document.body.textContent).toContain("Unreviewed");
    expect(document.body.textContent).not.toContain("Multiple enemies");
    expect(document.querySelectorAll("[data-observed-pattern-item]").length).toBeGreaterThanOrEqual(2);
    expect(document.body.textContent).toContain("Other suggested patterns");
    document.querySelectorAll("[data-observed-pattern-item]").forEach((item) => {
      expect(item.querySelector("h4")).toBeTruthy();
      expect(item.querySelectorAll("p")).toHaveLength(2);
    });
    expect(document.querySelector(".technical-evidence")?.hasAttribute("open")).toBe(false);
    expect(document.body.textContent).not.toContain("Raw deterministic facts");
    expect(document.body.textContent).not.toContain("Raw signal counts");
    expect(document.body.textContent).not.toContain("Candidate");
    expect(document.body.textContent).not.toContain("Overlapping detected signals");
  });

  it("builds review moments with death-specific signals and contextual questions", () => {
    const plan = buildMatchReviewPlan({
      activeGoalName: "Die Less",
      evaluationSummary: { deathCount: 3 },
      deterministicTagCounts: {
        death_count: 3,
        objective_setup_death_candidate: 1,
        solo_death_candidate: 1,
        multi_enemy_collapse_candidate: 1,
        level_up_all_in_candidate: 1
      },
      deathEvents: [
        {
          deathIndex: 1,
          timestampSeconds: 100,
          tags: ["objective_setup_death_candidate", "multi_enemy_collapse_candidate"],
          nearbyEnemyCount: 3,
          objectiveName: "dragon",
          objectiveSpawnSecondsAfterDeath: 42
        },
        {
          deathIndex: 2,
          timestampSeconds: 200,
          tags: ["solo_death_candidate"]
        },
        {
          deathIndex: 3,
          timestampSeconds: 300,
          tags: ["level_up_all_in_candidate"],
          enemyLevelUpsBeforeDeath: [{ level: 6 }]
        }
      ]
    });

    const byDeath = new Map(plan.reviewMoments.map((moment) => [moment.deathIndex, moment]));
    expect(byDeath.get(1).detectedSignals.map((signal) => signal.id)).toEqual([
      "objective_setup_death_candidate",
      "multi_enemy_collapse_candidate"
    ]);
    expect(byDeath.get(2).detectedSignals.map((signal) => signal.id)).toEqual(["solo_death_candidate"]);
    expect(byDeath.get(3).detectedSignals.map((signal) => signal.label)).toEqual(["Enemy ultimate timing"]);
    expect(byDeath.get(1).progressLabel).toBe("Death 1 of 3");
    expect(byDeath.get(1).reviewQuestion).toBe("Were you early, grouped, or late to dragon setup?");
    expect(byDeath.get(2).reviewQuestion).toBe("Who was close enough to cover you when you walked forward?");
    expect(byDeath.get(3).reviewQuestion).toBe("Did the enemy hit the level breakpoint before you committed?");
  });

  it("filters weak review labels and falls back to no clear cause", () => {
    const plan = buildMatchReviewPlan({
      activeGoalName: "Improve map awareness",
      evaluationSummary: { deathCount: 1 },
      deterministicTagCounts: { death_count: 1 },
      deathEvents: [
        {
          deathIndex: 1,
          timestampSeconds: 120,
          tags: ["death_count", "selected_for_evaluation_ready", "raw_signal_counts"]
        }
      ]
    });

    expect(plan.reviewMoments[0].factorOptions.map((option) => option.label)).toEqual([
      "No clear pattern yet",
      "Other pattern not listed"
    ]);
    expect(plan.reviewMoments[0].factorOptions.map((option) => option.label).join(" ")).not.toContain("Observed pattern");
    expect(plan.reviewMoments[0].factorOptions.map((option) => option.label).join(" ")).not.toContain("candidate");
  });

  it("builds reusable fight-shape and repeated-enemy candidates", () => {
    const lane2v2 = buildMatchReviewPlan({
      activeGoalName: "Trading",
      matchSummary: { role: "ADC" },
      evaluationSummary: { deathCount: 1 },
      deterministicTagCounts: { death_count: 1 },
      deathEvents: [
        {
          deathIndex: 1,
          timestampSeconds: 100,
          killerChampionName: "Bard",
          assistingChampionNames: ["Brand"],
          nearbyAllyChampionNames: ["Lulu"],
          nearbyEnemyChampionNames: ["Bard", "Brand"],
          nearbyEnemyCount: 2
        }
      ]
    });
    const lane2v1 = buildMatchReviewPlan({
      activeGoalName: "Trading",
      matchSummary: { role: "ADC" },
      evaluationSummary: { deathCount: 1 },
      deterministicTagCounts: { death_count: 1 },
      deathEvents: [
        {
          deathIndex: 1,
          timestampSeconds: 100,
          killerChampionName: "Bard",
          assistingChampionNames: ["Brand"],
          nearbyEnemyChampionNames: ["Bard", "Brand"],
          nearbyEnemyCount: 2
        }
      ]
    });
    const collapse = buildMatchReviewPlan({
      activeGoalName: "Die Less",
      matchSummary: { role: "ADC" },
      evaluationSummary: { deathCount: 1 },
      deterministicTagCounts: { death_count: 1 },
      deathEvents: [
        {
          deathIndex: 1,
          timestampSeconds: 100,
          killerChampionName: "Bard",
          assistingChampionNames: ["Brand", "Lee Sin"],
          nearbyEnemyChampionNames: ["Bard", "Brand", "Lee Sin"],
          nearbyEnemyCount: 3
        }
      ]
    });
    const repeated = buildMatchReviewPlan({
      activeGoalName: "Die Less",
      matchSummary: { role: "ADC" },
      evaluationSummary: { deathCount: 2 },
      deterministicTagCounts: { death_count: 2 },
      deathEvents: [
        { deathIndex: 1, timestampSeconds: 100, killerChampionName: "Annie", assistingChampionNames: ["Brand"] },
        { deathIndex: 2, timestampSeconds: 200, killerChampionName: "Annie", assistingChampionNames: ["Brand"] }
      ]
    });

    expect(lane2v2.reviewMoments[0].factorOptions.map((option) => option.label)).toContain("Bot lane 2v2 death");
    expect(lane2v2.reviewMoments[0].fightShape.bucket).toBe("2v2");
    expect(lane2v1.reviewMoments[0].factorOptions.map((option) => option.label)).toContain("Bot lane 2v1 punish");
    expect(collapse.reviewMoments[0].factorOptions.map((option) => option.label)).toContain("Collapsed on by multiple enemies");
    expect(repeated.patterns.map((pattern) => pattern.label)).toContain("Repeatedly killed by Annie + Brand");
  });

  it("keeps equal fights neutral and only marks true count disadvantages as outnumbered", () => {
    const equal = buildMatchReviewPlan({
      activeGoalName: "Die Less",
      evaluationSummary: { deathCount: 1 },
      deterministicTagCounts: { death_count: 1 },
      deathEvents: [{
        deathIndex: 1,
        timestampSeconds: 100,
        nearbyEnemyCount: 3,
        nearbyEnemyChampionNames: ["A", "B", "C"],
        nearbyAllyChampionNames: ["D", "E"]
      }]
    });
    const advantaged = buildMatchReviewPlan({
      activeGoalName: "Die Less",
      evaluationSummary: { deathCount: 1 },
      deterministicTagCounts: { death_count: 1, solo_death_candidate: 1 },
      deathEvents: [{
        deathIndex: 1,
        timestampSeconds: 100,
        tags: ["solo_death_candidate"],
        nearbyEnemyCount: 1,
        nearbyAllyChampionNames: ["D", "E"]
      }]
    });
    const collapsed = buildMatchReviewPlan({
      activeGoalName: "Die Less",
      evaluationSummary: { deathCount: 1 },
      deterministicTagCounts: { death_count: 1 },
      deathEvents: [{
        deathIndex: 1,
        timestampSeconds: 100,
        nearbyEnemyCount: 3
      }]
    });

    expect(equal.reviewMoments[0].fightShape.helperText).toBe("Even fight: 3 enemies vs 3 allies");
    expect(equal.reviewMoments[0].fightShape.label).not.toContain("Outnumbered");
    expect(advantaged.reviewMoments[0].evidenceFacts.join(" ")).not.toContain("allied cover was not close enough");
    expect(collapsed.reviewMoments[0].fightShape.label).toContain("Collapsed");
  });

  it("uses plain fight-shape display labels without against-you wording for allied advantages", () => {
    expect(fightShapeDisplayLabel({ enemyCount: 3, alliedCount: 4 })).toBe("Allied numbers advantage: 3 enemies vs 4 allies");
    expect(fightShapeDisplayLabel({ enemyCount: 3, alliedCount: 2 })).toBe("Outnumbered: 3 enemies vs 2 allies");
    expect(fightShapeDisplayLabel({ enemyCount: 2, alliedCount: 2 })).toBe("Even fight: 2 enemies vs 2 allies");
  });

  it("keeps main review evidence suggested until user selections confirm it", () => {
    const plan = buildMatchReviewPlan({
      activeGoalName: "Die Less",
      evaluationSummary: { deathCount: 2 },
      deterministicTagCounts: { death_count: 2, solo_death_candidate: 2 },
      deathEvents: [
        { deathIndex: 1, timestampSeconds: 100, tags: ["solo_death_candidate"], killerChampionName: "Ahri" },
        { deathIndex: 2, timestampSeconds: 200, tags: ["solo_death_candidate"], killerChampionName: "Ahri" }
      ],
      reviewedMoments: [
        {
          deathIndex: 1,
          signalId: "solo_death_candidate",
          selectedPatternId: "solo_death_candidate",
          status: "confirmed",
          causeCategory: "walked_without_cover"
        },
        {
          deathIndex: 2,
          signalId: "solo_death_candidate",
          selectedPatternId: "manual_other_pattern",
          status: "unsure",
          causeCategory: "other"
        }
      ]
    });

    expect(plan.mainReview.diagnosis).toContain("Confirmed: 1 reviewed moments match this pattern");
    const soloPattern = plan.patterns.find((pattern) => pattern.id === "solo_death_candidate");
    expect(soloPattern.confirmedCount).toBe(1);
    expect(soloPattern.evidenceRows).toEqual([
      expect.objectContaining({ deathIndex: 1, status: "reviewed" }),
      expect.objectContaining({ deathIndex: 2, status: "suggested" })
    ]);
  });

  it("maps death coordinates into reusable absolute and relative zones", () => {
    expect(mapDeathPositionToZone({ x: 9600, y: 2600, playerSide: "blue" }).userRelativeZoneLabel).toContain("allied bot outer area");
    expect(mapDeathPositionToZone({ x: 12100, y: 5000, playerSide: "blue" }).userRelativeZoneLabel).toContain("enemy bot outer area");
    expect(mapDeathPositionToZone({ x: 10400, y: 3000, playerSide: "blue" }).laneRegion).toBe("bot outer area");
    expect(mapDeathPositionToZone({ x: 11200, y: 5000, playerSide: "blue" }).laneRegion).toBe("bot lane center");
    expect(mapDeathPositionToZone({ x: 4200, y: 5200 }).jungleQuadrant).toContain("blue-side blue quadrant");
    expect(mapDeathPositionToZone({ x: 6000, y: 4300 }).jungleQuadrant).toContain("blue-side red quadrant");
    expect(mapDeathPositionToZone({ x: 11500, y: 7600 }).jungleQuadrant).toContain("red-side blue quadrant");
    expect(mapDeathPositionToZone({ x: 8200, y: 10500 }).jungleQuadrant).toContain("red-side red quadrant");
    expect(mapDeathPositionToZone({ x: 9866, y: 4414 }).broadRegion).toBe("objective");
    expect(mapDeathPositionToZone({ x: 9866, y: 4414 }).absoluteZoneLabel).toBe("dragon pit");
  });

  it("uses location and matchup context in review candidates", () => {
    const river = buildMatchReviewPlan({
      activeGoalName: "Die Less",
      matchSummary: { role: "ADC", teamSide: "blue" },
      evaluationSummary: { deathCount: 1 },
      deterministicTagCounts: { death_count: 1 },
      deathEvents: [{
        deathIndex: 1,
        timestampSeconds: 700,
        x: 9300,
        y: 5200,
        enemyRolesInvolved: ["jungle", "support"],
        killerChampionName: "Lee Sin"
      }]
    });
    const lane = buildMatchReviewPlan({
      activeGoalName: "Trading",
      matchSummary: { role: "ADC", teamSide: "blue" },
      evaluationSummary: { deathCount: 1 },
      deterministicTagCounts: { death_count: 1 },
      deathEvents: [{
        deathIndex: 1,
        timestampSeconds: 300,
        x: 11200,
        y: 5000,
        enemyRolesInvolved: ["bot"],
        killerChampionName: "Jinx"
      }]
    });

    expect(river.reviewMoments[0].locationZone.userRelativeZoneLabel).toContain("bot river");
    expect(river.reviewMoments[0].factorOptions.map((option) => option.label)).toContain("River skirmish with jungle involved");
    expect(lane.reviewMoments[0].factorOptions.map((option) => option.label)).toContain("Lane fight against matchup opponent");
  });

  it("does not promote weak 2v2, post-6 level timing, or post-death facts as primary causes", () => {
    const plan = buildMatchReviewPlan({
      activeGoalName: "Die Less",
      evaluationSummary: { deathCount: 3 },
      deterministicTagCounts: {
        death_count: 3,
        multi_enemy_collapse_candidate: 1,
        level_up_all_in_candidate: 1,
        solo_death_candidate: 1
      },
      deathEvents: [
        {
          deathIndex: 1,
          timestampSeconds: 100,
          tags: ["multi_enemy_collapse_candidate"],
          nearbyEnemyCount: 2,
          nearbyEnemyChampionNames: ["Jinx", "Lulu"]
        },
        {
          deathIndex: 2,
          timestampSeconds: 200,
          tags: ["level_up_all_in_candidate"],
          enemyLevelUpsBeforeDeath: [{ level: 7 }]
        },
        {
          deathIndex: 3,
          timestampSeconds: 300,
          tags: ["solo_death_candidate"],
          postDeathEvents: [{ type: "dragon" }]
        }
      ]
    });

    const byDeath = new Map(plan.reviewMoments.map((moment) => [moment.deathIndex, moment]));
    expect(byDeath.get(1).primaryLabel).toBe("No clear pattern yet");
    expect(byDeath.get(1).factorOptions.map((option) => option.label)).not.toContain("Walked forward with missing enemies");
    expect(byDeath.get(2).primaryLabel).toBe("No clear pattern yet");
    expect(byDeath.get(2).factorOptions.map((option) => option.label)).not.toContain("Enemy level-up timing");
    expect(byDeath.get(3).evidenceFacts.join(" ")).not.toContain("dragon");
    expect(new Set(plan.reviewMoments.map((moment) => moment.reviewQuestion)).size).toBeGreaterThan(1);
  });

  it("only promotes objective review candidates when objective timing facts exist", () => {
    const unsupported = buildMatchReviewPlan({
      activeGoalName: "Objective Setup",
      evaluationSummary: { deathCount: 1 },
      deterministicTagCounts: { objective_window_candidate: 1 },
      deathEvents: [
        { deathIndex: 1, timestampSeconds: 100, tags: ["objective_window_candidate"] }
      ]
    });
    const supported = buildMatchReviewPlan({
      activeGoalName: "Objective Setup",
      evaluationSummary: { deathCount: 1 },
      deterministicTagCounts: { objective_window_candidate: 1 },
      deathEvents: [
        {
          deathIndex: 1,
          timestampSeconds: 100,
          tags: ["objective_window_candidate"],
          objectiveName: "dragon",
          objectiveSpawnSecondsAfterDeath: 35,
          objectiveTakenSecondsAfterDeath: 80
        }
      ]
    });

    expect(unsupported.reviewMoments[0].factorOptions.map((option) => option.label)).not.toContain("Died before objective setup completed");
    expect(supported.reviewMoments[0].factorOptions.map((option) => option.label)).toContain("Died before dragon setup completed");
    expect(supported.reviewMoments[0].evidenceFacts.join(" ")).toContain("dragon spawned 35s after the death");
    expect(supported.reviewMoments[0].reviewQuestion).toBe("Were you early, grouped, or late to dragon setup?");
    expect(supported.reviewMoments[0].whyReview).toContain("dragon");
    expect(unsupported.reviewMoments[0].factorOptions.map((option) => option.label).join(" ")).not.toContain("objective setup/window");
  });

  it("deduplicates death facts and keeps replay language out of Facts", () => {
    const plan = buildMatchReviewPlan({
      activeGoalName: "Die Less",
      evaluationSummary: { deathCount: 1 },
      deterministicTagCounts: { death_count: 1, bot_lane_2v2_death: 1 },
      deathEvents: [{
        deathIndex: 1,
        timestampSeconds: 120,
        killerChampionName: "Draven",
        assistingChampionNames: ["Pantheon"],
        tags: ["bot_lane_2v2_death"],
        laneDeathContext: "bot_lane_2v2_death",
        laneDeathContextLabel: "2v2 lane death",
        fightShape: {
          enemyCount: 2,
          alliedCount: 2,
          helperText: "Fight shape: 2 enemies vs 2 allies"
        },
        evidenceSections: {
          knownFromData: [
            "Fight shape: 2 enemies vs 2 allies",
            "Even fight: 2 enemies vs 2 allies",
            "Lane context: 2v2 lane death",
            "Could nearby allies affect the fight?"
          ],
          replayCanAnswer: ["Did you and your lane partner commit to the same trade?"]
        }
      }]
    });

    const facts = plan.reviewMoments[0].evidenceFacts.join(" ");
    expect(facts).toContain("Fight shape: 2 enemies vs 2 allies");
    expect(facts).not.toContain("Even fight: 2 enemies vs 2 allies");
    expect(facts).not.toContain("Lane context: 2v2 lane death");
    expect(facts).not.toMatch(/review whether|could affect|unclear/i);
  });

  it("shows level evidence only when it changes interpretation", () => {
    const plan = buildMatchReviewPlan({
      activeGoalName: "Die Less",
      evaluationSummary: { deathCount: 3 },
      deterministicTagCounts: { death_count: 3, level_up_all_in_candidate: 2 },
      deathEvents: [
        { deathIndex: 1, timestampSeconds: 100, killerLevel: 11, victimLevel: 10 },
        { deathIndex: 2, timestampSeconds: 200, killerLevel: 3, victimLevel: 2, tags: ["level_up_all_in_candidate"], enemyLevelUpsBeforeDeath: [{ level: 3 }] },
        { deathIndex: 3, timestampSeconds: 300, killerLevel: 12, victimLevel: 10 }
      ]
    });

    const byDeath = new Map(plan.reviewMoments.map((moment) => [moment.deathIndex, moment]));
    expect(byDeath.get(1).evidenceFacts.join(" ")).not.toContain("Enemy level lead");
    expect(byDeath.get(2).evidenceFacts.join(" ")).toContain("Enemy level 3 timing");
    expect(byDeath.get(3).evidenceFacts.join(" ")).toContain("Enemy level lead: 10 vs 12");
  });

  it("uses participant-specific wording instead of lane-pair overreach", () => {
    const supportJungle = buildMatchReviewPlan({
      activeGoalName: "Die Less",
      matchSummary: { role: "ADC" },
      evaluationSummary: { deathCount: 1 },
      deterministicTagCounts: { death_count: 1 },
      deathEvents: [{
        deathIndex: 1,
        timestampSeconds: 300,
        nearbyEnemyCount: 2,
        enemyRolesInvolved: ["support", "jungle"],
        killerChampionName: "Nautilus"
      }]
    });
    const botPair = buildMatchReviewPlan({
      activeGoalName: "Trading",
      matchSummary: { role: "ADC" },
      evaluationSummary: { deathCount: 1 },
      deterministicTagCounts: { death_count: 1 },
      deathEvents: [{
        deathIndex: 1,
        timestampSeconds: 300,
        nearbyEnemyCount: 2,
        nearbyAllyChampionNames: ["Lulu"],
        enemyRolesInvolved: ["bot", "support"],
        killerChampionName: "Jinx"
      }]
    });
    const topGank = buildMatchReviewPlan({
      activeGoalName: "Die Less",
      matchSummary: { role: "TOP" },
      evaluationSummary: { deathCount: 1 },
      deterministicTagCounts: { death_count: 1 },
      deathEvents: [{
        deathIndex: 1,
        timestampSeconds: 300,
        nearbyEnemyCount: 2,
        enemyRolesInvolved: ["top", "jungle"],
        killerChampionName: "Renekton"
      }]
    });

    expect(supportJungle.reviewMoments[0].factorOptions.map((option) => option.label)).not.toContain("Bot lane 2v1 punish");
    expect(supportJungle.reviewMoments[0].evidenceFacts.join(" ")).toContain("Enemy support + jungle were involved");
    expect(botPair.reviewMoments[0].factorOptions.map((option) => option.label)).toContain("Bot lane 2v2 death");
    expect(botPair.reviewMoments[0].factorOptions[0].interpretationReasons.join(" ")).toContain("bot carry + support");
    expect(topGank.reviewMoments[0].factorOptions.map((option) => option.label)).toContain("Lane gank/collapse");
  });

  it("separates facts, impact, review questions, and suppresses filler reasons", () => {
    const plan = buildMatchReviewPlan({
      activeGoalName: "Trading",
      matchSummary: { role: "ADC" },
      evaluationSummary: { deathCount: 2 },
      deterministicTagCounts: { death_count: 2 },
      deathEvents: [
        {
          deathIndex: 1,
          timestampSeconds: 300,
          nearbyEnemyCount: 2,
          nearbyAllyChampionNames: ["Lulu"],
          enemyRolesInvolved: ["bot", "support"],
          killerChampionName: "Jinx",
          objectiveName: "dragon",
          objectiveTakenSecondsAfterDeath: 38,
          shutdownGoldGiven: 300
        },
        {
          deathIndex: 2,
          timestampSeconds: 600,
          nearbyEnemyCount: 2,
          nearbyAllyChampionNames: ["Lulu"],
          enemyRolesInvolved: ["bot", "support"],
          killerChampionName: "Jinx"
        }
      ]
    });

    const first = plan.reviewMoments[0];
    const text = JSON.stringify(first);
    expect(text).not.toContain("lane matchup participants were involved in lane phase");
    expect(first.factorOptions[0].interpretationReasons.join(" ")).toContain("execution/trade timing");
    expect(first.consequenceFacts.join(" ")).toContain("enemy took dragon 38s after this death");
    expect(first.consequenceFacts.join(" ")).toContain("300g shutdown given");
    expect(plan.reviewMoments[1].consequenceFacts).toEqual([]);
  });

  it("shows assessment progress, checklist counts, and completion next action", async () => {
    const putBodies = [];
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url === "/api/session") {
        return mockJsonResponse({
          authEnabled: true,
          authenticated: true,
          user: { id: "usr_1" },
          accountUrl: "",
          portalBaseUrl: "",
          manualTokenEntryAvailable: false
        });
      }
      if (url === "/api/home") {
        return mockJsonResponse({
          home: {
            goalDashboard: {
              activePersonalGoal: {
                title: "Die Less",
                riotEvidence: {
                  initialAssessmentTarget: 3,
                  candidateGames: [
                    { matchId: "NA1_flow", evaluationSummary: { deathCount: 2 }, evaluationDeaths: [{ deathIndex: 1 }, { deathIndex: 2 }] },
                    { matchId: "NA1_next", evaluationSummary: { deathCount: 1 }, evaluationDeaths: [{ deathIndex: 1 }] },
                    { matchId: "NA1_third", evaluationSummary: { deathCount: 1 }, evaluationDeaths: [{ deathIndex: 1 }] }
                  ]
                }
              }
            }
          }
        });
      }
      if (url === "/api/matches/NA1_flow/evaluation") {
        return mockJsonResponse({
          matchId: "NA1_flow",
          activeGoalName: "Die Less",
          matchSummary: { championName: "Jhin", queueLabel: "Ranked Solo/Duo", result: "Loss", kills: 1, deaths: 2, assists: 1 },
          evaluationSummary: { deathCount: 2 },
          deathEvents: [
            { deathIndex: 1, timestampSeconds: 494, killerChampionName: "LeBlanc", tags: ["solo_death_candidate"] },
            { deathIndex: 2, timestampSeconds: 620, killerChampionName: "Jinx", tags: ["death_count"] }
          ],
          deterministicTagCounts: { death_count: 2, solo_death_candidate: 1 },
          reviewedMoments: []
        });
      }
      if (url === "/api/matches/NA1_flow/reviewed-moments" && options.method === "PUT") {
        const body = JSON.parse(options.body);
        putBodies.push(body);
        return mockJsonResponse({ reviewedMoment: body });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/review?matchId=NA1_flow");

    await renderApp(document.querySelector("#app"));
    expect(document.body.textContent).toContain("0 complete · 3 remaining");
    expect(document.body.textContent).toContain("Current game: Jhin loss");
    expect(document.body.textContent).not.toContain("Game 1 of 3");
    expect(document.body.textContent).toContain("0 Reviewed");
    expect(document.body.textContent).toContain("2 Not reviewed");
    expect(document.body.textContent).not.toContain("Game review complete");

    document.querySelectorAll("[data-death-review-item]")[0].querySelector('[data-review-moment-action="reviewed"]').click();
    await flushAsyncWork();
    expect(document.body.textContent).toContain("1 Reviewed");
    expect(document.body.textContent).toContain("1 Not reviewed");
    expect(document.querySelector("[data-death-review-item].is-reviewed")).toBeTruthy();

    document.querySelectorAll("[data-death-review-item]")[1].querySelector('[data-review-moment-action="skipped"]').click();
    await flushAsyncWork();
    expect(putBodies[1].status).toBe("unsure");
    expect(document.body.textContent).toContain("Game review complete");
    expect(document.body.textContent).toContain("1 reviewed · 1 needs manual review · 2 total");
    expect(document.querySelector('a[href="/review?matchId=NA1_next"]')?.textContent).toContain("Go to next assessment game");
  });

  it("does not mix candidate order with assessment progress on review pages", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/session") {
        return mockJsonResponse({
          authEnabled: true,
          authenticated: true,
          user: { id: "usr_1" },
          accountUrl: "",
          portalBaseUrl: "",
          manualTokenEntryAvailable: false
        });
      }
      if (url === "/api/home") {
        const candidateGames = [
          { matchId: "NA1_current", championName: "Jhin", result: "Loss", queueLabel: "Ranked Solo/Duo", kda: "1/2/1", evaluationSummary: { deathCount: 2 } },
          { matchId: "NA1_done_1", championName: "Ashe", result: "Win", queueLabel: "Ranked Solo/Duo", kda: "4/1/8", evaluationSummary: { deathCount: 1 }, reviewStatus: "triaged" },
          { matchId: "NA1_done_2", championName: "Caitlyn", result: "Loss", queueLabel: "Ranked Solo/Duo", kda: "2/4/5", evaluationSummary: { deathCount: 4 }, reviewStatus: "triaged" }
        ];
        return mockJsonResponse({
          home: {
            goalDashboard: {
              activePersonalGoal: {
                title: "Die Less",
                riotEvidence: {
                  initialAssessment: {
                    target: 3,
                    completedCount: 2,
                    completedMatchIds: ["NA1_done_1", "NA1_done_2"],
                    nextMatchId: "NA1_current",
                    assessmentComplete: false,
                    candidateGames
                  },
                  candidateGames
                }
              }
            }
          }
        });
      }
      if (url === "/api/matches/NA1_current/evaluation") {
        return mockJsonResponse({
          matchId: "NA1_current",
          activeGoalName: "Die Less",
          matchSummary: { championName: "Jhin", queueLabel: "Ranked Solo/Duo", result: "Loss", kills: 1, deaths: 2, assists: 1 },
          evaluationSummary: { deathCount: 2 },
          deathEvents: [
            { deathIndex: 1, timestampSeconds: 494, killerChampionName: "LeBlanc", tags: ["solo_death_candidate"] },
            { deathIndex: 2, timestampSeconds: 620, killerChampionName: "Jinx", tags: ["death_count"] }
          ],
          deterministicTagCounts: { death_count: 2 },
          reviewedMoments: []
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/review?matchId=NA1_current");

    await renderApp(document.querySelector("#app"));

    expect(document.body.textContent).toContain("2 complete · 1 remaining");
    expect(document.body.textContent).toContain("Current game: Jhin loss");
    expect(document.body.textContent).not.toContain("Game 1 of 3");
  });

  it("uses server assessment state so stale candidate objects do not loop next assessment game", async () => {
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url === "/api/session") {
        return mockJsonResponse({
          authEnabled: true,
          authenticated: true,
          user: { id: "usr_1" },
          accountUrl: "",
          portalBaseUrl: "",
          manualTokenEntryAvailable: false
        });
      }
      if (url === "/api/home") {
        return mockJsonResponse({
          home: {
            goalDashboard: {
              activePersonalGoal: {
                title: "Improve teamfight deaths",
                riotEvidence: {
                  initialAssessment: {
                    target: 3,
                    completedMatchIds: ["NA1_first"],
                    completedCount: 1,
                    nextMatchId: "NA1_second",
                    assessmentComplete: false,
                    candidateGames: [
                      { matchId: "NA1_first", evaluationSummary: { deathCount: 1 }, evaluationDeaths: [{ deathIndex: 1 }] },
                      { matchId: "NA1_second", evaluationSummary: { deathCount: 1 }, evaluationDeaths: [{ deathIndex: 1 }] },
                      { matchId: "NA1_third", evaluationSummary: { deathCount: 1 }, evaluationDeaths: [{ deathIndex: 1 }] }
                    ]
                  },
                  candidateGames: [
                    { matchId: "NA1_first", evaluationSummary: { deathCount: 1 }, evaluationDeaths: [{ deathIndex: 1 }], reviewedMoments: [] },
                    { matchId: "NA1_second", evaluationSummary: { deathCount: 1 }, evaluationDeaths: [{ deathIndex: 1 }] },
                    { matchId: "NA1_third", evaluationSummary: { deathCount: 1 }, evaluationDeaths: [{ deathIndex: 1 }] }
                  ]
                }
              }
            }
          }
        });
      }
      if (url === "/api/matches/NA1_second/evaluation") {
        return mockJsonResponse({
          matchId: "NA1_second",
          activeGoalName: "Improve teamfight deaths",
          matchSummary: { championName: "Jhin", queueLabel: "Ranked Solo/Duo", result: "Loss", kills: 1, deaths: 1, assists: 1 },
          evaluationSummary: { deathCount: 1 },
          deathEvents: [
            { deathIndex: 1, timestampSeconds: 494, killerChampionName: "LeBlanc", tags: ["solo_death_candidate"] }
          ],
          deterministicTagCounts: { death_count: 1, solo_death_candidate: 1 },
          reviewedMoments: []
        });
      }
      if (url === "/api/matches/NA1_second/reviewed-moments" && options.method === "PUT") {
        return mockJsonResponse({ reviewedMoment: JSON.parse(options.body) });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/review?matchId=NA1_second");

    await renderApp(document.querySelector("#app"));
    document.querySelector('[data-review-moment-action="reviewed"]').click();
    await flushAsyncWork();

    expect(document.body.textContent).toContain("Game review complete");
    expect(document.body.textContent).toContain("2 complete");
    expect(document.querySelector('a[href="/review?matchId=NA1_third"]')?.textContent).toContain("Go to next assessment game");
    expect(document.querySelector('a[href="/review?matchId=NA1_first"]')).toBeNull();
  });

  it("lets the user set and persist a main review focus", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/session") {
        return mockJsonResponse({
          authEnabled: true,
          authenticated: true,
          user: { id: "usr_1" },
          accountUrl: "",
          portalBaseUrl: "",
          manualTokenEntryAvailable: false
        });
      }
      if (url === "/api/home") {
        return mockJsonResponse({ home: { goalDashboard: { activePersonalGoal: { title: "Die Less", riotEvidence: { candidateGames: [] } } } } });
      }
      if (url === "/api/matches/NA1_focus/evaluation") {
        return mockJsonResponse({
          matchId: "NA1_focus",
          activeGoalName: "Die Less",
          matchSummary: { championName: "Jhin", queueLabel: "Ranked Solo/Duo", result: "Loss", role: "ADC" },
          evaluationSummary: { deathCount: 2 },
          deathEvents: [
            { deathIndex: 1, timestampSeconds: 300, nearbyEnemyCount: 2, nearbyAllyChampionNames: ["Lulu"], enemyRolesInvolved: ["bot", "support"], killerChampionName: "Jinx" },
            { deathIndex: 2, timestampSeconds: 620, killerChampionName: "LeBlanc", tags: ["solo_death_candidate"] }
          ],
          deterministicTagCounts: { death_count: 2, solo_death_candidate: 1 },
          reviewedMoments: []
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/review?matchId=NA1_focus");

    await renderApp(document.querySelector("#app"));
    document.querySelectorAll("[data-death-review-item]")[1].querySelector("[data-set-main-focus-death]").click();
    expect(document.querySelector("[data-main-review]")?.textContent).toContain("User-selected focus: Death 2");

    await renderApp(document.querySelector("#app"));
    expect(document.querySelector("[data-main-review]")?.textContent).toContain("User-selected focus: Death 2");

    document.querySelector("[data-set-main-focus-pattern]")?.click();
    expect(document.querySelector("[data-main-review]")?.textContent).toContain("User-selected focus:");
  });

  it("uses neutral review moment language for unknown or non-death goal types", () => {
    const unknownPlan = buildMatchReviewPlan({
      activeGoalName: "Improve map awareness",
      evaluationSummary: { deathCount: 1 },
      deterministicTagCounts: { death_count: 1, solo_death_candidate: 1 },
      deathEvents: [
        {
          deathIndex: 1,
          timestampSeconds: 120,
          tags: ["solo_death_candidate"]
        }
      ]
    });
    const farmPlan = buildMatchReviewPlan({
      activeGoalName: "Farm Better",
      evaluationSummary: { deathCount: 1 },
      deterministicTagCounts: { death_count: 1, solo_death_candidate: 1 },
      deathEvents: [
        {
          deathIndex: 1,
          timestampSeconds: 120,
          tags: ["solo_death_candidate"]
        }
      ]
    });

    expect(unknownPlan.reviewMoments[0].progressLabel).toBe("Moment 1 of 1");
    expect(unknownPlan.reviewMoments[0].headline).toBe("Review moment 1");
    expect(unknownPlan.reviewMoments[0].eventSummary).toContain("Observed window");
    expect(farmPlan.reviewMoments[0].progressLabel).toBe("Moment 1 of 1");
    expect(farmPlan.reviewMoments[0].headline).not.toContain("Death");
  });

  it("persists a confirmed reviewed signal from the review page", async () => {
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url === "/api/session") {
        return mockJsonResponse({
          authEnabled: true,
          authenticated: true,
          user: { id: "usr_1" },
          accountUrl: "",
          portalBaseUrl: "",
          manualTokenEntryAvailable: false
        });
      }

      if (url === "/api/matches/NA1_1/evaluation") {
        return mockJsonResponse({
          matchId: "NA1_1",
          activeGoalName: "Die Less",
          evaluationStatus: "current",
          evaluationVersion: "deterministic-v2",
          matchSummary: {
            championName: "Jhin",
            queueLabel: "Ranked Solo/Duo",
            result: "Loss",
            kills: 8,
            deaths: 5,
            assists: 6
          },
          evaluationSummary: {
            deathCount: 1,
            reviewSignals: ["1 death", "1 possible unsupported death"]
          },
          deathEvents: [
            {
              deathIndex: 1,
              timestampSeconds: 494,
              killerChampionName: "LeBlanc",
              tags: ["solo_death_candidate"]
            }
          ],
          deterministicTagCounts: {
            death_count: 1,
            solo_death_candidate: 1
          },
          reviewedMoments: []
        });
      }

      if (url === "/api/matches/NA1_1/reviewed-moments" && options.method === "PUT") {
        expect(JSON.parse(options.body)).toMatchObject({
          deathIndex: 1,
          deathTimestampSeconds: 494,
          signalId: "solo_death_candidate",
          selectedPatternId: "solo_death_candidate",
          status: "confirmed",
          causeCategory: "walked_without_cover"
        });
        return mockJsonResponse({
          reviewedMoment: {
            deathIndex: 1,
            signalId: "solo_death_candidate",
            selectedPatternId: "solo_death_candidate",
            status: "confirmed",
            causeCategory: "walked_without_cover"
          }
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/review?matchId=NA1_1");

    await renderApp(document.querySelector("#app"));
    document.querySelector('[data-review-moment-action="reviewed"]').click();
    await flushAsyncWork();

    expect(document.body.textContent).toContain("Review complete");
    expect(document.body.textContent).toContain("Next-game focus");
  });

  it("persists other pattern selection as confirmed manual classification", async () => {
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url === "/api/session") {
        return mockJsonResponse({
          authEnabled: true,
          authenticated: true,
          user: { id: "usr_1" },
          accountUrl: "",
          portalBaseUrl: "",
          manualTokenEntryAvailable: false
        });
      }

      if (url === "/api/matches/NA1_other/evaluation") {
        return mockJsonResponse({
          matchId: "NA1_other",
          activeGoalName: "Die Less",
          evaluationStatus: "current",
          evaluationVersion: "deterministic-v2",
          matchSummary: {
            championName: "Jhin",
            queueLabel: "Ranked Solo/Duo",
            result: "Loss",
            kills: 1,
            deaths: 1,
            assists: 1
          },
          evaluationSummary: { deathCount: 1 },
          deathEvents: [
            {
              deathIndex: 1,
              timestampSeconds: 494,
              killerChampionName: "LeBlanc",
              tags: ["solo_death_candidate"]
            }
          ],
          deterministicTagCounts: { death_count: 1, solo_death_candidate: 1 },
          reviewedMoments: []
        });
      }

      if (url === "/api/matches/NA1_other/reviewed-moments" && options.method === "PUT") {
        expect(JSON.parse(options.body)).toMatchObject({
          deathIndex: 1,
          signalId: "manual_other_pattern",
          selectedPatternId: "manual_other_pattern",
          status: "confirmed",
          causeCategory: "other"
        });
        return mockJsonResponse({
          reviewedMoment: {
            deathIndex: 1,
            signalId: "manual_other_pattern",
            selectedPatternId: "manual_other_pattern",
            status: "confirmed",
            causeCategory: "other"
          }
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/review?matchId=NA1_other");

    await renderApp(document.querySelector("#app"));
    document.querySelector('input[value="manual_other_pattern"]').click();
    document.querySelector('[data-review-moment-action="reviewed"]').click();
    await flushAsyncWork();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/matches/NA1_other/reviewed-moments",
      expect.objectContaining({ method: "PUT" })
    );
    expect(document.querySelector('input[value="manual_other_pattern"]')?.checked).toBe(true);
  });

  it("renders the read-only system inventory page", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/session") {
        return mockJsonResponse({
          authEnabled: true,
          authenticated: true,
          user: { id: "usr_1" },
          accountUrl: "",
          portalBaseUrl: "",
          manualTokenEntryAvailable: false
        });
      }
      if (url === "/api/system-inventory") {
        return mockJsonResponse({
          goalTypes: [{
            id: "death_review",
            title: "Death Review",
            evidenceCategories: ["death_review"],
            subscribedPatterns: ["bot_lane_2v1_punish"]
          }],
          deterministicEvidenceParsers: ["deterministic match evaluation"],
          systemEvidencePatterns: ["bot_lane_2v1_punish", "objective_window_candidate"],
          gamePhase: { note: "before 14:00 is lane phase" },
          mapTimers: {
            rules: {
              dragon: { firstSpawnSeconds: 300 },
              voidgrubs: { firstSpawnSeconds: 480 },
              riftHerald: { firstSpawnSeconds: 900 },
              baron: { firstSpawnSeconds: 1200 },
              scuttle: { firstSpawnSeconds: 175 },
              jungleCamps: { minorCampRespawnSeconds: 135, buffRespawnSeconds: 300 }
            }
          }
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/system-inventory");

    await renderApp(document.querySelector("#app"));

    expect(document.body.textContent).toContain("Known evidence patterns");
    expect(document.body.textContent).toContain("Death Review");
    expect(document.body.textContent).toContain("Bot lane 2v1 punish");
    expect(document.body.textContent).toContain("deterministic match evaluation");
    expect(document.body.textContent).toContain("Dragon first spawn: 300s");
    expect(document.body.textContent).toContain("Scuttle first spawn: 175s");
  });

  it("preserves a non-default selected pattern when marking reviewed or needs review", async () => {
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url === "/api/session") {
        return mockJsonResponse({
          authEnabled: true,
          authenticated: true,
          user: { id: "usr_1" },
          accountUrl: "",
          portalBaseUrl: "",
          manualTokenEntryAvailable: false
        });
      }

      if (url === "/api/matches/NA1_select/evaluation") {
        return mockJsonResponse({
          matchId: "NA1_select",
          activeGoalName: "Die Less",
          evaluationStatus: "current",
          matchSummary: { championName: "Jhin", queueLabel: "Ranked Solo/Duo", result: "Loss", role: "ADC" },
          evaluationSummary: { deathCount: 2 },
          deathEvents: [
            {
              deathIndex: 1,
              timestampSeconds: 494,
              nearbyEnemyCount: 2,
              killerChampionName: "LeBlanc",
              assistingChampionNames: ["Briar"],
              tags: ["solo_death_candidate"]
            },
            {
              deathIndex: 2,
              timestampSeconds: 600,
              nearbyEnemyCount: 2,
              killerChampionName: "LeBlanc",
              assistingChampionNames: ["Briar"],
              tags: ["solo_death_candidate"]
            }
          ],
          deterministicTagCounts: { death_count: 2, solo_death_candidate: 2 },
          reviewedMoments: []
        });
      }

      if (url === "/api/matches/NA1_select/reviewed-moments" && options.method === "PUT") {
        const body = JSON.parse(options.body);
        expect(body.selectedPatternId).toBe("solo_death_candidate");
        return mockJsonResponse({ reviewedMoment: body });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/review?matchId=NA1_select");

    await renderApp(document.querySelector("#app"));
    const firstCard = document.querySelectorAll("[data-death-review-item]")[0];
    firstCard.querySelector('input[value="solo_death_candidate"]').click();
    firstCard.querySelector('[data-review-moment-action="reviewed"]').click();
    await flushAsyncWork();

    expect(document.querySelector('input[name="review-factor-1"][value="solo_death_candidate"]')?.checked).toBe(true);
    expect(document.body.textContent).toContain("Reviewed");

    const secondCard = document.querySelectorAll("[data-death-review-item]")[1];
    secondCard.querySelector('input[value="solo_death_candidate"]').click();
    secondCard.querySelector('[data-review-moment-action="skipped"]').click();
    await flushAsyncWork();

    expect(document.querySelector('input[name="review-factor-2"][value="solo_death_candidate"]')?.checked).toBe(true);
    expect(document.body.textContent).toContain("Needs manual review");
  });

  it("reload preserves reviewed moment state on the review page", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/session") {
        return mockJsonResponse({
          authEnabled: true,
          authenticated: true,
          user: { id: "usr_1" },
          accountUrl: "",
          portalBaseUrl: "",
          manualTokenEntryAvailable: false
        });
      }

      if (url === "/api/matches/NA1_1/evaluation") {
        return mockJsonResponse({
          matchId: "NA1_1",
          activeGoalName: "Die Less",
          evaluationStatus: "current",
          evaluationVersion: "deterministic-v2",
          matchSummary: {
            championName: "Jhin",
            queueLabel: "Ranked Solo/Duo",
            result: "Loss",
            kills: 8,
            deaths: 5,
            assists: 6
          },
          evaluationSummary: {
            deathCount: 1,
            reviewSignals: ["1 death", "1 possible unsupported death"]
          },
          deathEvents: [
            {
              deathIndex: 1,
              timestampSeconds: 494,
              killerChampionName: "LeBlanc",
              tags: ["solo_death_candidate"]
            }
          ],
          deterministicTagCounts: {
            death_count: 1,
            solo_death_candidate: 1
          },
          reviewedMoments: [
            {
              deathIndex: 1,
              signalId: "solo_death_candidate",
              selectedPatternId: "manual_other_pattern",
              status: "dismissed"
            }
          ]
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/review?matchId=NA1_1");

    await renderApp(document.querySelector("#app"));

    expect(document.body.textContent).toContain("Review complete");
    expect(document.body.textContent).toContain("Needs manual review");
    expect(document.querySelector('input[value="manual_other_pattern"]')?.checked).toBe(true);
    expect(document.querySelector('[data-review-moment-action="skipped"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector('[data-review-moment-action="reviewed"]')?.getAttribute("aria-pressed")).toBe("false");
    expect(document.body.textContent).toContain("Detected signals: Walked forward without reliable cover");
    expect(document.body.textContent).not.toContain("Review status:");
  });

  it("renders a useful zero-death review priority", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/session") {
        return mockJsonResponse({
          authEnabled: true,
          authenticated: true,
          user: { id: "usr_1" },
          accountUrl: "",
          portalBaseUrl: "",
          manualTokenEntryAvailable: false
        });
      }

      if (url === "/api/matches/NA1_zero/evaluation") {
        return mockJsonResponse({
          matchId: "NA1_zero",
          evaluationStatus: "current",
          evaluationVersion: "deterministic-v2",
          matchSummary: {
            championName: "Ashe",
            queueLabel: "Ranked Solo/Duo",
            result: "Win",
            kills: 4,
            deaths: 0,
            assists: 11
          },
          evaluationSummary: {
            deathCount: 0,
            reviewSignals: ["0 deaths"]
          },
          deathEvents: [],
          deterministicTagCounts: {
            death_count: 0
          }
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/review?matchId=NA1_zero");

    await renderApp(document.querySelector("#app"));

    expect(document.body.textContent).toContain("Review");
    expect(document.body.textContent).toContain("No deaths detected");
    expect(document.body.textContent).toContain("This evaluated match has zero deterministic death events.");
    expect(document.body.textContent).toContain("No deterministic death facts are available for this match.");
  });

  it("renders a useful pending state for a missing evaluation", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/session") {
        return mockJsonResponse({
          authEnabled: true,
          authenticated: true,
          user: { id: "usr_1" },
          accountUrl: "",
          portalBaseUrl: "",
          manualTokenEntryAvailable: false
        });
      }

      if (url === "/api/matches/NA1_pending/evaluation") {
        return mockJsonResponse({
          matchId: "NA1_pending",
          evaluationStatus: "not_evaluated",
          evaluationVersion: "deterministic-v2",
          matchSummary: {
            championName: "Jhin",
            queueLabel: "Ranked Solo/Duo",
            result: "Loss",
            kills: 4,
            deaths: 3,
            assists: 5
          },
          evaluationSummary: null,
          deathEvents: [],
          deterministicTagCounts: null
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/review?matchId=NA1_pending");

    await renderApp(document.querySelector("#app"));

    expect(document.body.textContent).toContain("Review");
    expect(document.body.textContent).toContain("Evaluation pending");
    expect(document.body.textContent).toContain("No persisted deterministic evaluation exists yet for this match.");
    expect(document.body.textContent).toContain("Evaluation is not prepared for this match yet.");
  });
});
