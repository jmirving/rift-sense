// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderApp } from "../../public/app/app.js";

function mockJsonResponse(body) {
  return {
    ok: true,
    status: 200,
    async json() {
      return body;
    }
  };
}

describe("public app routes", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    window.localStorage.clear();
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {}
    }));
    vi.restoreAllMocks();
  });

  it("renders the public landing state on the unauthenticated root route", async () => {
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

      if (url === "/api/home") {
        return mockJsonResponse({
          home: {
            user: {
              id: null,
              source: "public",
              profile: {}
            },
            publicEntry: {
              title: "RiftSense",
              summary: "Review goals, recent games, and team focus from a Nexus-authenticated League workflow.",
              signInHref: "/#session-login-form",
              signInLabel: "Continue with Nexus",
              aboutHref: "/about",
              demoHref: "/demo"
            },
            goalDashboard: null
          }
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/");

    await renderApp(document.querySelector("#app"));

    expect(document.body.textContent).toContain("Continue with Nexus");
    expect(document.body.textContent).toContain("Turn recent games into goal-linked review work");
    expect(document.querySelector('a[href="/about"]')).not.toBeNull();
    expect(document.querySelector('a[href="/demo"]')).not.toBeNull();
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

      if (url === "/api/home") {
        return mockJsonResponse({
          home: {
            user: {
              id: null,
              source: "public",
              profile: {}
            },
            publicEntry: {
              title: "RiftSense",
              summary: "",
              signInHref: "/#session-login-form",
              signInLabel: "Continue with Nexus",
              aboutHref: "/about",
              demoHref: "/demo"
            },
            goalDashboard: null
          }
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

      if (url === "/api/home") {
        return mockJsonResponse({
          home: {
            user: {
              id: null,
              source: "public",
              profile: {}
            },
            publicEntry: {
              title: "RiftSense",
              summary: "",
              signInHref: "/#session-login-form",
              signInLabel: "Continue with Nexus",
              aboutHref: "/about",
              demoHref: "/demo"
            },
            goalDashboard: null
          }
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
                  candidateGames: [
                    {
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

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/");

    await renderApp(document.querySelector("#app"));

    expect(document.body.textContent).toContain("1 game ready");
    expect(document.body.textContent).toContain("2 games still being prepared");
    expect(document.body.textContent).toContain("Jhin · Ranked Solo/Duo · Loss");
    expect(document.body.textContent).toContain("Review Signals · current");
    expect(document.body.textContent).toContain("5 deaths");
    expect(document.body.textContent).toContain("2 multi-enemy collapse candidates");
    expect(document.body.textContent).toContain("08:14");
    expect(document.body.textContent).toContain("killed by LeBlanc, assisted by Briar");
    expect(document.body.textContent).toContain("Tags: Multi Enemy Collapse Candidate");
    expect(document.body.textContent).toContain("0 deaths");
    expect(document.body.textContent).toContain("No deaths recorded for this evaluation.");
    expect(document.body.textContent).toContain("Evaluation: none");
    expect(document.body.textContent).not.toContain("SECRET_TIMELINE_EVENT");
    expect(document.querySelector('a[href="/review"]')?.textContent).toContain("Review");
  });
});
