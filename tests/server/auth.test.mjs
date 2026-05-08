import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";

import { createRequireAuth } from "../../server/auth/middleware.js";
import { loadConfig } from "../../server/config.js";

function createResponse() {
  return {};
}

describe("auth middleware", () => {
  it("allows requests through when shared auth is disabled", async () => {
    const config = loadConfig({
      NEXUS_AUTH_ENABLED: "false"
    });
    const middleware = createRequireAuth(config);
    const request = {
      headers: {}
    };

    await new Promise((resolve, reject) => {
      middleware(request, createResponse(), (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    expect(request.auth).toBeUndefined();
  });

  it("attaches shared identity when a Nexus-style token is valid", async () => {
    const config = loadConfig({
      NEXUS_AUTH_ENABLED: "true",
      NEXUS_JWT_SECRET: "test-secret",
      NEXUS_AUTH_ISSUER: "nexus",
      NEXUS_AUTH_AUDIENCE: "riftsense"
    });
    const token = jwt.sign(
      { sub: "usr_123", iss: "nexus", aud: "riftsense" },
      "test-secret",
      { algorithm: "HS256", expiresIn: "1h" }
    );
    const middleware = createRequireAuth(config);
    const request = {
      headers: {
        authorization: `Bearer ${token}`
      }
    };

    await new Promise((resolve, reject) => {
      middleware(request, createResponse(), (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    expect(request.auth.subjectId).toBe("usr_123");
    expect(request.identity.id).toBe("usr_123");
  });

  it("passes Riot identity through when the token includes Riot claims", async () => {
    const config = loadConfig({
      NEXUS_AUTH_ENABLED: "true",
      NEXUS_JWT_SECRET: "test-secret",
      NEXUS_AUTH_ISSUER: "nexus",
      NEXUS_AUTH_AUDIENCE: "riftsense"
    });
    const token = jwt.sign(
      {
        sub: "usr_riot",
        iss: "nexus",
        aud: "riftsense",
        riot: {
          puuid: "puuid_123",
          gameName: "Summoner",
          tagLine: "NA1",
          platformRegion: "NA1",
          routingRegion: "americas"
        }
      },
      "test-secret",
      { algorithm: "HS256", expiresIn: "1h" }
    );
    const middleware = createRequireAuth(config);
    const request = {
      headers: {
        authorization: `Bearer ${token}`
      }
    };

    await new Promise((resolve, reject) => {
      middleware(request, createResponse(), (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    expect(request.identity.riot).toMatchObject({
      puuid: "puuid_123",
      gameName: "Summoner",
      tagLine: "NA1"
    });
  });

  it("accepts a Nexus token from the shared cookie handoff", async () => {
    const config = loadConfig({
      NEXUS_AUTH_ENABLED: "true",
      NEXUS_JWT_SECRET: "test-secret",
      NEXUS_AUTH_ISSUER: "nexus",
      NEXUS_AUTH_AUDIENCE: "riftsense"
    });
    const token = jwt.sign(
      { sub: "usr_cookie", iss: "nexus", aud: "riftsense" },
      "test-secret",
      { algorithm: "HS256", expiresIn: "1h" }
    );
    const middleware = createRequireAuth(config);
    const request = {
      headers: {
        cookie: `nexus_access_token=${encodeURIComponent(token)}`
      }
    };

    await new Promise((resolve, reject) => {
      middleware(request, createResponse(), (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    expect(request.auth.subjectId).toBe("usr_cookie");
    expect(request.identity.id).toBe("usr_cookie");
  });

  it("accepts a RiftSense-owned auth cookie after hosted exchange", async () => {
    const config = loadConfig({
      NEXUS_AUTH_ENABLED: "true",
      NEXUS_JWT_SECRET: "test-secret",
      NEXUS_AUTH_ISSUER: "nexus",
      NEXUS_AUTH_AUDIENCE: "riftsense",
      RIFTSENSE_SESSION_COOKIE_NAME: "riftsense_access_token"
    });
    const token = jwt.sign(
      { sub: "usr_app_cookie", iss: "nexus", aud: "riftsense" },
      "test-secret",
      { algorithm: "HS256", expiresIn: "1h" }
    );
    const middleware = createRequireAuth(config);
    const request = {
      headers: {
        cookie: `riftsense_access_token=${encodeURIComponent(token)}`
      }
    };

    await new Promise((resolve, reject) => {
      middleware(request, createResponse(), (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    expect(request.auth.subjectId).toBe("usr_app_cookie");
    expect(request.identity.id).toBe("usr_app_cookie");
  });
});
