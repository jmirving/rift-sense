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
});
