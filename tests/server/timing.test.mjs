import { afterEach, describe, expect, it, vi } from "vitest";

import { createTimingContext } from "../../server/observability/timing.js";

describe("performance timing helper", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not log when disabled", async () => {
    const logger = vi.fn();
    const timing = createTimingContext({
      route: "home",
      request: {
        headers: { "x-request-id": "req_1" },
        identity: { id: "usr_1" }
      },
      logger
    });

    const result = await timing.time("resolve_shared_profile", async () => "ok");
    timing.log("route", "success", { durationMs: 1 });

    expect(result).toBe("ok");
    expect(logger).not.toHaveBeenCalled();
  });

  it("logs the expected shape when enabled", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const timing = createTimingContext({
      route: "home",
      request: {
        headers: { "x-request-id": "req_1" },
        identity: { id: "usr_1" }
      },
      enabled: true
    });

    await timing.time("resolve_shared_profile", async () => "ok", { source: "cookie" });

    expect(info).toHaveBeenCalledTimes(1);
    expect(JSON.parse(info.mock.calls[0][0])).toEqual(expect.objectContaining({
      event: "perf_timing",
      route: "home",
      step: "resolve_shared_profile",
      outcome: "success",
      requestId: "req_1",
      userId: "usr_1",
      source: "cookie",
      durationMs: expect.any(Number)
    }));
  });
});
