function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const state = {
  session: null,
  recentEvaluationPreparationKeys: new Set(),
  recentGamesRefreshMessage: ""
};

const RECENT_EVALUATION_PREPARATION_LIMIT = 3;

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
  return pathname === "/" || pathname === "/about";
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
    return `/demo/goals${suffix}`;
  }
  if (pathname === "/review") {
    return `/demo/review${suffix}`;
  }
  if (pathname === "/onboarding") {
    return `/demo/onboarding${suffix}`;
  }
  if (pathname === "/training" || pathname === "/drills" || pathname === "/test") {
    return `/demo/training${suffix}`;
  }
  if (pathname === "/team") {
    return `/demo/team${suffix}`;
  }
  if (pathname === "/focus/today" || pathname === "/focus/week" || pathname === "/focus/month") {
    return `/demo/goals${suffix}`;
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
    ? `<a class="button secondary" href="${escapeHtml(session.accountUrl)}">Open Nexus</a>`
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
        <div class="panel panel-slim session-card">
          <p class="eyebrow">Signed In</p>
          <h2>${escapeHtml(displayName)}</h2>
          ${email ? `<p class="muted">${escapeHtml(email)}</p>` : ""}
          <div class="action-row">
            <button class="button secondary" type="button" id="session-logout-button">Sign Out</button>
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
        <form id="session-login-form" class="session-form">
          <label>
            Email
            <input type="email" name="email" autocomplete="email" required />
          </label>
          <label>
            Password
            <input type="password" name="password" autocomplete="current-password" required />
          </label>
          <div class="action-row">
            <button class="button" type="submit">Sign In</button>
            ${accountLink}
          </div>
          <p class="muted session-status" id="session-login-status" aria-live="polite"></p>
        </form>
        ${renderDeveloperTokenTools(session)}
      </div>
    </section>
  `;
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
  const heroText = hero.text ?? "Open goals, reviews, team focus, onboarding, or the content library.";
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
            { href: "/demo/goals", label: "Goals", active: pathname === "/demo/goals" },
            { href: "/demo/review", label: "Review", active: pathname === "/demo/review" },
            { href: "/demo/training", label: "Training", active: pathname === "/demo/training" },
            { href: "/demo/team", label: "Team", active: pathname === "/demo/team" },
            { href: "/demo/onboarding", label: "Onboarding", active: pathname === "/demo/onboarding" }
          ]
        : [
            { href: "/", label: "Dashboard", active: pathname === "/" },
            { href: "/goals", label: "Goals", active: pathname === "/goals" || pathname.startsWith("/focus/") },
            { href: "/review", label: "Review", active: pathname === "/review" },
            { href: "/training", label: "Training", active: pathname === "/training" || pathname === "/drills" || pathname === "/test" },
            { href: "/team", label: "Team", active: pathname === "/team" },
            { href: "/onboarding", label: "Onboarding", active: pathname === "/onboarding" },
            { href: "/library", label: "Library", active: pathname === "/library" || (pathname.startsWith("/content/") && !isCuratorDetail) }
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
          <p class="nav-meta">${escapeHtml(publicMode ? "Open the public home, About page, or demo." : "Open dashboard, review, training, team, or library.")}</p>
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
                      if (item.upcoming) {
                        return `<span class="side-nav-link is-upcoming" aria-disabled="true"><span>${escapeHtml(item.label)}</span><span class="side-nav-status">Soon</span></span>`;
                      }

                      return `<a class="side-nav-link${item.active ? " is-active" : ""}" href="${item.href}">${escapeHtml(item.label)}</a>`;
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

function targetChip(target) {
  const label = typeof target === "string" ? target : target.label;
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
        <p class="target-chip-label">${escapeHtml(label ?? "Weekly target")}</p>
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
  return Number.isFinite(reviewedCount) && reviewedCount > 0;
}

function compactTargetRow(target) {
  const label = typeof target === "string" ? target : target.label;
  const statusLabel = typeof target === "string" ? "Needs review" : target.statusLabel;
  const trend = typeof target === "string" ? "unknown" : target.trend;
  return `
    <article class="compact-row">
      <span>${escapeHtml(label ?? "Target")}</span>
      ${statusBadge(statusLabel ?? "Needs review", trend)}
    </article>
  `;
}

function goalSignalRow(signal) {
  return `
    <article class="compact-row">
      <span>${escapeHtml(signal.label)}</span>
      <span class="compact-row-value">${escapeHtml(signal.value)} · ${escapeHtml(trendLabel(signal.trend))}</span>
    </article>
  `;
}

function reviewTagButton(signal) {
  return `
    <button class="review-tag-button" type="button">
      <strong>${escapeHtml(signal.label)}</strong>
      <span>${escapeHtml(signal.value)} logged</span>
    </button>
  `;
}

function targetList(items, emptyText) {
  return `
    <ul class="target-list">
      ${(items ?? []).length > 0
        ? items.map((item) => `<li>${escapeHtml(typeof item === "string" ? item : item.label)}</li>`).join("")
        : `<li>${escapeHtml(emptyText)}</li>`}
    </ul>
  `;
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
  return `
    <article class="next-step-card">
      <p class="eyebrow">${escapeHtml(actionTypeLabel(step.type))} · ${escapeHtml(step.label ?? "Next")}${step.estimatedMinutes ? ` · ${escapeHtml(step.estimatedMinutes)} min` : ""}</p>
      <h3>${escapeHtml(step.title)}</h3>
      <p class="muted">${escapeHtml(step.reason ?? step.summary ?? "")}</p>
      ${step.href ? `<a class="button secondary" href="${escapeHtml(step.href)}">Open</a>` : ""}
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
    solo_death_candidate: "Possible unsupported death",
    enemy_level_up_recently_candidate: "Enemy level-up timing candidate",
    level_up_all_in_candidate: "Possible level-up all-in",
    multi_enemy_collapse_candidate: "Multi-enemy collapse candidate",
    objective_window_candidate: "Objective-window candidate",
    objective_setup_death_candidate: "Objective setup death candidate",
    objective_exit_death_candidate: "Objective exit death candidate",
    isolated_forward_death_candidate: "Possible isolated forward death"
  };
  if (labels[value]) {
    return labels[value];
  }
  return String(value ?? "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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
    label: "multi-enemy deaths",
    singularLabel: "multi-enemy death",
    priorityLabel(count) {
      return count > 1 ? "Repeated multi-enemy deaths" : "Multi-enemy death";
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
    label: "level-up all-in deaths",
    singularLabel: "level-up all-in death",
    priorityLabel() {
      return "Level-up all-in deaths";
    }
  },
  {
    tag: "enemy_level_up_recently_candidate",
    label: "level-up timing deaths",
    singularLabel: "level-up timing death",
    priorityLabel() {
      return "Level-up timing deaths";
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
  if (!summary) {
    return `<p class="muted">Evaluation: ${escapeHtml(status)}</p>`;
  }

  const signals = Array.isArray(summary.reviewSignals) && summary.reviewSignals.length > 0
    ? summary.reviewSignals
    : [`${summary.deathCount ?? 0} ${(summary.deathCount ?? 0) === 1 ? "death" : "deaths"}`];

  return `
    <div class="evaluation-summary">
      <p class="eyebrow">Review Signals · ${escapeHtml(status)}</p>
      <ul>
        ${signals.slice(0, 4).map((signal) => `<li>${escapeHtml(signal)}</li>`).join("")}
      </ul>
    </div>
  `;
}

function recentGameState(game) {
  if (game?.reviewedAt) {
    return { label: "Reviewed", actionLabel: "Open review", canReview: true };
  }
  if (game?.reviewStartedAt) {
    return { label: "Review started", actionLabel: "Continue review", canReview: true };
  }
  if (gameIsEvaluationReady(game)) {
    return { label: "Evaluation ready", actionLabel: "Review", canReview: true };
  }
  if (game?.evaluationStatus === "failed") {
    return { label: "Evaluation failed", actionLabel: null, canReview: false };
  }
  if (gameHasSummaryMetadata(game)) {
    return { label: "Summary ready", actionLabel: "Open summary", canReview: true };
  }
  if (game?.parseStatus === "parse_failed" || game?.sourceMetadata?.parseStatus === "parse_failed") {
    return { label: "Summary failed", actionLabel: null, canReview: false };
  }
  return { label: "Discovered", actionLabel: null, canReview: false };
}

function riotEvidenceCard(riotEvidence, context = {}) {
  if (!riotEvidence) {
    return "";
  }

  const recentGames = riotEvidence.recentGames ?? riotEvidence.candidateGames ?? [];
  const sourceLabel = riotEvidence.sourceLabel ? `<p class="eyebrow">${escapeHtml(riotEvidence.sourceLabel)}</p>` : "";
  return `
    <section class="panel riot-evidence-panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Recent Game Evidence</p>
          <h2>${escapeHtml(riotEvidenceTitle(riotEvidence))}</h2>
          ${sourceLabel}
        </div>
        <div class="action-row">
          ${getSessionState().authenticated ? '<button class="button secondary" type="button" data-refresh-recent-games>Refresh recent games</button>' : ""}
          ${riotEvidence.confidence ? statusBadge(riotEvidence.confidence, riotEvidence.status === "seeded-demo" ? "watch" : riotStatusTrend(riotEvidence.status)) : ""}
        </div>
      </div>
      <p class="muted recent-games-refresh-status" aria-live="polite">${escapeHtml(state.recentGamesRefreshMessage)}</p>
      <p class="muted">${escapeHtml(riotEvidenceSummary(riotEvidence))}</p>
      ${riotReadinessLine(riotEvidence)}
      <p class="eyebrow">Recent Games</p>
      <section class="compact-list">
        ${recentGames.length > 0
          ? recentGames.map((game) => {
            const hasSummaryMetadata = gameHasSummaryMetadata(game);
            const state = recentGameState(game);
            const title = hasSummaryMetadata
              ? `${game.champion ?? game.championName ?? "Unknown champion"} · ${game.queueLabel} · ${game.result}`
              : `${game.champion ?? game.championName ?? "Unknown champion"} · ${state.label}`;
            const value = hasSummaryMetadata
              ? `${game.kda} · ${game.csPerMinute ?? "?"} cs/min`
              : state.label;
            const action = state.canReview
              ? `<a class="button secondary compact-row-action" href="${escapeHtml(reviewHrefForGame(game, context))}">${escapeHtml(state.actionLabel)}</a>`
              : "";

            return `
              <article class="compact-row game-evidence-row">
                <div class="game-evidence-main">
                  <span class="compact-row-main">${escapeHtml(title)}</span>
                  <span class="compact-row-value">${escapeHtml(value)}</span>
                  <span class="muted">${escapeHtml(game.relevanceReason ?? "")}</span>
                  ${evaluationSummaryBlock(game)}
                </div>
                <div class="game-evidence-actions">
                  <span class="context-badge">${escapeHtml(state.label)}</span>
                  <span class="muted">${escapeHtml((game.confidenceLabel ?? "").toUpperCase())}</span>
                  ${action}
                </div>
              </article>
            `;
          }).join("")
          : '<p class="muted">No recent games are available yet.</p>'}
      </section>
    </section>
  `;
}

function reviewCandidateCard(riotEvidence, goal, context = {}) {
  const candidate = riotEvidence?.reviewCandidate ?? null;
  if (!candidate?.matchId) {
    const hasEvaluatedGame = (riotEvidence?.candidateGames ?? []).some((game) =>
      game?.evaluationStatus === "current" && game?.evaluationSummary
    );
    if (!hasEvaluatedGame && (riotEvidence?.readyCount > 0 || (riotEvidence?.recentGames ?? riotEvidence?.candidateGames ?? []).length > 0)) {
      const counts = riotReadinessCounts(riotEvidence);
      const message = counts.summaryReadyCount > 0
        ? "Match summaries are ready. Evaluations are pending."
        : "Recent games found. Match summaries are being prepared.";
      return `
        <section class="panel review-candidate-panel">
          <div class="panel-header">
            <div>
              <p class="eyebrow">Today's Review Candidate</p>
              <h2>${escapeHtml(counts.summaryReadyCount > 0 ? "Review candidate pending" : "Review candidate unavailable")}</h2>
            </div>
          </div>
          <p class="muted">${escapeHtml(message)}</p>
        </section>
      `;
    }

    return "";
  }

  const signals = candidate.topDeterministicSignals?.length > 0
    ? candidate.topDeterministicSignals.map((signal) => signal.label ?? signal.tag).filter(Boolean)
    : candidate.evaluationSummary?.reviewSignals ?? [];
  const goalRelevance = candidate.goalRelevance ?? (
    goal?.title ? `${goal.title}${goal.role ? ` · ${goal.role}` : ""}` : null
  );

  return `
    <section class="panel review-candidate-panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Today's Review Candidate</p>
          <h2>${escapeHtml(candidate.champion ?? candidate.championName ?? "Unknown champion")}</h2>
        </div>
        <a class="button" href="${escapeHtml(reviewHrefForGame(candidate, context))}">Review this game</a>
      </div>
      <div class="badge-row">
        ${statusBadge(candidate.result, candidate.result === "Win" ? "positive" : "watch")}
        <span class="context-badge">${escapeHtml(candidate.queueLabel)}</span>
        <span class="context-badge">${escapeHtml(candidate.kda)} KDA</span>
      </div>
      ${signals.length > 0 ? renderSignalList(signals.slice(0, 3), "") : '<p class="muted">No deterministic signals are available yet.</p>'}
      <p class="muted">${escapeHtml(candidate.selectionReason ?? candidate.relevanceReason ?? "Selected from recent reviewable games.")}</p>
      ${goalRelevance ? `<p class="muted">Goal relevance: ${escapeHtml(goalRelevance)}</p>` : ""}
    </section>
  `;
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

const REVIEW_STATUS_LABELS = {
  confirmed: "Confirmed",
  dismissed: "Dismissed",
  unsure: "Unsure"
};

const REVIEW_CAUSES = [
  ["", "Cause"],
  ["walked_without_cover", "Walked without cover"],
  ["outnumbered_fight", "Outnumbered fight"],
  ["stayed_too_long", "Stayed too long"],
  ["objective_setup_mistake", "Objective setup mistake"],
  ["mechanics_misplay", "Mechanics/misplay"],
  ["team_fight_already_lost", "Team fight already lost"],
  ["not_preventable", "Not preventable"],
  ["other", "Other"]
];

function reviewMomentKey(deathIndex, signalId) {
  return `${deathIndex}:${signalId}`;
}

function reviewedMomentIndex(reviewedMoments = []) {
  return new Map(
    reviewedMoments.map((moment) => [reviewMomentKey(moment.deathIndex, moment.signalId), moment])
  );
}

function renderCauseSelect(moment, deathIndex, signalId) {
  return `
    <label class="review-cause-label">
      <span class="sr-only">Cause category</span>
      <select class="review-cause-select" data-death-index="${escapeHtml(String(deathIndex))}" data-signal-id="${escapeHtml(signalId)}">
        ${REVIEW_CAUSES.map(([value, label]) => `
          <option value="${escapeHtml(value)}"${moment?.causeCategory === value ? " selected" : ""}>${escapeHtml(label)}</option>
        `).join("")}
      </select>
    </label>
  `;
}

function renderReviewControls({ death, deathIndex, signalId, moment }) {
  const timestamp = Number.isFinite(Number(death?.timestampSeconds))
    ? Number(death.timestampSeconds)
    : Number.isFinite(Number(death?.timestampMs))
      ? Math.round(Number(death.timestampMs) / 1000)
      : "";
  const status = moment?.status ?? "unreviewed";

  return `
    <div class="review-moment-control" data-review-moment="${escapeHtml(reviewMomentKey(deathIndex, signalId))}">
      <p class="muted">Review status: <strong data-review-status-label>${escapeHtml(REVIEW_STATUS_LABELS[status] ?? "Unreviewed")}</strong></p>
      <div class="review-control-row">
        <button class="button secondary review-status-button" type="button" data-review-status="confirmed" data-death-index="${escapeHtml(String(deathIndex))}" data-death-timestamp-seconds="${escapeHtml(String(timestamp))}" data-signal-id="${escapeHtml(signalId)}">Confirm</button>
        <button class="button secondary review-status-button" type="button" data-review-status="dismissed" data-death-index="${escapeHtml(String(deathIndex))}" data-death-timestamp-seconds="${escapeHtml(String(timestamp))}" data-signal-id="${escapeHtml(signalId)}">Dismiss</button>
        <button class="button secondary review-status-button" type="button" data-review-status="unsure" data-death-index="${escapeHtml(String(deathIndex))}" data-death-timestamp-seconds="${escapeHtml(String(timestamp))}" data-signal-id="${escapeHtml(signalId)}">Unsure</button>
        ${renderCauseSelect(moment, deathIndex, signalId)}
      </div>
    </div>
  `;
}

function renderDeathFacts(deaths, reviewedMoments = []) {
  if (!Array.isArray(deaths) || deaths.length === 0) {
    return '<p class="muted">No deterministic death facts are available for this match.</p>';
  }

  const momentsByKey = reviewedMomentIndex(reviewedMoments);

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
            <div class="review-moment-list">
              ${detectedSignalIds.map((signalId) => `
                <div class="review-signal-row">
                  <p><strong>${escapeHtml(tagLabel(signalId))}</strong></p>
                  ${renderReviewControls({
                    death,
                    deathIndex,
                    signalId,
                    moment: momentsByKey.get(reviewMomentKey(deathIndex, signalId))
                  })}
                </div>
              `).join("")}
            </div>
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
  return (death?.tags ?? []).map(tagLabel);
}

function reviewMomentReasons(death) {
  const reasons = [];
  const tags = new Set(death?.tags ?? []);
  if (Number(death?.nearbyEnemyCount ?? 0) >= 2 || tags.has("multi_enemy_collapse_candidate")) {
    reasons.push("Multiple enemies were involved or nearby.");
  }
  if (tags.has("objective_window_candidate") || tags.has("objective_setup_death_candidate") || tags.has("objective_exit_death_candidate")) {
    reasons.push("Death occurred near an objective window.");
  }
  if (tags.has("enemy_level_up_recently_candidate") || tags.has("level_up_all_in_candidate")) {
    reasons.push("Enemy level-up timing was detected.");
  }
  if (tags.has("solo_death_candidate") || tags.has("isolated_forward_death_candidate")) {
    reasons.push("Possible unsupported position.");
  }
  if (Number(death?.killerLevel ?? 0) > Number(death?.victimLevel ?? 0)) {
    reasons.push("Killer had a level advantage.");
  }
  return reasons.length > 0 ? reasons : ["Death event has deterministic facts to inspect."];
}

function scoreReviewDeath(death, tagCounts = {}) {
  const tags = new Set(death?.tags ?? []);
  let score = tags.size * 10;
  if (Number(death?.nearbyEnemyCount ?? 0) >= 2 || tags.has("multi_enemy_collapse_candidate")) score += 35;
  if (tags.has("objective_window_candidate") || tags.has("objective_setup_death_candidate") || tags.has("objective_exit_death_candidate")) score += 30;
  if (tags.has("enemy_level_up_recently_candidate") || tags.has("level_up_all_in_candidate")) score += 25;
  if (tags.has("solo_death_candidate") || tags.has("isolated_forward_death_candidate")) score += 20;
  if (Number(death?.killerLevel ?? 0) > Number(death?.victimLevel ?? 0)) score += 15;
  for (const tag of tags) {
    if (Number(tagCounts[tag] ?? 0) > 1) score += 12;
  }
  return score;
}

export function buildMatchReviewPlan(review) {
  const deaths = Array.isArray(review?.deathEvents) ? review.deathEvents : [];
  const tagCounts = review?.deterministicTagCounts ?? {};
  if (!review?.evaluationSummary || deaths.length === 0) {
    return {
      primaryPattern: null,
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

  return {
    primaryPattern: primaryTag ? {
      id: primaryTag[0],
      title: tagLabel(primaryTag[0]),
      confidence: Number(primaryTag[1]) >= 3 ? "high" : "medium",
      summary: `${Number(primaryTag[1])} deaths share this detected signal. Use the timestamps below to compare the setup before each death.`,
      deathTimes: primaryDeaths.slice(0, 3).map(formatDeathTimestamp),
      supportingSignals: reviewMomentSignals(primaryDeaths[0] ?? {}).slice(0, 4)
    } : null,
    reviewMoments: rankedDeaths.slice(0, 3).map(({ death, priority }) => ({
      time: formatDeathTimestamp(death),
      priority,
      headline: `${tagLabel((death.tags ?? [])[0] ?? "death_count")} at ${formatDeathTimestamp(death)}`,
      detectedSignals: reviewMomentSignals(death),
      whyReview: reviewMomentReasons(death),
      reviewQuestion: "What information or teammate position should have changed this decision before the death?",
      deterministicLesson: Number(death?.killerLevel ?? 0) > Number(death?.victimLevel ?? 0)
        ? "Respect level disadvantage before contesting space."
        : undefined
    })),
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

function renderReviewPlan(plan, review) {
  if (!review?.evaluationSummary) {
    return renderReviewPriority(deriveReviewPriority(review));
  }
  if ((review.evaluationSummary?.deathCount ?? 0) === 0) {
    return renderReviewPriority(deriveReviewPriority(review));
  }
  const timestamps = plan.primaryPattern?.deathTimes?.length
    ? plan.primaryPattern.deathTimes
    : plan.reviewMoments.map((moment) => moment.time);

  return `
    <article class="panel review-priority-panel">
      <p class="eyebrow">Guided Review Plan</p>
      <h3>${escapeHtml(plan.primaryPattern?.title ?? "Death review")}</h3>
      <p class="muted">${escapeHtml(plan.primaryPattern?.summary ?? "Review the highest-priority deterministic death moments first.")}</p>
      ${timestamps.length > 0 ? `<p class="muted">Inspect first: ${escapeHtml(timestamps.slice(0, 3).join(", "))}</p>` : ""}
      <p class="muted">Why review: overlapping detected signals and repeated candidates are ranked before single-signal deaths.</p>
    </article>
    <section class="compact-list">
      ${plan.reviewMoments.map((moment) => `
        <article class="panel">
          <p class="eyebrow">${escapeHtml(moment.time)}</p>
          <h3>${escapeHtml(moment.headline)}</h3>
          ${renderSignalList(moment.detectedSignals, "No detected signals for this moment.")}
          <p class="muted">Flagged because: ${escapeHtml(moment.whyReview.join(" "))}</p>
          <p><strong>Review question:</strong> ${escapeHtml(moment.reviewQuestion)}</p>
          ${moment.deterministicLesson ? `<p class="muted">${escapeHtml(moment.deterministicLesson)}</p>` : ""}
        </article>
      `).join("")}
    </section>
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
      <p class="eyebrow">Review First</p>
      <h3>${escapeHtml(priority.title)}</h3>
      <p class="muted">${escapeHtml(priority.detail)}</p>
      ${timestampLine}
      ${groupList}
    </article>
  `;
}

function renderReviewLanding(root, context = getRouteContext()) {
  root.innerHTML = appShell(`
    <section class="goal-dashboard-stack">
      <section class="panel active-goal-panel">
        <p class="eyebrow">Review</p>
        <h2>Choose a recent game from the dashboard to review.</h2>
        <div class="action-row">
          <a class="button" href="${escapeHtml(toAppHref("/", context) ?? "/")}">Open dashboard</a>
        </div>
      </section>
    </section>
  `, {
    eyebrow: "Review",
    title: "Review",
    text: "Choose a recent game from the dashboard.",
    compact: true
  });
}

function renderMatchReview(root, review, context = getRouteContext()) {
  const summary = review.matchSummary ?? {};
  const evaluationSummary = review.evaluationSummary ?? null;
  const reviewSignals = evaluationSummary?.reviewSignals ?? [];
  const goalRelevance = review.goalRelevance ?? review.relevanceReason ?? null;
  const reviewPlan = buildMatchReviewPlan(review);

  root.innerHTML = appShell(`
    <section class="section-heading">
      <div>
        <p class="eyebrow">Deterministic Review</p>
        <h2>${escapeHtml(matchSummaryTitle(review))}</h2>
      </div>
      <p class="section-copy">${escapeHtml(kdaLabel(summary))} KDA${summary.role ? ` · ${escapeHtml(summary.role)}` : ""}</p>
    </section>
    ${renderReviewPlan(reviewPlan, review)}
    <section class="review-workspace-layout">
      <article class="panel review-run-panel">
        <p class="eyebrow">Match Summary</p>
        <h3>${escapeHtml(summary.championName ?? "Unknown champion")}</h3>
        <div class="badge-row">
          ${statusBadge(summary.result ?? "Unknown result", summary.result === "Win" ? "positive" : "watch")}
          <span class="context-badge">${escapeHtml(summary.queueLabel ?? "Unknown queue")}</span>
          <span class="context-badge">${escapeHtml(kdaLabel(summary))} KDA</span>
        </div>
        <p class="muted">Evaluation: ${escapeHtml(review.evaluationStatus ?? "unknown")}</p>
      </article>
      <article class="panel">
        <p class="eyebrow">Detected Signals</p>
        ${renderSignalList(reviewSignals, "No review signals are available yet.")}
      </article>
      <details class="panel">
        <summary>Raw deterministic facts</summary>
        <p class="muted">Confirmed signals update goal progress. Dismissed and unsure signals stay visible here and do not count.</p>
        ${review.evaluationSummary ? renderDeathFacts(review.deathEvents, review.reviewedMoments) : '<p class="muted">Evaluation is not prepared for this match yet.</p>'}
      </details>
      <details class="panel">
        <summary>Raw signal counts</summary>
        ${renderTagCounts(review.deterministicTagCounts)}
      </details>
      ${goalRelevance ? `
        <article class="panel">
          <p class="eyebrow">Goal Relevance</p>
          <p class="muted">${escapeHtml(goalRelevance)}</p>
        </article>
      ` : ""}
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

  root.addEventListener("click", async (event) => {
    const button = event.target.closest(".review-status-button");
    if (!button) {
      return;
    }

    const container = button.closest("[data-review-moment]");
    const causeSelect = container?.querySelector(".review-cause-select");
    const body = {
      deathIndex: Number(button.dataset.deathIndex),
      deathTimestampSeconds: button.dataset.deathTimestampSeconds ? Number(button.dataset.deathTimestampSeconds) : null,
      signalId: button.dataset.signalId,
      status: button.dataset.reviewStatus,
      causeCategory: causeSelect?.value || null
    };

    button.disabled = true;
    try {
      const result = await requestJson(`/api/matches/${encodeURIComponent(review.matchId)}/reviewed-moments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const label = container?.querySelector("[data-review-status-label]");
      if (label) {
        label.textContent = REVIEW_STATUS_LABELS[result.reviewedMoment?.status] ?? "Unreviewed";
      }
    } finally {
      button.disabled = false;
    }
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
    relevanceReason: game.relevanceReason ?? null
  };
}

async function renderReviewPage(root, context = getRouteContext()) {
  const url = new URL(window.location.href);
  const matchId = url.searchParams.get("matchId");

  if (!matchId) {
    renderReviewLanding(root, context);
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
      renderMatchReview(root, review, context);
      bindReviewMomentControls(root, review);
      return;
    }

    const review = await requestJson(`/api/matches/${encodeURIComponent(matchId)}/evaluation`);
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

function actionStepList(steps) {
  return `
    <ol class="action-step-list">
      ${(steps ?? []).length > 0
        ? steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")
        : "<li>Choose one review moment and write the next action.</li>"}
    </ol>
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

    if (home.user?.source === "public") {
      root.innerHTML = appShell(`
        <section class="goal-dashboard-stack">
          <section class="panel active-goal-panel">
            <p class="eyebrow">RiftSense</p>
            <h2>${escapeHtml(home.publicEntry?.title ?? "RiftSense")}</h2>
            <p class="muted">${escapeHtml(home.publicEntry?.summary ?? "")}</p>
            <div class="action-row">
              <a class="button" href="${escapeHtml(home.publicEntry?.signInHref ?? "/#session-login-form")}">${escapeHtml(home.publicEntry?.signInLabel ?? "Continue with Nexus")}</a>
              <a class="button secondary" href="${escapeHtml(home.publicEntry?.aboutHref ?? "/about")}">About</a>
              <a class="button secondary" href="${escapeHtml(home.publicEntry?.demoHref ?? "/demo")}">Demo</a>
            </div>
          </section>
          <section class="dashboard-two-column">
            <section class="panel">
              <p class="eyebrow">What It Does</p>
              <h2>Turn recent games into goal-linked review work</h2>
              <p class="muted">RiftSense uses Nexus identity, Riot account data, and active goals to surface review candidates and next actions.</p>
            </section>
            <section class="panel">
              <p class="eyebrow">Start Here</p>
              <h2>Sign in or open the seeded demo</h2>
              <p class="muted">Use Nexus sign-in for your own setup, or open the demo to inspect the current ADC evidence flow.</p>
            </section>
          </section>
        </section>
      `, {
        eyebrow: "Public Home",
        title: "RiftSense",
        text: "Review goals, recent games, and team focus from a Nexus-authenticated workflow."
      });
      return;
    }

    const profile = home.user.profile ?? {};
    const dashboard = home.goalDashboard ?? {};
    const goal = dashboard.activePersonalGoal ?? {};
    const action = dashboard.todaysAction ?? {};
    const teamFocus = dashboard.activeTeamFocus ?? {};
    const recentInsights = dashboard.recentInsights ?? [];
    const suggestedNextSteps = (dashboard.suggestedNextSteps ?? []).filter((step) =>
      Boolean(toAppHref(step.href, context) || !step.href)
    );
    const riotEvidence = goal.riotEvidence ?? null;
    const goalEvidenceSource = goal.evidenceSource ?? {};
    const teamEvidenceSource = teamFocus.evidenceSource ?? {};
    const reviewedEvidenceReady = hasReviewedEvidence(goal, dashboard);
    const displayGoalStatus = reviewedEvidenceReady ? (goal.goalStatus ?? "No data yet") : "No reviewed games yet";
    const displayGoalStatusTrend = reviewedEvidenceReady ? (goal.goalStatusTrend ?? "unknown") : "unknown";
    const displayTrend = reviewedEvidenceReady ? (goal.trend ?? "Unknown") : "Unknown";
    const displayConfidence = reviewedEvidenceReady ? (goal.confidence ?? "Low sample") : "No reviewed games yet";
    const weeklyTargets = reviewedEvidenceReady ? (goal.weeklyTargets ?? []) : [];
    const goalSignals = reviewedEvidenceReady ? (goal.signals ?? []) : [];
    const insights = reviewedEvidenceReady ? recentInsights : [];
    const reviewHref = toAppHref("/review", context) ?? "#";
    const goalsHref = toAppHref("/goals", context) ?? "#";
    const actionHref = toAppHref(action.href ?? "/review", context) ?? reviewHref;
    const teamHref = toAppHref("/team", context) ?? "#";
    const teamActionHref = toAppHref(teamFocus.nextTeamAction?.href ?? "/team", context) ?? teamHref;
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
      ? `
      <section class="panel panel-slim">
        <p class="eyebrow">${escapeHtml(home.setupGuide.status === "setup-needed" ? "Setup" : "Next")}</p>
        <h2>${escapeHtml(home.setupGuide.title ?? "Setup needed")}</h2>
        <p class="muted">${escapeHtml(home.setupGuide.summary ?? "")}</p>
        ${home.setupGuide.href ? `<a class="button" href="${escapeHtml(toAppHref(home.setupGuide.href, context) ?? home.setupGuide.href)}">${escapeHtml(home.setupGuide.label ?? "Open setup")}</a>` : ""}
      </section>
    `
      : "";

    root.innerHTML = appShell(`
    <section class="goal-dashboard-stack">
      ${demoBanner}
      ${setupGuide}
      <section class="panel active-goal-panel">
        <div class="active-goal-hero">
          <div class="active-goal-copy">
            <p class="eyebrow">Active Goal</p>
            <h2>${escapeHtml(goal.title ?? "No active goal yet")}</h2>
            <div class="badge-row">
              <span class="context-badge">${escapeHtml(focusTagline)}</span>
              ${statusBadge(displayGoalStatus, displayGoalStatusTrend)}
              ${statusBadge(`Trend: ${displayTrend}`, reviewedEvidenceReady ? (goal.trendKey ?? "unknown") : "unknown")}
              ${statusBadge(`Confidence: ${displayConfidence}`, "unknown")}
            </div>
            <div class="hero-next-action">
              <p class="eyebrow">Next action</p>
              <h3>${escapeHtml(action.title ?? "No action configured yet")}</h3>
              <a class="button" href="${escapeHtml(actionHref)}">${escapeHtml(action.ctaLabel ?? "Start review")}</a>
            </div>
            ${evidenceMeta(
              goalEvidenceSource.summary,
              goalEvidenceSource.confidence,
              goalEvidenceSource.confidenceTrend
            )}
          </div>
          <div class="active-goal-targets">
            <p class="eyebrow">Weekly Targets</p>
            ${targetChipGrid(weeklyTargets, "Review a game to establish weekly targets.")}
          </div>
        </div>
        <div class="active-goal-footer">
          <p class="muted">${escapeHtml(reviewedEvidenceReady ? (goal.progressSummary ?? "No trend summary yet.") : "No reviewed games yet.")}</p>
          <div class="action-row">
            <a class="button secondary" href="${escapeHtml(goalsHref)}">View Goals</a>
          </div>
        </div>
      </section>

      <section class="dashboard-two-column">
        <section class="panel team-focus-panel">
          <div class="panel-header">
            <div>
              <p class="eyebrow">Team Focus</p>
              <h2>${escapeHtml(teamFocus.title ?? "No team focus configured")}</h2>
            </div>
            <a class="button secondary" href="${escapeHtml(teamHref)}">Open Team Focus</a>
          </div>
          <div class="team-focus-meta">
            <p><strong>Your assignment:</strong> ${escapeHtml(teamFocus.assignment ?? "Not set")}</p>
            <p><strong>Practice topic:</strong> ${escapeHtml(teamFocus.practiceTopic ?? "Not set")}</p>
            <p><strong>Next team action:</strong> ${escapeHtml(teamFocus.nextTeamAction?.title ?? "Not set")}</p>
            <p><strong>Recent team signal:</strong> ${escapeHtml(reviewedEvidenceReady && teamFocus.headlineSignal ? `${teamFocus.headlineSignal.value} ${teamFocus.headlineSignal.label.toLowerCase()}${Number(teamFocus.headlineSignal.value) === 1 ? "" : "s"}` : "Seeded from onboarding. Not updated from reviewed games yet.")}</p>
          </div>
          ${evidenceMeta(
            teamEvidenceSource.summary,
            teamEvidenceSource.confidence,
            teamEvidenceSource.confidenceTrend
          )}
          ${teamFocus.nextTeamAction?.title ? `
            <div class="action-row">
              <a class="button secondary" href="${escapeHtml(teamActionHref)}">Open ${escapeHtml(actionTypeLabel(teamFocus.nextTeamAction.type).toLowerCase())}</a>
            </div>
          ` : ""}
        </section>

        <section class="panel insights-panel">
          <div class="panel-header">
            <div>
              <p class="eyebrow">Insights</p>
              <h2>Recent read</h2>
            </div>
          </div>
          <section class="insight-grid">
            ${insights.length > 0
              ? insights.slice(0, 2).map(insightCard).join("")
              : '<p class="muted">Insights will appear after you review games.</p>'}
          </section>
        </section>
      </section>

      <section class="panel recent-signals-panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Recent Signals</p>
            <h2>Goal-linked evidence</h2>
          </div>
        </div>
          <section class="signal-grid">
          ${goalSignals.length > 0
            ? goalSignals.map(signalCard).join("")
            : '<p class="muted">No goal-linked signals yet. Review a game to record the first one.</p>'}
        </section>
      </section>

      ${reviewCandidateCard(riotEvidence, goal, context)}
      ${riotEvidenceCard(riotEvidence, context)}

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
              .map((step) => nextStepCard({
                ...step,
                href: toAppHref(step.href, context)
              }))
              .join("")
            : '<p class="muted">No next steps yet. Add a goal or team focus to generate suggestions.</p>'}
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
          <a class="button" href="/#session-login-form">Continue with Nexus</a>
          <a class="button secondary" href="/demo">View Demo</a>
        </div>
      </section>
      <section class="dashboard-two-column">
        <section class="panel">
          <p class="eyebrow">Current Scope</p>
          <h2>Goals, evidence, and setup</h2>
          <p class="muted">Authenticated players can save setup, see goal-linked evidence states, and review Riot recent-game candidates when Riot identity and RiftSense config are available.</p>
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
          <a class="button" href="/#session-login-form">Continue with Nexus</a>
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
  const action = dashboard.todaysAction ?? {};
  const teamFocus = dashboard.activeTeamFocus ?? {};
  const recentInsights = dashboard.recentInsights ?? [];

  const pages = {
    goals: {
      eyebrow: "Goals",
      title: "Goal Settings",
      text: "Targets, signals, and linked work.",
      content: `
        <section class="goal-management-layout">
          <article class="panel goal-roster-panel">
            <p class="eyebrow">Active</p>
            <h3>${escapeHtml(goal.title ?? "No active goal yet")}</h3>
            <div class="badge-row">
              ${statusBadge(goal.goalStatus ?? "No data yet", goal.goalStatusTrend ?? "unknown")}
              <span class="context-badge">${escapeHtml(goal.role ?? "Player")} · ${escapeHtml(goal.scope ?? "Personal")}</span>
            </div>
          </article>
          <article class="panel">
            <p class="eyebrow">Weekly Targets</p>
            <section class="compact-list">
              ${(goal.weeklyTargets ?? []).length > 0
                ? goal.weeklyTargets.map(compactTargetRow).join("")
                : '<p class="muted">No weekly targets configured yet.</p>'}
            </section>
          </article>
          <article class="panel">
            <p class="eyebrow">Monthly Targets</p>
            ${targetList(goal.monthlyTargets, "No monthly targets configured yet.")}
          </article>
          <article class="panel">
            <p class="eyebrow">Tracked Signals</p>
            <section class="compact-list">
              ${(goal.signals ?? []).length > 0
                ? goal.signals.map(goalSignalRow).join("")
                : '<p class="muted">No signals configured yet.</p>'}
            </section>
          </article>
          <article class="panel">
            <p class="eyebrow">Linked Action</p>
            <h3>${escapeHtml(action.title ?? "No action configured")}</h3>
            <p class="action-time">${escapeHtml(action.estimatedMinutes ?? 0)} minutes</p>
            <a class="button secondary" href="${escapeHtml(toAppHref(action.href ?? "/review", context) ?? "#")}">Open Action</a>
          </article>
          <article class="panel">
            <p class="eyebrow">Team Link</p>
            <h3>${escapeHtml(teamFocus.title ?? "No team focus configured")}</h3>
            <p class="muted">${escapeHtml(teamFocus.practiceTopic ?? "No practice topic configured.")}</p>
          </article>
        </section>
      `
    },
    review: {
      eyebrow: "Review",
      title: action.title ?? "Review",
      text: "Checklist and tags for the next review.",
      content: `
        <section class="review-workspace-layout">
          <article class="panel review-run-panel">
            <div class="panel-header">
              <div>
                <p class="eyebrow">Review Block</p>
                <h3>${escapeHtml(action.title ?? "No review action configured")}</h3>
              </div>
              <p class="action-time">${escapeHtml(action.estimatedMinutes ?? 0)} minutes</p>
            </div>
            ${actionStepList(action.steps)}
          </article>
          <article class="panel review-tags-panel">
            <p class="eyebrow">Tag Against</p>
            <h3>${escapeHtml(goal.title ?? "Active goal")}</h3>
            <section class="review-tag-grid">
              ${(goal.signals ?? []).length > 0
                ? goal.signals.map(reviewTagButton).join("")
                : '<p class="muted">No signals configured yet.</p>'}
            </section>
          </article>
          <article class="panel">
            <p class="eyebrow">Recent Read</p>
            <section class="compact-list">
              ${recentInsights.length > 0
                ? recentInsights.map((insight) => `
                  <article class="compact-row">
                    <span>${escapeHtml(insight.title)}</span>
                  </article>
                `).join("")
                : '<p class="muted">No insights yet.</p>'}
            </section>
          </article>
          <article class="panel">
            <p class="eyebrow">Targets</p>
            <section class="compact-list">
              ${(goal.weeklyTargets ?? []).length > 0
                ? goal.weeklyTargets.map(compactTargetRow).join("")
                : '<p class="muted">No weekly targets configured yet.</p>'}
            </section>
          </article>
        </section>
      `
    },
    training: {
      eyebrow: "Training",
      title: "Practice Blocks",
      text: "Decision tree and pre-game reminder.",
      content: `
        <section class="panel">
          <p class="eyebrow">Decision Tree</p>
          <h3>ADC trading check</h3>
          <ul class="team-checklist">
            <li>Do we win this matchup before level 6?</li>
            <li>Is the wave state supporting the trade?</li>
            <li>Are key cooldowns or summoners missing?</li>
            <li>Can jungle or support punish if I extend?</li>
          </ul>
        </section>
        <section class="panel">
          <p class="eyebrow">Pre-game Reminder</p>
          <h3>${escapeHtml(goal.title ?? "Active goal")}</h3>
        </section>
      `
    },
    team: {
      eyebrow: "Team",
      title: teamFocus.title ?? "Team Focus",
      text: "Practice topic, review item, checklist, and signals.",
      content: `
        <section class="panel team-focus-panel">
          <p class="eyebrow">Practice Topic</p>
          <h3>${escapeHtml(teamFocus.practiceTopic ?? "No practice topic configured")}</h3>
          <p><strong>Assigned review:</strong> ${escapeHtml(teamFocus.assignedReview ?? "Not set")}</p>
          ${teamChecklist(teamFocus.checklist)}
        </section>
        <section class="panel recent-signals-panel">
          <p class="eyebrow">Team Signals</p>
          <h3>Objective setup evidence</h3>
          <section class="signal-grid">
            ${(teamFocus.signals ?? []).length > 0
              ? teamFocus.signals.map(signalCard).join("")
              : '<p class="muted">No team signals configured yet.</p>'}
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
        <strong>${escapeHtml(signal.label)}</strong>
        <small>${escapeHtml(signal.description)}</small>
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
    renderAuthRequiredPage(root, "Sign in to start setup", "RiftSense setup is saved to your authenticated account.");
    return;
  }

  const { templates } = await requestJson("/api/onboarding/options", {
    skipStoredToken: context.demoMode
  });
  const initialGoal = templates.goalTemplates[0];
  const initialTeamFocus = templates.teamFocusTemplates[0];
  const state = {
    context: "both",
    role: "ADC",
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
    const showPersonal = state.context === "personal" || state.context === "both";
    const showTeam = state.context === "team" || state.context === "both";
    const dashboardHref = toAppHref("/", context) ?? "/";

    root.innerHTML = appShell(`
      <section class="section-heading">
        <div>
          <p class="eyebrow">${context.demoMode ? "Demo Onboarding" : "Onboarding"}</p>
          <h2>Onboarding</h2>
        </div>
        <p class="section-copy">Select context, role, goal, signals, targets, first action, and optional team focus.</p>
      </section>
      <form class="onboarding-flow" id="onboarding-form">
        <section class="panel onboarding-step">
          <p class="eyebrow">Step 1</p>
          <h3>Choose setup context</h3>
          <div class="segmented-options">
            ${["personal", "team", "both"].map((option) => `
              <label class="option-card">
                <input type="radio" name="context" value="${option}" ${state.context === option ? "checked" : ""} />
                <span>${escapeHtml(option === "both" ? "Both" : option === "team" ? "Team improvement" : "Personal improvement")}</span>
              </label>
            `).join("")}
          </div>
        </section>

        ${showPersonal ? `
          <section class="panel onboarding-step">
            <p class="eyebrow">Step 2</p>
            <h3>Personal goal</h3>
            <div class="field-row">
              <label>
                Role
                <select name="role">
                  ${["Top", "Jungle", "Mid", "ADC", "Support", "Multiple"].map((role) => `
                    <option value="${role}" ${state.role === role ? "selected" : ""}>${role}</option>
                  `).join("")}
                </select>
              </label>
              <label>
                Goal template
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
            <p class="muted">${escapeHtml(selectedGoal?.description ?? "")}</p>
          </section>

          <section class="panel onboarding-step">
            <p class="eyebrow">Step 3</p>
            <h3>Signals and weekly targets</h3>
            <section class="option-grid">
              ${visibleSignals.map((signal) => onboardingSignalCheckbox(signal, state.selectedSignalIds.includes(signal.id))).join("")}
            </section>
            <section class="option-grid target-option-grid">
              ${weeklyTargets.map((target) => onboardingTargetCheckbox(
                target,
                findTemplate(templates.signalTemplates, target.signalId),
                state.selectedWeeklyTargetIds.includes(target.signalId)
              )).join("")}
            </section>
          </section>
        ` : ""}

        ${showTeam ? `
          <section class="panel onboarding-step">
            <p class="eyebrow">Team Setup</p>
            <h3>Choose team focus</h3>
            <label>
              Team focus template
              <select name="selectedTeamFocusTemplateId">
                ${templates.teamFocusTemplates.map((template) => templateOption(template, selectedTeamFocus?.id)).join("")}
              </select>
            </label>
            <p class="muted">${escapeHtml(selectedTeamFocus?.description ?? "")}</p>
            ${teamChecklist(selectedTeamFocus?.defaultChecklist ?? [])}
          </section>
        ` : ""}

        ${onboardingPreview({ state, templates })}

        <section class="panel panel-slim onboarding-submit">
          <div>
            <p class="eyebrow">Finish</p>
            <h3>${context.demoMode ? "Preview demo setup" : "Save onboarding setup"}</h3>
            <p class="muted" id="onboarding-status" aria-live="polite">${context.demoMode ? "Demo onboarding does not write server state." : "Saving will update your active dashboard state."}</p>
          </div>
          <div class="action-row">
            <button class="button" type="submit">${context.demoMode ? "Preview Setup" : "Save Setup"}</button>
            <a class="button secondary" href="${escapeHtml(dashboardHref)}">Dashboard</a>
          </div>
        </section>
      </form>
    `, {
      eyebrow: context.demoMode ? "Demo Onboarding" : "Onboarding",
      title: "Onboarding",
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
        status.textContent = "Demo preview is ready. The selected template state matches what the dashboard save would create.";
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
        status.textContent = error instanceof Error ? error.message : "Onboarding save failed.";
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
  const goalsHref = context.demoMode ? "/demo/goals" : "/goals";

  root.innerHTML = appShell(`
    <section class="section-heading">
      <div>
        <p class="eyebrow">Goals</p>
        <h2>${escapeHtml(label)}</h2>
      </div>
      <p class="section-copy">This view moved to Goals.</p>
    </section>
    <section class="panel panel-slim">
      <p class="muted">Use Goals for active goal details, weekly targets, and linked signals.</p>
      <div class="action-row">
        <a class="button" href="${escapeHtml(goalsHref)}">Open Goals</a>
      </div>
    </section>
  `, {
    eyebrow: "Goals",
    title: label,
    text: "This view moved to Goals.",
    compact: true
  });
}

async function renderLearnPlaceholder(root, page) {
  const pages = {
    drills: {
      title: "Drills",
      text: "Practice-oriented work will land here."
    },
    test: {
      title: "Test",
      text: "Quizzes and knowledge checks will land here."
    },
    review: {
      title: "Review",
      text: "Review workflows will land here."
    }
  };
  const config = pages[page];

  root.innerHTML = appShell(`
    <section class="panel">
      <p class="eyebrow">Learn</p>
      <h3>${escapeHtml(config.title)}</h3>
      <p>${escapeHtml(config.text)}</p>
    </section>
  `, {
    eyebrow: "Learn",
    title: config.title,
    text: config.text,
    compact: true
  });
}

async function renderLibrary(root) {
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

  const { items } = await requestJson(`/api/content-items?${params.toString()}`);

  root.innerHTML = appShell(`
    <section class="panel panel-slim library-toolbar">
      <div class="library-toolbar-head">
        <div>
          <p class="eyebrow">Learning Library</p>
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
    eyebrow: "Learning Library",
    title: "Learning Library",
    text: "Filter published content by type, topic, or view.",
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
        submitButton.textContent = "Sign In";
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

  try {
    if (pathname === "/about") {
      renderPublicAbout(root);
      bindNavControls(root);
      bindNavSectionControls(root);
      bindSessionControls(root);
      return;
    }

    if (pathname === "/" || pathname === "/demo" || pathname === "/demo/adc" || pathname === "/demo/no-riot-linked") {
      await renderHome(root, context);
      bindNavControls(root);
      bindNavSectionControls(root);
      bindSessionControls(root);
      return;
    }

    if (pathname === "/goals" || pathname === "/demo/goals") {
      await renderGoalDashboardPage(root, "goals", context);
      bindNavControls(root);
      bindNavSectionControls(root);
      bindSessionControls(root);
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

    if (pathname === "/drills") {
      await renderLearnPlaceholder(root, "drills");
      bindNavControls(root);
      bindNavSectionControls(root);
      bindSessionControls(root);
      return;
    }

    if (pathname === "/test") {
      await renderLearnPlaceholder(root, "test");
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

    if (pathname === "/onboarding" || pathname === "/demo/onboarding") {
      await renderOnboarding(root, context);
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
