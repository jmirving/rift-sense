function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeCssIdentifier(value) {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(String(value ?? ""))
    : String(value ?? "").replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

const state = {
  session: null,
  recentEvaluationPreparationKeys: new Set(),
  recentGamesRefreshMessage: "",
  reviewMomentCursorByMatch: new Map()
};

const RECENT_EVALUATION_PREPARATION_LIMIT = 3;
const INITIAL_ASSESSMENT_TARGET = 3;

function elapsedMs(startedAt) {
  return Math.round((performance.now() - startedAt) * 100) / 100;
}

function clientPerfLoggingEnabled() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("perf") === "1") {
    window.localStorage.setItem("riftsense.perfLogging", "true");
    return true;
  }

  return window.localStorage.getItem("riftsense.perfLogging") === "true";
}

function logClientTiming(step, metadata = {}) {
  if (!clientPerfLoggingEnabled()) {
    return;
  }

  console.info("[RiftSense perf]", {
    event: "perf_timing",
    route: window.location.pathname,
    step,
    ...metadata
  });
}

function isDemoPath(pathname) {
  return pathname === "/demo" || pathname.startsWith("/demo/");
}

function getRouteContext() {
  const pathname = window.location.pathname;
  const demoMode = isDemoPath(pathname);
  let homeApiUrl = "/api/home";

  if (pathname === "/demo/adc") {
    homeApiUrl = "/api/demo/home/adc";
  } else if (pathname === "/demo/no-riot-linked") {
    homeApiUrl = "/api/demo/home/no-riot-linked";
  } else if (demoMode) {
    homeApiUrl = "/api/demo/home";
  }

  return {
    pathname,
    demoMode,
    homeApiUrl,
    requestOptions: demoMode
      ? {
          skipStoredToken: true
        }
      : undefined
  };
}

function isPublicPath(pathname) {
  return pathname === "/about" || pathname === "/login";
}

function toAppHref(href, context = getRouteContext()) {
  if (!href) {
    return null;
  }

  if (!context.demoMode) {
    return href;
  }

  if (!href.startsWith("/")) {
    return href;
  }

  const [pathname, query = ""] = href.split("?");
  const suffix = query ? `?${query}` : "";

  if (pathname === "/") {
    return `/demo${suffix}`;
  }
  if (pathname === "/goals") {
    return `/demo/setup${suffix}`;
  }
  if (pathname === "/setup") {
    return `/demo/setup${suffix}`;
  }
  if (pathname === "/review") {
    return `/demo/review${suffix}`;
  }
  if (pathname === "/onboarding") {
    return `/demo/setup${suffix}`;
  }
  if (pathname === "/training" || pathname === "/drills" || pathname === "/test") return null;
  if (pathname === "/team" || pathname === "/team-focus") return null;
  if (pathname === "/library") return null;
  if (pathname === "/focus/today" || pathname === "/focus/week" || pathname === "/focus/month") {
    return `/demo/setup${suffix}`;
  }

  return null;
}

function readStoredAuthToken() {
  return window.localStorage.getItem("riftsense.authToken");
}

function getSessionState() {
  if (state.session && typeof state.session === "object") {
    return state.session;
  }

  return {
    authEnabled: false,
    authenticated: false,
    user: null,
    accountUrl: "",
    portalBaseUrl: "",
    manualTokenEntryAvailable: false,
    unavailable: false,
    error: ""
  };
}

async function requestJson(url, options) {
  const startedAt = performance.now();
  let outcome = "success";
  const headers = new Headers(options?.headers ?? {});
  const authToken = readStoredAuthToken();
  if (!options?.skipStoredToken && authToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  try {
    const response = await fetch(url, {
      ...options,
      credentials: "same-origin",
      headers
    });
    const body = response.status === 204 ? null : await response.json();

    if (!response.ok) {
      outcome = "failure";
      throw new Error(body?.error?.message ?? "Request failed.");
    }

    return body;
  } catch (error) {
    outcome = "failure";
    throw error;
  } finally {
    logClientTiming("client_request", {
      url: String(url),
      durationMs: elapsedMs(startedAt),
      outcome
    });
  }
}

async function loadSession() {
  if (getRouteContext().demoMode) {
    state.session = {
      authEnabled: false,
      authenticated: false,
      user: null,
      accountUrl: "",
      portalBaseUrl: "",
      manualTokenEntryAvailable: false,
      unavailable: false,
      error: "",
      demoMode: true
    };
    return;
  }

  try {
    state.session = await requestJson("/api/session", {
      headers: {
        Accept: "application/json"
      }
    });
  } catch (error) {
    state.session = {
      authEnabled: false,
      authenticated: false,
      user: null,
      accountUrl: "",
      portalBaseUrl: "",
      manualTokenEntryAvailable: false,
      unavailable: true,
      error: error instanceof Error ? error.message : "Session is unavailable right now."
    };
  }
}

function renderDeveloperTokenTools(session) {
  if (!session.manualTokenEntryAvailable) {
    return "";
  }

  return `
    <details class="session-dev-tools">
      <summary>Developer token</summary>
      <form id="session-token-form" class="session-form">
        <label>
          Bearer Token
          <textarea name="authToken" rows="3" placeholder="Optional local fallback token">${escapeHtml(readStoredAuthToken() ?? "")}</textarea>
        </label>
        <div class="action-row">
          <button class="button secondary" type="submit">Save Token</button>
          <button class="button secondary" type="button" id="session-clear-button">Clear Token</button>
        </div>
      </form>
    </details>
  `;
}

function renderSessionPanel() {
  const session = getSessionState();
  const accountLink = session.accountUrl
    ? `<a class="session-footer-link" href="${escapeHtml(session.accountUrl)}">Open Nexus</a>`
    : "";

  if (session.demoMode) {
    return `
      <section class="session-panel">
        <div class="panel panel-slim">
          <p class="eyebrow">Public Demo</p>
          <h2>Seeded dashboard</h2>
          <p class="muted">This route always shows demo data and never loads an authenticated player's home.</p>
        </div>
      </section>
    `;
  }

  if (!session.authEnabled) {
    return `
      <section class="session-panel">
        <div class="panel panel-slim">
          <p class="eyebrow">Access</p>
          <h2>Demo mode</h2>
          <p class="muted">Shared sign-in is off in this environment.</p>
        </div>
      </section>
    `;
  }

  if (session.authenticated) {
    const displayName = session.user?.displayName?.trim() || "Signed in";
    const email = session.user?.email?.trim() || "";

    return `
      <section class="session-panel">
        <div class="session-card session-footer">
          <p class="eyebrow">Signed in</p>
          <p class="session-footer-name" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</p>
          ${email ? `<p class="session-footer-email" title="${escapeHtml(email)}">${escapeHtml(email)}</p>` : ""}
          <div class="session-footer-actions">
            <button class="session-footer-button" type="button" id="session-logout-button">Sign out</button>
            ${accountLink}
          </div>
          ${renderDeveloperTokenTools(session)}
        </div>
      </section>
    `;
  }

  const intro = session.unavailable
    ? session.error || "Session is unavailable right now."
    : "Use your Nexus account to sign in.";

  return `
    <section class="session-panel">
      <div class="panel panel-slim session-card">
        <p class="eyebrow">Sign In</p>
        <h2>Continue in RiftSense</h2>
        <p class="muted">${escapeHtml(intro)}</p>
        <div class="action-row">
          <a class="button" href="/login">Continue with Nexus</a>
          ${accountLink}
        </div>
        ${renderDeveloperTokenTools(session)}
      </div>
    </section>
  `;
}

function renderLoginForm(session, { fullWidth = false } = {}) {
  const submitLabel = fullWidth ? "Sign in to RiftSense" : "Sign In";

  return `
    <form id="session-login-form" class="session-form${fullWidth ? " auth-form" : ""}">
      <label>
        NEXUS EMAIL
        <input type="email" name="email" autocomplete="email" required />
      </label>
      <label>
        NEXUS PASSWORD
        <input type="password" name="password" autocomplete="current-password" required />
      </label>
      <button class="button${fullWidth ? " auth-submit" : ""}" type="submit" data-submit-label="${escapeHtml(submitLabel)}">${escapeHtml(submitLabel)}</button>
      <p class="muted session-status" id="session-login-status" aria-live="polite">${session.unavailable ? escapeHtml(session.error || "Session is unavailable right now.") : ""}</p>
    </form>
  `;
}

function authShell(session) {
  const accountHref = session.accountUrl || session.portalBaseUrl || "/about";

  return `
    <main class="auth-page-shell">
      <section class="auth-card" aria-label="RiftSense sign in">
        <section class="auth-info-panel">
          <div class="brand-lockup">
            <img class="brand-mark" src="/riftsense.png" alt="RiftSense" />
            <div class="brand-copy">
              <p class="eyebrow">RIFTSENSE</p>
              <a class="wordmark" href="/">RiftSense</a>
            </div>
          </div>
          <div class="auth-info-copy">
            <p class="eyebrow">RIFTSENSE</p>
            <h1>Sign in to review.</h1>
            <p class="muted">Use your Nexus account to open recent games, active goals, and review work.</p>
          </div>
          <dl class="auth-context-list">
            <div>
              <dt>Account</dt>
              <dd>Nexus</dd>
            </div>
            <div>
              <dt>Session</dt>
              <dd>RiftSense</dd>
            </div>
            <div>
              <dt>Profile</dt>
              <dd>Shared Nexus profile</dd>
            </div>
          </dl>
        </section>
        <section class="auth-signin-panel">
          <p class="eyebrow">SIGN IN</p>
          <h2>RiftSense</h2>
          <p class="muted">Continue with your Nexus credentials.</p>
          ${renderLoginForm(session, { fullWidth: true })}
          <div class="auth-help-links">
            <a href="${escapeHtml(accountHref)}">Need account help? Open Nexus account access</a>
            <a href="/about">New here? What is RiftSense?</a>
            <a href="/demo">Want the guided path first? Open demo flow</a>
          </div>
          ${renderDeveloperTokenTools(session)}
        </section>
      </section>
    </main>
  `;
}

function renderLoginPage(root) {
  root.innerHTML = authShell(getSessionState());
}

function appShell(content, hero = {}) {
  const context = getRouteContext();
  const pathname = context.pathname;
  const demoMode = context.demoMode;
  const session = getSessionState();
  const publicMode = !demoMode && !session.authenticated && isPublicPath(pathname);
  const navCollapsed = window.localStorage.getItem("riftsense.navCollapsed") === "true";
  const searchParams = new URLSearchParams(window.location.search);
  const isCuratorDetail = pathname.startsWith("/content/") && searchParams.get("curator") === "1";
  const heroHidden = hero.hidden === true;
  const heroTitle = hero.title ?? "RiftSense";
  const heroEyebrow = hero.eyebrow ?? "Dashboard";
  const heroText = hero.text ?? "Open dashboard, review, or setup.";
  const heroPills = Array.isArray(hero.pills) ? hero.pills : [];
  const heroCompact = hero.compact !== false;

  const navSections = [
    {
      key: "learn",
      title: publicMode ? "Explore" : "Improve",
      items: publicMode
        ? [
            { href: "/", label: "Home", active: pathname === "/" },
            { href: "/about", label: "About", active: pathname === "/about" },
            { href: "/demo", label: "Demo", active: pathname === "/demo" }
          ]
        : demoMode
        ? [
            { href: "/demo", label: "Dashboard", active: pathname === "/demo" },
            { href: "/demo/review", label: "Review", active: pathname === "/demo/review" },
            { href: "/demo/setup", label: "Setup", active: pathname === "/demo/setup" || pathname === "/demo/goals" || pathname === "/demo/onboarding" },
            { label: "Team Focus", disabled: true, status: "Soon", statusTitle: "Under construction" },
            { label: "Library", disabled: true, status: "Soon", statusTitle: "Under construction" },
            { label: "Training", disabled: true, status: "Soon", statusTitle: "Under construction" }
          ]
        : [
            { href: "/", label: "Dashboard", active: pathname === "/" || pathname === "/dashboard" },
            { href: "/review", label: "Review", active: pathname === "/review" },
            { href: "/setup", label: "Setup", active: pathname === "/setup" || pathname === "/goals" || pathname === "/onboarding" || pathname.startsWith("/focus/") },
            { href: "/system-inventory", label: "System inventory", active: pathname === "/system-inventory", muted: true },
            { label: "Team Focus", disabled: true, status: "Soon", statusTitle: "Under construction" },
            { label: "Library", disabled: true, status: "Soon", statusTitle: "Under construction" },
            { label: "Training", disabled: true, status: "Soon", statusTitle: "Under construction" }
          ]
    }
  ];
  const activeSection = navSections.find((section) => section.items.some((item) => item.active))?.key ?? "learn";
  const openSection = window.localStorage.getItem("riftsense.navSection") ?? activeSection;
  return `
    <div class="page-shell">
      <aside class="nav-drawer${navCollapsed ? " is-collapsed" : ""}" aria-label="Primary" id="nav-drawer">
        <nav class="nav-shell">
          <div class="nav-header">
            <div class="brand-lockup">
              <img class="brand-mark" src="/riftsense.png" alt="RiftSense" />
              <div class="brand-copy">
                <p class="eyebrow">RiftSense</p>
                <a class="wordmark" href="${escapeHtml(toAppHref("/", context) ?? "/")}">RiftSense</a>
              </div>
            </div>
            <button
              class="button secondary nav-desktop-toggle"
              type="button"
              id="nav-desktop-toggle"
              aria-controls="nav-drawer"
              aria-expanded="${navCollapsed ? "false" : "true"}"
              aria-label="${navCollapsed ? "Expand sidebar" : "Collapse sidebar"}"
              title="${navCollapsed ? "Expand sidebar" : "Collapse sidebar"}"
            >${navCollapsed ? "▶" : "◀"}</button>
          </div>
          <p class="nav-meta">${escapeHtml(publicMode ? "Open the public home, About page, or demo." : "Open dashboard, review, or setup.")}</p>
          <div class="side-nav-sections">
            ${navSections.map((section) => `
              <details
                class="side-nav-accordion${section.key === activeSection ? " is-current" : ""}"
                data-nav-section="${escapeHtml(section.key)}"
                ${section.key === openSection ? "open" : ""}
              >
                <summary class="side-nav-summary">${escapeHtml(section.title)}</summary>
                <div class="side-nav-links">
                  ${section.items
                    .map((item) => {
                      if (item.disabled || item.upcoming) {
                        const statusTitle = item.statusTitle ?? item.status ?? "Under construction";
                        return `<span class="side-nav-link is-disabled" aria-disabled="true" title="${escapeHtml(statusTitle)}"><span class="side-nav-label">${escapeHtml(item.label)}</span><span class="side-nav-status" aria-label="${escapeHtml(statusTitle)}">${escapeHtml(item.status ?? "Soon")}</span></span>`;
                      }

                      return `<a class="side-nav-link${item.active ? " is-active" : ""}${item.muted ? " is-muted" : ""}" href="${item.href}">
                        <span class="side-nav-label">${escapeHtml(item.label)}</span>
                        ${item.status ? `<span class="side-nav-status">${escapeHtml(item.status)}</span>` : ""}
                      </a>`;
                    })
                    .join("")}
                </div>
              </details>
            `).join("")}
          </div>
          <div class="side-nav-spacer"></div>
          ${renderSessionPanel()}
        </nav>
      </aside>
      <button id="nav-overlay" class="nav-overlay" type="button" aria-label="Close navigation"></button>
      <div class="content-shell">
        <div class="mobile-header">
          <button
            id="nav-toggle"
            class="button secondary nav-toggle"
            type="button"
            aria-controls="nav-drawer"
            aria-expanded="false"
          >Menu</button>
        </div>
        ${heroHidden ? "" : `
          <header class="hero">
          <section class="hero-copy${heroCompact ? " is-compact" : ""}">
            <p class="eyebrow">${escapeHtml(heroEyebrow)}</p>
            <h1>${escapeHtml(heroTitle)}</h1>
            <p class="hero-text">${escapeHtml(heroText)}</p>
            ${heroPills.length > 0 ? `
              <div class="hero-pills" aria-label="RiftSense guidance">
                ${heroPills.map((pill) => `<span>${escapeHtml(pill)}</span>`).join("")}
              </div>
            ` : ""}
          </section>
          </header>
        `}
        <main class="page-main">${content}</main>
      </div>
    </div>
  `;
}

function renderViewer(item) {
  const viewer = item.viewer ?? {};

  if (viewer.mode === "pdf" && item.asset?.accessUrl) {
    return `
      <p class="muted">View in app, download the original file, or share this content page.</p>
      <div class="action-row viewer-actions">
        <a class="button secondary" href="${escapeHtml(item.asset.accessUrl)}" target="_blank" rel="noreferrer">Download original</a>
        <button class="button secondary" type="button" data-share-link="${escapeHtml(item.shareUrl ?? "")}">Copy share link</button>
      </div>
      <iframe class="viewer-frame" src="${escapeHtml(item.asset.accessUrl)}" title="Content preview"></iframe>
    `;
  }

  if (viewer.mode === "pdf-preview" && item.asset?.previewUrl && item.asset?.accessUrl) {
    return `
      <p class="muted">This deck is being shown as a generated PDF preview. You can still download the original file or share this page directly.</p>
      <div class="action-row viewer-actions">
        <a class="button" href="${escapeHtml(item.asset.previewUrl)}" target="_blank" rel="noreferrer">Open PDF preview</a>
        <a class="button secondary" href="${escapeHtml(item.asset.accessUrl)}" target="_blank" rel="noreferrer">Download original</a>
        <button class="button secondary" type="button" data-share-link="${escapeHtml(item.shareUrl ?? "")}">Copy share link</button>
      </div>
      <iframe class="viewer-frame" src="${escapeHtml(item.asset.previewUrl)}" title="Content preview"></iframe>
    `;
  }

  if ((viewer.mode === "youtube" || viewer.mode === "google-embed") && viewer.embedUrl) {
    return `
      <div class="action-row viewer-actions">
        <a class="button secondary" href="${escapeHtml(viewer.openUrl ?? viewer.embedUrl)}" target="_blank" rel="noreferrer">Open source</a>
        <button class="button secondary" type="button" data-share-link="${escapeHtml(item.shareUrl ?? "")}">Copy share link</button>
      </div>
      <iframe class="viewer-frame" src="${escapeHtml(viewer.embedUrl)}" title="Embedded content" allowfullscreen></iframe>
    `;
  }

  if (viewer.mode === "deck-preview" && item.asset?.previewUrl && item.asset?.accessUrl) {
    return `
      <p class="muted">This uploaded slide deck can be viewed in app as a generated PDF, downloaded as the original file, or shared by link.</p>
      <div class="action-row viewer-actions">
        <button class="button" type="button" data-generate-preview="${escapeHtml(item.id)}">View in app</button>
        <a class="button secondary" href="${escapeHtml(item.asset.accessUrl)}" target="_blank" rel="noreferrer">Download original</a>
        <button class="button secondary" type="button" data-share-link="${escapeHtml(item.shareUrl ?? "")}">Copy share link</button>
      </div>
      <p class="muted preview-status" aria-live="polite"></p>
    `;
  }

  if (item.asset?.accessUrl) {
    const label = viewer.mode === "download" ? "Download uploaded asset" : "Open uploaded asset";
    return `
      <p class="muted">Download the original file or share this content page.</p>
      <div class="action-row viewer-actions">
        <a class="button secondary" href="${escapeHtml(item.asset.accessUrl)}" target="_blank" rel="noreferrer">${label}</a>
        <button class="button secondary" type="button" data-share-link="${escapeHtml(item.shareUrl ?? "")}">Copy share link</button>
      </div>
    `;
  }

  if (viewer.openUrl) {
    return `
      <div class="action-row viewer-actions">
        <a class="button secondary" href="${escapeHtml(viewer.openUrl)}" target="_blank" rel="noreferrer">Open external content</a>
        <button class="button secondary" type="button" data-share-link="${escapeHtml(item.shareUrl ?? "")}">Copy share link</button>
      </div>
    `;
  }

  return `<p class="muted">No viewer is available for this content yet.</p>`;
}

async function copyText(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return false;
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const input = document.createElement("input");
  input.value = text;
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
  return true;
}

function contentCard(item, curator = false) {
  const href = curator ? `/content/${item.id}?curator=1` : `/content/${item.id}`;
  return `
    <article class="content-card">
      <p class="eyebrow">${escapeHtml(item.contentType)} · ${escapeHtml(item.status)}</p>
      <h3><a href="${href}">${escapeHtml(item.title)}</a></h3>
      <p>${escapeHtml(item.description)}</p>
      <p class="muted">${escapeHtml((item.topicTags ?? []).join(", ")) || "No topics yet"}</p>
    </article>
  `;
}

function progressMeter(label, percent, detail) {
  const normalizedPercent = Math.max(0, Math.min(Number(percent ?? 0), 100));
  return `
    <article class="progress-card">
      <p class="eyebrow">${escapeHtml(label)}</p>
      <p class="progress-value">${normalizedPercent}%</p>
      <div class="progress-bar" aria-hidden="true">
        <span style="width: ${normalizedPercent}%"></span>
      </div>
      <p class="muted">${escapeHtml(detail ?? "")}</p>
    </article>
  `;
}

function goalItem(goal) {
  return `
    <article class="goal-item">
      <div>
        <h3>${escapeHtml(goal.title)}</h3>
        <p class="muted">${escapeHtml(goal.progressLabel ?? "")}</p>
      </div>
      <div class="goal-item-meter" aria-hidden="true">
        <span style="width: ${Math.max(0, Math.min(Number(goal.progressPercent ?? 0), 100))}%"></span>
      </div>
    </article>
  `;
}

function focusSummaryLink(label, value, href) {
  return `
    <a class="summary-chip summary-link" href="${escapeHtml(href)}">
      <p class="eyebrow">${escapeHtml(label)}</p>
      <p class="summary-chip-value">${escapeHtml(value)}</p>
    </a>
  `;
}

function coachItemCard(item) {
  const linkedMeta = item.linkedContent
    ? `${item.linkedContent.contentType} · ${item.linkedContent.status}`
    : "Recommendation";
  const contextBadges = [
    item.courseLabel,
    item.goalLabel,
    item.emphasis === "team" ? "Team Focus" : null
  ].filter(Boolean);

  return `
    <article class="coach-item-card">
      <p class="eyebrow">${escapeHtml(linkedMeta)}</p>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.summary)}</p>
      ${contextBadges.length > 0 ? `
        <div class="badge-row">
          ${contextBadges.map((badge) => `<span class="context-badge">${escapeHtml(badge)}</span>`).join("")}
        </div>
      ` : ""}
      <div class="action-row">
        ${item.href ? `<a class="button secondary" href="${escapeHtml(item.href)}">${escapeHtml(item.actionLabel ?? "Open")}</a>` : ""}
      </div>
    </article>
  `;
}

function continueCard(item) {
  return `
    <article class="continue-card">
      <p class="eyebrow">Continue</p>
      <h3>${escapeHtml(item.title)}</h3>
      <p class="muted">${escapeHtml(item.progressLabel ?? "Not started")}</p>
      <p>${escapeHtml(item.summary ?? "")}</p>
      ${item.href ? `<a class="button secondary" href="${escapeHtml(item.href)}">Resume</a>` : ""}
    </article>
  `;
}

function trendLabel(trend) {
  return {
    positive: "Improving",
    watch: "Watch",
    "needs-attention": "Needs attention",
    unknown: "No data yet"
  }[trend] ?? "No data yet";
}

function trendClass(trend) {
  return {
    positive: "is-positive",
    watch: "is-watch",
    "needs-attention": "is-attention",
    unknown: "is-unknown"
  }[trend] ?? "is-unknown";
}

function statusBadge(label, trend = "unknown") {
  return `<span class="status-badge ${trendClass(trend)}">${escapeHtml(label)}</span>`;
}

const REVIEW_STATUS_HELP = {
  "Next review": "Recommended next game to continue the initial assessment.",
  "Not reviewed": "No review moments in this game have been triaged yet.",
  "In progress": "Some review moments have been triaged, but the game is not complete.",
  "Triaged": "Every review moment was marked reviewed or needs manual review.",
  "Needs manual review": "At least one moment was marked uncertain and should be replay-checked.",
  "Evaluation pending": "The match summary is ready, but review moments are still being prepared.",
  "Evaluation failed": "RiftSense could not prepare review moments for this game."
};

function reviewStatusBadge(label, trend = "unknown") {
  const help = REVIEW_STATUS_HELP[label] ?? "";
  const title = help ? ` title="${escapeHtml(help)}" aria-label="${escapeHtml(`${label}: ${help}`)}" tabindex="0"` : "";
  return `<span class="status-badge ${trendClass(trend)}"${title}>${escapeHtml(label)}</span>`;
}

function targetChip(target) {
  const rawLabel = typeof target === "string" ? target : target.label;
  const label = String(rawLabel ?? "Weekly target").replaceAll("known gank deaths", "preventable known-danger deaths");
  const currentValue = typeof target === "string" ? null : target.currentValue;
  const targetValue = typeof target === "string" ? null : target.targetValue;
  const statusLabel = typeof target === "string" ? "Needs review" : target.statusLabel;
  const trend = typeof target === "string" ? "unknown" : target.trend;
  const valueLabel =
    currentValue === null || currentValue === undefined || targetValue === null || targetValue === undefined
      ? "No data"
      : `${currentValue}/${targetValue}`;

  return `
    <article class="target-chip">
      <div>
        <p class="target-chip-value">${escapeHtml(valueLabel)}</p>
        <p class="target-chip-label">${escapeHtml(label)}</p>
      </div>
      ${statusBadge(statusLabel ?? "Needs review", trend)}
    </article>
  `;
}

function targetChipGrid(items, emptyText) {
  return `
    <section class="target-chip-grid">
      ${(items ?? []).length > 0
        ? items.map(targetChip).join("")
        : `<p class="muted">${escapeHtml(emptyText)}</p>`}
    </section>
  `;
}

function hasReviewedEvidence(goal = {}, dashboard = {}) {
  const reviewedCount = Number(goal.reviewedGameCount ?? goal.reviewedGamesCount ?? dashboard.reviewedGameCount ?? 0);
  const assessmentCount = Number(goal.riotEvidence?.initialAssessment?.completedCount ?? 0);
  const progressCount = Number(goal.riotEvidence?.reviewProgress?.totalReviewedTriagedGames ?? 0);
  return (Number.isFinite(reviewedCount) && reviewedCount > 0) ||
    (Number.isFinite(assessmentCount) && assessmentCount > 0) ||
    (Number.isFinite(progressCount) && progressCount > 0);
}

function signalCard(signal) {
  return `
    <article class="signal-card">
      <div class="signal-card-head">
        <p class="signal-value">${escapeHtml(signal.value)}</p>
        ${statusBadge(trendLabel(signal.trend), signal.trend)}
      </div>
      <h3>${escapeHtml(signal.label)}</h3>
    </article>
  `;
}

function actionTypeLabel(type) {
  return {
    review: "Review",
    drill: "Drill",
    checklist: "Checklist",
    lesson: "Lesson",
    reflection: "Reflection"
  }[type] ?? "Next";
}

function evidenceMeta(summary, confidence, trend = "unknown") {
  if (!summary && !confidence) {
    return "";
  }

  return `
    <div class="evidence-meta">
      ${summary ? `<p class="muted">${escapeHtml(summary)}</p>` : ""}
      ${confidence ? statusBadge(confidence, trend) : ""}
    </div>
  `;
}

function nextStepCard(step) {
  const label = step.label ?? "Open";
  return `
    <article class="next-step-card">
      <p class="eyebrow">${escapeHtml(actionTypeLabel(step.type))} · ${escapeHtml(step.label ?? "Next")}${step.estimatedMinutes ? ` · ${escapeHtml(step.estimatedMinutes)} min` : ""}</p>
      <h3>${escapeHtml(step.title)}</h3>
      <p class="muted">${escapeHtml(step.reason ?? step.summary ?? "")}</p>
      ${step.href
        ? `<a class="button secondary" href="${escapeHtml(step.href)}">${escapeHtml(label)}</a>`
        : step.status ? `<span class="button is-disabled" aria-disabled="true">${escapeHtml(step.status)}</span>` : ""}
    </article>
  `;
}

function riotStatusTrend(status) {
  if (status === "all_recent_games_ready" || status === "some_games_ready") {
    return "positive";
  }
  if (status === "games_found_parsing" || status === "checking_recent_games") {
    return "watch";
  }
  if (status === "parse_failed_retry_available" || status === "recent_games_unavailable") {
    return "needs-attention";
  }
  return "unknown";
}

function gameHasSummaryMetadata(game) {
  return Boolean(game?.matchId && game?.queueLabel && game?.result && game?.kda);
}

function gameIsEvaluationReady(game) {
  return Boolean(gameHasSummaryMetadata(game) && game?.evaluationStatus === "current" && game?.evaluationSummary);
}

function riotReadinessCounts(riotEvidence) {
  const recentGames = riotEvidence?.recentGames ?? riotEvidence?.candidateGames ?? [];
  const candidateGames = riotEvidence?.candidateGames ?? [];
  const summaryReadyCount = Number.isFinite(Number(riotEvidence?.summaryReadyCount))
    ? Number(riotEvidence.summaryReadyCount)
    : recentGames.length > 0
      ? recentGames.filter(gameHasSummaryMetadata).length
      : Number(riotEvidence?.readyCount ?? 0);
  const evaluationReadyCount = Number.isFinite(Number(riotEvidence?.evaluationReadyCount))
    ? Number(riotEvidence.evaluationReadyCount)
    : recentGames.filter(gameIsEvaluationReady).length;
  const discoveredCount = Number.isFinite(Number(riotEvidence?.discoveredCount))
    ? Number(riotEvidence.discoveredCount)
    : Math.max(recentGames.length + Number(riotEvidence?.preparingCount ?? 0), candidateGames.length, summaryReadyCount, Number(riotEvidence?.readyCount ?? 0));
  const evaluationsPendingCount = Number.isFinite(Number(riotEvidence?.evaluationPendingCount))
    ? Number(riotEvidence.evaluationPendingCount)
    : Number.isFinite(Number(riotEvidence?.evaluationPreparingCount))
    ? Number(riotEvidence.evaluationPreparingCount)
    : Math.max(0, summaryReadyCount - evaluationReadyCount);

  return {
    discoveredCount,
    summaryReadyCount,
    evaluationReadyCount,
    evaluationsPendingCount,
    matchSummariesPreparingCount: Math.max(0, discoveredCount - summaryReadyCount - Number(riotEvidence?.failedCount ?? 0)),
    failedCount: Number(riotEvidence?.failedCount ?? 0)
  };
}

function riotEvidenceTitle(riotEvidence) {
  const counts = riotReadinessCounts(riotEvidence);
  if (counts.evaluationReadyCount > 0) {
    return `${counts.evaluationReadyCount} ${counts.evaluationReadyCount === 1 ? "evaluation" : "evaluations"} ready`;
  }
  if (counts.summaryReadyCount > 0) {
    return `${counts.summaryReadyCount} match ${counts.summaryReadyCount === 1 ? "summary" : "summaries"} ready`;
  }
  if (counts.failedCount > 0) {
    return "Recent game parsing failed";
  }
  if (counts.discoveredCount > 0) {
    return `${counts.discoveredCount} ${counts.discoveredCount === 1 ? "game" : "games"} found`;
  }
  return riotEvidence?.title ?? "Riot evidence";
}

function riotEvidenceSummary(riotEvidence) {
  const counts = riotReadinessCounts(riotEvidence);
  if (counts.matchSummariesPreparingCount > 0 && counts.summaryReadyCount === 0) {
    return "Match summaries are being prepared.";
  }
  if (counts.failedCount > 0 && counts.summaryReadyCount === 0) {
    return "Match preparation failed. Retry available.";
  }
  if (counts.evaluationsPendingCount > 0 && counts.evaluationReadyCount === 0) {
    return "Match summaries are ready. Evaluations are pending.";
  }
  return riotEvidence?.summary ?? "";
}

function riotReadinessLine(riotEvidence) {
  if (!riotEvidence) {
    return "";
  }

  const counts = riotReadinessCounts(riotEvidence);
  return `
    <div class="riot-readiness" aria-live="polite">
      <span>${escapeHtml(`${counts.discoveredCount} ${counts.discoveredCount === 1 ? "game" : "games"} discovered`)}</span>
      <span>${escapeHtml(`${counts.summaryReadyCount} match ${counts.summaryReadyCount === 1 ? "summary" : "summaries"} ready`)}</span>
      <span>${escapeHtml(`${counts.matchSummariesPreparingCount} match ${counts.matchSummariesPreparingCount === 1 ? "summary" : "summaries"} preparing`)}</span>
      <span>${escapeHtml(`${counts.evaluationReadyCount} ${counts.evaluationReadyCount === 1 ? "evaluation" : "evaluations"} ready`)}</span>
      <span>${escapeHtml(`${counts.evaluationsPendingCount} ${counts.evaluationsPendingCount === 1 ? "evaluation" : "evaluations"} pending`)}</span>
      ${counts.failedCount > 0 ? `<span>${escapeHtml(`${counts.failedCount} ${counts.failedCount === 1 ? "preparation" : "preparations"} failed`)}</span>` : ""}
    </div>
  `;
}

function tagLabel(value) {
  const labels = {
    death_count: "Deaths",
    solo_death_candidate: "Walked forward without reliable cover",
    enemy_level_up_recently_candidate: "Enemy level-up timing",
    level_up_all_in_candidate: "Enemy level-up timing",
    multi_enemy_collapse_candidate: "Walked forward with missing enemies",
    bot_lane_2v2_death: "Bot lane 2v2 death",
    bot_lane_2v1_punish: "Bot lane 2v1 punish",
    bot_lane_gank: "Bot lane gank",
    bot_lane_roam: "Bot lane roam/collapse",
    top_lane_roam: "Top-lane roam/collapse",
    mid_lane_roam: "Mid-lane roam/collapse",
    lane_roam_collapse: "Lane roam/collapse",
    bot_lane_collapse_unknown: "Bot lane collapse",
    lane_gank_death: "Lane gank",
    outnumbered_known_enemy: "Outnumbered with known nearby enemy",
    objective_window_candidate: "Objective timing signal",
    objective_setup_death_candidate: "Collapsed on before objective",
    objective_exit_death_candidate: "Stayed after objective window ended",
    isolated_forward_death_candidate: "Walked forward without reliable cover",
    low_cs_interval: "Farm dropped after lane phase",
    missed_wave_after_recall: "Lost wave after recall timing",
    missed_side_wave_collection: "Missed side-wave collection",
    bad_recall_timing: "Stayed after safe reset window"
  };
  if (labels[value]) {
    return labels[value];
  }
  return String(value ?? "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function tagLabelForDeath(value, death) {
  if ((value === "enemy_level_up_recently_candidate" || value === "level_up_all_in_candidate") &&
    (death?.enemyLevelUpsBeforeDeath ?? []).some((event) => Number(event?.level) === 6)) {
    return "Enemy ultimate timing";
  }
  return tagLabel(value);
}

function formatDeathTimestamp(death) {
  const seconds = Number(death?.timestampSeconds ?? Math.floor(Number(death?.timestampMs ?? 0) / 1000));
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "00:00";
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

const REVIEW_PRIORITY_TAGS = [
  {
    tag: "multi_enemy_collapse_candidate",
    label: "possible multi-enemy deaths",
    singularLabel: "possible multi-enemy death",
    priorityLabel(count) {
      return count > 1 ? "Repeated possible multi-enemy deaths" : "Possible multi-enemy death";
    }
  },
  {
    tag: "objective_window_candidate",
    label: "objective-window deaths",
    singularLabel: "objective-window death",
    priorityLabel() {
      return "Objective-window deaths";
    }
  },
  {
    tag: "objective_setup_death_candidate",
    label: "objective setup deaths",
    singularLabel: "objective setup death",
    priorityLabel() {
      return "Objective setup deaths";
    }
  },
  {
    tag: "objective_exit_death_candidate",
    label: "objective exit deaths",
    singularLabel: "objective exit death",
    priorityLabel() {
      return "Objective exit deaths";
    }
  },
  {
    tag: "level_up_all_in_candidate",
    label: "level breakpoint deaths",
    singularLabel: "level breakpoint death",
    priorityLabel() {
      return "Level breakpoint deaths";
    }
  },
  {
    tag: "enemy_level_up_recently_candidate",
    label: "level breakpoint deaths",
    singularLabel: "level breakpoint death",
    priorityLabel() {
      return "Level breakpoint deaths";
    }
  },
  {
    tag: "solo_death_candidate",
    label: "solo deaths",
    singularLabel: "solo death",
    priorityLabel(count) {
      return count > 1 ? "Repeated solo deaths" : "Solo death";
    }
  }
];

function tagCountFromReview(review, tag, deaths) {
  const count = Number(review?.deterministicTagCounts?.[tag]);
  if (Number.isFinite(count) && count > 0) {
    return count;
  }

  return deaths.filter((death) => (death.tags ?? []).includes(tag)).length;
}

export function deriveReviewPriority(review) {
  const evaluationSummary = review?.evaluationSummary ?? null;
  const deaths = Array.isArray(review?.deathEvents) ? review.deathEvents : [];

  if (!evaluationSummary) {
    return {
      state: "pending",
      title: "Evaluation pending",
      detail: "No persisted deterministic evaluation exists yet for this match.",
      groups: [],
      timestamps: []
    };
  }

  const deathCount = Number(evaluationSummary.deathCount ?? review?.deterministicTagCounts?.death_count ?? deaths.length ?? 0);
  if (deathCount === 0) {
    return {
      state: "safe",
      title: "No deaths detected",
      detail: "This evaluated match has zero deterministic death events.",
      groups: [],
      timestamps: []
    };
  }

  const groups = REVIEW_PRIORITY_TAGS
    .map((definition) => {
      const matchingDeaths = deaths.filter((death) => (death.tags ?? []).includes(definition.tag));
      const count = tagCountFromReview(review, definition.tag, deaths);
      const timestamps = matchingDeaths
        .filter((death) => Number.isFinite(Number(death?.timestampSeconds)) || Number.isFinite(Number(death?.timestampMs)))
        .map(formatDeathTimestamp);

      return {
        tag: definition.tag,
        label: `${count} ${count === 1 ? definition.singularLabel : definition.label}`,
        priorityLabel: definition.priorityLabel(count),
        count,
        timestamps
      };
    })
    .filter((group) => group.count > 0);

  const primaryGroup = groups[0] ?? null;
  const fallbackTimestamps = deaths.slice(0, 3).map(formatDeathTimestamp);
  const timestamps = (primaryGroup?.timestamps.length ? primaryGroup.timestamps : fallbackTimestamps).slice(0, 3);
  const title = primaryGroup ? `Review first: ${primaryGroup.priorityLabel}` : "Review first: death events";

  return {
    state: "ready",
    title,
    detail: "Deterministic evidence only.",
    groups: groups.length > 0 ? groups : [{ tag: "death_count", label: `${deathCount} ${deathCount === 1 ? "death" : "deaths"}`, count: deathCount, timestamps }],
    timestamps
  };
}

function reviewHrefForGame(game, context = {}) {
  if (!game?.matchId) {
    return toAppHref("/review", context) ?? "/review";
  }

  return toAppHref(`/review?matchId=${encodeURIComponent(game.matchId)}`, context) ?? "/review";
}

function evaluationSummaryBlock(game) {
  const summary = game?.evaluationSummary ?? null;
  const status = game?.evaluationStatus ?? "none";
  if (status === "failed") {
    return '<p class="muted">Evaluation failed</p>';
  }
  if (!summary || status !== "current") {
    return '<p class="muted">Evaluation pending</p>';
  }

  const momentCount = reviewMomentCount(game);
  const plainSummary = `${momentCount} review ${momentCount === 1 ? "moment" : "moments"}`;

  return `
    <div class="evaluation-summary">
      <p class="muted">${escapeHtml(plainSummary)}</p>
    </div>
  `;
}

function recentGameState(game) {
  if (game?.reviewStatus === "needs_manual_review") {
    return { label: "Needs manual review", actionLabel: "Open review", canReview: true };
  }
  if (game?.reviewStatus === "triaged") {
    return { label: "Triaged", actionLabel: "Open review", canReview: true };
  }
  if (game?.reviewStatus === "in_progress") {
    return { label: "In progress", actionLabel: "Continue review", canReview: true };
  }
  if (game?.reviewedAt) {
    return { label: "Triaged", actionLabel: "Open review", canReview: true };
  }
  if (game?.reviewStartedAt) {
    return { label: "In progress", actionLabel: "Continue review", canReview: true };
  }
  if (gameIsEvaluationReady(game)) {
    return { label: "Not reviewed", actionLabel: "Review", canReview: true };
  }
  if (game?.evaluationStatus === "failed") {
    return { label: "Evaluation failed", actionLabel: null, canReview: false };
  }
  if (gameHasSummaryMetadata(game)) {
    return { label: "Evaluation pending", actionLabel: null, canReview: false };
  }
  if (game?.parseStatus === "parse_failed" || game?.sourceMetadata?.parseStatus === "parse_failed") {
    return { label: "Evaluation failed", actionLabel: null, canReview: false };
  }
  return { label: "Evaluation pending", actionLabel: null, canReview: false };
}

function reviewStatusTrend(label) {
  return {
    "Next review": "watch",
    "Not reviewed": "unknown",
    "In progress": "watch",
    "Triaged": "positive",
    "Needs manual review": "needs-attention",
    "Evaluation pending": "watch",
    "Evaluation failed": "needs-attention"
  }[label] ?? "unknown";
}

function riotPreparationStatusBlock(riotEvidence) {
  const counts = riotReadinessCounts(riotEvidence);
  const status = riotEvidence?.status ?? "";
  if (status === "riot_access_not_configured" || status === "recent_games_unavailable") {
    return '<p class="muted">Riot data unavailable.</p>';
  }
  if (counts.failedCount > 0) {
    return '<p class="muted">Some evaluations failed.</p>';
  }
  if (counts.evaluationsPendingCount > 0) {
    return '<p class="muted">Evaluations are being prepared.</p>';
  }
  return "";
}

function riotEvidenceCard(riotEvidence, context = {}) {
  if (!riotEvidence) {
    return "";
  }

  const recentGames = reviewReadyDisplayGroups(riotEvidence);
  const hasRecommendedFirst = recentGames[0]?.games?.[0]?.matchId === assessmentNextGame(riotEvidence.initialAssessment)?.matchId;
  const sourceLabel = riotEvidence.sourceLabel ? `<p class="eyebrow">${escapeHtml(riotEvidence.sourceLabel)}</p>` : "";
  const counts = riotReadinessCounts(riotEvidence);
  const availabilityLabel = counts.evaluationReadyCount > 0
    ? `${counts.evaluationReadyCount} evaluated ${counts.evaluationReadyCount === 1 ? "game" : "games"} available`
    : riotEvidenceSummary(riotEvidence);
  const sortLabel = riotEvidence.initialAssessment?.nextMatchId
    ? (hasRecommendedFirst ? "Assessment recommendation appears first." : "Sorted by recency. Recommended assessment game is marked.")
    : "Sorted by recency.";
  const preparationStatus = riotPreparationStatusBlock(riotEvidence);
  const gameCount = recentGames.reduce((sum, group) => sum + group.games.length, 0);
  return `
    <section class="panel riot-evidence-panel" id="review-ready-games">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Recent Games</p>
          <h2>Review-ready games</h2>
          ${sourceLabel}
        </div>
        <div class="action-row">
          ${getSessionState().authenticated ? '<button class="button secondary" type="button" data-refresh-recent-games>Refresh recent games</button>' : ""}
        </div>
      </div>
      <p class="muted recent-games-refresh-status" aria-live="polite">${escapeHtml(state.recentGamesRefreshMessage)}</p>
      ${availabilityLabel ? `<p class="muted">${escapeHtml(availabilityLabel)}</p>` : ""}
      ${gameCount > 1 ? `<p class="muted">${escapeHtml(sortLabel)}</p>` : ""}
      ${preparationStatus}
      <section class="compact-list">
        ${gameCount > 0
          ? recentGames.map((group) => `
            <section class="review-ready-group" aria-label="${escapeHtml(group.title)}">
              <p class="eyebrow">${escapeHtml(group.title)}</p>
              ${group.games.map((game) => {
            const hasSummaryMetadata = gameHasSummaryMetadata(game);
            const state = recentGameState(game);
            const displayStatus = state.label === "Not reviewed" && game.matchId === riotEvidence.initialAssessment?.nextMatchId
              ? "Next review"
              : state.label;
            const title = hasSummaryMetadata
              ? `${game.champion ?? game.championName ?? "Unknown champion"} · ${game.result}`
              : `${game.champion ?? game.championName ?? "Unknown champion"} · ${state.label}`;
            const value = hasSummaryMetadata
              ? `${game.queueLabel} · ${game.kda} KDA${game.csPerMinute ? ` · ${game.csPerMinute} cs/min` : ""}`
              : state.label;
            const action = state.canReview
              ? `<a class="button secondary compact-row-action" href="${escapeHtml(reviewHrefForGame(game, context))}">${escapeHtml(state.actionLabel)}</a>`
              : "";

            return `
              <article class="compact-row game-evidence-row">
                <div class="game-evidence-main">
                  <span class="compact-row-main">${escapeHtml(title)}</span>
                  <span class="compact-row-value">${escapeHtml(value)}</span>
                  ${evaluationSummaryBlock(game)}
                </div>
                <div class="game-evidence-actions">
                  ${reviewStatusBadge(displayStatus, reviewStatusTrend(displayStatus))}
                  ${action}
                </div>
              </article>
            `;
          }).join("")}
            </section>
          `).join("")
          : '<p class="muted">No recent games are available yet.</p>'}
      </section>
    </section>
  `;
}

function reviewReadyDisplayGroups(riotEvidence = {}) {
  const assessment = riotEvidence.initialAssessment ?? null;
  const recommended = assessmentNextGame(assessment);
  const allGames = [...(riotEvidence.recentGames ?? riotEvidence.candidateGames ?? [])];
  const seen = new Set();
  const uniqueGames = allGames.filter((game) => {
    if (!game?.matchId || seen.has(game.matchId)) return false;
    seen.add(game.matchId);
    return true;
  });

  const groups = [
    { key: "recommended", title: "Recommended next", games: [] },
    { key: "other", title: "Other review-ready games", games: [] },
    { key: "reviewed", title: "Already reviewed", games: [] },
    { key: "manual", title: "Needs manual review", games: [] },
    { key: "pending", title: "Pending evaluations", games: [] }
  ];
  const byKey = new Map(groups.map((group) => [group.key, group]));

  for (const game of uniqueGames) {
    const state = recentGameState(game);
    if (recommended?.matchId && game.matchId === recommended.matchId) {
      byKey.get("recommended").games.push(game);
    } else if (state.label === "In progress" || state.label === "Not reviewed") {
      byKey.get("other").games.push(game);
    } else if (state.label === "Triaged") {
      byKey.get("reviewed").games.push(game);
    } else if (state.label === "Needs manual review") {
      byKey.get("manual").games.push(game);
    } else {
      byKey.get("pending").games.push(game);
    }
  }

  return groups.filter((group) => group.games.length > 0);
}

function reviewMomentCount(game = {}) {
  const deathCount = Number(game.evaluationSummary?.deathCount ?? game.deathCount);
  if (Number.isFinite(deathCount)) {
    return Math.max(0, deathCount);
  }
  const signals = game.evaluationSummary?.reviewSignals ?? game.topDeterministicSignals ?? [];
  return Array.isArray(signals) ? signals.length : 0;
}

function reviewMomentLabel(game = {}) {
  const count = reviewMomentCount(game);
  return `${count} review ${count === 1 ? "moment" : "moments"}`;
}

function reviewQueueGames(riotEvidence, limit = 3) {
  const games = [
    riotEvidence?.reviewCandidate,
    ...(riotEvidence?.recentGames ?? riotEvidence?.candidateGames ?? [])
  ].filter((game) =>
    game?.matchId
    && (game.reviewStartedAt || game.reviewedAt || gameIsEvaluationReady(game))
    && reviewMomentCount(game) > 0
    && game.reviewStatus !== "triaged"
    && game.reviewStatus !== "needs_manual_review"
  );
  const seen = new Set();
  return games.filter((game) => {
    if (seen.has(game.matchId)) {
      return false;
    }
    seen.add(game.matchId);
    return true;
  }).slice(0, limit);
}

function dashboardState({ dashboard = {}, goal = {}, riotEvidence = {} }) {
  const reviewQueue = reviewQueueGames(riotEvidence);
  const initialAssessment = riotEvidence?.initialAssessment ?? null;
  const assessmentTarget = Number(initialAssessment?.target ?? INITIAL_ASSESSMENT_TARGET);
  const assessmentAvailable = Array.isArray(initialAssessment?.candidateGames) ? initialAssessment.candidateGames.length : 0;
  const assessmentCompleted = Number(initialAssessment?.completedCount ?? 0);
  const assessmentComplete = Boolean(initialAssessment?.assessmentComplete) ||
    (initialAssessment && assessmentCompleted >= Math.min(assessmentTarget, assessmentAvailable || assessmentTarget));
  const inInitialAssessment = Boolean(initialAssessment && !assessmentComplete);
  const hasReviewedGames = hasReviewedEvidence(goal, dashboard);
  const weeklyTargets = hasReviewedGames && !inInitialAssessment ? (goal.weeklyTargets ?? []) : [];
  const patterns = hasReviewedGames && !inInitialAssessment ? (dashboard.recentInsights ?? []) : [];
  const goalSignals = hasReviewedGames && !inInitialAssessment ? (goal.signals ?? []) : [];
  const inProgressReview = dashboard.inProgressReview ?? dashboard.currentReview ?? null;
  const reviewedCount = Number(goal.reviewedGameCount ?? goal.reviewedGamesCount ?? dashboard.reviewedGameCount ?? 0);

  return {
    inInitialAssessment,
    assessmentTarget,
    assessmentCompleted,
    hasReviewedGames,
    hasReviewReadyGames: reviewQueue.length > 0,
    hasInProgressReview: Boolean(inProgressReview?.matchId || inProgressReview?.href),
    hasConfirmedPatterns: patterns.length > 0 || goalSignals.length > 0,
    hasWeeklyTargets: weeklyTargets.length > 0,
    hasActionableTeamFocus: Boolean(dashboard.activeTeamFocus?.headlineSignal || dashboard.activeTeamFocus?.nextTeamAction?.title),
    inProgressReview,
    reviewQueue,
    initialAssessment,
    weeklyTargets,
    patterns,
    goalSignals,
    goalReviewedCount: Number.isFinite(reviewedCount) ? reviewedCount : 0
  };
}

function assessmentNextGame(assessment) {
  const candidates = assessment?.candidateGames ?? [];
  const eligible = candidates.filter((game) =>
    game?.matchId &&
    game.reviewStatus !== "triaged" &&
    game.reviewStatus !== "needs_manual_review"
  );
  return eligible.find(isAssessmentReviewInProgress) ??
    eligible.find((game) => game.matchId === assessment.nextMatchId) ??
    [...eligible].sort((left, right) => reviewMomentCount(right) - reviewMomentCount(left))[0] ??
    null;
}

function assessmentNextGameReason(game, assessment) {
  if (!game) return null;
  const eligible = eligibleUnreviewedAssessmentGames(assessment);
  if (isAssessmentReviewInProgress(game)) {
    return "You already started reviewing this game.";
  }
  if (!eligible.some((candidate) => candidate.matchId === game.matchId)) {
    return null;
  }
  if (hasMostReviewMoments(game, eligible)) {
    return "It has the most review moments among your unreviewed assessment games.";
  }
  if (isMostRecentAssessmentGame(game, eligible)) {
    return "It is your most recent unreviewed game with review moments ready.";
  }
  if (addsAssessmentContext(game, assessment)) {
    return "It adds a different champion or game context to your baseline.";
  }
  if (hasIneligibleUnreviewedAssessmentGames(assessment)) {
    return "It is the next eligible game with review moments ready.";
  }
  return null;
}

function eligibleUnreviewedAssessmentGames(assessment) {
  return (assessment?.candidateGames ?? []).filter((candidate) =>
    candidate?.matchId &&
    candidate.reviewStatus !== "triaged" &&
    candidate.reviewStatus !== "needs_manual_review" &&
    !isAssessmentReviewInProgress(candidate) &&
    !candidate.reviewedAt &&
    !candidate.lastReviewedAt &&
    gameIsEvaluationReady(candidate) &&
    reviewMomentCount(candidate) > 0
  );
}

function isAssessmentReviewInProgress(game = {}) {
  const triagedMomentCount = Number(game.triagedMomentCount ?? 0);
  return Boolean(
    game.reviewStatus === "in_progress" ||
    game.reviewStartedAt ||
    (triagedMomentCount > 0 && game.reviewStatus !== "triaged" && game.reviewStatus !== "needs_manual_review")
  );
}

function hasMostReviewMoments(game, eligible) {
  if (!eligible.length) return false;
  const gameMoments = reviewMomentCount(game);
  const maxMoments = Math.max(...eligible.map(reviewMomentCount));
  return gameMoments > 0 && gameMoments === maxMoments;
}

function assessmentGameTimestamp(game = {}) {
  const rawTimestamp = game.playedAt ?? game.gameCreation ?? game.gameEndTimestamp ?? game.gameCreationDate ?? game.startedAt ?? null;
  const timestamp = rawTimestamp ? new Date(rawTimestamp).getTime() : NaN;
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isMostRecentAssessmentGame(game, eligible) {
  const gameTimestamp = assessmentGameTimestamp(game);
  if (gameTimestamp === null) return false;
  const timestamps = eligible.map(assessmentGameTimestamp).filter((timestamp) => timestamp !== null);
  return timestamps.length > 0 && gameTimestamp === Math.max(...timestamps);
}

function hasIneligibleUnreviewedAssessmentGames(assessment) {
  return (assessment?.candidateGames ?? []).some((candidate) =>
    candidate?.matchId &&
    candidate.reviewStatus !== "triaged" &&
    candidate.reviewStatus !== "needs_manual_review" &&
    !isAssessmentReviewInProgress(candidate) &&
    !candidate.reviewedAt &&
    !candidate.lastReviewedAt &&
    (!gameIsEvaluationReady(candidate) || reviewMomentCount(candidate) <= 0)
  );
}

function addsAssessmentContext(game, assessment) {
  const reviewed = (assessment?.candidateGames ?? []).filter((candidate) =>
    candidate?.matchId &&
    (candidate.reviewStatus === "triaged" || candidate.reviewStatus === "needs_manual_review" || candidate.reviewedAt || candidate.lastReviewedAt)
  );
  if (reviewed.length === 0) return false;
  const values = (key) => new Set(reviewed.map((candidate) => candidate[key]).filter(Boolean));
  const champion = game.champion ?? game.championName;
  return (
    (champion && !new Set(reviewed.map((candidate) => candidate.champion ?? candidate.championName).filter(Boolean)).has(champion)) ||
    (game.result && !values("result").has(game.result)) ||
    (game.queueLabel && !values("queueLabel").has(game.queueLabel))
  );
}

function primaryDashboardAction({ state: dashboardView, action = {}, context = {} }) {
  if (dashboardView.hasInProgressReview) {
    const href = toAppHref(dashboardView.inProgressReview.href, context)
      ?? (dashboardView.inProgressReview.matchId ? reviewHrefForGame(dashboardView.inProgressReview, context) : toAppHref("/review", context))
      ?? "#";
    return {
      title: "Finish current review",
      body: "You have an unfinished review in progress.",
      primaryLabel: "Continue this game",
      primaryHref: href
    };
  }

  const recommended = dashboardView.reviewQueue[0] ?? null;
  if (recommended && dashboardView.reviewQueue.length > 1) {
    return {
      title: "Pick a game to review",
      body: "Start with the most recent review-ready game, or choose another from the queue.",
      primaryLabel: "Review this game",
      primaryHref: reviewHrefForGame(recommended, context),
      secondaryLabel: "View review queue",
      secondaryHref: toAppHref("/review", context) ?? "/review"
    };
  }

  if (recommended) {
    return {
      title: "Review your latest game",
      body: "Start with one short review so RiftSense can learn what is actually causing deaths in your recent games.",
      primaryLabel: "Review this game",
      primaryHref: reviewHrefForGame(recommended, context)
    };
  }

  const fallbackHref = canonicalDashboardHref(action.href ?? "/review", context);
  return {
    title: action.title ?? "No review ready",
    body: "Recent games are still being prepared. Check the review queue when preparation finishes.",
    primaryLabel: action.ctaLabel ?? "Open review",
    primaryHref: fallbackHref ?? "#",
    disabled: !fallbackHref || (action.href ?? "/review") === "/review"
  };
}

function primaryActionCard(primaryAction) {
  return `
    <section class="panel primary-action-panel">
      <p class="eyebrow">Next action</p>
      <h2>${escapeHtml(primaryAction.title)}</h2>
      <p class="muted">${escapeHtml(primaryAction.body)}</p>
      <div class="action-row">
        ${primaryAction.disabled
          ? `<span class="button is-disabled" aria-disabled="true">${escapeHtml(primaryAction.primaryLabel)}</span>`
          : `<a class="button" href="${escapeHtml(primaryAction.primaryHref)}">${escapeHtml(primaryAction.primaryLabel)}</a>`}
        ${primaryAction.secondaryHref ? `<a class="button secondary" href="${escapeHtml(primaryAction.secondaryHref)}">${escapeHtml(primaryAction.secondaryLabel)}</a>` : ""}
      </div>
    </section>
  `;
}

function reviewQueueSummary(reviewQueue, context = {}) {
  return `
    <section class="panel dashboard-compact-panel" id="review-queue">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Waiting for review</p>
          <h2>Review queue</h2>
        </div>
      </div>
      <section class="compact-list">
        ${reviewQueue.length > 0
          ? reviewQueue.map((game) => `
            <article class="compact-row dashboard-queue-row">
              <div>
                <span class="compact-row-main">${escapeHtml(game.champion ?? game.championName ?? "Unknown champion")} · ${escapeHtml(game.result ?? "Result unknown")}</span>
                <span class="compact-row-value">${escapeHtml(game.queueLabel ?? "Queue unknown")} · ${escapeHtml(reviewMomentLabel(game))}</span>
              </div>
              <a class="button secondary compact-row-action" href="${escapeHtml(reviewHrefForGame(game, context))}">Review</a>
            </article>
          `).join("")
          : '<p class="muted">No review-ready games yet.</p>'}
      </section>
    </section>
  `;
}

function gameKdaLabel(game = {}) {
  if (game.kda) return game.kda;
  const kills = Number(game.kills);
  const deaths = Number(game.deaths);
  const assists = Number(game.assists);
  return [kills, deaths, assists].every(Number.isFinite) ? `${kills}/${deaths}/${assists}` : null;
}

function assessmentGameStatus(game = {}, assessment = {}) {
  if (game.matchId === assessment.nextMatchId) return "Next review";
  if (game.reviewStatus === "needs_manual_review") return "Needs manual review";
  if (game.reviewStatus === "triaged") return "Triaged";
  if (game.lastReviewedAt || game.reviewedAt) return "Triaged";
  if (game.evaluationStatus && game.evaluationStatus !== "current") return "Evaluation pending";
  if (game.queueLabel || game.result || game.kda) return "Not reviewed";
  return "Evaluation pending";
}

function assessmentGameRow(game, assessment, context = {}) {
  const champion = game.champion ?? game.championName ?? "Unknown champion";
  const result = game.result ?? "Result unknown";
  const kda = gameKdaLabel(game);
  const triaged = Number(game.triagedMomentCount ?? 0);
  const total = Number(game.totalReviewMomentCount ?? game.evaluationSummary?.deathCount ?? game.evaluationDeaths?.length ?? 0);
  const momentText = total > 0 ? `${triaged}/${total} moments triaged` : reviewMomentLabel(game);
  return `
    <article class="compact-row dashboard-queue-row assessment-game-row">
      <div>
        <span class="compact-row-main">${escapeHtml(champion)} · ${escapeHtml(result)}</span>
        <span class="compact-row-value">${escapeHtml(game.queueLabel ?? "Queue unknown")}${kda ? ` · ${escapeHtml(kda)}` : ""} · ${escapeHtml(momentText)}</span>
      </div>
      <div class="assessment-game-actions">
        <span class="context-badge">${escapeHtml(assessmentGameStatus(game, assessment))}</span>
        <a class="button secondary compact-row-action" href="${escapeHtml(reviewHrefForGame(game, context))}">Review</a>
      </div>
    </article>
  `;
}

function initialAssessmentPanel(dashboardView, context = {}) {
  const assessment = dashboardView.initialAssessment;
  if (!assessment || !dashboardView.inInitialAssessment) return "";
  const target = dashboardView.assessmentTarget;
  const completedCount = dashboardView.assessmentCompleted;
  const remaining = Math.max(0, target - completedCount);
  const nextGame = assessmentNextGame(assessment);
  const nextChampion = nextGame?.champion ?? nextGame?.championName ?? "Unknown champion";
  const nextResult = nextGame?.result ?? "Result unknown";
  const nextQueue = nextGame?.queueLabel ?? "Queue unknown";
  const nextKda = gameKdaLabel(nextGame ?? {}) ?? "KDA unknown";
  const nextMomentCount = reviewMomentCount(nextGame ?? {});
  const reason = assessmentNextGameReason(nextGame, assessment);
  const reasonLine = reason ? `<p class="muted">Why this game: ${escapeHtml(reason)}</p>` : "";
  const ctaLabel = isAssessmentReviewInProgress(nextGame)
    ? "Continue this game"
    : "Review this game";
  return `
    <section class="panel primary-action-panel initial-assessment-panel">
      <p class="eyebrow">Initial assessment</p>
      <h2>${escapeHtml(completedCount)} of ${escapeHtml(target)} games reviewed</h2>
      <p class="muted">${remaining === 1 ? "Review one more game to finish the baseline." : `Review ${remaining} more games to finish the baseline.`}</p>
      ${nextGame ? `
      <article class="recommended-review-card">
        <div>
          <p class="eyebrow">Recommended next review</p>
          <h3>${escapeHtml(nextChampion)} · ${escapeHtml(nextResult)}</h3>
          <p class="muted">${escapeHtml(nextQueue)} · ${escapeHtml(nextKda)} KDA · ${escapeHtml(nextMomentCount)} review ${nextMomentCount === 1 ? "moment" : "moments"}</p>
          ${reasonLine}
        </div>
        <div class="action-row">
          <a class="button" href="${escapeHtml(reviewHrefForGame(nextGame, context))}">${escapeHtml(ctaLabel)}</a>
          <a class="button secondary" href="#review-ready-games">Choose a different game</a>
        </div>
      </article>` : ""}
    </section>
  `;
}

function evidenceProgressCard(dashboardView) {
  if (dashboardView.hasReviewedGames) {
    const reviewedCount = dashboardView.goalReviewedCount;
    const latestPattern = dashboardView.patterns[0];
    return `
      <section class="panel evidence-progress-panel">
        <p class="eyebrow">Evidence progress</p>
        <h2>Evidence progress</h2>
        <div class="progress-checklist">
          <span>${escapeHtml(reviewedCount)} ${reviewedCount === 1 ? "game" : "games"} reviewed</span>
          <span>${escapeHtml(dashboardView.goalSignals.length || dashboardView.patterns.length)} ${(dashboardView.goalSignals.length || dashboardView.patterns.length) === 1 ? "pattern" : "patterns"} found</span>
          <span>${dashboardView.hasWeeklyTargets ? "Weekly targets ready" : "Weekly targets not ready yet"}</span>
        </div>
        ${latestPattern ? `<p class="muted">Latest pattern: ${escapeHtml(latestPattern.title ?? latestPattern.label ?? "Pattern found")}</p>` : ""}
        <span class="button is-disabled" aria-disabled="true">Under construction</span>
      </section>
    `;
  }

  return `
    <section class="panel evidence-progress-panel">
      <p class="eyebrow">Evidence progress</p>
      <h2>Evidence progress</h2>
      <p class="muted">Review one game to create your first evidence point.</p>
      <div class="progress-checklist">
        <span>0 games reviewed</span>
        <span>0 patterns found</span>
        <span>Weekly targets not ready yet</span>
      </div>
    </section>
  `;
}

function inactiveDashboardSection({ title, status, body, href, cta }) {
  return `
    <section class="panel dashboard-inactive-panel">
      <div>
        <p class="eyebrow">${escapeHtml(title)}</p>
        <h2>${escapeHtml(title)}</h2>
      </div>
      ${statusBadge(status, "unknown")}
      <p class="muted">${escapeHtml(body)}</p>
      ${href ? `<a class="button secondary" href="${escapeHtml(href)}">${escapeHtml(cta ?? "Open")}</a>` : ""}
    </section>
  `;
}

function dashboardContextCards(dashboardView, teamFocus = {}) {
  const reviewedCount = dashboardView.goalReviewedCount || dashboardView.assessmentCompleted;
  const teamEvidenceConnected = Boolean(teamFocus.teamEvidenceEvents?.length || teamFocus.evidenceEvents?.length || teamFocus.signals?.some((signal) => signal.source === "team-review" || signal.source === "team-focus"));
  const latestPattern = initialAssessmentPattern(dashboardView);
  const targetRows = initialAssessmentTargetRows(dashboardView);
  return `
    <section class="dashboard-context-column">
      ${dashboardView.hasWeeklyTargets
        ? `
          <section class="panel dashboard-compact-panel">
            <p class="eyebrow">Weekly targets</p>
            <h2>Weekly targets</h2>
            ${targetChipGrid(dashboardView.weeklyTargets, "No weekly targets ready.")}
          </section>
        `
        : dashboardView.inInitialAssessment
          ? `
            <section class="panel dashboard-compact-panel weekly-target-preview-panel">
              <p class="eyebrow">Early target preview</p>
              <h2>Targets pending baseline</h2>
              <p class="muted">Final weekly targets unlock after 3 assessment games.</p>
              ${targetRows.length > 0 ? `<div class="target-list">${targetRows.map((row) => `<p><strong>${escapeHtml(row.label)}:</strong> ${escapeHtml(row.value)}</p>`).join("")}</div>` : ""}
              <p class="muted">${escapeHtml(dashboardView.assessmentCompleted)} of ${escapeHtml(dashboardView.assessmentTarget)} assessment games reviewed</p>
            </section>
          `
          : inactiveDashboardSection({
            title: "Weekly targets",
            status: "Not ready yet",
            body: "Unlocks after reviewed evidence is ready."
          })}
      ${dashboardView.hasConfirmedPatterns
        ? `
          <section class="panel dashboard-compact-panel">
            <p class="eyebrow">${dashboardView.inInitialAssessment ? "Early signal preview" : "Latest pattern"}</p>
            <h2>${dashboardView.inInitialAssessment ? "Early signal preview" : "Latest pattern"}</h2>
            <section class="insight-grid">
              ${dashboardView.patterns.length > 0
                ? dashboardView.patterns.slice(0, 1).map(insightCard).join("")
                : dashboardView.goalSignals.slice(0, 2).map(signalCard).join("")}
            </section>
          </section>
        `
        : dashboardView.inInitialAssessment
          ? `
            <section class="panel dashboard-compact-panel latest-pattern-preview-panel">
              <p class="eyebrow">Early signal preview</p>
              <h2>${escapeHtml(latestPattern.title)}</h2>
              <p class="muted">${escapeHtml(latestPattern.body)}</p>
              <p class="muted">Based on ${escapeHtml(dashboardView.assessmentCompleted)} of ${escapeHtml(dashboardView.assessmentTarget)} assessment games</p>
            </section>
          `
          : inactiveDashboardSection({
            title: "Latest pattern",
            status: "Under construction",
            body: "RiftSense needs reviewed games before it can identify patterns."
          })}
      <section class="panel dashboard-inactive-panel team-focus-panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Team focus</p>
            <h2>${escapeHtml(teamFocus.title ?? teamFocus.practiceTopic ?? "Dragon Setup")}</h2>
          </div>
          ${statusBadge(teamEvidenceConnected ? "Updated from team evidence" : "Not connected yet", teamEvidenceConnected ? "positive" : "unknown")}
        </div>
        <p class="muted">${teamEvidenceConnected
          ? "Team-focused review evidence is available."
          : dashboardView.inInitialAssessment
            ? "Team focus will use team reviews and shared practice goals. Personal initial assessment does not update this."
            : "Team focus will use team reviews and shared practice goals later."}</p>
        <div class="team-focus-meta">
          <p><strong>Current focus:</strong> ${escapeHtml(teamFocus.practiceTopic ?? teamFocus.title ?? "Not set")}</p>
          <p><strong>Assignment:</strong> ${escapeHtml(teamFocus.assignment ?? teamFocus.assignedReview ?? "Not set")}</p>
        </div>
      </section>
    </section>
  `;
}

function initialAssessmentPattern(dashboardView) {
  if (dashboardView.assessmentCompleted > 0 || dashboardView.goalReviewedCount > 0) {
    return {
      title: "Known-danger deaths showing up",
      body: "Early reviewed moments are clustering around visible or inferable danger."
    };
  }
  return {
    title: "No pattern yet",
    body: "Patterns unlock after more assessment reviews."
  };
}

function initialAssessmentTargetRows(dashboardView) {
  const completedIds = new Set(dashboardView.initialAssessment?.completedMatchIds ?? []);
  const completedGames = (dashboardView.initialAssessment?.candidateGames ?? []).filter((game) =>
    completedIds.has(game.matchId) ||
    game.reviewStatus === "triaged" ||
    game.reviewStatus === "needs_manual_review" ||
    game.reviewedAt ||
    game.lastReviewedAt
  );
  const knownDangerDeaths = completedGames.reduce((sum, game) => sum + reviewMomentCount(game), 0);
  if (knownDangerDeaths <= 0) return [];
  return [
    { label: "Known-danger deaths", value: `${knownDangerDeaths} so far` },
    { label: "2v2 deaths", value: "no reviewed evidence yet" },
    { label: "Bad pre-6 all-ins", value: "no reviewed evidence yet" }
  ];
}

function canonicalSetupHref(context = getRouteContext()) {
  return toAppHref("/setup", context) ?? "/setup";
}

function canonicalDashboardHref(href, context = getRouteContext()) {
  if (!href) {
    return null;
  }
  if (!href.startsWith("/")) {
    return href;
  }

  const [pathname, query = ""] = href.split("?");
  const suffix = query ? `?${query}` : "";
  if (pathname === "/goals" || pathname === "/onboarding" || pathname.startsWith("/focus/") || pathname === "/setup") {
    return `${canonicalSetupHref(context)}${suffix}`;
  }
  if (pathname === "/team" || pathname === "/team-focus" || pathname === "/library" || pathname === "/training" || pathname === "/drills" || pathname === "/test") {
    return null;
  }

  return toAppHref(href, context);
}

function shouldPrepareRecentEvaluations(riotEvidence, context = getRouteContext()) {
  if (context.demoMode || !getSessionState().authenticated) {
    return false;
  }

  const counts = riotReadinessCounts(riotEvidence);
  return counts.summaryReadyCount > 0 && counts.evaluationReadyCount < counts.summaryReadyCount;
}

function scheduleRecentEvaluationPreparation(root, riotEvidence, context = getRouteContext()) {
  if (!shouldPrepareRecentEvaluations(riotEvidence, context)) {
    return;
  }

  const counts = riotReadinessCounts(riotEvidence);
  const key = `${context.pathname}:${counts.summaryReadyCount}:${counts.evaluationReadyCount}`;
  if (state.recentEvaluationPreparationKeys.has(key)) {
    return;
  }
  state.recentEvaluationPreparationKeys.add(key);

  Promise.resolve()
    .then(() => requestJson(`/api/matches/recent/evaluations?limit=${RECENT_EVALUATION_PREPARATION_LIMIT}`))
    .then(() => {
      if (window.location.pathname !== context.pathname || !root.isConnected) {
        return null;
      }
      return renderApp(root);
    })
    .catch((error) => {
      logClientTiming("client_recent_evaluation_preparation", {
        outcome: "failure",
        message: error instanceof Error ? error.message : "Evaluation preparation failed."
      });
    });
}

function refreshRecentGamesMessage(result) {
  const evidence = result?.riotEvidence ?? null;
  if (!evidence) {
    return "Recent games refresh failed.";
  }
  if (evidence.status === "riot_access_not_configured") {
    return "Riot unavailable or not configured.";
  }
  if (evidence.status === "recent_games_unavailable") {
    return "Riot unavailable.";
  }
  if (evidence.status === "parse_failed_retry_available") {
    return "Evaluation failed.";
  }
  if (evidence.status === "cooldown_active") {
    return "Cooldown active.";
  }
  const newCount = Number(result?.newCount ?? 0);
  if (newCount === 1) {
    return "1 new game found.";
  }
  if (newCount > 1) {
    return `${newCount} new games found.`;
  }
  return "No new games found.";
}

function bindRecentGamesRefresh(root) {
  root.querySelector("[data-refresh-recent-games]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const status = root.querySelector(".recent-games-refresh-status");
    button.disabled = true;
    if (status) {
      status.textContent = "Checking recent games...";
    }

    try {
      const result = await requestJson("/api/home/recent-games/refresh", { method: "POST" });
      state.recentGamesRefreshMessage = refreshRecentGamesMessage(result);
      if (status) {
        status.textContent = state.recentGamesRefreshMessage;
      }
      await renderApp(root);
    } catch (error) {
      state.recentGamesRefreshMessage = "";
      if (status) {
        const message = error instanceof Error ? error.message : "Refresh failed.";
        status.textContent = message.toLowerCase().includes("cooldown") ? "Cooldown active." : message;
      }
      button.disabled = false;
    }
  });
}

function matchSummaryTitle(review) {
  const summary = review?.matchSummary ?? {};
  const champion = summary.championName ?? "Unknown champion";
  const result = summary.result ?? "Unknown result";
  const queue = summary.queueLabel ?? (summary.queueId ? `Queue ${summary.queueId}` : "Unknown queue");
  return `${champion} · ${result} · ${queue}`;
}

function kdaLabel(summary = {}) {
  const kills = summary.kills ?? "?";
  const deaths = summary.deaths ?? "?";
  const assists = summary.assists ?? "?";
  return `${kills}/${deaths}/${assists}`;
}

function renderSignalList(signals, emptyText) {
  return `
    <section class="compact-list">
      ${(signals ?? []).length > 0
        ? signals.map((signal) => `<article class="compact-row"><span>${escapeHtml(signal)}</span></article>`).join("")
        : `<p class="muted">${escapeHtml(emptyText)}</p>`}
    </section>
  `;
}

function reviewMomentKey(deathIndex, signalId) {
  return `${deathIndex}:${signalId}`;
}

function mainReviewStorageKey(matchId) {
  return `riftsense.mainReviewFocus.${matchId}`;
}

function readStoredMainReviewFocus(matchId) {
  if (!matchId) return null;
  try {
    return JSON.parse(window.localStorage.getItem(mainReviewStorageKey(matchId)) || "null");
  } catch {
    return null;
  }
}

function writeStoredMainReviewFocus(matchId, focus) {
  if (!matchId || !focus) return;
  window.localStorage.setItem(mainReviewStorageKey(matchId), JSON.stringify({
    ...focus,
    selectedByUser: true
  }));
}

function reviewedMomentIndex(reviewedMoments = []) {
  return new Map(
    reviewedMoments.map((moment) => [reviewMomentKey(moment.deathIndex, moment.signalId), moment])
  );
}

function activeGoalName(review = {}) {
  const fromGoal = review.activeGoal?.title ?? review.activeGoalName ?? review.goalTitle ?? null;
  if (fromGoal) {
    return fromGoal;
  }
  const relevance = review.goalRelevance ?? review.relevanceReason ?? "";
  return relevance ? String(relevance).split("·")[0].trim() : "Active goal";
}

function activeGoalKind(goalName) {
  const normalized = String(goalName ?? "").toLowerCase();
  if (normalized.includes("die") || normalized.includes("death")) {
    return "die_less";
  }
  if (normalized.includes("farm") || normalized.includes("cs") || normalized.includes("income")) {
    return "farm";
  }
  if (normalized.includes("objective") || normalized.includes("dragon") || normalized.includes("baron") || normalized.includes("herald")) {
    return "objective";
  }
  if (normalized.includes("trade") || normalized.includes("lane") || normalized.includes("laning")) {
    return "laning";
  }
  return "unknown";
}

function isDeathReviewGoal(goalKind) {
  return goalKind === "die_less";
}

function reviewMomentTitle({ goalKind, death, primarySignal, index }) {
  const time = formatDeathTimestamp(death);
  if (isDeathReviewGoal(goalKind)) {
    return `Death at ${time}`;
  }
  if (goalKind === "objective" && primarySignal?.includes("objective")) {
    return tagLabel(primarySignal);
  }
  if (goalKind === "farm") {
    return primarySignal ? tagLabel(primarySignal) : "Review moment";
  }
  if (goalKind === "laning") {
    return primarySignal ? tagLabel(primarySignal) : "Review moment";
  }
  return index ? `Review moment ${index}` : "Review moment";
}

function reviewMomentProgressLabel({ goalKind, index, total }) {
  if (isDeathReviewGoal(goalKind)) {
    return `Death ${index} of ${total}`;
  }
  return `Moment ${index} of ${total}`;
}

function compactChampionList(names) {
  return [...new Set((names ?? []).map((name) => String(name ?? "").trim()).filter(Boolean))];
}

function deathEnemyParticipants(death) {
  return compactChampionList([
    death?.killerChampionName,
    ...(death?.assistingChampionNames ?? []),
    ...(death?.nearbyEnemyChampionNames ?? [])
  ]);
}

function deathKillParticipants(death) {
  return compactChampionList([
    death?.killerChampionName,
    ...(death?.assistingChampionNames ?? [])
  ]);
}

function deathAllyParticipants(death) {
  return compactChampionList([
    ...(death?.nearbyAllyChampionNames ?? []),
    ...(death?.alliedChampionNames ?? [])
  ]);
}

function roleIsBotLane(role) {
  const normalized = String(role ?? "").toLowerCase();
  return ["adc", "bottom", "bot", "support", "utility"].some((value) => normalized.includes(value));
}

function normalizeTeamSide(value) {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized.includes("blue") || normalized === "100") return "blue";
  if (normalized.includes("red") || normalized === "200") return "red";
  return "";
}

function teamRelativeLabel(label, side) {
  if (!label || !side) return label;
  const enemySide = side === "blue" ? "red" : "blue";
  return label
    .replaceAll(`${side}-side `, "allied ")
    .replaceAll(`${enemySide}-side `, "enemy ");
}

function rawDeathPosition(death = {}) {
  const position = death.position ?? death.victimPosition ?? death.coordinates ?? {};
  const x = Number(death.x ?? death.positionX ?? death.victimX ?? position.x ?? position.positionX);
  const y = Number(death.y ?? death.positionY ?? death.victimY ?? position.y ?? position.positionY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return { x, y };
}

function nearPoint(position, point, radius = 900) {
  return Math.hypot(position.x - point.x, position.y - point.y) <= radius;
}

export function mapDeathPositionToZone({ x, y, playerSide, teamSide, lane, role, nearestObjective, nearestCamp } = {}) {
  const position = { x: Number(x), y: Number(y) };
  const side = normalizeTeamSide(playerSide ?? teamSide);
  const laneHint = String(lane ?? role ?? "").toLowerCase();
  const result = {
    rawPosition: Number.isFinite(position.x) && Number.isFinite(position.y) ? position : null,
    absoluteZoneLabel: "unknown location",
    userRelativeZoneLabel: "unknown location",
    broadRegion: "unknown",
    laneRegion: "",
    jungleQuadrant: "",
    nearestLandmark: "",
    confidence: "low"
  };
  if (!result.rawPosition) return result;

  const landmarks = [
    { name: "dragon", label: "dragon pit", broadRegion: "objective", x: 9866, y: 4414, radius: 950 },
    { name: "baron", label: "Baron pit", broadRegion: "objective", x: 5007, y: 10471, radius: 950 },
    { name: "herald", label: "grubs / Herald pit", broadRegion: "objective", x: 5007, y: 10471, radius: 950 },
    { name: "blue buff", label: "blue buff", broadRegion: "jungle", x: 3900, y: 7900, radius: 750 },
    { name: "red buff", label: "red buff", broadRegion: "jungle", x: 7800, y: 3900, radius: 750 },
    { name: "raptors", label: "raptors", broadRegion: "jungle", x: 7200, y: 5200, radius: 650 },
    { name: "krugs", label: "krugs", broadRegion: "jungle", x: 8400, y: 2700, radius: 700 },
    { name: "gromp", label: "gromp", broadRegion: "jungle", x: 2100, y: 8400, radius: 700 },
    { name: "wolves", label: "wolves", broadRegion: "jungle", x: 3800, y: 6400, radius: 700 },
    { name: "pixel brush", label: "pixel brush area", broadRegion: "river", x: 6800, y: 8200, radius: 750 },
    { name: "pixel brush", label: "pixel brush area", broadRegion: "river", x: 8000, y: 6600, radius: 750 }
  ];
  const objectiveName = String(nearestObjective?.name ?? nearestObjective ?? "").toLowerCase();
  const campName = String(nearestCamp?.name ?? nearestCamp ?? "").toLowerCase();
  const landmark = landmarks.find((entry) =>
    nearPoint(position, entry, entry.radius) ||
    objectiveName.includes(entry.name) ||
    campName.includes(entry.name)
  );
  if (landmark) {
    result.absoluteZoneLabel = landmark.label;
    result.broadRegion = landmark.broadRegion;
    result.nearestLandmark = landmark.label;
    result.confidence = "high";
  }

  const inBase = position.x < 2100 && position.y < 2100
    ? "blue-side base / nexus area"
    : position.x > 12800 && position.y > 12800
      ? "red-side base / nexus area"
      : "";
  if (inBase) {
    result.absoluteZoneLabel = inBase;
    result.broadRegion = "base";
    result.confidence = "high";
  } else if (!landmark || landmark.broadRegion === "jungle") {
    const laneZones = [
      { label: "blue-side bot outer area", laneRegion: "bot outer area", laneName: "bot", test: position.x > 8800 && position.y < 3300 },
      { label: "blue-side bot inner area", laneRegion: "bot inner area", laneName: "bot", test: position.x > 6200 && position.x <= 8800 && position.y < 3600 },
      { label: "red-side bot outer area", laneRegion: "bot outer area", laneName: "bot", test: position.x > 11500 && position.y < 6200 && position.y >= 3300 },
      { label: "red-side bot inner area", laneRegion: "bot inner area", laneName: "bot", test: position.x > 11800 && position.y >= 6200 && position.y < 9200 },
      { label: "blue-side top outer area", laneRegion: "top outer area", laneName: "top", test: position.x < 3300 && position.y > 8800 },
      { label: "blue-side top inner area", laneRegion: "top inner area", laneName: "top", test: position.x < 3600 && position.y > 6200 && position.y <= 8800 },
      { label: "red-side top outer area", laneRegion: "top outer area", laneName: "top", test: position.x < 6200 && position.y > 11500 },
      { label: "red-side top inner area", laneRegion: "top inner area", laneName: "top", test: position.x >= 6200 && position.x < 9200 && position.y > 11800 },
      { label: "mid outer area", laneRegion: "mid outer area", laneName: "mid", test: Math.abs(position.x - position.y) < 900 && position.x > 3600 && position.x < 6200 },
      { label: "mid inner area", laneRegion: "mid inner area", laneName: "mid", test: Math.abs(position.x - position.y) < 900 && position.x >= 6200 && position.x < 9200 },
      { label: "top lane center / between outer towers", laneRegion: "top lane center", laneName: "top", test: position.x < 5200 && position.y > 9300 && position.y < 11600 },
      { label: "bot lane center / between outer towers", laneRegion: "bot lane center", laneName: "bot", test: position.x > 9300 && position.x < 11600 && position.y < 5200 },
      { label: "mid lane center / between outer towers", laneRegion: "mid lane center", laneName: "mid", test: Math.abs(position.x - position.y) < 900 && position.x >= 5200 && position.x <= 9300 }
    ];
    const laneZone = laneZones.find((zone) => zone.test);
    if (laneZone) {
      result.absoluteZoneLabel = laneZone.label;
      result.broadRegion = "lane";
      result.laneRegion = laneZone.laneRegion;
      result.confidence = laneHint.includes(laneZone.laneName) ? "high" : "medium";
    } else if (!landmark) {
      const riverLabel = position.y - position.x > 1600 && position.x > 4400 && position.x < 7800
        ? "top river"
        : position.x - position.y > 1600 && position.x > 7600 && position.x < 10800
          ? "bot river"
          : Math.abs(position.x - position.y) < 950 && position.x > 5600 && position.x < 9000
            ? "mid river"
            : "";
      if (riverLabel) {
        result.absoluteZoneLabel = riverLabel;
        result.broadRegion = "river";
        result.confidence = "medium";
      } else {
        const quadrant = position.x < 6000 && position.y < 7800
          ? "blue-side blue quadrant / west quadrant"
          : position.x >= 6000 && position.y < 6500
            ? "blue-side red quadrant / south quadrant"
            : position.x > 8800 && position.y >= 6500
              ? "red-side blue quadrant / east quadrant"
              : "red-side red quadrant / north quadrant";
        result.absoluteZoneLabel = quadrant;
        result.broadRegion = "jungle";
        result.jungleQuadrant = quadrant;
        result.confidence = "medium";
      }
    }
  }

  result.userRelativeZoneLabel = teamRelativeLabel(result.absoluteZoneLabel, side);
  if (result.nearestLandmark && !result.userRelativeZoneLabel.includes(result.nearestLandmark)) {
    result.userRelativeZoneLabel = `${result.userRelativeZoneLabel} near ${result.nearestLandmark}`;
  }
  return result;
}

function deathLocationZone(death = {}, context = {}) {
  const position = rawDeathPosition(death);
  if (!position) {
    return {
      rawPosition: null,
      absoluteZoneLabel: death.lane ?? death.positionLabel ?? death.location ?? "",
      userRelativeZoneLabel: death.positionLabel ?? death.location ?? death.lane ?? "",
      broadRegion: "",
      laneRegion: "",
      jungleQuadrant: "",
      nearestLandmark: "",
      confidence: "low"
    };
  }
  return mapDeathPositionToZone({
    ...position,
    playerSide: death.playerSide ?? death.teamSide ?? death.side ?? context.playerSide ?? context.teamSide,
    lane: death.lane ?? context.lane,
    role: death.role ?? death.participantRole ?? context.role,
    nearestObjective: death.nearestObjective ?? death.objectiveName,
    nearestCamp: death.nearestCamp
  });
}

function enemyParticipantCount(death) {
  return Math.max(
    Number(death?.nearbyEnemyCount ?? 0),
    deathEnemyParticipants(death).length,
    deathKillParticipants(death).length
  );
}

function alliedParticipantCount(death) {
  return 1 + Math.max(Number(death?.nearbyAllyCount ?? 0), deathAllyParticipants(death).length);
}

function normalizedRole(value) {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized.includes("support") || normalized.includes("utility")) return "support";
  if (normalized.includes("adc") || normalized.includes("bottom") || normalized === "bot") return "bot";
  if (normalized.includes("jungle")) return "jungle";
  if (normalized.includes("middle") || normalized.includes("mid")) return "mid";
  if (normalized.includes("top")) return "top";
  return normalized;
}

function enemyRolesInvolved(death = {}) {
  const direct = death.enemyRolesInvolved ?? death.involvedEnemyRoles ?? death.nearbyEnemyRoles ?? [];
  const roles = Array.isArray(direct) ? direct : [direct];
  if (death.killerRole) roles.push(death.killerRole);
  if (Array.isArray(death.assistingChampionRoles)) roles.push(...death.assistingChampionRoles);
  return [...new Set(roles.map(normalizedRole).filter(Boolean))];
}

function roleListLabel(roles) {
  const labels = {
    bot: "bot carry",
    support: "support",
    jungle: "jungle",
    mid: "mid",
    top: "top"
  };
  return roles.map((role) => labels[role] ?? role).join(" + ");
}

export function fightShapeDisplayLabel(fightShape = {}) {
  const enemyCount = Number(fightShape.enemyCount ?? fightShape.enemy ?? fightShape.enemies);
  const allyCount = Number(fightShape.alliedCount ?? fightShape.allyCount ?? fightShape.allies);
  if (!Number.isFinite(enemyCount) || !Number.isFinite(allyCount)) {
    return "Fight shape unknown";
  }
  const enemyLabel = `${enemyCount} ${enemyCount === 1 ? "enemy" : "enemies"}`;
  const allyLabel = `${allyCount} ${allyCount === 1 ? "ally" : "allies"}`;
  if (enemyCount > allyCount) {
    return `Outnumbered: ${enemyLabel} vs ${allyLabel}`;
  }
  if (enemyCount === allyCount) {
    return `Even fight: ${enemyLabel} vs ${allyLabel}`;
  }
  return `Allied numbers advantage: ${enemyLabel} vs ${allyLabel}`;
}

function compactFightShapeLabel(fightShape = {}) {
  const enemyCount = Number(fightShape.enemyCount ?? 0);
  const allyCount = Number(fightShape.allyCount ?? fightShape.alliedCount ?? 0);
  return Number.isFinite(enemyCount) && Number.isFinite(allyCount) && enemyCount > 0
    ? `${enemyCount} enemies vs ${allyCount} allies`
    : "Fight shape unknown";
}

function countNoun(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function laneContextDisplayLabel(id, death = {}) {
  if (death?.laneDeathContextLabel) return death.laneDeathContextLabel;
  const role = normalizedRole(death?.victimRole ?? death?.role ?? death?.participantRole);
  const lane = role === "top" ? "Top" : role === "mid" ? "Mid" : roleIsBotLane(role) ? "Bot" : "Lane";
  const labels = {
    bot_lane_2v2_death: "2v2 lane death",
    lane_2v2_death: "2v2 lane death",
    bot_lane_2v1_punish: "2v1 bot-lane punish",
    lane_2v1_death: "2v1 bot-lane punish",
    bot_lane_gank: "Bot-lane gank",
    lane_gank_death: `${lane}-lane gank`,
    bot_lane_roam: "Bot-lane roam/collapse",
    top_lane_roam: "Top-lane roam/collapse",
    mid_lane_roam: "Mid-lane roam/collapse",
    lane_roam_collapse: `${lane}-lane roam/collapse`,
    bot_lane_collapse_unknown: "Bot-lane collapse"
  };
  return labels[id] ?? null;
}

function fightOutcomeDisplayLabel(context = {}) {
  const alliedDeaths = Number(context.alliedDeaths ?? 0);
  const enemyDeaths = Number(context.enemyDeaths ?? 0);
  const totalDeaths = Number(context.totalDeaths ?? alliedDeaths + enemyDeaths);
  const duration = Number(context.durationSeconds ?? 0);
  const label = String(context.label ?? "");
  const counts = `${countNoun(alliedDeaths, "allied death")}, ${countNoun(enemyDeaths, "enemy death")}`;
  if (label === "pick_death") return alliedDeaths <= 1 && enemyDeaths === 0 ? "Outcome: you died" : `Outcome: pick - ${counts}`;
  if (label === "lost_skirmish") return `Outcome: lost local fight - ${counts}`;
  if (label === "even_trade") return `Outcome: local trade - ${counts}`;
  if (label === "won_fight_but_died") return `Outcome: won local fight but died - ${counts}`;
  if (label === "teamfight_death") return `Outcome: local teamfight - ${countNoun(totalDeaths, "total death")}${duration > 0 ? ` in ${duration}s` : ""}`;
  if (label === "stagger_death") return `Outcome: stagger - ${counts}`;
  return totalDeaths > 0 ? `Outcome: ${counts}` : "";
}

function matchupContextForDeath(death, context = {}) {
  const playerRole = normalizedRole(context.role ?? death?.role ?? death?.participantRole);
  const locationZone = context.locationZone ?? deathLocationZone(death, context);
  const phaseSeconds = Number(death?.timestampSeconds ?? 0);
  const gamePhase = phaseSeconds > 14 * 60 ? "post-lane" : "lane";
  const roles = enemyRolesInvolved(death);
  const expected = playerRole === "bot" || playerRole === "support"
    ? ["bot", "support"]
    : playerRole === "top" || playerRole === "mid"
      ? [playerRole]
      : [];
  const matchupParticipants = roles.filter((role) => expected.includes(role));
  const nonMatchupParticipants = roles.filter((role) => !expected.includes(role));
  return {
    playerRole,
    playerLane: playerRole === "bot" || playerRole === "support" ? "bot" : playerRole,
    expectedMatchupParticipants: expected,
    enemyParticipantsInvolved: roles,
    matchupParticipantsInvolved: matchupParticipants,
    nonMatchupEnemyParticipantsInvolved: nonMatchupParticipants,
    lanePartnerPresent: Boolean(death?.alliedLanePartnerPresent) || deathAllyParticipants(death).length > 0,
    gamePhase,
    locationZone
  };
}

function inferFightShape(death, context = {}) {
  if (death?.fightShape?.enemyCount || death?.fightShape?.notation) {
    const enemyCount = Number(death.fightShape.enemyCount ?? 0);
    const allyCount = Number(death.fightShape.alliedCount ?? 0);
    const laneLabel = laneContextDisplayLabel(death.laneDeathContext, death);
    return {
      id: death.laneDeathContext ?? "fight_context",
      label: laneLabel ?? death.fightShape.label ?? fightShapeDisplayLabel({ enemyCount, alliedCount: allyCount }),
      bucket: compactFightShapeLabel({ enemyCount, allyCount }),
      numericFightShape: death.fightShape.notation ?? `${death.fightShape.enemyCount ?? "?"}v${death.fightShape.alliedCount ?? "?"}`,
      fightInterpretation: death.fightShape.helperText ?? "",
      enemyCount,
      allyCount,
      helperText: fightShapeDisplayLabel({ enemyCount, alliedCount: allyCount }),
      category: "fight_shape"
    };
  }
  const enemyCount = enemyParticipantCount(death);
  const allyCount = alliedParticipantCount(death);
  const numericFightShape = `${enemyCount || "?"}v${allyCount || "?"}`;
  const matchup = matchupContextForDeath(death, context);
  const botLane = roleIsBotLane(matchup.playerRole);
  const lanePairFight = botLane && enemyCount === 2 && matchup.gamePhase === "lane";
  const laneMatchupRoles = matchup.matchupParticipantsInvolved.length === 2 ||
    matchup.enemyParticipantsInvolved.length === 0;

  if (lanePairFight && matchup.lanePartnerPresent && laneMatchupRoles) {
    return {
      id: "lane_2v2_death",
      label: "Bot lane 2v2 death",
      bucket: "2v2",
      numericFightShape,
      fightInterpretation: "lane fight",
      enemyCount,
      allyCount,
      category: "fight_shape"
    };
  }
  if (lanePairFight && !matchup.lanePartnerPresent && laneMatchupRoles) {
    return {
      id: "lane_2v1_death",
      label: "Bot lane 2v1 punish",
      bucket: "2v1",
      numericFightShape,
      fightInterpretation: "lane fight",
      enemyCount,
      allyCount,
      category: "fight_shape"
    };
  }
  if (enemyCount > allyCount) {
    const location = matchup.locationZone?.broadRegion;
    const interpretation = enemyCount >= 3 ? "collapse" : "outnumbered";
    return {
      id: "outnumbered_fight",
      label: enemyCount >= allyCount + 2 || location === "river" || location === "jungle"
        ? "Collapsed on by multiple enemies"
        : "Outnumbered fight",
      bucket: compactFightShapeLabel({ enemyCount, allyCount }),
      numericFightShape,
      fightInterpretation: interpretation,
      enemyCount,
      allyCount,
      helperText: fightShapeDisplayLabel({ enemyCount, alliedCount: allyCount }),
      category: "fight_shape"
    };
  }
  if (enemyCount === allyCount && enemyCount >= 3) {
    return {
      id: enemyCount >= 5 ? "teamfight" : "even_skirmish",
      label: enemyCount >= 5 ? `${numericFightShape} teamfight` : "Even skirmish",
      bucket: compactFightShapeLabel({ enemyCount, allyCount }),
      numericFightShape,
      fightInterpretation: enemyCount >= 5 ? "teamfight" : "even skirmish",
      enemyCount,
      allyCount,
      helperText: fightShapeDisplayLabel({ enemyCount, alliedCount: allyCount }),
      category: "fight_shape"
    };
  }
  if (enemyCount < allyCount && enemyCount > 0) {
    return {
      id: "allied_number_advantage",
      label: "Allied numbers advantage",
      bucket: compactFightShapeLabel({ enemyCount, allyCount }),
      numericFightShape,
      fightInterpretation: "advantaged fight",
      enemyCount,
      allyCount,
      helperText: fightShapeDisplayLabel({ enemyCount, alliedCount: allyCount }),
      category: "fight_shape"
    };
  }
  if (enemyCount === 1 && allyCount === 1) {
    return { id: "isolated_duel", label: "1v1 death", bucket: "1v1", numericFightShape, fightInterpretation: "lane fight", enemyCount, allyCount, category: "fight_shape" };
  }
  return { id: "fight_context", label: `${numericFightShape} fight`, bucket: numericFightShape, numericFightShape, fightInterpretation: "uncertain", enemyCount, allyCount, category: "fight_shape" };
}

function objectiveEvidence(death) {
  if (Array.isArray(death?.objectiveFacts) && death.objectiveFacts.length > 0) {
    const facts = death.objectiveFacts.map((objective) => {
      const seconds = Number(objective.secondsFromDeath ?? 0);
      const timing = seconds < 0
        ? `${Math.abs(seconds)}s before the death`
        : seconds > 0
          ? `${seconds}s after the death`
          : "at the death";
      if (objective.source === "timeline_event" && objective.teamRelation) {
        const relation = objective.teamRelation === "enemy" ? "Enemy team" : objective.teamRelation === "allied" ? "Allied team" : "Team";
        return `${relation} took ${objective.name ?? "objective"} ${timing}`;
      }
      if (seconds > 0) return `${objective.name ?? "Objective"} spawned ${seconds}s after this death`;
      if (seconds < 0) return `${objective.name ?? "Objective"} spawned ${Math.abs(seconds)}s before this death`;
      return `${objective.name ?? "Objective"} timing was active at this death`;
    });
    const reasons = death.objectiveFacts.map((objective) => {
      if (objective.reviewWindow === "setup") return `death happened before ${objective.name ?? "objective"} spawned`;
      if (objective.reviewWindow === "contest") return `death happened during ${objective.name ?? "objective"} timing`;
      return `death happened after the ${objective.name ?? "objective"} fight`;
    });
    return { facts, reasons };
  }
  const objectiveName = death?.objectiveName ?? death?.objective?.name ?? "objective";
  const beforeSpawn = Number(death?.objectiveSpawnSecondsAfterDeath ?? death?.objectiveSecondsUntilSpawn ?? NaN);
  const takenAfter = Number(death?.objectiveTakenSecondsAfterDeath ?? death?.objective?.takenSecondsAfterDeath ?? NaN);
  const facts = [];
  const reasons = [];
  if (Number.isFinite(beforeSpawn) && beforeSpawn >= 0) {
    facts.push(`${objectiveName} spawned ${Math.round(beforeSpawn)}s after the death`);
    reasons.push(`this happened ${Math.round(beforeSpawn)}s before ${objectiveName}`);
  }
  if (Number.isFinite(takenAfter) && takenAfter >= 0) {
    facts.push(`Enemy took ${objectiveName} ${Math.round(takenAfter)}s after the death`);
    reasons.push(`enemy took ${objectiveName} ${Math.round(takenAfter)}s after the death`);
  }
  return { facts, reasons };
}

function objectiveNameForDeath(death) {
  return death?.objectiveName ?? death?.objective?.name ?? "";
}

function objectiveEvidenceWithName(death) {
  const evidence = objectiveEvidence(death);
  return {
    ...evidence,
    objectiveName: objectiveNameForDeath(death) || "objective",
    supported: evidence.facts.length > 0
  };
}

function shownLevelEvidence(death, { includeRaw = false } = {}) {
  const victimLevel = Number(death?.victimLevel ?? 0);
  const killerLevel = Number(death?.killerLevel ?? 0);
  const levelLead = killerLevel - victimLevel;
  const breakpoint = (death?.enemyLevelUpsBeforeDeath ?? [])
    .map((event) => Number(event?.level))
    .find((level) => [2, 3, 6].includes(level));
  if (breakpoint) {
    return `Enemy level ${breakpoint} timing`;
  }
  if (levelLead >= 2) {
    return `Enemy level lead: ${victimLevel} vs ${killerLevel}`;
  }
  if (includeRaw && victimLevel > 0 && killerLevel > 0) {
    return `Levels: ${victimLevel} vs ${killerLevel}`;
  }
  return "";
}

function alliedCoverReason(death) {
  const allyCount = alliedParticipantCount(death);
  const enemyCount = enemyParticipantCount(death);
  const explicitNearbyAllies = Number(death?.nearbyAllyCount ?? NaN);
  const allyNames = deathAllyParticipants(death);
  if (allyCount > enemyCount && enemyCount > 0) {
    return "allies were nearby; review whether the first engage happened outside their peel/trade range";
  }
  if ((Number.isFinite(explicitNearbyAllies) && explicitNearbyAllies === 0) || allyNames.length === 0 && death?.nearbyAllyCount === 0) {
    return "no nearby allied cover detected";
  }
  if (allyNames.length > 0 || Number.isFinite(explicitNearbyAllies)) {
    return "ally proximity was detected, but functional peel/trade range is unclear";
  }
  return "allied cover unclear";
}

function enemyParticipantByRole(death, role) {
  return (death?.enemyParticipants ?? []).find((entry) => normalizedRole(entry?.role) === role) ?? null;
}

function laneInterventionFact(fightShape, death) {
  const id = fightShape?.id ?? "";
  if (id === "bot_lane_gank" || id === "lane_gank_death") {
    const jungler = enemyParticipantByRole(death, "jungle");
    return `Enemy jungle involved: ${jungler?.championName ?? "detected"}`;
  }
  if (id.includes("roam")) {
    const joined = (death?.enemyParticipants ?? []).find((entry) => {
      const role = normalizedRole(entry?.role);
      return role && !["jungle"].includes(role) && !isExpectedLaneEnemyRole(death, role);
    });
    return joined ? `Enemy ${normalizedRole(joined.role)} joined: ${joined.championName ?? "detected"}` : "Non-lane enemy joined";
  }
  return "";
}

function isExpectedLaneEnemyRole(death, role) {
  const playerRole = normalizedRole(death?.victimRole ?? death?.role ?? death?.participantRole);
  if (roleIsBotLane(playerRole)) return role === "bot" || role === "support";
  return role === playerRole;
}

function compactUncertaintyNote(lines = [], fallback = "Needs replay check") {
  const normalized = [...new Set(lines.map((line) => String(line ?? "").trim()).filter(Boolean))];
  const uncertainty = normalized.filter((line) =>
    /unclear|not detected|manual review|no clear|not enough/i.test(line)
  );
  if (uncertainty.length <= 1) {
    return normalized[0] ?? fallback;
  }
  const objective = uncertainty.some((line) => /objective/i.test(line));
  const ally = uncertainty.some((line) => /allied|cover|ally/i.test(line));
  if (objective && ally) return "Replay check: confirm objective relevance and ally position.";
  if (objective) return "Replay check: confirm objective relevance.";
  if (ally) return "Replay check: confirm whether allied cover could affect the fight.";
  return fallback;
}

function filterInterpretationReasons(reasons = []) {
  const fillerPatterns = [
    /lane matchup participants were involved/i,
    /objective relevance unclear/i,
    /use this when the replay shows a different cause/i,
    /relevant because it was relevant/i
  ];
  const useful = reasons
    .map((reason) => String(reason ?? "").trim())
    .filter((reason) => reason && !fillerPatterns.some((pattern) => pattern.test(reason)));
  return useful.length > 1 ? [compactUncertaintyNote(useful), ...useful.filter((reason) => !/unclear|not detected|manual review|no clear/i.test(reason))].slice(0, 2) : useful;
}

function deathConsequenceFacts(death = {}) {
  const objectiveImpactFacts = [];
  const economicImpactFacts = [];
  const waveImpactFacts = [];
  const consequenceFacts = [];
  const confidence = [];
  const objective = objectiveEvidenceWithName(death);
  const objectiveTakenAfter = Number(death?.objectiveTakenSecondsAfterDeath ?? death?.objective?.takenSecondsAfterDeath ?? NaN);
  if (objective.supported && Number.isFinite(objectiveTakenAfter) && objectiveTakenAfter >= 0) {
    objectiveImpactFacts.push(`Follow-up: enemy took ${objective.objectiveName} ${Math.round(objectiveTakenAfter)}s after this death.`);
    confidence.push("medium");
  }
  const plateLabel = death?.turretPlateLostLane ?? death?.plateLostLane ?? death?.turretPlateLane ?? "";
  if (death?.turretPlateLostAfterDeath || death?.plateLostAfterDeath || death?.turretPlatesLostAfterDeath) {
    objectiveImpactFacts.push(`Follow-up: ${plateLabel ? `${plateLabel} ` : ""}outer plate fell during the death window.`);
    confidence.push("medium");
  }
  const turretLabel = death?.turretDestroyedLane ?? death?.towerDestroyedLane ?? death?.turretLane ?? "";
  if (death?.turretDestroyedAfterDeath || death?.towerDestroyedAfterDeath) {
    objectiveImpactFacts.push(`Follow-up: ${turretLabel ? `${turretLabel} ` : ""}turret fell after this death.`);
    confidence.push("medium");
  }
  const shutdownGold = Number(death?.shutdownGoldGiven ?? death?.shutdownGold ?? NaN);
  if (Number.isFinite(shutdownGold) && shutdownGold > 0) {
    economicImpactFacts.push(`Kill impact: ${Math.round(shutdownGold)}g shutdown given.`);
    confidence.push("high");
  }
  const killGold = Number(death?.killGoldGiven ?? death?.killGold ?? NaN);
  if (Number.isFinite(killGold) && killGold > 0) {
    economicImpactFacts.push(`Kill impact: ${Math.round(killGold)}g kill gold given.`);
    confidence.push("high");
  }
  if (death?.waveCrashedWhileDead || death?.waveCrashedAfterDeath) {
    waveImpactFacts.push("Possible lane cost: wave crashed while you were dead.");
    confidence.push("low");
  } else if (death?.waveStateAfterDeath || death?.waveStateAtDeath) {
    waveImpactFacts.push(`Possible wave cost: ${death.waveStateAfterDeath ?? death.waveStateAtDeath}.`);
    confidence.push("low");
  }
  const missedMinions = Number(death?.missedMinionEstimate ?? death?.missedMinionsWhileDead ?? NaN);
  if (Number.isFinite(missedMinions) && missedMinions > 0) {
    waveImpactFacts.push(`Possible wave cost: about ${Math.round(missedMinions)} minions during the death window.`);
    confidence.push("low");
  }
  if (death?.teamfightStartedWhileDead || death?.objectiveFightStartedWhileDead) {
    consequenceFacts.push("After this death: a teamfight/objective fight started while you were dead.");
    confidence.push("medium");
  }
  if (death?.resetWindowMissed || death?.recallWindowMissed) {
    consequenceFacts.push("Possible reset cost: recall/reset window may have been missed.");
    confidence.push("low");
  }
  const all = [...objectiveImpactFacts, ...economicImpactFacts, ...waveImpactFacts, ...consequenceFacts];
  return {
    consequenceFacts: all,
    economicImpactFacts,
    objectiveImpactFacts,
    waveImpactFacts,
    confidence: confidence.includes("high") ? "high" : confidence.includes("medium") ? "medium" : all.length ? "low" : ""
  };
}

function repeatedEnemySignature(death) {
  const participants = deathKillParticipants(death).sort((left, right) => left.localeCompare(right));
  return participants.length > 0 ? participants.join(" + ") : "";
}

function candidateCauseCategory(id) {
  if (id === "solo_death_candidate" || id === "isolated_forward_death_candidate") return "walked_without_cover";
  if (id.includes("cover") || id === "lane_2v1_death" || id === "bot_lane_2v1_punish") return "walked_without_cover";
  if (id.includes("outnumbered") || id.includes("collapse")) return "outnumbered_fight";
  if (id.includes("gank") || id.includes("roam")) return "outnumbered_fight";
  if (id.includes("objective")) return "objective_setup_mistake";
  if (id.includes("stayed")) return "stayed_too_long";
  if (id === "no_flash_punish") return "not_preventable";
  return "other";
}

function candidateFrom({ id, label, category, confidence = "Low", facts = [], reasons = [], affectedDeathIds = [], sourceSignals = [], causeCategory }) {
  return {
    id,
    label,
    category,
    confidence,
    supportingFacts: [...new Set(facts)].filter(Boolean),
    interpretationReasons: filterInterpretationReasons([...new Set(reasons)].filter(Boolean)),
    affectedDeathIds,
    sourceSignals,
    causeCategory: causeCategory ?? candidateCauseCategory(id),
    nextGameRule: nextGameRuleForLabel(label)
  };
}

function reviewMomentFactorOptions(death, goalKind, context = {}) {
  const invalidLabels = new Set([
    "death_count",
    "observed_pattern",
    "raw_signal_counts",
    "selected_for_evaluation_ready",
    "goal_relevant_signals"
  ]);
  const factors = [];
  const seenLabels = new Set();
  const addFactor = (candidate) => {
    const id = candidate?.id;
    const label = candidate?.label;
    const normalizedId = String(id ?? "").toLowerCase();
    const normalizedLabel = String(label ?? "").trim();
    if (!normalizedLabel || invalidLabels.has(normalizedId) || normalizedId.includes("candidate") && !tagLabelForDeath(id, death)) {
      return;
    }
    if (normalizedLabel.toLowerCase().includes("observed pattern") ||
      normalizedLabel.toLowerCase().includes("candidate") ||
      normalizedLabel.toLowerCase().includes("raw signal counts") ||
      normalizedLabel.toLowerCase().includes("selected for evaluation ready") ||
      normalizedLabel.toLowerCase().includes("goal-relevant signals")) {
      return;
    }
    if (seenLabels.has(normalizedLabel.toLowerCase())) {
      return;
    }
    seenLabels.add(normalizedLabel.toLowerCase());
    factors.push({ ...candidate, label: normalizedLabel });
  };

  const deathIndex = Number(death?.deathIndex ?? 0);
  const fightShape = inferFightShape(death, context);
  const locationZone = context.locationZone ?? deathLocationZone(death, context);
  const matchupContext = matchupContextForDeath(death, { ...context, locationZone });
  if (fightShape.id === "lane_2v2_death" || fightShape.id === "lane_2v1_death" ||
    fightShape.id === "bot_lane_2v2_death" || fightShape.id === "bot_lane_2v1_punish" ||
    fightShape.id === "bot_lane_gank" || fightShape.id === "bot_lane_roam" || fightShape.id === "bot_lane_collapse_unknown" ||
    fightShape.id === "outnumbered_fight" && fightShape.enemyCount >= 3 ||
    fightShape.id === "even_skirmish") {
    const involvedRoles = roleListLabel(matchupContext.enemyParticipantsInvolved);
    addFactor(candidateFrom({
      id: fightShape.id,
      label: fightShape.label,
      category: "fight_shape",
      confidence: fightShape.id === "outnumbered_fight" ? "High" : "Medium",
      facts: [
        fightShape.helperText || fightShapeDisplayLabel(fightShape),
        `Enemy participants: ${deathEnemyParticipants(death).join(", ") || fightShape.enemyCount}`,
        `Allied participants nearby: ${deathAllyParticipants(death).join(", ") || "not detected"}`,
        laneInterventionFact(fightShape, death)
      ].filter(Boolean),
      reasons: fightShape.id === "lane_2v2_death" || fightShape.id === "bot_lane_2v2_death"
        ? [`This was an even 2v2 by count${involvedRoles ? ` against enemy ${involvedRoles}` : ""}, so the replay question is execution/trade timing, not outnumbering.`]
        : fightShape.id === "lane_2v1_death" || fightShape.id === "bot_lane_2v1_punish"
          ? [involvedRoles ? `Enemy ${involvedRoles} fought while allied lane partner was not detected.` : "Enemy lane pressure landed while allied lane partner was not detected."]
          : fightShape.id === "bot_lane_gank"
            ? ["enemy jungler was involved in a bot-lane death during lane phase"]
            : fightShape.id === "bot_lane_roam"
              ? ["a non-lane enemy joined the bot-lane death during lane phase"]
              : fightShape.id === "bot_lane_collapse_unknown"
                ? ["three or more enemies were involved, but the data does not identify gank versus roam"]
        : fightShape.id === "even_skirmish"
          ? ["this was even by participant count; review engage timing instead of treating it as outnumbered"]
            : ["enemy numbers exceeded allied participants close enough to influence the death"],
      affectedDeathIds: deathIndex ? [deathIndex] : [],
      sourceSignals: death?.tags ?? []
    }));
  }

  if (locationZone.broadRegion === "river" && matchupContext.enemyParticipantsInvolved.includes("jungle")) {
    addFactor(candidateFrom({
      id: "river_jungle_skirmish",
      label: "River skirmish with jungle involved",
      category: "location_context",
      confidence: "Medium",
      facts: [`Death happened in ${locationZone.userRelativeZoneLabel}`, "Enemy jungler was involved"],
      reasons: ["river location makes objective/vision pressure more likely than lane trading"],
      affectedDeathIds: deathIndex ? [deathIndex] : [],
      sourceSignals: death?.tags ?? []
    }));
  } else if (["top", "mid"].includes(matchupContext.playerRole) && matchupContext.nonMatchupEnemyParticipantsInvolved.includes("jungle") && matchupContext.gamePhase === "lane") {
    addFactor(candidateFrom({
      id: "lane_gank_collapse",
      label: "Lane gank/collapse",
      category: "matchup_context",
      confidence: "Medium",
      facts: [`Enemy ${roleListLabel(matchupContext.enemyParticipantsInvolved)} were involved`],
      reasons: [`enemy ${roleListLabel(matchupContext.nonMatchupEnemyParticipantsInvolved)} joined the ${matchupContext.playerLane} matchup`],
      affectedDeathIds: deathIndex ? [deathIndex] : [],
      sourceSignals: death?.tags ?? []
    }));
  } else if (locationZone.broadRegion === "jungle" && locationZone.userRelativeZoneLabel?.startsWith("enemy ")) {
    addFactor(candidateFrom({
      id: "enemy_jungle_forward_death",
      label: "Forward death in enemy jungle",
      category: "location_context",
      confidence: "Medium",
      facts: [`Death happened in ${locationZone.userRelativeZoneLabel}`],
      reasons: ["enemy jungle position points to invade or collapse context"],
      affectedDeathIds: deathIndex ? [deathIndex] : [],
      sourceSignals: death?.tags ?? []
    }));
  } else if (locationZone.laneRegion?.includes("center") && matchupContext.matchupParticipantsInvolved.length > 0) {
    addFactor(candidateFrom({
      id: "lane_center_matchup_fight",
      label: "Lane fight against matchup opponent",
      category: "location_context",
      confidence: "Medium",
      facts: [`Death happened in ${locationZone.userRelativeZoneLabel}`, `Enemy ${roleListLabel(matchupContext.matchupParticipantsInvolved)} involved`],
      reasons: ["lane-center location and matchup participants point to a lane fight"],
      affectedDeathIds: deathIndex ? [deathIndex] : [],
      sourceSignals: death?.tags ?? []
    }));
  }

  for (const tag of death?.tags ?? []) {
    if (tag === "multi_enemy_collapse_candidate" && Number(death?.nearbyEnemyCount ?? 3) < 3) {
      continue;
    }
    if ((tag === "enemy_level_up_recently_candidate" || tag === "level_up_all_in_candidate") &&
      !shownLevelEvidence(death)) {
      continue;
    }
    if (tag === "objective_setup_death_candidate" || tag === "objective_window_candidate" || tag === "objective_exit_death_candidate") {
      const objective = objectiveEvidenceWithName(death);
      if (objective.facts.length === 0) {
        continue;
      }
      addFactor(candidateFrom({
        id: tag,
        label: tag === "objective_exit_death_candidate" ? `Died after ${objective.objectiveName} window ended` : `Died before ${objective.objectiveName} setup completed`,
        category: "objective_timing",
        confidence: "Medium",
        facts: objective.facts,
        reasons: objective.reasons,
        affectedDeathIds: deathIndex ? [deathIndex] : [],
        sourceSignals: [tag]
      }));
      continue;
    }
    addFactor(candidateFrom({
      id: tag,
      label: tagLabelForDeath(tag, death),
      category: "signal",
      confidence: "Low",
      facts: reviewMomentEvidenceFacts(death, goalKind).slice(0, 3),
      reasons: reviewMomentReasons(death, context.tagCounts ?? {}) ? [reviewMomentReasons(death, context.tagCounts ?? {})] : [],
      affectedDeathIds: deathIndex ? [deathIndex] : [],
      sourceSignals: [tag]
    }));
  }

  const repeatedSignature = repeatedEnemySignature(death);
  const repeatedCount = Number(context.repeatedEnemySignatures?.get(repeatedSignature) ?? 0);
  if (repeatedSignature && repeatedCount > 1) {
    addFactor(candidateFrom({
      id: `repeated_enemy_${repeatedSignature.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      label: `Repeatedly killed by ${repeatedSignature}`,
      category: "repeated_enemy",
      confidence: repeatedCount >= 3 ? "High" : "Medium",
      facts: [`${repeatedCount} deaths involved ${repeatedSignature}`],
      reasons: ["the same enemy involvement repeated across multiple deaths"],
      affectedDeathIds: context.deathsByRepeatedSignature?.get(repeatedSignature) ?? [],
      causeCategory: "other",
      sourceSignals: ["killer_assist_signature"]
    }));
  }

  if (Number(death?.summonerSpellFlashCooldownSeconds ?? death?.flashCooldownSeconds ?? 0) > 0) {
    addFactor(candidateFrom({
      id: "no_flash_punish",
      label: "Died while flash was unavailable",
      category: "summoner_spell",
      confidence: "Medium",
      facts: ["Flash was unavailable during the death window"],
      reasons: ["escape options were reduced before the fight started"],
      affectedDeathIds: deathIndex ? [deathIndex] : []
    }));
  }

  factors.push(candidateFrom({
    id: "manual_other_pattern",
    label: "Other pattern not listed",
    category: "manual_override",
    confidence: "Manual",
    facts: ["Generated candidates did not explain this death"],
    reasons: ["The generated options do not fit."],
    affectedDeathIds: deathIndex ? [deathIndex] : [],
    causeCategory: "other"
  }));

  return factors.length > 1
    ? factors
    : [
        candidateFrom({
          id: "no_clear_deterministic_cause",
          label: "No clear pattern yet",
          category: "uncertain",
          confidence: "Low",
          facts: reviewMomentEvidenceFacts(death, goalKind),
          reasons: ["review this death manually before confirming a pattern"],
          affectedDeathIds: deathIndex ? [deathIndex] : [],
          causeCategory: "other"
        }),
        factors[0]
      ];
}

function reviewMomentEvidenceFacts(death, goalKind) {
  const facts = [];
  const tags = new Set(death?.tags ?? []);
  const locationZone = deathLocationZone(death, { role: death?.role ?? death?.participantRole });
  const fightShape = inferFightShape(death, { role: death?.role ?? death?.participantRole, locationZone });
  const matchup = matchupContextForDeath(death, { role: death?.role ?? death?.participantRole, locationZone });
  const killer = death?.killerChampionName ? `Killed by ${death.killerChampionName}` : "";
  const assists = (death?.assistingChampionNames ?? []).length
    ? `Assisted by ${(death.assistingChampionNames ?? []).join(", ")}`
    : "";
  const levels = shownLevelEvidence(death);
  const participantRoles = roleListLabel(matchup.enemyParticipantsInvolved);

  if (killer) facts.push(killer);
  if (assists) facts.push(assists);
  facts.push(fightShape.helperText || fightShapeDisplayLabel(fightShape));
  const outcome = fightOutcomeDisplayLabel(death?.localFightOutcomeContext ?? death?.fightOutcomeContext);
  if (outcome) facts.push(outcome);
  if (death?.gamePhaseLabel) facts.push(`Phase: ${death.gamePhaseLabel}`);
  if (locationZone?.userRelativeZoneLabel) facts.push(`Death happened in ${locationZone.userRelativeZoneLabel}`);
  const intervention = laneInterventionFact(fightShape, death);
  if (intervention) facts.push(intervention);
  else if (participantRoles) facts.push(`Enemy ${participantRoles} were involved`);
  facts.push(`Enemy participants: ${deathEnemyParticipants(death).join(", ") || fightShape.enemyCount}`);
  const allies = deathAllyParticipants(death).join(", ");
  facts.push(`Allied participants nearby: ${allies || "not detected"}`);
  if (tags.has("objective_setup_death_candidate") || tags.has("objective_window_candidate")) {
    const objective = objectiveEvidenceWithName(death);
    if (objective.facts.length > 0) {
      facts.push(...objective.facts);
    }
  }
  if (tags.has("objective_exit_death_candidate")) {
    const objective = objectiveEvidenceWithName(death);
    if (objective.facts.length > 0) {
      facts.push(...objective.facts);
    }
  }
  if (tags.has("solo_death_candidate") || tags.has("isolated_forward_death_candidate")) {
    if (deathAllyParticipants(death).length === 0 || Number(death?.nearbyAllyCount ?? NaN) === 0) {
      facts.push("Allied participants nearby: not detected");
    }
  }
  if (tags.has("multi_enemy_collapse_candidate") && Number(death?.nearbyEnemyCount ?? 0) >= 3) {
    const enemies = (death?.nearbyEnemyChampionNames ?? []).slice(0, 5).join(", ");
    facts.push(enemies ? `Nearby enemies: ${enemies}` : "Multiple enemies nearby");
  }
  if (tags.has("enemy_level_up_recently_candidate") || tags.has("level_up_all_in_candidate")) {
    const levelsHit = (death?.enemyLevelUpsBeforeDeath ?? [])
      .map((event) => Number(event?.level))
      .filter((level) => [2, 3, 6].includes(level));
    if (levelsHit.length > 0) {
      facts.push(`Enemy level ${levelsHit[0]} timing`);
    }
  }
  if (levels) {
    facts.push(levels);
  }

  if (death?.nearbyDeathWindowContext?.totalDeaths > 0) {
    facts.push(`Nearby timeline: ${countNoun(Number(death.nearbyDeathWindowContext.totalDeaths), "other death")} happened within 30s; not enough position data to confirm same fight.`);
  }

  return normalizeDeathFacts([...(death?.evidenceSections?.knownFromData ?? []), ...facts], death, fightShape)
    .slice(0, 8);
}

function normalizeDeathFacts(facts, death = {}, fightShape = {}) {
  const primaryLabels = new Set([
    String(death?.laneDeathContextLabel ?? "").toLowerCase(),
    String(laneContextDisplayLabel(death?.laneDeathContext, death) ?? "").toLowerCase()
  ].filter(Boolean));
  const seen = new Set();
  let hasFightShape = false;
  let hasEnemyParticipants = false;
  let hasAlliedParticipants = false;

  return facts
    .map((fact) => typeof fact === "string" ? fact.trim() : "")
    .filter(Boolean)
    .filter((fact) => !/review whether|replay|unclear|could affect|objective relevance|use this when|whether an objective/i.test(fact))
    .filter((fact) => {
      const normalized = fact.toLowerCase().replace(/\s+/g, " ");
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      if (primaryLabels.has(normalized.replace(/^lane context:\s*/, ""))) return false;
      if (/^lane context:/i.test(fact)) return false;
      if (/^(even fight|outnumbered|allied numbers advantage):/i.test(fact) && fightShape?.helperText) return false;
      if (/^fight shape:/i.test(fact)) {
        if (hasFightShape) return false;
        hasFightShape = true;
      }
      if (/^enemy participants:/i.test(fact)) {
        if (hasEnemyParticipants) return false;
        hasEnemyParticipants = true;
      }
      if (/^allied participants nearby:/i.test(fact)) {
        if (hasAlliedParticipants) return false;
        hasAlliedParticipants = true;
      }
      return true;
    });
}

function reviewMomentEventSummary(death, goalKind) {
  if (isDeathReviewGoal(goalKind)) {
    const killer = death?.killerChampionName ? `Killed by ${death.killerChampionName}` : "Death event";
    return `${killer} at ${formatDeathTimestamp(death)}`;
  }
  return `Observed window at ${formatDeathTimestamp(death)}`;
}

function primarySignalForDeath(death) {
  return (death?.tags ?? []).find((tag) => tag !== "death_count") ?? "death_count";
}

function renderDeathFacts(deaths, reviewedMoments = []) {
  if (!Array.isArray(deaths) || deaths.length === 0) {
    return '<p class="muted">No deterministic death facts are available for this match.</p>';
  }

  return `
    <section class="death-list">
      ${deaths.map((death, index) => {
        const deathIndex = Number(death.deathIndex ?? index + 1);
        const assists = (death.assistingChampionNames ?? []).join(", ");
        const enemies = (death.nearbyEnemyChampionNames ?? []).join(", ");
        const detectedSignalIds = (death.tags ?? []).length > 0 ? death.tags : ["death_count"];
        const tags = detectedSignalIds.map(tagLabel).join(", ");
        const levels = [
          death.victimLevel ? `Victim level ${death.victimLevel}` : "",
          death.killerLevel ? `Killer level ${death.killerLevel}` : ""
        ].filter(Boolean).join(" · ");
        return `
          <article class="death-row">
            <p><strong>${escapeHtml(formatDeathTimestamp(death))}</strong> Killed by ${escapeHtml(death.killerChampionName ?? "Unknown")}${assists ? `, assisted by ${escapeHtml(assists)}` : ""}</p>
            <p class="muted">Detected signals: ${escapeHtml(tags || "None")}</p>
            ${enemies ? `<p class="muted">Nearby enemies: ${escapeHtml(enemies)}</p>` : ""}
            ${levels ? `<p class="muted">${escapeHtml(levels)}</p>` : ""}
          </article>
        `;
      }).join("")}
    </section>
  `;
}

function renderTagCounts(counts) {
  const entries = Object.entries(counts ?? {})
    .filter(([, count]) => Number(count) > 0)
    .sort((left, right) => Number(right[1]) - Number(left[1]) || left[0].localeCompare(right[0]));

  return renderSignalList(
    entries.map(([tag, count]) => `${count} ${tagLabel(tag)}`),
    "No deterministic tags are available yet."
  );
}

function reviewMomentSignals(death) {
  return (death?.tags ?? []).map((tag) => ({
    id: tag,
    label: tagLabelForDeath(tag, death)
  }));
}

function levelBreakpointLabel(death) {
  const levels = (death?.enemyLevelUpsBeforeDeath ?? [])
    .map((event) => Number(event?.level))
    .filter((level) => [2, 3, 6].includes(level));
  if (levels.length > 0) {
    return `the enemy hit level ${levels[0]} before you died`;
  }
  return "an enemy level breakpoint was detected before the death";
}

function reviewMomentReasons(death, tagCounts = {}) {
  const reasons = [];
  const tags = new Set(death?.tags ?? []);
  const objective = objectiveEvidenceWithName(death);
  if (objective.supported && tags.has("objective_setup_death_candidate")) {
    reasons.push(`this happened during ${objective.objectiveName} setup`);
  } else if (objective.supported && tags.has("objective_exit_death_candidate")) {
    reasons.push(`this happened after the ${objective.objectiveName} window ended`);
  } else if (objective.supported && tags.has("objective_window_candidate")) {
    reasons.push(`this happened near ${objective.objectiveName} timing`);
  }
  if (tags.has("solo_death_candidate") || tags.has("isolated_forward_death_candidate")) {
    reasons.push(alliedCoverReason(death));
  }
  if (tags.has("multi_enemy_collapse_candidate") && Number(death?.nearbyEnemyCount ?? 0) >= 3) {
    const fightShape = inferFightShape(death, { role: death?.role ?? death?.participantRole });
    reasons.push(fightShape.enemyCount > fightShape.allyCount
      ? "multiple enemies could reach the position before enough allies could affect it"
      : "multiple enemies were involved, but the fight was not outnumbered by participant count");
  }
  if ((tags.has("enemy_level_up_recently_candidate") || tags.has("level_up_all_in_candidate")) &&
    shownLevelEvidence(death)) {
    reasons.push(levelBreakpointLabel(death));
  }
  const repeatedTag = [...tags].find((tag) => Number(tagCounts[tag] ?? 0) > 1);
  if (repeatedTag) {
    reasons.push(`${Number(tagCounts[repeatedTag])} deaths shared ${tagLabelForDeath(repeatedTag, death).toLowerCase()}`);
  }
  return reasons.length > 0 ? `${reasons.slice(0, 2).join(". ")}.` : "";
}

function reviewQuestionForDeath(death) {
  const tags = new Set(death?.tags ?? []);
  const objective = objectiveEvidenceWithName(death);
  if (objective.supported && (tags.has("objective_setup_death_candidate") || tags.has("objective_window_candidate"))) {
    return `Were you early, grouped, or late to ${objective.objectiveName} setup?`;
  }
  if (objective.supported && tags.has("objective_exit_death_candidate")) {
    return `Was ${objective.objectiveName} already over when you stayed or walked forward?`;
  }
  if (tags.has("solo_death_candidate") || tags.has("isolated_forward_death_candidate")) {
    return "Who was close enough to cover you when you walked forward?";
  }
  if (tags.has("multi_enemy_collapse_candidate")) {
    return "Did you know multiple enemies could reach this position?";
  }
  if (tags.has("enemy_level_up_recently_candidate") || tags.has("level_up_all_in_candidate")) {
    return "Did the enemy hit the level breakpoint before you committed?";
  }
  return "What were you trying to accomplish before this death?";
}

function scoreReviewDeath(death, tagCounts = {}) {
  const tags = new Set(death?.tags ?? []);
  let score = tags.size * 10;
  if (Number(death?.nearbyEnemyCount ?? 0) >= 3 && tags.has("multi_enemy_collapse_candidate")) score += 35;
  if (tags.has("objective_window_candidate") || tags.has("objective_setup_death_candidate") || tags.has("objective_exit_death_candidate")) score += 30;
  if ((tags.has("enemy_level_up_recently_candidate") || tags.has("level_up_all_in_candidate")) &&
    shownLevelEvidence(death)) score += 25;
  if (tags.has("solo_death_candidate") || tags.has("isolated_forward_death_candidate")) score += 20;
  if (Number(death?.killerLevel ?? 0) > Number(death?.victimLevel ?? 0)) score += 15;
  for (const tag of tags) {
    if (Number(tagCounts[tag] ?? 0) > 1) score += 12;
  }
  return score;
}

function confidenceLabel(count, total) {
  if (count >= 3 || count >= Math.max(2, Math.ceil(total * 0.5))) {
    return "High";
  }
  if (count >= 2) {
    return "Medium";
  }
  return "Low";
}

function nextGameRuleForLabel(label) {
  const normalized = String(label ?? "").toLowerCase();
  if (normalized.includes("2v2 lane")) {
    return "Next game: review whether you and lane partner committed to the same trade.";
  }
  if (normalized.includes("2v1 lane")) {
    return "Next game: do not contest the lane pair until your partner can cover the wave.";
  }
  if (normalized.includes("repeatedly killed")) {
    return "Next game: mark the repeated enemy threat before walking into their range.";
  }
  if (normalized.includes("cover")) {
    return "Next game: stop at the wave line when nearby allies cannot cover you.";
  }
  if (normalized.includes("missing enemies")) {
    return "Next game: pause before walking forward when enemy positions are unknown.";
  }
  if (normalized.includes("objective")) {
    return "Next game: arrive early enough to set vision before contesting space.";
  }
  if (normalized.includes("level")) {
    return "Next game: back up when the lane can hit the next level first.";
  }
  if (normalized.includes("flash")) {
    return "Next game: play one screen shorter while flash is unavailable.";
  }
  return "Next game: pause the replay and write the safer alternative before queueing again.";
}

function buildPatternSummaries(moments, reviewedMoments = []) {
  const byLabel = new Map();
  for (const moment of moments) {
    const reviewedMoment = reviewedMomentForUiMoment(moment, reviewedMoments);
    const selectedFactorId = reviewedMoment ? selectedPatternIdForMoment(moment, reviewedMoment) : "";
    for (const factor of moment.factorOptions.filter((option) =>
      !["no_clear_deterministic_cause", "manual_other_pattern"].includes(option.id)
    )) {
      const entry = byLabel.get(factor.label) ?? {
        id: factor.id,
        label: factor.label,
        count: 0,
        suggestedCount: 0,
        confirmedCount: 0,
        needsManualReviewCount: 0,
        times: [],
        evidenceRows: []
      };
      entry.count += 1;
      entry.suggestedCount += 1;
      entry.times.push(moment.time);
      const selectedHere = reviewedMoment && selectedFactorId === factor.id;
      if (selectedHere && reviewStatusUi(reviewedMoment).label === "Reviewed") {
        entry.confirmedCount += 1;
      }
      if (selectedHere && reviewStatusUi(reviewedMoment).label === "Needs manual review") {
        entry.needsManualReviewCount += 1;
      }
      entry.evidenceRows.push({
        deathIndex: moment.deathIndex,
        time: moment.time,
        status: !reviewedMoment ? "suggested" : selectedHere ? reviewStatusUi(reviewedMoment).label.toLowerCase() : "suggested"
      });
      byLabel.set(factor.label, entry);
    }
  }
  return [...byLabel.values()].sort((left, right) =>
    right.confirmedCount - left.confirmedCount ||
    right.suggestedCount - left.suggestedCount ||
    left.label.localeCompare(right.label)
  );
}

function findMomentByDeathIndex(moments, deathIndex) {
  return moments.find((moment) => Number(moment.deathIndex) === Number(deathIndex));
}

function buildManualMainReview(focus, moments) {
  const moment = findMomentByDeathIndex(moments, focus?.mainReviewDeathIndex);
  return {
    type: "manual",
    title: focus?.mainReviewLabel || "Manual review focus",
    diagnosis: focus?.mainReviewNote || "The generated options were not enough for this game.",
    impact: "",
    evidence: moment ? [`Death ${moment.deathIndex} at ${moment.time}`] : [],
    takeaway: "Next game: write the replay-confirmed rule before queueing again.",
    confidence: "Manual",
    selectedByUser: true
  };
}

function buildMainReview(moments, patterns, selectedFocus = null) {
  if (moments.length === 0) {
    return null;
  }
  if (selectedFocus?.selectedByUser) {
    if (selectedFocus.mainReviewType === "death") {
      const moment = findMomentByDeathIndex(moments, selectedFocus.mainReviewDeathIndex);
      const factor = moment?.factorOptions.find((option) => option.id === selectedFocus.mainReviewPatternId) ??
        moment?.factorOptions.find((option) => option.id !== "manual_other_pattern") ??
        moment?.factorOptions[0];
      if (moment && factor) {
        return {
          type: "death",
          title: selectedFocus.mainReviewLabel || factor.label,
          diagnosis: `User-selected focus: Death ${moment.deathIndex} at ${moment.time}.`,
          impact: moment.consequenceFacts?.[0] ?? "",
          evidence: (moment.evidenceFacts?.length ? moment.evidenceFacts : [`Death ${moment.deathIndex} at ${moment.time}`]).slice(0, 4),
          takeaway: factor.nextGameRule ?? nextGameRuleForLabel(factor.label),
          confidence: factor.confidence ?? "Manual",
          selectedByUser: true
        };
      }
    }
    if (selectedFocus.mainReviewType === "pattern") {
      const pattern = patterns.find((entry) => entry.id === selectedFocus.mainReviewPatternId || entry.label === selectedFocus.mainReviewLabel);
      if (pattern) {
        return {
          type: "pattern",
          title: pattern.label,
          diagnosis: pattern.confirmedCount > 0
            ? `User-selected focus: confirmed by your review - ${pattern.confirmedCount} reviewed ${pattern.confirmedCount === 1 ? "moment" : "moments"} match this pattern.`
            : `User-selected focus: suggested from detected evidence - ${pattern.suggestedCount} ${pattern.suggestedCount === 1 ? "death" : "deaths"} match this pattern.`,
          impact: "",
          evidence: pattern.evidenceRows.slice(0, 4).map((row) => `Death ${row.deathIndex} · ${row.time} · ${row.status}`),
          takeaway: nextGameRuleForLabel(pattern.label),
          confidence: pattern.confirmedCount > 0 ? confidenceLabel(pattern.confirmedCount, moments.length) : "Suggested",
          selectedByUser: true
        };
      }
    }
    if (selectedFocus.mainReviewType === "manual") {
      return buildManualMainReview(selectedFocus, moments);
    }
  }
  const repeatedPattern = patterns.find((pattern) => pattern.confirmedCount > 1) ?? patterns.find((pattern) => pattern.suggestedCount > 1);
  if (repeatedPattern) {
    return {
      type: "pattern",
      title: repeatedPattern.label,
      diagnosis: repeatedPattern.confirmedCount > 0
        ? `Confirmed: ${repeatedPattern.confirmedCount} reviewed moments match this pattern.`
        : `Suggested: ${repeatedPattern.suggestedCount} deaths match this pattern.`,
      impact: repeatedPattern.confirmedCount > 0 ? "Confirmed by your review." : "Suggested from detected evidence.",
      evidence: repeatedPattern.evidenceRows.slice(0, 4).map((row) => `Death ${row.deathIndex} · ${row.time} · ${row.status}`),
      takeaway: nextGameRuleForLabel(repeatedPattern.label),
      confidence: repeatedPattern.confirmedCount > 0 ? confidenceLabel(repeatedPattern.confirmedCount, moments.length) : "Suggested"
    };
  }
  const moment = [...moments].sort((left, right) => right.priority - left.priority || left.deathIndex - right.deathIndex)[0];
  const factor = moment.factorOptions.find((option) => option.id !== "no_clear_deterministic_cause") ?? moment.factorOptions[0];
  const uncertain = factor?.id === "no_clear_deterministic_cause";
  return {
    type: "death",
    title: uncertain ? `Review Death ${moment.deathIndex} manually` : factor.label,
    diagnosis: uncertain ? "No clear pattern yet." : `${factor.label} was the clearest review issue.`,
    impact: moment.consequenceFacts?.[0] ?? "",
    evidence: (moment.evidenceFacts?.length ? moment.evidenceFacts : [`Death ${moment.deathIndex} at ${moment.time}`]).slice(0, 4),
    takeaway: uncertain ? "Next game: pause this replay moment and write what information was missing." : nextGameRuleForLabel(factor.label),
    confidence: uncertain ? "Low" : confidenceLabel(1, moments.length)
  };
}

export function buildMatchReviewPlan(review) {
  const deaths = Array.isArray(review?.deathEvents) ? review.deathEvents : [];
  const tagCounts = review?.deterministicTagCounts ?? {};
  const goalName = activeGoalName(review);
  const goalKind = activeGoalKind(goalName);
  const reviewContext = {
    role: review?.matchSummary?.role ?? review?.matchSummary?.lane ?? review?.role,
    lane: review?.matchSummary?.lane ?? review?.lane,
    playerSide: review?.matchSummary?.teamSide ?? review?.matchSummary?.side ?? review?.playerSide ?? review?.teamSide,
    tagCounts
  };
  const selectedMainFocus = review?.selectedMainReviewFocus ?? readStoredMainReviewFocus(review?.matchId);
  if (!review?.evaluationSummary || deaths.length === 0) {
    return {
      activeGoalName: goalName,
      goalKind,
      primaryPattern: null,
      mainReview: null,
      patterns: [],
      reviewMoments: [],
      debugSignalCounts: Object.entries(tagCounts)
        .filter(([, count]) => Number(count) > 0)
        .map(([label, count]) => ({ label: tagLabel(label), count: Number(count), sampleTimes: [] }))
    };
  }

  const rankedDeaths = deaths
    .map((death) => ({ death, priority: scoreReviewDeath(death, tagCounts) }))
    .sort((left, right) => right.priority - left.priority || Number(left.death.timestampSeconds ?? 0) - Number(right.death.timestampSeconds ?? 0));
  const primaryTag = Object.entries(tagCounts)
    .filter(([tag, count]) => tag !== "death_count" && Number(count) > 1)
    .sort((left, right) => Number(right[1]) - Number(left[1]) || left[0].localeCompare(right[0]))[0] ?? null;
  const primaryDeaths = primaryTag ? deaths.filter((death) => (death.tags ?? []).includes(primaryTag[0])) : rankedDeaths.map((entry) => entry.death);
  const repeatedEnemySignatures = new Map();
  const deathsByRepeatedSignature = new Map();
  deaths.forEach((death, index) => {
    const signature = repeatedEnemySignature(death);
    if (!signature) return;
    repeatedEnemySignatures.set(signature, (repeatedEnemySignatures.get(signature) ?? 0) + 1);
    deathsByRepeatedSignature.set(signature, [
      ...(deathsByRepeatedSignature.get(signature) ?? []),
      Number(death.deathIndex ?? index + 1)
    ]);
  });

  const reviewMoments = rankedDeaths
    .sort((left, right) => Number(left.death.timestampSeconds ?? 0) - Number(right.death.timestampSeconds ?? 0))
    .map(({ death, priority }, index) => {
      const deathIndex = Number(death.deathIndex ?? index + 1);
      const primarySignal = primarySignalForDeath(death);
      const locationZone = deathLocationZone(death, reviewContext);
      const deathWithIndex = { ...death, deathIndex, role: reviewContext.role, locationZone };
      const fightShape = inferFightShape(deathWithIndex, { ...reviewContext, locationZone });
      const factorOptions = reviewMomentFactorOptions(deathWithIndex, goalKind, {
        ...reviewContext,
        locationZone,
        repeatedEnemySignatures,
        deathsByRepeatedSignature
      });
      const consequence = deathConsequenceFacts(deathWithIndex);
      const primaryFactor = factorOptions.find((option) =>
        !["no_clear_deterministic_cause", "manual_other_pattern"].includes(option.id)
      ) ?? factorOptions[0];
      return {
        id: reviewMomentKey(deathIndex, primarySignal),
        death: deathWithIndex,
        deathIndex,
        time: formatDeathTimestamp(death),
        timeWindow: formatDeathTimestamp(death),
        priority,
        primarySignal,
        primaryLabel: primaryFactor?.label ?? "No clear pattern yet",
        statusLabel: primaryFactor?.id === "no_clear_deterministic_cause" ? "Needs manual review" : "Pattern detected",
        fightShape,
        locationZone,
        headline: reviewMomentTitle({ goalKind, death, primarySignal, index: index + 1 }),
        progressLabel: reviewMomentProgressLabel({ goalKind, index: index + 1, total: deaths.length }),
        detectedSignals: reviewMomentSignals(deathWithIndex),
        eventSummary: reviewMomentEventSummary(deathWithIndex, goalKind),
        evidenceFacts: reviewMomentEvidenceFacts(deathWithIndex, goalKind),
        consequenceFacts: consequence.consequenceFacts,
        economicImpactFacts: consequence.economicImpactFacts,
        objectiveImpactFacts: consequence.objectiveImpactFacts,
        waveImpactFacts: consequence.waveImpactFacts,
        consequenceConfidence: consequence.confidence,
        factorOptions,
        defaultFactorId: factorOptions[0]?.id ?? primarySignal,
        whyReview: primaryFactor?.interpretationReasons?.[0] ?? compactUncertaintyNote([reviewMomentReasons(deathWithIndex, tagCounts)], "Needs replay check."),
        reviewQuestion: reviewQuestionForDeath(deathWithIndex),
        deterministicLesson: Number(death?.killerLevel ?? 0) > Number(death?.victimLevel ?? 0)
          ? "Enemy level lead before contesting space."
          : undefined
      };
    });
  const patterns = buildPatternSummaries(reviewMoments, review?.reviewedMoments ?? []);

  return {
    activeGoalName: goalName,
    goalKind,
    mainReview: buildMainReview(reviewMoments, patterns, selectedMainFocus),
    patterns,
    primaryPattern: primaryTag ? {
      id: primaryTag[0],
      title: tagLabel(primaryTag[0]),
      confidence: Number(primaryTag[1]) >= 3 ? "high" : "medium",
      summary: `${Number(primaryTag[1])} moments share this pattern.`,
      deathTimes: primaryDeaths.slice(0, 3).map(formatDeathTimestamp),
      supportingSignals: reviewMomentSignals(primaryDeaths[0] ?? {}).map((signal) => signal.label).slice(0, 4)
    } : null,
    reviewMoments,
    debugSignalCounts: Object.entries(tagCounts)
      .filter(([, count]) => Number(count) > 0)
      .sort((left, right) => Number(right[1]) - Number(left[1]) || left[0].localeCompare(right[0]))
      .map(([label, count]) => ({
        label: tagLabel(label),
        count: Number(count),
        sampleTimes: deaths.filter((death) => (death.tags ?? []).includes(label)).slice(0, 3).map(formatDeathTimestamp)
      }))
  };
}

function reviewedMomentForUiMoment(moment, reviewedMoments = []) {
  const momentsByKey = reviewedMomentIndex(reviewedMoments);
  return momentsByKey.get(reviewMomentKey(moment.deathIndex, moment.primarySignal)) ??
    reviewedMoments.find((entry) =>
      Number(entry?.deathIndex) === Number(moment.deathIndex) &&
      String(entry?.signalId ?? "") === "manual_other_pattern"
    );
}

function uiMomentIsComplete(moment, reviewedMoments = []) {
  return Boolean(reviewedMomentForUiMoment(moment, reviewedMoments));
}

function selectedPatternIdForMoment(moment, reviewedMoment = null) {
  const selected = reviewedMoment?.selectedPatternId ?? reviewedMoment?.patternId ?? reviewedMoment?.factorId ?? "";
  if (selected && moment.factorOptions.some((option) => option.id === selected)) {
    return selected;
  }
  if (reviewedMoment?.causeCategory) {
    const byCategory = moment.factorOptions.find((option) => option.causeCategory === reviewedMoment.causeCategory);
    if (byCategory) return byCategory.id;
  }
  return moment.defaultFactorId;
}

function reviewStatusUi(reviewedMoment) {
  if (!reviewedMoment) {
    return {
      label: "Unreviewed",
      badgeClass: "context-badge review-status-badge is-unreviewed",
      reviewedPressed: "false",
      needsReviewPressed: "false",
      reviewedClass: "button secondary",
      needsReviewClass: "button secondary"
    };
  }
  const needsReview = ["unsure", "dismissed", "skipped", "needs_review"].includes(String(reviewedMoment.status ?? "").toLowerCase());
  return {
    label: needsReview ? "Needs manual review" : "Reviewed",
    badgeClass: `context-badge review-status-badge ${needsReview ? "is-needs-review" : "is-reviewed"}`,
    reviewedPressed: needsReview ? "false" : "true",
    needsReviewPressed: needsReview ? "true" : "false",
    reviewedClass: needsReview ? "button secondary" : "button is-selected",
    needsReviewClass: needsReview ? "button warning is-selected" : "button secondary"
  };
}

function reviewProgressSummary(plan, reviewedMoments = []) {
  const momentsByKey = reviewedMomentIndex(reviewedMoments);
  return plan.reviewMoments.reduce((summary, moment) => {
    const reviewedMoment = momentsByKey.get(reviewMomentKey(moment.deathIndex, moment.primarySignal)) ??
      reviewedMoments.find((entry) =>
        Number(entry?.deathIndex) === Number(moment.deathIndex) &&
        String(entry?.signalId ?? "") === "manual_other_pattern"
      );
    if (!reviewedMoment) {
      summary.notReviewed += 1;
    } else if (["unsure", "dismissed", "skipped", "needs_review"].includes(String(reviewedMoment.status ?? "").toLowerCase())) {
      summary.needsManualReview += 1;
    } else {
      summary.reviewed += 1;
    }
    summary.total += 1;
    return summary;
  }, { reviewed: 0, needsManualReview: 0, notReviewed: 0, total: 0 });
}

function reviewCompletionSummary(plan, reviewedMoments = []) {
  const counts = new Map();
  const momentsByKey = reviewedMomentIndex(reviewedMoments);
  for (const moment of plan.reviewMoments) {
    const reviewedMoment = momentsByKey.get(reviewMomentKey(moment.deathIndex, moment.primarySignal)) ??
      reviewedMomentForUiMoment(moment, reviewedMoments);
    const factorId = selectedPatternIdForMoment(moment, reviewedMoment);
    const factor = moment.factorOptions.find((option) => option.id === factorId) ?? moment.factorOptions[0];
    const label = factor?.label ?? "No clear deterministic cause";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const patterns = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([label, count]) => ({ label, count }));
  const primary = patterns[0]?.label ?? "No clear deterministic cause";
  return {
    patterns,
    focus: plan.mainReview?.title ? `${plan.activeGoalName}: ${plan.mainReview.title}` : `${plan.activeGoalName}: ${primary}`
  };
}

function assessmentState(review, { currentMatchTriaged = false } = {}) {
  const target = Number(review?.assessment?.target ?? INITIAL_ASSESSMENT_TARGET);
  const games = review?.assessment?.candidateGames ?? [];
  const currentIndex = games.findIndex((game) => game.matchId === review?.matchId);
  const completedIds = new Set(review?.assessment?.completedMatchIds ?? []);
  if (currentMatchTriaged && review?.matchId) {
    completedIds.add(review.matchId);
  }
  const completedCount = Math.min(target, Math.max(Number(review?.assessment?.completedCount ?? 0), completedIds.size));
  const availableCount = games.length || Number(review?.assessment?.availableCount ?? 0);
  const afterCurrent = currentIndex >= 0
    ? games.slice(currentIndex + 1).find((game) => !completedIds.has(game.matchId))
    : null;
  const nextGame = afterCurrent ?? games.find((game) => !completedIds.has(game.matchId)) ?? null;
  return {
    target,
    availableCount,
    currentNumber: Math.min(completedCount + 1, target),
    completedCount,
    remainingCount: Math.max(0, Math.min(target, availableCount || target) - completedCount),
    nextGame,
    thresholdReached: completedCount >= target,
    assessmentComplete: Boolean(review?.assessment?.assessmentComplete) || completedCount >= Math.min(target, availableCount || target) || !nextGame
  };
}

function renderAssessmentProgress(review, complete) {
  const assessment = assessmentState(review);
  const completedCount = complete ? Math.max(assessment.completedCount, assessment.currentNumber) : assessment.completedCount;
  const currentChampion = review?.matchSummary?.championName ?? review?.championName ?? "Current game";
  const currentResult = review?.matchSummary?.result ?? review?.result ?? "result unknown";
  const availableText = assessment.availableCount > 0 && assessment.availableCount < assessment.target
    ? `${completedCount} of ${assessment.availableCount} available games reviewed`
    : `${completedCount} complete · ${Math.max(0, assessment.target - completedCount)} remaining`;
  return `
    <article class="panel review-progress-panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Initial assessment</p>
          <h3>${escapeHtml(availableText)}</h3>
        </div>
        <span class="context-badge">Current game: ${escapeHtml(currentChampion)} ${escapeHtml(String(currentResult).toLowerCase())}</span>
      </div>
      <p class="muted">${assessment.availableCount > 0 && assessment.availableCount < assessment.target
        ? "Review more games as they become available."
        : "After 3 reviewed games, RiftSense will suggest first mini-goals."}</p>
    </article>
  `;
}

function renderReviewChecklist(plan, reviewedMoments = []) {
  const momentsByKey = reviewedMomentIndex(reviewedMoments);
  const summary = reviewProgressSummary(plan, reviewedMoments);
  return `
    <aside class="panel review-checklist-panel" aria-labelledby="review-checklist-title">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Review progress</p>
          <h3 id="review-checklist-title">${summary.reviewed + summary.needsManualReview} of ${summary.total} triaged</h3>
        </div>
      </div>
      <div class="review-checklist-counts">
        <span class="review-count-pill is-reviewed">${summary.reviewed} Reviewed</span>
        <span class="review-count-pill is-needs-review">${summary.needsManualReview} Needs manual review</span>
        <span class="review-count-pill is-unreviewed">${summary.notReviewed} Not reviewed</span>
      </div>
      <div class="review-checklist-items">
        ${plan.reviewMoments.map((moment) => {
          const reviewedMoment = momentsByKey.get(reviewMomentKey(moment.deathIndex, moment.primarySignal)) ??
            reviewedMomentForUiMoment(moment, reviewedMoments);
          const status = reviewStatusUi(reviewedMoment);
          return `
            <button class="review-checklist-item ${reviewedMoment ? "is-complete" : "is-open"}" type="button" data-jump-to-death="${escapeHtml(String(moment.deathIndex))}">
              <span>Death ${escapeHtml(String(moment.deathIndex))} · ${escapeHtml(moment.time)}</span>
              <span>${escapeHtml(status.label)}</span>
            </button>
          `;
        }).join("")}
      </div>
    </aside>
  `;
}

function renderReviewCompletion(plan, review, context = getRouteContext()) {
  const summary = reviewCompletionSummary(plan, review.reviewedMoments);
  const progress = reviewProgressSummary(plan, review.reviewedMoments);
  const assessment = assessmentState(review, { currentMatchTriaged: true });
  const completeCount = assessment.completedCount;
  const assessmentComplete = assessment.assessmentComplete;
  const nextHref = assessment.nextGame?.matchId
    ? toAppHref(`/review?matchId=${encodeURIComponent(assessment.nextGame.matchId)}`, context)
    : null;
  return `
    <article class="panel review-moment-card" data-review-complete>
      <p class="eyebrow">Review complete</p>
      <h3>${escapeHtml(assessmentComplete ? "Initial assessment game complete" : "Game review complete")}</h3>
      <p class="muted">${escapeHtml(progress.reviewed)} reviewed · ${escapeHtml(progress.needsManualReview)} needs manual review · ${escapeHtml(progress.total)} total</p>
      <section class="compact-list">
        ${summary.patterns.length > 0
          ? summary.patterns.map((pattern) => `
            <article class="compact-row">
              <span>${escapeHtml(pattern.label)}</span>
              <span class="compact-row-value">${escapeHtml(String(pattern.count))} ${pattern.count === 1 ? "moment" : "moments"}</span>
            </article>
          `).join("")
          : '<p class="muted">No repeated pattern was recorded.</p>'}
      </section>
      <div class="next-focus-box">
        <p class="eyebrow">Selected main focus · Next-game focus</p>
        <h4>${escapeHtml(summary.focus)}</h4>
      </div>
      ${assessmentComplete ? `
        <div class="next-focus-box">
          <p class="eyebrow">Next step</p>
          <h4>${escapeHtml(completeCount < assessment.target ? "All available assessment games reviewed." : "Initial assessment complete.")}</h4>
        </div>
      ` : ""}
      <div class="action-row">
        ${nextHref && !assessmentComplete
          ? `<a class="button" href="${escapeHtml(nextHref)}">Go to next assessment game</a>`
          : ""}
        ${assessmentComplete
          ? `<a class="button" href="${escapeHtml(toAppHref("/", context) ?? "/")}">${escapeHtml(completeCount < assessment.target ? "All available assessment games reviewed" : "Complete initial assessment")}</a>`
          : `<a class="button secondary" href="${escapeHtml(toAppHref("/", context) ?? "/")}">Back to dashboard</a>`}
        <button class="button secondary" type="button" data-change-main-focus>Change main focus</button>
      </div>
    </article>
  `;
}

function currentReviewMomentIndex(plan, reviewedMoments = [], matchId = "") {
  const total = plan.reviewMoments.length;
  if (total === 0) {
    return 0;
  }
  const stored = Number(state.reviewMomentCursorByMatch.get(matchId));
  if (Number.isFinite(stored)) {
    return Math.max(0, Math.min(total - 1, stored));
  }
  const firstOpen = plan.reviewMoments.findIndex((moment) => !uiMomentIsComplete(moment, reviewedMoments));
  return firstOpen >= 0 ? firstOpen : total - 1;
}

function renderMainReview(plan) {
  const main = plan.mainReview;
  if (!main) {
    return `
      <article class="panel main-review-card" data-main-review>
        <p class="eyebrow">Main Review</p>
        <h3>No deaths detected</h3>
        <p class="muted">There are no death moments to review for this match.</p>
      </article>
    `;
  }

  return `
    <article class="panel main-review-card" data-main-review>
      <div class="panel-header">
        <div>
          <p class="eyebrow">Main Review</p>
          <h3>${escapeHtml(main.title)}</h3>
        </div>
        <span class="context-badge">${escapeHtml(main.confidence)} confidence</span>
      </div>
      <p class="review-event-summary">${escapeHtml(main.diagnosis)}</p>
      ${main.impact ? `<p class="muted">${escapeHtml(main.impact)}</p>` : ""}
      <div class="review-evidence-facts">
        <p class="eyebrow">Evidence</p>
        <ul>
          ${main.evidence.map((fact) => `<li>${escapeHtml(fact)}</li>`).join("")}
        </ul>
      </div>
      <div class="next-focus-box">
        <p class="eyebrow">Review takeaway</p>
        <h4>${escapeHtml(main.takeaway)}</h4>
      </div>
      <div class="action-row">
        <button class="button secondary" type="button" data-change-main-focus>Change focus</button>
      </div>
    </article>
  `;
}

function deathContextFacts(moment) {
  const death = moment.death ?? {};
  const facts = [];
  const allies = (death.nearbyAllyChampionNames ?? []).slice(0, 4).join(", ");
  const enemies = (death.nearbyEnemyChampionNames ?? []).slice(0, 4).join(", ");
  const location = moment.locationZone?.userRelativeZoneLabel ?? death.lane ?? death.positionLabel ?? death.location ?? "";
  if (death.gamePhaseLabel) facts.push(death.gamePhaseLabel);
  if (moment.fightShape?.helperText) {
    facts.push(moment.fightShape.helperText);
  } else if (moment.fightShape?.bucket) {
    facts.push(fightShapeDisplayLabel(moment.fightShape));
  }
  const outcome = fightOutcomeDisplayLabel(death?.localFightOutcomeContext ?? death?.fightOutcomeContext);
  if (outcome) facts.push(outcome);
  if (location) facts.push(location);
  if (allies) facts.push(`Nearby allies: ${allies}`);
  if (enemies) facts.push(`Nearby enemies: ${enemies}`);
  if (Number(death?.summonerSpellFlashCooldownSeconds ?? death?.flashCooldownSeconds ?? 0) > 0) {
    facts.push("Flash unavailable");
  }
  const levelEvidence = shownLevelEvidence(death);
  if (levelEvidence) {
    facts.push(levelEvidence);
  }
  if (death.shutdownGold || death.goldSwing) {
    facts.push(death.shutdownGold ? `Shutdown: ${death.shutdownGold}g` : `Gold swing: ${death.goldSwing}g`);
  }
  return facts;
}

function renderDeathReviewList(plan, review) {
  const reviewedMoments = review.reviewedMoments ?? [];
  if (plan.reviewMoments.length === 0) {
    return "";
  }

  return `
    <section class="review-section" aria-labelledby="death-review-list-title">
      <div class="section-heading compact-section-heading">
        <div>
          <p class="eyebrow">Complete Death Review</p>
          <h3 id="death-review-list-title">All ${plan.reviewMoments.length} deaths</h3>
        </div>
      </div>
      <section class="death-review-list">
        ${plan.reviewMoments.map((moment) => {
          const facts = moment.evidenceFacts?.length ? moment.evidenceFacts : ["No clear pattern yet - review this death manually."];
          const reviewedMoment = reviewedMomentForUiMoment(moment, reviewedMoments);
          const statusUi = reviewStatusUi(reviewedMoment);
          const selectedFactor = selectedPatternIdForMoment(moment, reviewedMoment);
          const selectedCandidate = moment.factorOptions.find((option) => option.id === selectedFactor) ?? moment.factorOptions[0];
          const reasons = selectedCandidate?.interpretationReasons?.length
            ? selectedCandidate.interpretationReasons
            : [moment.reviewQuestion || "Needs replay check."];
          const replayQuestions = moment.death?.evidenceSections?.replayCanAnswer?.length
            ? moment.death.evidenceSections.replayCanAnswer
            : reasons;
          const impactFacts = moment.consequenceFacts?.length ? moment.consequenceFacts : [];
          const contextFacts = deathContextFacts(moment);
          const locationLabel = moment.locationZone?.userRelativeZoneLabel || "";
          return `
            <article class="death-review-item ${reviewedMoment ? "is-reviewed" : "is-unreviewed"}" id="death-${escapeHtml(String(moment.deathIndex))}" data-death-review-item data-death-index="${escapeHtml(String(moment.deathIndex))}">
              <div class="death-review-head">
                <div>
                  <p class="eyebrow">Death ${escapeHtml(String(moment.deathIndex))} · ${escapeHtml(moment.time)}</p>
                  <h4>${escapeHtml(moment.primaryLabel === "No clear deterministic cause" ? "No clear pattern yet" : moment.primaryLabel)}</h4>
                </div>
                <span class="${escapeHtml(statusUi.badgeClass)}">${escapeHtml(statusUi.label)}</span>
              </div>
              ${reviewedMoment ? `<p class="reviewed-summary-line">${escapeHtml(statusUi.label)} · ${escapeHtml(selectedCandidate?.label ?? "Pattern recorded")}</p>` : ""}
              ${locationLabel ? `<p class="death-location-line">Location: ${escapeHtml(locationLabel)}</p>` : ""}
              ${contextFacts.length > 0 ? `
                <div class="death-context-row">
                  ${contextFacts.map((fact) => `<span>${escapeHtml(fact)}</span>`).join("")}
                </div>
              ` : ""}
              <div class="death-review-expanded">
                <div class="review-evidence-facts">
                  <p class="eyebrow">Facts</p>
                  <ul>
                    ${facts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join("")}
                  </ul>
                </div>
                ${impactFacts.length > 0 ? `
                  <div class="review-evidence-facts">
                    <p class="eyebrow">Impact</p>
                    <ul>
                      ${impactFacts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join("")}
                    </ul>
                  </div>
                ` : ""}
                <div class="review-evidence-facts">
                  <p class="eyebrow">${impactFacts.length > 0 ? "Review question" : "Replay can answer"}</p>
                  <ul>
                    ${(impactFacts.length > 0 ? [moment.reviewQuestion] : replayQuestions).map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}
                  </ul>
                </div>
              </div>
              <div class="review-factor-intro">
                <h5>What type of death was this?</h5>
                <p>Pick the pattern that best matches the replay. Use “Other pattern not listed” if the generated options are wrong.</p>
              </div>
              <div class="review-factor-grid">
                ${moment.factorOptions.map((factor, factorIndex) => `
                  <label class="review-factor-option">
                    <input type="radio" name="review-factor-${escapeHtml(String(moment.deathIndex))}" value="${escapeHtml(factor.id)}" data-cause-category="${escapeHtml(factor.causeCategory ?? "other")}"${factor.id === selectedFactor || !selectedFactor && factorIndex === 0 ? " checked" : ""} />
                    <span>${escapeHtml(factor.label === "No clear deterministic cause" ? "Needs manual review" : factor.label)}</span>
                  </label>
                `).join("")}
              </div>
              <div class="action-row">
                <button class="button secondary" type="button" data-set-main-focus-death="${escapeHtml(String(moment.deathIndex))}" data-focus-label="${escapeHtml(selectedCandidate?.label ?? moment.primaryLabel)}" data-pattern-id="${escapeHtml(selectedCandidate?.id ?? "")}">Set as main focus</button>
                <button class="${escapeHtml(statusUi.reviewedClass)}" type="button" aria-pressed="${escapeHtml(statusUi.reviewedPressed)}" data-review-moment-action="reviewed" data-death-index="${escapeHtml(String(moment.deathIndex))}" data-death-timestamp-seconds="${escapeHtml(String(Number(moment.death?.timestampSeconds ?? 0)))}" data-signal-id="${escapeHtml(moment.primarySignal)}">Mark reviewed</button>
                <button class="${escapeHtml(statusUi.needsReviewClass)}" type="button" aria-pressed="${escapeHtml(statusUi.needsReviewPressed)}" data-review-moment-action="skipped" data-death-index="${escapeHtml(String(moment.deathIndex))}" data-death-timestamp-seconds="${escapeHtml(String(Number(moment.death?.timestampSeconds ?? 0)))}" data-signal-id="${escapeHtml(moment.primarySignal)}">Needs review</button>
              </div>
            </article>
          `;
        }).join("")}
      </section>
    </section>
  `;
}

function renderObservedPatterns(plan) {
  const patterns = plan.patterns.filter((pattern) => pattern.label !== plan.mainReview?.title);
  if (patterns.length === 0) {
    return "";
  }
  const visible = patterns.slice(0, 2);
  const hidden = patterns.slice(2);
  const patternCard = (pattern) => {
    const rows = pattern.evidenceRows ?? pattern.times.map((time) => ({ time, status: "suggested" }));
    const shownRows = rows.slice(0, 4);
    const moreCount = Math.max(0, rows.length - shownRows.length);
    return `
      <article class="observed-pattern-item" data-observed-pattern-item>
        <h4>${escapeHtml(pattern.label)}</h4>
        <p class="muted">Suggested: ${escapeHtml(String(pattern.suggestedCount ?? pattern.count))} ${Number(pattern.suggestedCount ?? pattern.count) === 1 ? "death" : "deaths"}${pattern.confirmedCount ? ` · Confirmed: ${escapeHtml(String(pattern.confirmedCount))}` : ""}</p>
        <p class="muted">${escapeHtml(shownRows.map((row) => `Death ${row.deathIndex ?? ""}${row.deathIndex ? " · " : ""}${row.time} · ${row.status}`).join(", "))}${moreCount > 0 ? ` <span class="more-count">+${escapeHtml(String(moreCount))} more</span>` : ""}</p>
        <button class="button secondary compact-row-action" type="button" data-set-main-focus-pattern="${escapeHtml(pattern.id)}" data-focus-label="${escapeHtml(pattern.label)}">Set as main focus</button>
      </article>
    `;
  };
  return `
    <section class="review-section observed-patterns-compact" aria-labelledby="observed-patterns-title">
      <div class="section-heading compact-section-heading">
        <div>
          <p class="eyebrow">Other suggested patterns</p>
          <h3 id="observed-patterns-title">Secondary review options</h3>
        </div>
      </div>
      <section class="observed-pattern-grid">
        ${visible.map(patternCard).join("")}
      </section>
      ${hidden.length > 0 ? `
        <details class="suggested-patterns-more">
          <summary>See more suggested patterns</summary>
          <section class="observed-pattern-grid">
            ${hidden.map(patternCard).join("")}
          </section>
        </details>
      ` : ""}
    </section>
  `;
}

function renderReviewPlan(plan, review) {
  if (!review?.evaluationSummary) {
    return renderReviewPriority(deriveReviewPriority(review));
  }
  if ((review.evaluationSummary?.deathCount ?? 0) === 0) {
    return renderReviewPriority(deriveReviewPriority(review));
  }
  const reviewedMoments = review.reviewedMoments ?? [];
  const complete = plan.reviewMoments.length > 0 && plan.reviewMoments.every((moment) => uiMomentIsComplete(moment, reviewedMoments));

  return `
    <section class="review-page-grid">
      <div class="review-main-column">
        ${renderAssessmentProgress(review, complete)}
        ${renderMainReview(plan)}
        ${renderObservedPatterns(plan)}
      </div>
      <div class="review-progress-rail">
        ${renderReviewChecklist(plan, reviewedMoments)}
      </div>
    </section>
    ${complete ? renderReviewCompletion(plan, review) : ""}
    ${renderDeathReviewList(plan, review)}
  `;
}

function renderReviewPriority(priority) {
  const timestampLine = priority.timestamps.length > 0
    ? `<p class="muted">Inspect first: ${escapeHtml(priority.timestamps.join(", "))}</p>`
    : "";
  const groupList = priority.groups.length > 0
    ? `
      <section class="compact-list">
        ${priority.groups.map((group) => {
          const timestamps = group.timestamps?.length ? ` · ${group.timestamps.slice(0, 3).join(", ")}` : "";
          return `<article class="compact-row"><span>${escapeHtml(group.label)}${escapeHtml(timestamps)}</span></article>`;
        }).join("")}
      </section>
    `
    : "";

  return `
    <article class="panel review-priority-panel">
      <p class="eyebrow">Review</p>
      <h3>${escapeHtml(priority.title)}</h3>
      <p class="muted">${escapeHtml(priority.detail)}</p>
      ${timestampLine}
      ${groupList}
    </article>
  `;
}

async function renderReviewLanding(root, context = getRouteContext()) {
  if (!context.demoMode && !getSessionState().authenticated) {
    renderAuthRequiredPage(root, "Sign in to open review", "The review queue uses your authenticated Riot identity.");
    return;
  }

  const { home } = await requestJson(context.homeApiUrl, context.requestOptions);
  const goal = home?.goalDashboard?.activePersonalGoal ?? {};
  const riotEvidence = goal.riotEvidence ?? {};
  const queue = reviewQueueGames(riotEvidence, 12);
  const recentGames = (riotEvidence.recentGames ?? riotEvidence.candidateGames ?? [])
    .filter((game) => game?.matchId && !queue.some((queued) => queued.matchId === game.matchId))
    .slice(0, 6);

  root.innerHTML = appShell(`
    <section class="goal-dashboard-stack">
      <section class="panel active-goal-panel">
        <p class="eyebrow">Review</p>
        <h2>Review queue</h2>
        <p class="muted">Pick a prepared game and review its moments against ${escapeHtml(goal.title ?? "your active goal")}.</p>
        <div class="action-row">
          <a class="button secondary" href="${escapeHtml(canonicalSetupHref(context))}">Edit setup</a>
        </div>
      </section>
      <section class="panel review-run-panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Ready</p>
            <h3>Games ready for review</h3>
          </div>
          ${statusBadge(`${queue.length} ready`, queue.length > 0 ? "positive" : "unknown")}
        </div>
        <section class="compact-list">
          ${queue.length > 0
            ? queue.map((game) => `
              <article class="compact-row dashboard-queue-row">
                <div>
                  <span class="compact-row-main">${escapeHtml(game.champion ?? game.championName ?? "Unknown champion")} · ${escapeHtml(game.result ?? "Result unknown")}</span>
                  <span class="compact-row-value">${escapeHtml(game.queueLabel ?? "Queue unknown")} · ${escapeHtml(reviewMomentLabel(game))}</span>
                </div>
                <a class="button secondary compact-row-action" href="${escapeHtml(reviewHrefForGame(game, context))}">Review</a>
              </article>
            `).join("")
            : '<p class="muted">No review-ready games yet. Recent games are still being prepared.</p>'}
        </section>
      </section>
      <section class="panel dashboard-compact-panel">
        <p class="eyebrow">Preparing or complete</p>
        <h3>Recent games</h3>
        <section class="compact-list">
          ${recentGames.length > 0
            ? recentGames.map((game) => `
              <article class="compact-row">
                <div>
                  <span class="compact-row-main">${escapeHtml(game.champion ?? game.championName ?? "Unknown champion")} · ${escapeHtml(reviewStateForGame(game).label)}</span>
                  <span class="compact-row-value">${escapeHtml(game.queueLabel ?? "Queue unknown")}</span>
                </div>
              </article>
            `).join("")
            : '<p class="muted">Reviewed games and pending summaries will appear here.</p>'}
        </section>
      </section>
    </section>
  `, {
    eyebrow: "Review",
    title: "Review queue",
    text: "Pick a game and review it.",
    compact: true
  });
}

function renderMatchReview(root, review, context = getRouteContext()) {
  const summary = review.matchSummary ?? {};
  const reviewPlan = buildMatchReviewPlan(review);
  const momentCount = reviewPlan.reviewMoments.length;
  const reviewedCount = reviewPlan.reviewMoments.filter((moment) => uiMomentIsComplete(moment, review.reviewedMoments)).length;
  const progressLabel = momentCount > 0
    ? `${reviewedCount} of ${momentCount} reviewed`
    : "No review moments ready";
  const role = summary.role ?? summary.lane ?? null;
  const playedAt = summary.playedAt ?? summary.gameCreationDate ?? summary.startedAt ?? null;
  const playedAtLabel = playedAt ? ` · ${new Date(playedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : "";
  const headerContext = `${role ? `${role} · ` : ""}${kdaLabel(summary)} KDA · Goal: ${reviewPlan.activeGoalName} · ${progressLabel}${playedAtLabel}`;
  const sideLabel = summary.teamSideLabel ? ` · ${summary.teamSideLabel}` : "";

  root.innerHTML = appShell(`
    <section class="section-heading">
      <div>
        <p class="eyebrow">Match Review</p>
        <h2>${escapeHtml(summary.championName ?? "Unknown champion")} · ${escapeHtml(summary.result ?? "Unknown result")} · ${escapeHtml(summary.queueLabel ?? "Unknown queue")}</h2>
      </div>
      <p class="section-copy">${escapeHtml(`${headerContext}${sideLabel}`)}</p>
    </section>
    ${renderReviewPlan(reviewPlan, review)}
    <section class="review-secondary-stack">
      <details class="panel technical-evidence">
        <summary>Technical evidence</summary>
        <p class="muted"><a href="${escapeHtml(toAppHref("/system-inventory", context) ?? "/system-inventory")}">System inventory</a></p>
        ${review.evaluationSummary ? renderDeathFacts(review.deathEvents, review.reviewedMoments) : '<p class="muted">Evaluation is not prepared for this match yet.</p>'}
        ${renderTagCounts(review.deterministicTagCounts)}
      </details>
      ${!review.evaluationSummary ? `
        <article class="panel">
          <p class="eyebrow">Preparing</p>
          <p class="muted">No persisted evaluation exists yet for this match.</p>
        </article>
      ` : ""}
    </section>
  `, {
    eyebrow: "Review",
    title: summary.championName ?? "Match Review",
    text: matchSummaryTitle(review),
    compact: true
  });
}

function bindReviewMomentControls(root, review) {
  if (!review?.matchId || getRouteContext().demoMode) {
    return;
  }
  if (root.dataset.reviewControlsBound === review.matchId) {
    return;
  }
  root.dataset.reviewControlsBound = review.matchId;

  root.addEventListener("click", async (event) => {
    const factorInput = event.target.closest('[data-death-review-item] input[type="radio"]');
    if (factorInput) {
      return;
    }

    const navButton = event.target.closest("[data-review-nav]");
    if (navButton) {
      const plan = buildMatchReviewPlan(review);
      const current = currentReviewMomentIndex(plan, review.reviewedMoments, review.matchId);
      const delta = navButton.dataset.reviewNav === "previous" ? -1 : 1;
      state.reviewMomentCursorByMatch.set(review.matchId, Math.max(0, Math.min(plan.reviewMoments.length - 1, current + delta)));
      renderMatchReview(root, review, getRouteContext());
      bindReviewMomentControls(root, review);
      return;
    }

    const checklistButton = event.target.closest("[data-jump-to-death]");
    if (checklistButton) {
      const target = root.querySelector(`[data-death-index="${escapeCssIdentifier(checklistButton.dataset.jumpToDeath)}"]`);
      target?.scrollIntoView?.({ block: "start", behavior: "smooth" });
      target?.focus?.();
      return;
    }

    const changeFocusButton = event.target.closest("[data-change-main-focus]");
    if (changeFocusButton) {
      const target = root.querySelector("[data-death-review-item]:not(.is-reviewed)") ?? root.querySelector("[data-observed-pattern-item]");
      target?.scrollIntoView?.({ block: "start", behavior: "smooth" });
      return;
    }

    const focusDeathButton = event.target.closest("[data-set-main-focus-death]");
    if (focusDeathButton) {
      const deathItem = focusDeathButton.closest("[data-death-review-item]");
      const selectedInput = deathItem?.querySelector('input[type="radio"]:checked');
      const focus = {
        mainReviewType: selectedInput?.value === "manual_other_pattern" ? "manual" : "death",
        mainReviewDeathIndex: Number(focusDeathButton.dataset.setMainFocusDeath),
        mainReviewPatternId: selectedInput?.value || focusDeathButton.dataset.patternId || "",
        mainReviewLabel: selectedInput?.closest("label")?.textContent?.trim() || focusDeathButton.dataset.focusLabel || "Manual review focus",
        selectedByUser: true
      };
      review.selectedMainReviewFocus = focus;
      writeStoredMainReviewFocus(review.matchId, focus);
      renderMatchReview(root, review, getRouteContext());
      bindReviewMomentControls(root, review);
      return;
    }

    const focusPatternButton = event.target.closest("[data-set-main-focus-pattern]");
    if (focusPatternButton) {
      const focus = {
        mainReviewType: "pattern",
        mainReviewPatternId: focusPatternButton.dataset.setMainFocusPattern,
        mainReviewLabel: focusPatternButton.dataset.focusLabel,
        selectedByUser: true
      };
      review.selectedMainReviewFocus = focus;
      writeStoredMainReviewFocus(review.matchId, focus);
      renderMatchReview(root, review, getRouteContext());
      bindReviewMomentControls(root, review);
      return;
    }

    const momentActionButton = event.target.closest("[data-review-moment-action]");
    if (momentActionButton) {
      const deathItem = momentActionButton.closest("[data-death-review-item]");
      const selectedInputs = [...(deathItem ?? root).querySelectorAll('input[type="radio"]:checked')];
      const selectedInput = selectedInputs[0] ?? null;
      const selectedFactor = selectedInput?.value || momentActionButton.dataset.signalId;
      const selectedCauseCategory = selectedInput?.dataset?.causeCategory || null;
      const selectedOtherPattern = selectedFactor === "manual_other_pattern";
      const action = momentActionButton.dataset.reviewMomentAction;
      const body = {
        deathIndex: Number(momentActionButton.dataset.deathIndex),
        deathTimestampSeconds: momentActionButton.dataset.deathTimestampSeconds ? Number(momentActionButton.dataset.deathTimestampSeconds) : null,
        signalId: selectedOtherPattern ? "manual_other_pattern" : momentActionButton.dataset.signalId,
        selectedPatternId: selectedFactor,
        status: action === "skipped" ? "unsure" : "confirmed",
        causeCategory: selectedCauseCategory || "other"
      };

      momentActionButton.disabled = true;
      try {
        const result = await requestJson(`/api/matches/${encodeURIComponent(review.matchId)}/reviewed-moments`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        review.reviewedMoments = [
          ...(review.reviewedMoments ?? []).filter((moment) =>
            !(Number(moment.deathIndex) === body.deathIndex && moment.signalId === body.signalId)
          ),
          { ...body, ...(result.reviewedMoment ?? {}) }
        ];
        const nextPlan = buildMatchReviewPlan(review);
        const current = currentReviewMomentIndex(nextPlan, review.reviewedMoments, review.matchId);
        state.reviewMomentCursorByMatch.set(review.matchId, Math.min(nextPlan.reviewMoments.length - 1, current + 1));
        renderMatchReview(root, review, getRouteContext());
        bindReviewMomentControls(root, review);
      } finally {
        momentActionButton.disabled = false;
      }
      return;
    }

    return;
  });
}

function candidateToReview(game) {
  if (!game) {
    return null;
  }

  const kdaParts = typeof game.kda === "string" ? game.kda.split("/") : [];
  return {
    matchId: game.matchId,
    evaluationStatus: game.evaluationStatus ?? "not_evaluated",
    evaluationVersion: game.evaluationVersion ?? null,
    matchSummary: {
      championName: game.championName ?? game.champion ?? null,
      queueLabel: game.queueLabel ?? null,
      result: game.result ?? null,
      kills: game.kills ?? kdaParts[0] ?? null,
      deaths: game.deaths ?? kdaParts[1] ?? null,
      assists: game.assists ?? kdaParts[2] ?? null
    },
    evaluationSummary: game.evaluationSummary ?? null,
    deathEvents: game.evaluationDeaths ?? [],
    deterministicTagCounts: Object.fromEntries((game.evaluationSummary?.topTags ?? []).map((entry) => [entry.tag, entry.count])),
    relevanceReason: game.relevanceReason ?? null,
    goalRelevance: game.goalRelevance ?? null,
    reviewedMoments: []
  };
}

function reviewIsTriaged(reviewLike) {
  if (reviewLike?.reviewStatus === "triaged" || reviewLike?.reviewStatus === "needs_manual_review") {
    return true;
  }
  const total = Number(reviewLike?.totalReviewMomentCount ?? reviewLike?.deathCount);
  const triaged = Number(reviewLike?.triagedMomentCount ?? 0);
  if (Number.isFinite(total) && total > 0 && triaged >= total) {
    return true;
  }
  const deaths = Array.isArray(reviewLike?.evaluationDeaths) ? reviewLike.evaluationDeaths : reviewLike?.deathEvents ?? [];
  const reviewed = reviewLike?.reviewedMoments ?? [];
  if (!Array.isArray(deaths) || deaths.length === 0) return Boolean(reviewLike?.reviewedAt || reviewLike?.reviewComplete);
  return deaths.every((death, index) => {
    const deathIndex = Number(death?.deathIndex ?? index + 1);
    return reviewed.some((moment) => Number(moment?.deathIndex) === deathIndex);
  });
}

function attachAssessmentState(review, homeResult) {
  const riotEvidence = homeResult?.home?.goalDashboard?.activePersonalGoal?.riotEvidence ?? null;
  const serverAssessment = riotEvidence?.initialAssessment ?? null;
  const games = (serverAssessment?.candidateGames ?? riotEvidence?.candidateGames ?? riotEvidence?.recentGames ?? [])
    .filter((game) => game?.matchId && (game.evaluationSummary || game.evaluationDeaths?.length || game.matchId === review?.matchId));
  const completedMatchIds = (serverAssessment?.completedMatchIds ?? games.filter(reviewIsTriaged).map((game) => game.matchId))
    .filter(Boolean);
  review.assessment = {
    target: Number(serverAssessment?.target ?? riotEvidence?.initialAssessmentTarget ?? INITIAL_ASSESSMENT_TARGET),
    candidateGames: games,
    completedMatchIds,
    completedCount: Number(serverAssessment?.completedCount ?? completedMatchIds.length),
    availableCount: games.length,
    nextMatchId: serverAssessment?.nextMatchId ?? null,
    assessmentComplete: Boolean(serverAssessment?.assessmentComplete)
  };
  return review;
}

async function renderReviewPage(root, context = getRouteContext()) {
  const url = new URL(window.location.href);
  const matchId = url.searchParams.get("matchId");

  if (!matchId) {
    await renderReviewLanding(root, context);
    return;
  }

  if (!context.demoMode && !getSessionState().authenticated) {
    renderAuthRequiredPage(root, "Sign in to open review", "This match review uses your authenticated Riot identity.");
    return;
  }

  try {
    if (context.demoMode) {
      const { home } = await requestJson(context.homeApiUrl, context.requestOptions);
      const candidates = home?.goalDashboard?.activePersonalGoal?.riotEvidence?.candidateGames ?? [];
      const review = candidateToReview(candidates.find((game) => game.matchId === matchId));
      if (!review) {
        throw new Error("Match review not found.");
      }
      review.activeGoal = home?.goalDashboard?.activePersonalGoal ?? null;
      attachAssessmentState(review, { home });
      renderMatchReview(root, review, context);
      bindReviewMomentControls(root, review);
      return;
    }

    const [review, homeResult] = await Promise.all([
      requestJson(`/api/matches/${encodeURIComponent(matchId)}/evaluation`),
      requestJson(context.homeApiUrl, context.requestOptions).catch(() => null)
    ]);
    review.activeGoal = homeResult?.home?.goalDashboard?.activePersonalGoal ?? null;
    attachAssessmentState(review, homeResult);
    renderMatchReview(root, review, context);
    bindReviewMomentControls(root, review);
  } catch (error) {
    root.innerHTML = appShell(`
      <section class="goal-dashboard-stack">
        <section class="panel active-goal-panel">
          <p class="eyebrow">Review</p>
          <h2>Match review not found.</h2>
          <p class="muted">${escapeHtml(error instanceof Error ? error.message : "The selected match is not available.")}</p>
          <div class="action-row">
            <a class="button" href="${escapeHtml(toAppHref("/", context) ?? "/")}">Open dashboard</a>
          </div>
        </section>
      </section>
    `, {
      eyebrow: "Review",
      title: "Review not found",
      text: "The selected match is not available.",
      compact: true
    });
  }
}

async function renderSystemInventoryPage(root, context = getRouteContext()) {
  if (!getSessionState().authenticated) {
    renderAuthRequiredPage(root, "Sign in to open system inventory", "System inventory uses your RiftSense setup.");
    return;
  }

  const inventory = await requestJson("/api/system-inventory", context.requestOptions);
  root.innerHTML = appShell(`
    <section class="section-heading">
      <div>
        <p class="eyebrow">System inventory</p>
        <h2>Known evidence patterns</h2>
      </div>
      <p class="section-copy">Read-only view of goal types, evidence categories, and detected evidence patterns.</p>
    </section>
    <section class="goal-dashboard-stack">
      <section class="panel dashboard-compact-panel">
        <p class="eyebrow">Goal types</p>
        <h3>Configured goals</h3>
        <section class="compact-list">
          ${(inventory.goalTypes ?? []).map((goal) => `
            <article class="compact-row">
              <div>
                <span class="compact-row-main">${escapeHtml(goal.title ?? goal.id)}</span>
                <span class="compact-row-value">Evidence: ${escapeHtml((goal.evidenceCategories ?? []).join(", ") || "None configured")}</span>
                <span class="compact-row-value">Subscribed patterns: ${escapeHtml((goal.subscribedPatterns ?? []).join(", ") || "None configured")}</span>
              </div>
            </article>
          `).join("") || '<p class="muted">No goal types are configured.</p>'}
        </section>
      </section>
      <section class="panel dashboard-compact-panel">
        <p class="eyebrow">Evidence parsers</p>
        <h3>Active deterministic parsers</h3>
        ${renderSignalList(inventory.deterministicEvidenceParsers ?? [], "No deterministic parsers are listed.")}
      </section>
      <section class="panel dashboard-compact-panel">
        <p class="eyebrow">System evidence patterns</p>
        <h3>Detected evidence patterns</h3>
        ${renderSignalList((inventory.systemEvidencePatterns ?? []).map(tagLabel), "No evidence patterns are listed.")}
      </section>
      <section class="panel dashboard-compact-panel">
        <p class="eyebrow">Game phase</p>
        <h3>Phase thresholds</h3>
        <p class="muted">${escapeHtml(inventory.gamePhase?.note ?? "Phase thresholds are not configured.")}</p>
      </section>
      <section class="panel dashboard-compact-panel">
        <p class="eyebrow">Map timers</p>
        <h3>Objective and jungle timers</h3>
        ${renderSignalList([
          inventory.mapTimers?.rules?.dragon?.firstSpawnSeconds ? `Dragon first spawn: ${inventory.mapTimers.rules.dragon.firstSpawnSeconds}s` : "",
          inventory.mapTimers?.rules?.voidgrubs?.firstSpawnSeconds ? `Voidgrubs first spawn: ${inventory.mapTimers.rules.voidgrubs.firstSpawnSeconds}s` : "",
          inventory.mapTimers?.rules?.riftHerald?.firstSpawnSeconds ? `Rift Herald first spawn: ${inventory.mapTimers.rules.riftHerald.firstSpawnSeconds}s` : "",
          inventory.mapTimers?.rules?.baron?.firstSpawnSeconds ? `Baron first spawn: ${inventory.mapTimers.rules.baron.firstSpawnSeconds}s` : "",
          inventory.mapTimers?.rules?.scuttle?.firstSpawnSeconds ? `Scuttle first spawn: ${inventory.mapTimers.rules.scuttle.firstSpawnSeconds}s` : "",
          inventory.mapTimers?.rules?.jungleCamps?.minorCampRespawnSeconds ? `Minor camp respawn: ${inventory.mapTimers.rules.jungleCamps.minorCampRespawnSeconds}s` : "",
          inventory.mapTimers?.rules?.jungleCamps?.buffRespawnSeconds ? `Buff respawn: ${inventory.mapTimers.rules.jungleCamps.buffRespawnSeconds}s` : ""
        ].filter(Boolean), "Map timer rules are not configured.")}
      </section>
    </section>
  `, {
    eyebrow: "System inventory",
    title: "Known evidence patterns",
    text: "Read-only configuration.",
    compact: true
  });
}

function insightCard(insight) {
  return `
    <article class="insight-card">
      <p class="eyebrow">Insight</p>
      <h3>${escapeHtml(insight.title)}</h3>
      <p class="muted">${escapeHtml(insight.summary ?? "")}</p>
      ${Array.isArray(insight.basedOn) && insight.basedOn.length > 0
        ? `<p class="signal-detail"><strong>Based on:</strong> ${escapeHtml(insight.basedOn.join(" + "))}</p>`
        : ""}
    </article>
  `;
}

function teamChecklist(items) {
  return `
    <ul class="team-checklist">
      ${(items ?? []).length > 0
        ? items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
        : "<li>No team checklist configured yet.</li>"}
    </ul>
  `;
}

function buildLibraryUrl(url, updates = {}) {
  const nextUrl = new URL("/library", window.location.origin);
  const nextEntries = {
    contentType: url.searchParams.get("contentType") ?? "",
    topic: url.searchParams.get("topic") ?? "",
    view: url.searchParams.get("view") ?? "grid",
    ...updates
  };

  Object.entries(nextEntries).forEach(([key, value]) => {
    if (value) {
      nextUrl.searchParams.set(key, value);
    }
  });

  if ((updates.view ?? nextEntries.view) === "grid") {
    nextUrl.searchParams.delete("view");
  }

  return nextUrl.toString();
}

function contentFormFields(item = {}) {
  const sourceType = item.sourceType ?? "upload";
  const topicTags = Array.isArray(item.topicTags) ? item.topicTags.join(", ") : "";
  return `
    <label>
      Title
      <input name="title" required value="${escapeHtml(item.title ?? "")}" />
    </label>
    <label>
      Description
      <textarea name="description" required rows="4">${escapeHtml(item.description ?? "")}</textarea>
    </label>
    <div class="field-row">
      <label>
        Content Type
        <select name="contentType">
          <option value="document" ${item.contentType === "document" ? "selected" : ""}>Document</option>
          <option value="deck" ${item.contentType === "deck" ? "selected" : ""}>Deck</option>
          <option value="video" ${item.contentType === "video" ? "selected" : ""}>Video</option>
        </select>
      </label>
      <label>
        Source Type
        <select name="sourceType" data-source-type>
          <option value="upload" ${sourceType === "upload" ? "selected" : ""}>Upload</option>
          <option value="external_url" ${sourceType === "external_url" ? "selected" : ""}>External URL</option>
        </select>
      </label>
      <label>
        Status
        <select name="status">
          <option value="draft" ${item.status === "draft" ? "selected" : ""}>Draft</option>
          <option value="published" ${item.status === "published" ? "selected" : ""}>Published</option>
          <option value="archived" ${item.status === "archived" ? "selected" : ""}>Archived</option>
        </select>
      </label>
    </div>
    <label data-upload-field="${sourceType === "upload" ? "visible" : "hidden"}">
      File
      <input type="file" name="file" />
    </label>
    <label data-url-field="${sourceType === "external_url" ? "visible" : "hidden"}">
      External URL
      <input name="externalUrl" value="${escapeHtml(item.asset?.url ?? "")}" />
    </label>
    <label>
      Topics
      <input name="topicTags" placeholder="wave-management, laning" value="${escapeHtml(topicTags)}" />
    </label>
    <div class="field-row">
      <label>
        Group Key
        <input name="groupKey" value="${escapeHtml(item.grouping?.groupKey ?? "")}" />
      </label>
      <label>
        Group Label
        <input name="groupLabel" value="${escapeHtml(item.grouping?.groupLabel ?? "")}" />
      </label>
      <label>
        Group Order
        <input type="number" name="groupOrder" value="${escapeHtml(item.grouping?.order ?? "")}" />
      </label>
    </div>
    <label class="checkbox">
      <input type="checkbox" name="patchSensitive" ${item.patchSensitive ? "checked" : ""} />
      Patch-sensitive content
    </label>
  `;
}

function bindSourceTypeVisibility(root) {
  const sourceSelect = root.querySelector("[data-source-type]");
  const uploadField = root.querySelector("[data-upload-field]");
  const urlField = root.querySelector("[data-url-field]");

  if (!sourceSelect || !uploadField || !urlField) {
    return;
  }

  function sync() {
    const isUpload = sourceSelect.value === "upload";
    uploadField.style.display = isUpload ? "grid" : "none";
    urlField.style.display = isUpload ? "none" : "grid";
  }

  sourceSelect.addEventListener("change", sync);
  sync();
}

async function renderHome(root, context = getRouteContext()) {
  const startedAt = performance.now();
  let outcome = "success";
  let source = "unknown";
  let home;

  try {
    ({ home } = await requestJson(context.homeApiUrl, context.requestOptions));
    source = home.user?.source ?? "unknown";

    const profile = home.user.profile ?? {};
    const dashboard = home.goalDashboard ?? {};
    const goal = dashboard.activePersonalGoal ?? {};
    const action = dashboard.todaysAction ?? {};
    const teamFocus = dashboard.activeTeamFocus ?? {};
    const suggestedNextSteps = (dashboard.suggestedNextSteps ?? []).filter((step) =>
      Boolean(canonicalDashboardHref(step.href, context) || !step.href)
    );
    const riotEvidence = goal.riotEvidence ?? null;
    const dashboardView = dashboardState({ dashboard, goal, riotEvidence });
    const activeReviewStatus = dashboardView.inInitialAssessment
      ? `Initial assessment: ${dashboardView.assessmentCompleted}/${dashboardView.assessmentTarget} reviewed`
      : dashboardView.hasReviewedGames ? (goal.goalStatus ?? "Evidence started") : "No reviewed games yet";
    const activeReviewTrend = dashboardView.inInitialAssessment
      ? "watch"
      : dashboardView.hasReviewedGames ? (goal.goalStatusTrend ?? "unknown") : "unknown";
    const primaryAction = primaryDashboardAction({ state: dashboardView, action, context });
    const setupHref = canonicalSetupHref(context);
    const reviewHref = toAppHref("/review", context) ?? "#";
    const focusTagline = `${goal.role ?? profile.primaryRole ?? "Player"} · ${goal.scope ?? "Personal"}`;
    const demoBanner = context.demoMode
      ? `
      <section class="panel panel-slim">
        <p class="eyebrow">Public Demo</p>
        <h2>Seeded MVP dashboard</h2>
        <p class="muted">This view is fixed demo data for the ADC + team-focus scenario from the MVP spec.</p>
      </section>
    `
      : "";
    const setupGuide = home.setupGuide
      ? (() => {
        const href = canonicalDashboardHref(home.setupGuide.href, context) ?? setupHref;
        const label = href === setupHref && (home.setupGuide.label === "View Goals" || home.setupGuide.href === "/goals" || home.setupGuide.href === "/onboarding")
          ? "Open setup"
          : home.setupGuide.label ?? "Open setup";
        return `
      <section class="panel panel-slim">
        <p class="eyebrow">${escapeHtml(home.setupGuide.status === "setup-needed" ? "Setup" : "Next")}</p>
        <h2>${escapeHtml(home.setupGuide.title ?? "Setup needed")}</h2>
        <p class="muted">${escapeHtml(home.setupGuide.summary ?? "")}</p>
        ${home.setupGuide.href ? `<a class="button" href="${escapeHtml(href)}">${escapeHtml(label)}</a>` : ""}
      </section>
    `;
      })()
      : "";

    root.innerHTML = appShell(`
    <section class="goal-dashboard-stack">
      ${demoBanner}
      ${setupGuide}
      <section class="dashboard-home-layout">
        <section class="dashboard-main-column">
          <section class="panel active-goal-panel">
            <div class="active-goal-hero">
              <div class="active-goal-copy">
                <p class="eyebrow">Active Goal</p>
                <h2>${escapeHtml(goal.title ?? "No active goal yet")}</h2>
                <div class="badge-row">
                  <span class="context-badge">${escapeHtml(focusTagline)}</span>
                  ${statusBadge(activeReviewStatus, activeReviewTrend)}
                </div>
              </div>
              <a class="button secondary" href="${escapeHtml(setupHref)}">Edit setup</a>
            </div>
          </section>
          ${dashboardView.inInitialAssessment ? initialAssessmentPanel(dashboardView, context) : primaryActionCard(primaryAction)}
          ${dashboardView.inInitialAssessment ? "" : reviewQueueSummary(dashboardView.reviewQueue, context)}
          ${riotEvidenceCard(riotEvidence, context)}
          ${dashboardView.inInitialAssessment ? "" : evidenceProgressCard(dashboardView)}
        </section>
        ${dashboardContextCards(dashboardView, teamFocus)}
      </section>

      <section class="panel next-steps-panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Suggested Next Steps</p>
            <h2>Continue Learning</h2>
          </div>
        </div>
        <section class="next-step-grid">
          ${suggestedNextSteps.length > 0
            ? suggestedNextSteps
              .slice(0, 4)
              .map((step) => {
                const href = canonicalDashboardHref(step.href, context);
                const [stepPathname] = (step.href ?? "").split("?");
                const label = href === setupHref && (stepPathname === "/goals" || stepPathname === "/onboarding" || stepPathname.startsWith("/focus/"))
                  ? "Edit setup"
                  : step.label;
                return nextStepCard({
                  ...step,
                  href,
                  label
                });
              })
              .join("")
            : `
              ${nextStepCard(dashboardView.inInitialAssessment
                ? { title: "Assessment games", summary: "Review the remaining assessment games.", href: reviewHref, label: "Open assessment games" }
                : { title: "Review queue", summary: "Pick a prepared game and review its moments.", href: reviewHref, label: "Open review" })}
              ${nextStepCard({ title: "Setup", summary: "Update your active goal, role, and team focus.", href: setupHref, label: "Edit setup" })}
              ${nextStepCard({ title: "Library", summary: "Library fills as you review games.", status: "Under construction" })}
            `}
        </section>
      </section>
    </section>
  `, {
      hidden: true
    });
    bindRecentGamesRefresh(root);
    scheduleRecentEvaluationPreparation(root, riotEvidence, context);
  } catch (error) {
    outcome = "failure";
    throw error;
  } finally {
    logClientTiming("client_render_home", {
      durationMs: elapsedMs(startedAt),
      outcome,
      source
    });
  }
}

function renderPublicAbout(root) {
  root.innerHTML = appShell(`
    <section class="goal-dashboard-stack">
      <section class="panel active-goal-panel">
        <p class="eyebrow">About</p>
        <h2>RiftSense is a goal-driven League review workspace</h2>
        <p class="muted">It uses Nexus-authenticated identity, shared Riot profile fields, and RiftSense-owned recent-game evidence to help players focus review work against active goals.</p>
        <div class="action-row">
          <a class="button" href="/login">Continue with Nexus</a>
          <a class="button secondary" href="/demo">View Demo</a>
        </div>
      </section>
      <section class="dashboard-two-column">
        <section class="panel">
          <p class="eyebrow">Current Scope</p>
          <h2>Goals, evidence, and setup</h2>
          <p class="muted">Authenticated players can save setup, see goal-linked evidence states, and review recent Riot games when Riot identity and RiftSense config are available.</p>
        </section>
        <section class="panel">
          <p class="eyebrow">Access</p>
          <h2>Public About and Demo</h2>
          <p class="muted">About and Demo stay public. Enter the authenticated app when you are ready to save setup and use your own profile.</p>
        </section>
      </section>
    </section>
  `, {
    eyebrow: "About",
    title: "RiftSense",
    text: "A public overview of the RiftSense workflow."
  });
}

function renderAuthRequiredPage(root, title, summary) {
  root.innerHTML = appShell(`
    <section class="goal-dashboard-stack">
      <section class="panel active-goal-panel">
        <p class="eyebrow">Sign In Required</p>
        <h2>${escapeHtml(title)}</h2>
        <p class="muted">${escapeHtml(summary)}</p>
        <div class="action-row">
          <a class="button" href="/login">Continue with Nexus</a>
          <a class="button secondary" href="/demo">View Demo</a>
          <a class="button secondary" href="/about">About</a>
        </div>
      </section>
    </section>
  `, {
    eyebrow: "Access",
    title,
    text: summary
  });
}

async function renderGoalDashboardPage(root, page, context = getRouteContext()) {
  const startedAt = performance.now();
  let outcome = "success";
  if (!context.demoMode && !getSessionState().authenticated) {
    renderAuthRequiredPage(root, "Sign in to open RiftSense", "This area uses your authenticated setup and review state.");
    logClientTiming("client_render_dashboard", {
      durationMs: elapsedMs(startedAt),
      outcome,
      page,
      source: "auth_required"
    });
    return;
  }

  let home;
  try {
    ({ home } = await requestJson(context.homeApiUrl, context.requestOptions));
  } catch (error) {
    outcome = "failure";
    throw error;
  } finally {
    if (outcome === "failure") {
      logClientTiming("client_render_dashboard", {
        durationMs: elapsedMs(startedAt),
        outcome,
        page,
        source: "request_failed"
      });
    }
  }

  const dashboard = home.goalDashboard ?? {};
  const goal = dashboard.activePersonalGoal ?? {};
  const teamFocus = dashboard.activeTeamFocus ?? {};

  const pages = {
    training: {
      eyebrow: "Training",
      title: "Training - Under construction",
      text: "Training unlocks after confirmed patterns.",
      content: `
        <section class="panel dashboard-inactive-panel">
          <p class="eyebrow">Under construction</p>
          <h3>Training uses confirmed patterns</h3>
          <p class="muted">Review games first. Drills and practice blocks unlock after RiftSense has confirmed patterns from your reviewed evidence.</p>
          <div class="action-row">
            <a class="button secondary" href="${escapeHtml(toAppHref("/review", context) ?? "/review")}">Open review</a>
          </div>
        </section>
      `
    },
    team: {
      eyebrow: "Team Focus",
      title: teamFocus.title ?? "Team Focus",
      text: "Current team-oriented focus. Setup owns editing.",
      content: `
        <section class="panel team-focus-panel">
          <p class="eyebrow">Current team focus</p>
          <h3>${escapeHtml(teamFocus.practiceTopic ?? "No practice topic configured")}</h3>
          <p><strong>Assigned review:</strong> ${escapeHtml(teamFocus.assignedReview ?? "Not set")}</p>
          <p class="muted">Team Focus is seeded from setup until reviewed game evidence updates it.</p>
          ${teamChecklist(teamFocus.checklist)}
          <div class="action-row">
            <a class="button secondary" href="${escapeHtml(canonicalSetupHref(context))}">Edit setup</a>
          </div>
        </section>
        <section class="panel recent-signals-panel">
          <p class="eyebrow">Team Signals</p>
          <h3>Objective setup evidence</h3>
          <section class="signal-grid">
            ${(teamFocus.signals ?? []).length > 0
              ? teamFocus.signals.map(signalCard).join("")
              : '<p class="muted">Waiting for reviewed evidence.</p>'}
          </section>
        </section>
      `
    }
  };
  const config = pages[page];

  root.innerHTML = appShell(`
    <section class="section-heading">
      <div>
        <p class="eyebrow">${escapeHtml(config.eyebrow)}</p>
        <h2>${escapeHtml(config.title)}</h2>
      </div>
      <p class="section-copy">${escapeHtml(config.text)}</p>
    </section>
    <section class="goal-dashboard-stack">
      ${config.content}
    </section>
  `, {
    eyebrow: config.eyebrow,
    title: config.title,
    text: config.text,
    compact: true
  });
  logClientTiming("client_render_dashboard", {
    durationMs: elapsedMs(startedAt),
    outcome,
    page,
    source: home.user?.source ?? "unknown"
  });
}

function templateOption(template, selectedId) {
  const meta = [template.role, template.category].filter(Boolean).join(" · ");
  return `
    <option value="${escapeHtml(template.id)}" ${template.id === selectedId ? "selected" : ""}>
      ${escapeHtml(template.title)}${meta ? ` (${escapeHtml(meta)})` : ""}
    </option>
  `;
}

function findTemplate(items, id) {
  return (items ?? []).find((item) => item.id === id) ?? null;
}

function onboardingSignalCheckbox(signal, checked) {
  return `
    <label class="checkbox option-card">
      <input type="checkbox" name="selectedSignalIds" value="${escapeHtml(signal.id)}" ${checked ? "checked" : ""} />
      <span>
        <strong>${escapeHtml(signal.label ?? signal.title ?? signal.id)}</strong>
        <small>${escapeHtml(signal.description ?? "")}</small>
      </span>
    </label>
  `;
}

function onboardingTargetCheckbox(target, signal, checked = true) {
  return `
    <label class="checkbox option-card">
      <input
        type="checkbox"
        name="weeklyTargetSignalIds"
        value="${escapeHtml(target.signalId)}"
        data-target-value="${escapeHtml(target.targetValue)}"
        data-target-label="${escapeHtml(target.label ?? signal?.label ?? target.signalId)}"
        ${checked ? "checked" : ""}
      />
      <span>
        <strong>${escapeHtml(target.label ?? signal?.label ?? target.signalId)}</strong>
        <small>Target: ${escapeHtml(target.targetValue)}</small>
      </span>
    </label>
  `;
}

function onboardingPreview({ state, templates }) {
  const goal = findTemplate(templates.goalTemplates, state.selectedGoalTemplateId);
  const action = findTemplate(templates.actionTemplates, state.selectedActionTemplateId);
  const teamFocus = findTemplate(templates.teamFocusTemplates, state.selectedTeamFocusTemplateId);
  const signalLabels = state.selectedSignalIds
    .map((signalId) => findTemplate(templates.signalTemplates, signalId)?.label)
    .filter(Boolean);

  return `
    <section class="onboarding-preview">
      <article class="panel panel-slim">
        <p class="eyebrow">Dashboard Preview</p>
        <h3>${escapeHtml(goal?.title ?? "No personal goal selected")}</h3>
        <p class="muted">${escapeHtml(goal?.description ?? "Team-only onboarding will create a team focus without a personal goal.")}</p>
        <p><strong>Signals:</strong> ${escapeHtml(signalLabels.join(", ") || "None selected")}</p>
        <p><strong>First action:</strong> ${escapeHtml(action?.title ?? "None selected")}</p>
      </article>
      <article class="panel panel-slim">
        <p class="eyebrow">Team Focus</p>
        <h3>${escapeHtml(teamFocus?.title ?? "Skipped")}</h3>
        <p class="muted">${escapeHtml(teamFocus?.description ?? "No team focus will be created for this setup.")}</p>
      </article>
    </section>
  `;
}

async function renderOnboarding(root, context = getRouteContext()) {
  if (!context.demoMode && !getSessionState().authenticated) {
    renderAuthRequiredPage(root, "Sign in to edit setup", "RiftSense setup is saved to your authenticated account.");
    return;
  }

  const { templates } = await requestJson("/api/onboarding/options", {
    skipStoredToken: context.demoMode
  });
  const { home } = await requestJson(context.homeApiUrl, context.requestOptions);
  const dashboard = home.goalDashboard ?? {};
  const profile = home.user?.profile ?? {};
  const currentGoal = dashboard.activePersonalGoal ?? {};
  const currentTeamFocus = dashboard.activeTeamFocus ?? {};
  const riotEvidence = currentGoal.riotEvidence ?? {};
  const initialGoal = templates.goalTemplates.find((template) => template.title === currentGoal.title) ?? templates.goalTemplates[0];
  const initialTeamFocus = templates.teamFocusTemplates.find((template) =>
    template.title === currentTeamFocus.title || template.title === currentTeamFocus.practiceTopic
  ) ?? templates.teamFocusTemplates[0];
  const state = {
    context: "both",
    role: currentGoal.role ?? profile.primaryRole ?? "ADC",
    selectedGoalTemplateId: initialGoal?.id ?? "",
    selectedSignalIds: initialGoal?.defaultSignalIds ?? [],
    selectedWeeklyTargetIds: (initialGoal?.suggestedWeeklyTargets ?? []).map((target) => target.signalId),
    selectedActionTemplateId: initialGoal?.defaultActionIds?.[0] ?? templates.actionTemplates[0]?.id ?? "",
    selectedTeamFocusTemplateId: initialTeamFocus?.id ?? ""
  };

  function syncStateFromForm(form) {
    const formData = new FormData(form);
    const nextGoalId = String(formData.get("selectedGoalTemplateId") ?? "");
    const goalChanged = nextGoalId && nextGoalId !== state.selectedGoalTemplateId;
    const nextGoal = findTemplate(templates.goalTemplates, nextGoalId);

    state.context = String(formData.get("context") ?? "personal");
    state.role = String(formData.get("role") ?? "ADC");
    state.selectedGoalTemplateId = nextGoalId;
    state.selectedTeamFocusTemplateId = String(formData.get("selectedTeamFocusTemplateId") ?? "");

    if (goalChanged && nextGoal) {
      state.selectedSignalIds = nextGoal.defaultSignalIds ?? [];
      state.selectedWeeklyTargetIds = (nextGoal.suggestedWeeklyTargets ?? []).map((target) => target.signalId);
      state.selectedActionTemplateId = nextGoal.defaultActionIds?.[0] ?? state.selectedActionTemplateId;
      return;
    }

    state.selectedSignalIds = formData.getAll("selectedSignalIds").map(String);
    state.selectedWeeklyTargetIds = formData.getAll("weeklyTargetSignalIds").map(String);
    state.selectedActionTemplateId = String(formData.get("selectedActionTemplateId") ?? "");
  }

  function payloadFromForm(form) {
    syncStateFromForm(form);
    const formData = new FormData(form);
    const weeklyTargets = formData.getAll("weeklyTargetSignalIds").map((signalId) => {
      const input = Array.from(form.querySelectorAll('input[name="weeklyTargetSignalIds"]'))
        .find((targetInput) => targetInput.value === signalId);
      return {
        signalId,
        targetValue: Number(input?.dataset.targetValue ?? 0),
        label: input?.dataset.targetLabel ?? signalId
      };
    });

    return {
      context: state.context,
      role: state.role,
      selectedGoalTemplateId: state.selectedGoalTemplateId,
      selectedSignalIds: state.selectedSignalIds,
      weeklyTargets,
      selectedActionTemplateId: state.selectedActionTemplateId,
      selectedTeamFocusTemplateId: state.selectedTeamFocusTemplateId
    };
  }

  function render() {
    const selectedGoal = findTemplate(templates.goalTemplates, state.selectedGoalTemplateId) ?? templates.goalTemplates[0];
    const selectedTeamFocus = findTemplate(templates.teamFocusTemplates, state.selectedTeamFocusTemplateId);
    const selectedActionIds = selectedGoal?.defaultActionIds ?? [];
    const signalIds = new Set(selectedGoal?.defaultSignalIds ?? []);
    state.selectedSignalIds.forEach((signalId) => signalIds.add(signalId));
    const visibleSignals = templates.signalTemplates.filter((signal) => signalIds.has(signal.id));
    const weeklyTargets = selectedGoal?.suggestedWeeklyTargets ?? [];
    const dashboardHref = toAppHref("/", context) ?? "/";
    const reviewHref = toAppHref("/review", context) ?? "/review";
    const counts = riotReadinessCounts(riotEvidence);
    const riotIdentityLabel = profile.riotPuuid
      ? [profile.riotGameName, profile.riotTagline].filter(Boolean).join("#") || "Connected"
      : "Not connected";
    const recentGamesLabel = counts.discoveredCount > 0 ? `${counts.discoveredCount} available` : "None available";
    const reviewReadyLabel = counts.evaluationReadyCount > 0 ? `${counts.evaluationReadyCount} available` : "None available";

    root.innerHTML = appShell(`
      <section class="section-heading">
        <div>
          <p class="eyebrow">${context.demoMode ? "Demo Setup" : "Setup"}</p>
          <h2>Setup</h2>
        </div>
        <p class="section-copy">Active goal, review readiness, and team focus seed.</p>
      </section>
      <form class="onboarding-flow" id="onboarding-form">
        <section class="panel onboarding-step">
          <p class="eyebrow">Personal focus</p>
          <h3>${escapeHtml(currentGoal.title ?? selectedGoal?.title ?? "No active goal yet")}</h3>
          <p><strong>Role/context:</strong> ${escapeHtml(state.role)} · ${escapeHtml(currentGoal.scope ?? "personal")}</p>
          <input type="hidden" name="context" value="both" />
          <div class="field-row">
            <label>
              Role
              <select name="role">
                ${["Top", "Jungle", "Mid", "ADC", "Bot", "Support", "Multiple"].map((role) => `
                  <option value="${role}" ${state.role === role ? "selected" : ""}>${role}</option>
                `).join("")}
              </select>
            </label>
            <label>
              Active goal
              <select name="selectedGoalTemplateId">
                ${templates.goalTemplates.map((template) => templateOption(template, selectedGoal?.id)).join("")}
              </select>
            </label>
            <label>
              First action
              <select name="selectedActionTemplateId">
                ${templates.actionTemplates
                  .filter((template) => selectedActionIds.includes(template.id) || template.linkedGoalTemplateIds?.includes(selectedGoal?.id))
                  .map((template) => templateOption(template, state.selectedActionTemplateId))
                  .join("")}
              </select>
            </label>
          </div>
          <section class="option-grid target-option-grid" aria-label="Goal signals">
            ${visibleSignals.map((signal) => onboardingSignalCheckbox(signal, state.selectedSignalIds.includes(signal.id))).join("")}
            ${weeklyTargets.map((target) => onboardingTargetCheckbox(
              target,
              findTemplate(templates.signalTemplates, target.signalId),
              state.selectedWeeklyTargetIds.includes(target.signalId)
            )).join("")}
          </section>
        </section>

        <section class="panel onboarding-step">
          <p class="eyebrow">Review setup</p>
          <h3>Review readiness</h3>
          <div class="progress-checklist">
            <span>Nexus/Riot identity: ${escapeHtml(riotIdentityLabel)}</span>
            <span>Recent games: ${escapeHtml(recentGamesLabel)}</span>
            <span>Review-ready games: ${escapeHtml(reviewReadyLabel)}</span>
          </div>
          <div class="action-row">
            <a class="button secondary" href="${escapeHtml(reviewHref)}">Go to Review</a>
          </div>
        </section>

        <section class="panel onboarding-step">
          <p class="eyebrow">Team focus seed</p>
          <h3>${escapeHtml(currentTeamFocus.title ?? selectedTeamFocus?.title ?? "No team focus configured")}</h3>
          <p><strong>Assignment:</strong> ${escapeHtml(currentTeamFocus.assignment ?? currentTeamFocus.assignedReview ?? "Not set")}</p>
          <label>
            Team focus seed
            <select name="selectedTeamFocusTemplateId">
              ${templates.teamFocusTemplates.map((template) => templateOption(template, selectedTeamFocus?.id)).join("")}
            </select>
          </label>
          <p class="muted">Team Focus is under construction; this setup value is saved as a seed for later team workflows.</p>
        </section>

        <section class="panel panel-slim onboarding-submit">
          <div>
            <p class="eyebrow">Save setup</p>
            <h3>${context.demoMode ? "Preview demo setup" : "Save setup"}</h3>
            <p class="muted" id="onboarding-status" aria-live="polite">${context.demoMode ? "Demo setup does not write server state." : "Saving will update your dashboard, goal, and team focus."}</p>
          </div>
          <div class="action-row">
            <button class="button" type="submit">${context.demoMode ? "Preview Setup" : "Save Setup"}</button>
            <a class="button secondary" href="${escapeHtml(dashboardHref)}">Dashboard</a>
          </div>
        </section>
      </form>
    `, {
      eyebrow: context.demoMode ? "Demo Setup" : "Setup",
      title: "Setup",
      text: "Save active goal and team focus setup.",
      compact: true
    });

    bindNavControls(root);
    bindNavSectionControls(root);
    bindSessionControls(root);

    const form = root.querySelector("#onboarding-form");
    form?.addEventListener("change", (event) => {
      if (event.target?.name === "selectedSignalIds" || event.target?.name === "weeklyTargetSignalIds") {
        syncStateFromForm(form);
        return;
      }
      syncStateFromForm(form);
      render();
    });

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const status = root.querySelector("#onboarding-status");
      const payload = payloadFromForm(form);

      if (context.demoMode) {
        status.textContent = "Demo preview is ready. The selected setup matches what the dashboard save would create.";
        return;
      }

      status.textContent = "Saving...";
      try {
        await requestJson("/api/onboarding", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });
        window.location.href = "/";
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : "Setup save failed.";
      }
    });
  }

  render();
}

async function renderFocusPage(root, scope, context = getRouteContext()) {
  const label = {
    today: "Focus Today",
    week: "Focus This Week",
    month: "Focus This Month"
  }[scope];
  const setupHref = canonicalSetupHref(context);

  root.innerHTML = appShell(`
    <section class="section-heading">
      <div>
        <p class="eyebrow">Setup</p>
        <h2>${escapeHtml(label)}</h2>
      </div>
      <p class="section-copy">This setup view moved.</p>
    </section>
    <section class="panel panel-slim">
      <p class="muted">Use Setup for active goal details, weekly targets, linked signals, and team focus.</p>
      <div class="action-row">
        <a class="button" href="${escapeHtml(setupHref)}">Open setup</a>
      </div>
    </section>
  `, {
    eyebrow: "Setup",
    title: label,
    text: "This view moved to Setup.",
    compact: true
  });
}

async function renderLibrary(root) {
  const context = getRouteContext();
  const url = new URL(window.location.href);
  const params = new URLSearchParams();
  params.set("status", "published");
  const viewMode = url.searchParams.get("view") ?? "grid";
  const viewModeLabel = {
    grid: "All Courses",
    role: "By Role",
    stage: "By Game Stage",
    concept: "By Concept"
  }[viewMode] ?? "All Courses";
  const hasFilters = Boolean(url.searchParams.get("contentType") || url.searchParams.get("topic") || url.searchParams.get("view"));

  if (url.searchParams.get("contentType")) {
    params.set("contentType", url.searchParams.get("contentType"));
  }
  if (url.searchParams.get("topic")) {
    params.set("topic", url.searchParams.get("topic"));
  }

  const [{ items }, homeResult] = await Promise.all([
    requestJson(`/api/content-items?${params.toString()}`),
    getSessionState().authenticated
      ? requestJson(context.homeApiUrl, context.requestOptions).catch(() => null)
      : Promise.resolve(null)
  ]);
  const dashboard = homeResult?.home?.goalDashboard ?? {};
  const goal = dashboard.activePersonalGoal ?? {};
  const dashboardView = dashboardState({ dashboard, goal, riotEvidence: goal.riotEvidence ?? {} });

  root.innerHTML = appShell(`
    <section class="panel ${dashboardView.hasReviewedGames ? "evidence-progress-panel" : "dashboard-inactive-panel"}">
      <p class="eyebrow">Evidence history</p>
      <h2>Library</h2>
      ${dashboardView.hasReviewedGames
        ? `
          <p class="muted">${escapeHtml(dashboardView.goalReviewedCount)} ${dashboardView.goalReviewedCount === 1 ? "game" : "games"} reviewed. Confirmed patterns and saved review outputs appear here as they are created.</p>
          <div class="progress-checklist">
            <span>${escapeHtml(dashboardView.goalReviewedCount)} ${dashboardView.goalReviewedCount === 1 ? "game" : "games"} reviewed</span>
            <span>${escapeHtml(dashboardView.patterns.length || dashboardView.goalSignals.length)} ${(dashboardView.patterns.length || dashboardView.goalSignals.length) === 1 ? "pattern" : "patterns"} found</span>
          </div>
        `
        : `
          ${statusBadge("Under construction", "unknown")}
          <p class="muted">Library fills as you review games. Reviewed games, confirmed patterns, and saved outputs will appear here.</p>
          <a class="button secondary" href="${escapeHtml(toAppHref("/review", context) ?? "/review")}">Open review</a>
        `}
    </section>
    <section class="panel panel-slim library-toolbar">
      <div class="library-toolbar-head">
        <div>
          <p class="eyebrow">Reference content</p>
          <h2>${escapeHtml(viewModeLabel)}</h2>
        </div>
        <p class="muted">${items.length} ${items.length === 1 ? "item" : "items"}</p>
      </div>
      <div class="view-mode-row" aria-label="Library display modes">
        <a class="view-mode-link${viewMode === "grid" ? " is-active" : ""}" href="${escapeHtml(buildLibraryUrl(url, { view: "grid" }))}">All Courses</a>
        <a class="view-mode-link${viewMode === "role" ? " is-active" : ""}" href="${escapeHtml(buildLibraryUrl(url, { view: "role" }))}">By Role</a>
        <a class="view-mode-link${viewMode === "stage" ? " is-active" : ""}" href="${escapeHtml(buildLibraryUrl(url, { view: "stage" }))}">By Game Stage</a>
        <a class="view-mode-link${viewMode === "concept" ? " is-active" : ""}" href="${escapeHtml(buildLibraryUrl(url, { view: "concept" }))}">By Concept</a>
      </div>
      <form class="filter-form library-filter-form">
        <label>
          Content Type
          <select name="contentType">
            <option value="">All</option>
            <option value="document" ${url.searchParams.get("contentType") === "document" ? "selected" : ""}>Document</option>
            <option value="deck" ${url.searchParams.get("contentType") === "deck" ? "selected" : ""}>Deck</option>
            <option value="video" ${url.searchParams.get("contentType") === "video" ? "selected" : ""}>Video</option>
          </select>
        </label>
        <label>
          Topic
          <input name="topic" value="${escapeHtml(url.searchParams.get("topic") ?? "")}" />
        </label>
        <button class="button" type="submit">Apply</button>
        ${hasFilters ? '<a class="button secondary" href="/library">Clear</a>' : ""}
      </form>
    </section>
    <section class="card-grid">
      ${items.length > 0 ? items.map((item) => contentCard(item)).join("") : '<p class="muted">No published content matches these filters yet.</p>'}
    </section>
  `, {
    eyebrow: "Library",
    title: "Library",
    text: "Evidence history and reference content.",
    pills: [],
    compact: true
  });

  root.querySelector(".filter-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const nextUrl = new URL("/library", window.location.origin);
    if (viewMode !== "grid") {
      nextUrl.searchParams.set("view", viewMode);
    }
    if (formData.get("contentType")) {
      nextUrl.searchParams.set("contentType", formData.get("contentType"));
    }
    if (formData.get("topic")) {
      nextUrl.searchParams.set("topic", formData.get("topic"));
    }
    window.location.href = nextUrl.toString();
  });
}

async function renderCuratorList(root) {
  const { items } = await requestJson("/api/content-items");

  root.innerHTML = appShell(`
    <section class="section-heading">
      <div>
        <p class="eyebrow">Curator Workspace</p>
        <h2>Content items</h2>
      </div>
      <p class="section-copy">Content records for drafts, published assets, and grouped learning material.</p>
    </section>
    <section class="panel panel-header">
      <div>
        <p class="eyebrow">Manage Library</p>
        <h3>Current records</h3>
      </div>
      <a class="button" href="/curator/content/new">Create Content</a>
    </section>
    <section class="card-grid">
      ${items.length > 0 ? items.map((item) => contentCard(item, true)).join("") : '<p class="muted">No content has been created yet.</p>'}
    </section>
  `, {
    title: "Content Items",
    text: "Create, edit, publish, or delete content records.",
    compact: true
  });
}

async function renderCreateForm(root) {
  root.innerHTML = appShell(`
    <section class="section-heading">
      <div>
        <p class="eyebrow">Curator</p>
        <h2>Create content</h2>
      </div>
      <p class="section-copy">Upload a file or add an external URL with required metadata.</p>
    </section>
    <section class="panel">
      <p class="eyebrow">New Record</p>
      <h3>Content item details</h3>
      <form class="content-form" id="content-create-form">
        ${contentFormFields()}
        <div class="action-row">
          <button class="button" type="submit">Create Content</button>
          <p class="muted form-status" aria-live="polite"></p>
        </div>
      </form>
    </section>
  `, {
    title: "Create Content",
    text: "Upload a file or add an external URL.",
    compact: true
  });

  const form = root.querySelector("#content-create-form");
  bindSourceTypeVisibility(form);

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = root.querySelector(".form-status");
    status.textContent = "Saving...";

    try {
      const formData = new FormData(form);
      const { item } = await requestJson("/api/content-items", {
        method: "POST",
        body: formData
      });
      window.location.href = `/content/${item.id}?curator=1`;
    } catch (error) {
      status.textContent = error.message;
    }
  });
}

async function renderDetail(root) {
  const match = window.location.pathname.match(/^\/content\/([^/]+)$/);
  const id = match?.[1];
  const curatorMode = new URL(window.location.href).searchParams.get("curator") === "1";

  if (!id) {
    root.innerHTML = appShell(`<p class="muted">Content item not found.</p>`, {
      title: "Content Not Found",
      text: "Check the content ID or return to the library.",
      compact: true
    });
    return;
  }

  const { item } = await requestJson(`/api/content-items/${id}`);

  root.innerHTML = appShell(`
    <section class="section-heading">
      <div>
        <p class="eyebrow">${escapeHtml(item.contentType)} · ${escapeHtml(item.status)}</p>
        <h2>${escapeHtml(item.title)}</h2>
      </div>
      <p class="section-copy">${escapeHtml(item.description)}</p>
    </section>
    <section class="detail-layout">
      <article class="panel reading-panel">
        <p class="eyebrow">Topics</p>
        <p class="muted">Topics: ${escapeHtml((item.topicTags ?? []).join(", ")) || "none"}</p>
        ${renderViewer(item)}
      </article>
      ${curatorMode ? `
        <aside class="panel">
          <p class="eyebrow">Curator Edit</p>
          <form class="content-form" id="content-edit-form">
            ${contentFormFields(item)}
            <div class="action-row">
              <button class="button" type="submit">Save Changes</button>
              <button class="button secondary" type="button" id="publish-button">Publish</button>
              <button class="button danger" type="button" id="delete-button">Delete</button>
            </div>
            <p class="muted form-status" aria-live="polite"></p>
          </form>
        </aside>
      ` : ""}
    </section>
  `, curatorMode ? {
    title: "Edit Content",
    text: "Update metadata, publication status, asset, or delete the record.",
    compact: true
  } : {
    title: "Content Detail",
    text: "View topics and available asset actions.",
    compact: true
  });

  if (!curatorMode) {
    bindViewerActions(root, item);
    return;
  }

  const form = root.querySelector("#content-edit-form");
  const status = root.querySelector(".form-status");
  bindSourceTypeVisibility(form);

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.textContent = "Saving...";

    try {
      const formData = new FormData(form);
      await requestJson(`/api/content-items/${id}`, {
        method: "PUT",
        body: formData
      });
      window.location.reload();
    } catch (error) {
      status.textContent = error.message;
    }
  });

  root.querySelector("#publish-button")?.addEventListener("click", async () => {
    status.textContent = "Publishing...";
    try {
      await requestJson(`/api/content-items/${id}/publish`, {
        method: "POST"
      });
      window.location.reload();
    } catch (error) {
      status.textContent = error.message;
    }
  });

  root.querySelector("#delete-button")?.addEventListener("click", async () => {
    status.textContent = "Deleting...";
    try {
      await requestJson(`/api/content-items/${id}`, {
        method: "DELETE"
      });
      window.location.href = "/curator/content";
    } catch (error) {
      status.textContent = error.message;
    }
  });

  bindViewerActions(root, item);
}

function bindViewerActions(root, item) {
  root.querySelectorAll("[data-share-link]").forEach((button) => {
    button.addEventListener("click", async () => {
      const sharePath = button.getAttribute("data-share-link");
      const absoluteUrl = new URL(sharePath || `/content/${item.id}`, window.location.origin).toString();
      const status = root.querySelector(".preview-status");

      try {
        await copyText(absoluteUrl);
        if (status) {
          status.textContent = "Share link copied.";
        }
      } catch {
        if (status) {
          status.textContent = absoluteUrl;
        }
      }
    });
  });

  root.querySelector("[data-generate-preview]")?.addEventListener("click", async () => {
    const status = root.querySelector(".preview-status");
    if (status) {
      status.textContent = "Generating preview...";
    }

    try {
      await requestJson(`/api/content-items/${item.id}/preview`, {
        method: "POST"
      });
      window.location.reload();
    } catch (error) {
      if (status) {
        status.textContent = error.message;
      }
    }
  });
}

function bindSessionControls(root) {
  const loginForm = root.querySelector("#session-login-form");
  const loginStatus = root.querySelector("#session-login-status");
  const logoutButton = root.querySelector("#session-logout-button");
  const tokenForm = root.querySelector("#session-token-form");
  const clearButton = root.querySelector("#session-clear-button");

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = loginForm.querySelector('button[type="submit"]');
    const formData = new FormData(loginForm);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (loginStatus) {
      loginStatus.textContent = "";
    }

    if (submitButton instanceof HTMLButtonElement) {
      submitButton.disabled = true;
      submitButton.textContent = "Signing In...";
    }

    try {
      await requestJson("/auth/login", {
        method: "POST",
        skipStoredToken: true,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });

      window.localStorage.removeItem("riftsense.authToken");
      window.location.reload();
    } catch (error) {
      if (loginStatus) {
        loginStatus.textContent = error instanceof Error ? error.message : "Sign-in failed.";
      }
    } finally {
      if (submitButton instanceof HTMLButtonElement) {
        submitButton.disabled = false;
        submitButton.textContent = submitButton.dataset.submitLabel || "Sign In";
      }
    }
  });

  logoutButton?.addEventListener("click", async () => {
    try {
      await requestJson("/auth/logout", {
        method: "POST",
        headers: {
          Accept: "application/json"
        }
      });
    } finally {
      window.localStorage.removeItem("riftsense.authToken");
      window.location.reload();
    }
  });

  tokenForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(tokenForm);
    const token = String(formData.get("authToken") ?? "").trim();
    if (token) {
      window.localStorage.setItem("riftsense.authToken", token);
    } else {
      window.localStorage.removeItem("riftsense.authToken");
    }
    window.location.reload();
  });

  clearButton?.addEventListener("click", () => {
    window.localStorage.removeItem("riftsense.authToken");
    window.location.reload();
  });
}

function isCompactNavViewport() {
  return window.matchMedia("(max-width: 800px)").matches;
}

function applyNavLayout(root) {
  const navCollapsed = window.localStorage.getItem("riftsense.navCollapsed") === "true";
  const navOpen = root.dataset.navOpen === "true";
  const drawer = root.querySelector("#nav-drawer");
  const overlay = root.querySelector("#nav-overlay");
  const mobileToggle = root.querySelector("#nav-toggle");
  const desktopToggle = root.querySelector("#nav-desktop-toggle");
  const compact = isCompactNavViewport();

  drawer?.classList.toggle("is-open", compact && navOpen);
  drawer?.classList.toggle("is-collapsed", !compact && navCollapsed);
  overlay?.classList.toggle("is-open", compact && navOpen);
  document.body.classList.toggle("nav-open", compact && navOpen);
  document.body.classList.toggle("nav-collapsed", !compact && navCollapsed);

  if (mobileToggle) {
    mobileToggle.textContent = compact && navOpen ? "Close Menu" : "Menu";
    mobileToggle.setAttribute("aria-expanded", String(compact && navOpen));
  }

  if (desktopToggle) {
    const expanded = !navCollapsed;
    desktopToggle.textContent = expanded ? "◀" : "▶";
    desktopToggle.setAttribute("aria-expanded", String(expanded));
    desktopToggle.setAttribute("aria-label", expanded ? "Collapse sidebar" : "Expand sidebar");
    desktopToggle.setAttribute("title", expanded ? "Collapse sidebar" : "Expand sidebar");
  }
}

function bindNavControls(root) {
  const mobileToggle = root.querySelector("#nav-toggle");
  const overlay = root.querySelector("#nav-overlay");
  const desktopToggle = root.querySelector("#nav-desktop-toggle");

  function setNavOpen(open) {
    root.dataset.navOpen = open ? "true" : "false";
    applyNavLayout(root);
  }

  mobileToggle?.addEventListener("click", () => {
    setNavOpen(root.dataset.navOpen !== "true");
  });

  overlay?.addEventListener("click", () => {
    setNavOpen(false);
  });

  desktopToggle?.addEventListener("click", () => {
    const nextCollapsed = !(window.localStorage.getItem("riftsense.navCollapsed") === "true");
    window.localStorage.setItem("riftsense.navCollapsed", String(nextCollapsed));
    applyNavLayout(root);
  });

  if (window.__riftsenseNavResizeHandler) {
    window.removeEventListener("resize", window.__riftsenseNavResizeHandler);
  }

  window.__riftsenseNavResizeHandler = () => {
    if (!isCompactNavViewport()) {
      root.dataset.navOpen = "false";
    }
    applyNavLayout(root);
  };

  window.addEventListener("resize", window.__riftsenseNavResizeHandler);

  root.dataset.navOpen = "false";
  applyNavLayout(root);
}

function bindNavSectionControls(root) {
  const sections = Array.from(root.querySelectorAll("[data-nav-section]"));

  sections.forEach((section) => {
    section.addEventListener("toggle", () => {
      if (!section.open) {
        return;
      }

      sections.forEach((other) => {
        if (other !== section) {
          other.open = false;
        }
      });

      window.localStorage.setItem("riftsense.navSection", section.dataset.navSection);
    });
  });
}

export async function renderApp(root) {
  const context = getRouteContext();
  const pathname = context.pathname;

  await loadSession();
  function setAuthPageMode(enabled) {
    document.body.classList.toggle("auth-page", enabled);
    if (enabled) {
      document.body.classList.remove("nav-open", "nav-collapsed");
    }
  }

  setAuthPageMode(pathname === "/login" && !getSessionState().authenticated);
  if (document.body.classList.contains("auth-page")) {
    document.body.classList.remove("nav-open", "nav-collapsed");
  }

  try {
    if (pathname === "/" && !getSessionState().authenticated) {
      window.history.replaceState({}, "", "/login");
      setAuthPageMode(true);
      renderLoginPage(root);
      bindSessionControls(root);
      return;
    }

    if (pathname === "/login") {
      if (getSessionState().authenticated) {
        window.history.replaceState({}, "", "/");
        setAuthPageMode(false);
        await renderHome(root, getRouteContext());
        bindNavControls(root);
        bindNavSectionControls(root);
        bindSessionControls(root);
        return;
      }

      renderLoginPage(root);
      bindSessionControls(root);
      return;
    }

    if (pathname === "/about") {
      renderPublicAbout(root);
      bindNavControls(root);
      bindNavSectionControls(root);
      bindSessionControls(root);
      return;
    }

    if (pathname === "/" || pathname === "/dashboard" || pathname === "/demo" || pathname === "/demo/adc" || pathname === "/demo/no-riot-linked") {
      await renderHome(root, context);
      bindNavControls(root);
      bindNavSectionControls(root);
      bindSessionControls(root);
      return;
    }

    if (pathname === "/setup" || pathname === "/demo/setup" || pathname === "/goals" || pathname === "/demo/goals" || pathname === "/onboarding" || pathname === "/demo/onboarding") {
      await renderOnboarding(root, context);
      return;
    }

    if (pathname === "/library") {
      await renderLibrary(root);
      bindNavControls(root);
      bindNavSectionControls(root);
      bindSessionControls(root);
      return;
    }

    if (pathname === "/focus/today") {
      await renderFocusPage(root, "today", context);
      bindNavControls(root);
      bindNavSectionControls(root);
      bindSessionControls(root);
      return;
    }

    if (pathname === "/focus/week") {
      await renderFocusPage(root, "week", context);
      bindNavControls(root);
      bindNavSectionControls(root);
      bindSessionControls(root);
      return;
    }

    if (pathname === "/focus/month") {
      await renderFocusPage(root, "month", context);
      bindNavControls(root);
      bindNavSectionControls(root);
      bindSessionControls(root);
      return;
    }

    if (pathname === "/drills" || pathname === "/test") {
      await renderGoalDashboardPage(root, "training", context);
      bindNavControls(root);
      bindNavSectionControls(root);
      bindSessionControls(root);
      return;
    }

    if (pathname === "/review" || pathname === "/demo/review") {
      await renderReviewPage(root, context);
      bindNavControls(root);
      bindNavSectionControls(root);
      bindSessionControls(root);
      return;
    }

    if (pathname === "/system-inventory") {
      await renderSystemInventoryPage(root, context);
      bindNavControls(root);
      bindNavSectionControls(root);
      bindSessionControls(root);
      return;
    }

    if (pathname === "/training" || pathname === "/demo/training") {
      await renderGoalDashboardPage(root, "training", context);
      bindNavControls(root);
      bindNavSectionControls(root);
      bindSessionControls(root);
      return;
    }

    if (pathname === "/team" || pathname === "/demo/team") {
      await renderGoalDashboardPage(root, "team", context);
      bindNavControls(root);
      bindNavSectionControls(root);
      bindSessionControls(root);
      return;
    }

    if (pathname === "/curator/content") {
      await renderCuratorList(root);
      bindNavControls(root);
      bindNavSectionControls(root);
      bindSessionControls(root);
      return;
    }

    if (pathname === "/curator/content/new") {
      await renderCreateForm(root);
      bindNavControls(root);
      bindNavSectionControls(root);
      bindSessionControls(root);
      return;
    }

    if (pathname.startsWith("/content/")) {
      await renderDetail(root);
      bindNavControls(root);
      bindNavSectionControls(root);
      bindSessionControls(root);
      return;
    }

    root.innerHTML = appShell(`<p class="muted">Unknown route.</p>`, {
      title: "RiftSense",
      compact: true
    });
    bindNavControls(root);
    bindNavSectionControls(root);
    bindSessionControls(root);
  } catch (error) {
    root.innerHTML = appShell(`<section class="panel"><p>${escapeHtml(error.message)}</p></section>`, {
      title: "RiftSense",
      compact: true
    });
    bindNavControls(root);
    bindNavSectionControls(root);
    bindSessionControls(root);
    return;
  }

  bindNavControls(root);
  bindNavSectionControls(root);
  bindSessionControls(root);
}
