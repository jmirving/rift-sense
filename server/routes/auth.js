import express from "express";

import { clearCookie, serializeCookie } from "../auth/cookies.js";
import { redeemLaunchGrant as defaultRedeemLaunchGrant } from "../auth/exchange.js";
import { verifyAccessToken } from "../auth/tokens.js";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function logAuthEvent(details) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      service: "riftsense",
      route: "auth-callback",
      ...details
    })
  );
}

function sanitizeReturnTo(value) {
  if (typeof value !== "string") {
    return "/";
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return "/";
  }

  return trimmed;
}

function buildSessionCookie(token, payload, config) {
  const expiresAt = typeof payload?.exp === "number" ? payload.exp * 1000 : null;
  const maxAge = expiresAt ? Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)) : null;

  return serializeCookie(config.auth.sessionCookieName, token, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: config.nodeEnv === "production",
    maxAge: Number.isInteger(maxAge) ? maxAge : undefined
  });
}

function clearSessionCookie(config) {
  return clearCookie(config.auth.sessionCookieName, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: config.nodeEnv === "production"
  });
}

function renderHtmlPage({ title, heading, body, tone = "normal", portalBaseUrl }) {
  const headingClass = tone === "error" ? "tone-error" : "tone-ok";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4efe7;
        --panel: #fffaf2;
        --ink: #1b1a17;
        --muted: #5d5a55;
        --accent: #0d6b53;
        --error: #a3311e;
        --border: #d8cfbf;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        background:
          radial-gradient(circle at top left, rgba(13, 107, 83, 0.09), transparent 35%),
          linear-gradient(180deg, #f7f2ea 0%, var(--bg) 100%);
        color: var(--ink);
      }
      main {
        max-width: 760px;
        margin: 0 auto;
        min-height: 100vh;
        padding: 48px 20px 64px;
      }
      .panel {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 28px;
        box-shadow: 0 20px 60px rgba(27, 26, 23, 0.08);
      }
      .eyebrow {
        margin: 0 0 8px;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 12px;
      }
      h1 {
        margin: 0 0 12px;
        font-size: 36px;
        line-height: 1.05;
      }
      p {
        margin: 0 0 14px;
        line-height: 1.55;
      }
      .tone-ok { color: var(--accent); }
      .tone-error { color: var(--error); }
      .actions {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        margin-top: 18px;
      }
      a {
        color: var(--accent);
      }
      .button {
        display: inline-block;
        padding: 10px 16px;
        border-radius: 999px;
        text-decoration: none;
        background: var(--ink);
        color: #fff;
      }
      .button.secondary {
        background: transparent;
        color: var(--ink);
        border: 1px solid var(--border);
      }
    </style>
  </head>
  <body>
    <main>
      <section class="panel">
        <p class="eyebrow">RiftSense Hosted Auth</p>
        <h1 class="${headingClass}">${escapeHtml(heading)}</h1>
        <p>${escapeHtml(body)}</p>
        <div class="actions">
          <a class="button" href="/">Open RiftSense</a>
          <a class="button secondary" href="${escapeHtml(portalBaseUrl)}">Return to Nexus</a>
        </div>
      </section>
    </main>
  </body>
</html>`;
}

export function createAuthRouter({
  config,
  redeemLaunchGrant = defaultRedeemLaunchGrant
}) {
  const router = express.Router();

  router.get("/nexus/callback", async (request, response) => {
    const grantId = typeof request.query.grant === "string" ? request.query.grant.trim() : "";

    if (!grantId) {
      response.status(400).send(
        renderHtmlPage({
          title: "RiftSense Auth Failed",
          heading: "Hosted auth failed",
          body: "The callback is missing a launch grant.",
          tone: "error",
          portalBaseUrl: config.auth.portalBaseUrl
        })
      );
      logAuthEvent({
        outcome: "missing-grant"
      });
      return;
    }

    if (!config.auth.enabled || !config.auth.jwtSecret || !config.auth.exchangeUrl || !config.auth.exchangeSecret) {
      response.status(503).send(
        renderHtmlPage({
          title: "RiftSense Auth Failed",
          heading: "Hosted auth is unavailable",
          body: "RiftSense hosted auth is not fully configured.",
          tone: "error",
          portalBaseUrl: config.auth.portalBaseUrl
        })
      );
      logAuthEvent({
        outcome: "misconfigured",
        grantId
      });
      return;
    }

    logAuthEvent({
      outcome: "callback-received",
      grantId
    });

    try {
      const exchange = await redeemLaunchGrant({
        config,
        grantId
      });

      if (!exchange.ok) {
        const message =
          typeof exchange.payload?.message === "string"
            ? exchange.payload.message
            : "The Nexus exchange failed.";

        response.status(exchange.status).send(
          renderHtmlPage({
            title: "RiftSense Auth Failed",
            heading: "Hosted auth failed",
            body: message,
            tone: "error",
            portalBaseUrl: config.auth.portalBaseUrl
          })
        );
        logAuthEvent({
          outcome: "exchange-failed",
          grantId,
          statusCode: exchange.status
        });
        return;
      }

      const accessToken = exchange.payload?.accessToken;
      if (typeof accessToken !== "string" || !accessToken.trim()) {
        throw new Error("Exchange response did not include an access token.");
      }

      const payload = verifyAccessToken(accessToken, config);
      if (typeof exchange.payload?.user?.userId === "string" && exchange.payload.user.userId !== payload.sub) {
        throw new Error("Exchange user payload did not match token subject.");
      }

      const returnTo = sanitizeReturnTo(
        typeof exchange.payload?.returnTo === "string"
          ? exchange.payload.returnTo
          : typeof request.query.returnTo === "string"
            ? request.query.returnTo
            : "/"
      );

      response.setHeader("Set-Cookie", buildSessionCookie(accessToken, payload, config));
      response.redirect(303, returnTo);
      logAuthEvent({
        outcome: "authenticated",
        grantId,
        userId: payload.sub
      });
    } catch (error) {
      response.status(503).send(
        renderHtmlPage({
          title: "RiftSense Auth Failed",
          heading: "Hosted auth failed",
          body: error.message || "The hosted auth exchange is unavailable right now.",
          tone: "error",
          portalBaseUrl: config.auth.portalBaseUrl
        })
      );
      logAuthEvent({
        outcome: "exchange-error",
        grantId,
        error: error.message
      });
    }
  });

  router.post("/logout", (_request, response) => {
    response.setHeader("Set-Cookie", clearSessionCookie(config));
    response.redirect(303, "/");
  });

  return router;
}
