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
});
