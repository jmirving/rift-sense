// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildMatchReviewPlan, renderApp } from "../../public/app/app.js";

function mockJsonResponse(body) {
  return {
    ok: true,
    status: 200,
    async json() {
      return body;
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

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/");

    await renderApp(document.querySelector("#app"));

    expect(document.body.textContent).toContain("5 games discovered");
    expect(document.body.textContent).toContain("3 match summaries ready");
    expect(document.body.textContent).toContain("2 evaluations ready");
    expect(document.body.textContent).toContain("1 evaluation pending");
    expect(document.body.textContent).toContain("Next Review");
    expect(document.body.textContent).toContain("Review this game");
    expect(document.body.textContent).toContain("Refresh recent games");
    expect(document.body.textContent).toContain("No reviewed games yet");
    expect(document.body.textContent).toContain("Review a game to establish weekly targets.");
    expect(document.body.textContent).toContain("Insights will appear after you review games.");
    expect(document.body.textContent).toContain("Seeded from onboarding. Not updated from reviewed games yet.");
    expect(document.body.textContent).not.toContain("On track");
    expect(document.body.textContent).toContain("Active goal: Die Less · ADC");
    expect(document.body.textContent).toContain("Jhin · Ranked Solo/Duo · Loss");
    expect(document.body.textContent).toContain("5 review moments ready");
    expect(document.body.textContent).not.toContain("candidate");
    expect(document.body.textContent).not.toContain("raw signal counts");
    expect(document.body.textContent).not.toContain("08:14");
    expect(document.body.textContent).not.toContain("killed by LeBlanc, assisted by Briar");
    expect(document.body.textContent).toContain("Summary ready");
    expect(document.body.textContent).toContain("Review preparation: none");
    expect(document.body.textContent).not.toContain("SECRET_TIMELINE_EVENT");
    expect(document.body.textContent).not.toContain("SECRET_MATCH_JSON");
    expect(document.querySelector('a[href="/review?matchId=NA1_1"]')?.textContent).toContain("Review");
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

    expect(document.body.textContent).toContain("Preparing review");
    expect(document.body.textContent).toContain("1 match summary ready");
    expect(document.body.textContent).toContain("0 evaluations ready");
    expect(document.body.textContent).toContain("1 evaluation pending");
    expect(document.body.textContent).toContain("Match summaries are ready. Evaluations are pending.");
    expect(document.body.textContent).not.toContain("10 games ready");
    expect(document.body.textContent).not.toContain("Review this game");
    expect(document.querySelector('a[href="/review?matchId=NA1_pending"]')?.textContent).toContain("Open summary");

    await flushAsyncWork();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/matches/recent/evaluations?limit=3",
      expect.objectContaining({ credentials: "same-origin" })
    );
    expect(homeRequests).toBe(2);
    expect(document.body.textContent).toContain("1 evaluation ready");
    expect(document.body.textContent).toContain("0 evaluations pending");
    expect(document.body.textContent).toContain("Review this game");
    expect(document.body.textContent).toContain("3 review moments ready");
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

    expect(document.body.textContent).toContain("Jhin · Preparing");
    expect(document.body.textContent).toContain("10 games discovered");
    expect(document.body.textContent).toContain("0 match summaries ready");
    expect(document.body.textContent).toContain("10 match summaries preparing");
    expect(document.body.textContent).toContain("Match summaries are being prepared.");
    expect(document.body.textContent).not.toContain("Unknown queue");
    expect(document.body.textContent).not.toContain("Unknown result");
    expect(document.body.textContent).not.toContain("0/0/0");
    expect(document.body.textContent).not.toContain("10 games ready");
    expect(document.body.textContent).not.toContain("Review this game");
    expect(document.querySelector('a[href="/review?matchId=NA1_incomplete"]')).toBeNull();
    expect(document.body.textContent).toContain("Preparing");
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

    expect(document.body.textContent).toContain("Next Review");
    expect(document.body.textContent).not.toContain("Selected for evaluation ready");
    expect(document.querySelector('a[href="/review?matchId=NA1_review_candidate"]')?.textContent).toContain("Review this game");
    expect(document.body.textContent).toContain("Recent Games");
    expect(document.body.textContent).toContain("Kai'Sa · Preparing");
    expect(document.body.textContent).toContain("Caitlyn · Ranked Solo/Duo · Loss");
    expect(document.querySelector('a[href="/review?matchId=NA1_new_partial"]')).toBeNull();
  });

  it("renders failed recent-game preparation counts", async () => {
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
    expect(document.body.textContent).toContain("1 game discovered");
    expect(document.body.textContent).toContain("0 match summaries ready");
    expect(document.body.textContent).toContain("1 preparation failed");
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

    expect(document.body.textContent).toContain("Next Review");
    expect(document.querySelector('a[href="/demo/review?matchId=NA1_demo"]')?.textContent).toContain("Review");
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

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/review");

    await renderApp(document.querySelector("#app"));

    expect(document.body.textContent).toContain("Choose a recent game from the dashboard to review.");
    expect(document.querySelector('.button[href="/"]')?.textContent).toContain("Open dashboard");
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
    expect(document.body.textContent).toContain("Death 1 of 2");
    expect(document.body.textContent).toContain("Death at 08:14");
    expect(document.body.textContent).toContain("Why this was selected");
    expect(document.body.textContent).toContain("Evidence");
    expect(document.body.textContent).toContain("Likely contributing factors");
    expect(document.body.textContent).toContain("Walked forward with missing enemies");
    expect(document.querySelectorAll("[data-review-moment-card]")).toHaveLength(1);
    expect(document.querySelectorAll("[data-review-moment-card] .review-factor-option")).toHaveLength(1);
    expect(document.querySelector(".review-moment-body")).toBeTruthy();
    expect(document.querySelector(".review-factor-grid")).toBeTruthy();
    expect(document.querySelector(".review-factor-option input")?.type).toBe("checkbox");
    expect(document.querySelector(".debug-evidence")?.hasAttribute("open")).toBe(false);
    expect(document.body.textContent).not.toContain("Detected Signals");
    expect(document.body.textContent).not.toContain("Observed pattern");
    expect(document.body.textContent).not.toContain("candidate");
    expect(document.body.textContent).not.toContain("raw signal counts");
    expect(document.body.textContent).toContain("Debug evidence");
    expect(document.body.textContent).toContain("08:14");
    expect(document.body.textContent).toContain("Killed by LeBlanc, assisted by Briar");
    expect(document.body.textContent).toContain("Detected signals: Walked forward with missing enemies");
    expect(document.body.textContent).toContain("Victim level 8");
    expect(document.body.textContent).not.toContain("Raw deterministic facts");
    expect(document.body.textContent).not.toContain("Raw signal counts");
    expect(document.body.textContent).not.toContain("SECRET_TIMELINE_EVENT");
    expect(document.body.textContent).not.toContain("SECRET_MATCH_JSON");
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
          nearbyEnemyCount: 3
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
    expect(byDeath.get(1).reviewQuestion).toBe("Were you early, grouped, or late to the objective setup?");
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

    expect(plan.reviewMoments[0].factorOptions).toEqual([
      { id: "no_clear_deterministic_cause", label: "No clear deterministic cause" }
    ]);
    expect(plan.reviewMoments[0].factorOptions.map((option) => option.label).join(" ")).not.toContain("Observed pattern");
    expect(plan.reviewMoments[0].factorOptions.map((option) => option.label).join(" ")).not.toContain("candidate");
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
          status: "confirmed"
        });
        return mockJsonResponse({
          reviewedMoment: {
            deathIndex: 1,
            signalId: "solo_death_candidate",
            status: "confirmed"
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
