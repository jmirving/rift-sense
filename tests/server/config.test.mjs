import { describe, expect, it } from "vitest";

import { loadConfig } from "../../server/config.js";
import { startServer } from "../../server/index.js";

describe("RiftSense database config", () => {
  it("fails fast when DATABASE_URL is missing", () => {
    expect(() => loadConfig({ NODE_ENV: "test" })).toThrow("DATABASE_URL is required");
  });

  it("startup refuses to run when DATABASE_URL is missing", async () => {
    await expect(startServer({ NODE_ENV: "test", PORT: "0" })).rejects.toThrow("DATABASE_URL is required");
  });

  it("disables perf logging by default", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      DATABASE_URL: "postgres://test:test@localhost:5432/riftsense_test"
    });

    expect(config.perfLoggingEnabled).toBe(false);
  });

  it("enables perf logging from RIFTSENSE_PERF_LOGGING", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      DATABASE_URL: "postgres://test:test@localhost:5432/riftsense_test",
      RIFTSENSE_PERF_LOGGING: "true"
    });

    expect(config.perfLoggingEnabled).toBe(true);
  });
});
