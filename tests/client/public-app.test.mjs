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
    expect(document.body.textContent).toContain("1 evaluation preparing");
    expect(document.body.textContent).toContain("Today's Review Candidate");
    expect(document.body.textContent).toContain("Review this game");
    expect(document.body.textContent).toContain("Goal relevance: Die Less · ADC");
    expect(document.body.textContent).toContain("Jhin · Ranked Solo/Duo · Loss");
    expect(document.body.textContent).toContain("Review Signals · current");
    expect(document.body.textContent).toContain("5 deaths");
    expect(document.body.textContent).toContain("2 multi-enemy collapse candidates");
    expect(document.body.textContent).not.toContain("08:14");
    expect(document.body.textContent).not.toContain("killed by LeBlanc, assisted by Briar");
    expect(document.body.textContent).toContain("0 deaths");
    expect(document.body.textContent).toContain("Evaluation: none");
    expect(document.body.textContent).not.toContain("SECRET_TIMELINE_EVENT");
    expect(document.body.textContent).not.toContain("SECRET_MATCH_JSON");
    expect(document.querySelector('a[href="/review?matchId=NA1_1"]')?.textContent).toContain("Review");
  });

  it("renders a preparing review candidate state when no evaluated game exists", async () => {
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
                  preparingCount: 0,
                  discoveredCount: 10,
                  candidateGames: [
                    {
                      matchId: "NA1_pending",
                      championName: "Jhin",
                      queueLabel: "Ranked Solo/Duo",
                      result: "Loss",
                      kda: "4/3/5",
                      evaluationStatus: "not_evaluated",
                      evaluationSummary: null
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

    expect(document.body.textContent).toContain("Review candidate preparing");
    expect(document.body.textContent).toContain("1 match summary ready");
    expect(document.body.textContent).toContain("0 evaluations ready");
    expect(document.body.textContent).toContain("1 evaluation preparing");
    expect(document.body.textContent).toContain("Match summaries are ready. Evaluations are preparing.");
    expect(document.body.textContent).not.toContain("10 games ready");
    expect(document.body.textContent).not.toContain("Review this game");
    expect(document.querySelector('a[href="/review?matchId=NA1_pending"]')?.textContent).toContain("Open summary");
  });

  it("renders preparing match summary instead of fabricated candidate metadata", async () => {
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

    expect(document.body.textContent).toContain("Preparing match summary");
    expect(document.body.textContent).toContain("10 games discovered");
    expect(document.body.textContent).toContain("0 match summaries ready");
    expect(document.body.textContent).toContain("Match summaries preparing.");
    expect(document.body.textContent).not.toContain("Unknown queue");
    expect(document.body.textContent).not.toContain("Unknown result");
    expect(document.body.textContent).not.toContain("0/0/0");
    expect(document.body.textContent).not.toContain("10 games ready");
    expect(document.body.textContent).not.toContain("Review this game");
    expect(document.querySelector('a[href="/review?matchId=NA1_incomplete"]')).toBeNull();
    expect(document.body.textContent).toContain("Preparing");
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

    expect(document.body.textContent).toContain("Today's Review Candidate");
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
    expect(document.body.textContent).toContain("Review First");
    expect(document.body.textContent).toContain("Review first: Repeated multi-enemy deaths");
    expect(document.body.textContent).toContain("Deterministic evidence only.");
    expect(document.body.textContent).toContain("Inspect first: 08:14, 10:00");
    expect(document.body.textContent).toContain("Review Signals");
    expect(document.body.textContent).toContain("2 multi-enemy collapse candidates");
    expect(document.body.textContent).toContain("Deterministic Death Facts");
    expect(document.body.textContent).toContain("08:14");
    expect(document.body.textContent).toContain("killed by LeBlanc, assisted by Briar");
    expect(document.body.textContent).toContain("Tags: Multi Enemy Collapse Candidate");
    expect(document.body.textContent).toContain("victim level 8");
    expect(document.body.textContent).not.toContain("SECRET_TIMELINE_EVENT");
    expect(document.body.textContent).not.toContain("SECRET_MATCH_JSON");
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

    expect(document.body.textContent).toContain("Review First");
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

    expect(document.body.textContent).toContain("Review First");
    expect(document.body.textContent).toContain("Evaluation pending");
    expect(document.body.textContent).toContain("No persisted deterministic evaluation exists yet for this match.");
    expect(document.body.textContent).toContain("Evaluation is not prepared for this match yet.");
  });
});
