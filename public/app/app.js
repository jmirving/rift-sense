function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const state = {
  session: null
};

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

function riotReadinessLine(riotEvidence) {
  if (!riotEvidence || !Number.isFinite(Number(riotEvidence.readyCount))) {
    return "";
  }

  const readyCount = Number(riotEvidence.readyCount);
  const preparingCount = Number(riotEvidence.preparingCount ?? 0);
  return `
    <div class="riot-readiness" aria-live="polite">
      <span>${escapeHtml(`${readyCount} ${readyCount === 1 ? "game" : "games"} ready`)}</span>
      <span>${escapeHtml(`${preparingCount} ${preparingCount === 1 ? "game" : "games"} still being prepared`)}</span>
    </div>
  `;
}

function tagLabel(value) {
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

function deathDetailsBlock(game) {
  const deaths = Array.isArray(game?.evaluationDeaths) ? game.evaluationDeaths : [];
  if (!game?.evaluationSummary) {
    return "";
  }
  if (deaths.length === 0) {
    return `<p class="muted">No deaths recorded for this evaluation.</p>`;
  }

  return `
    <details class="death-details">
      <summary>Death facts</summary>
      <section class="death-list">
        ${deaths.map((death) => {
          const assists = (death.assistingChampionNames ?? []).join(", ");
          const tags = (death.tags ?? []).map(tagLabel).join(", ");
          return `
            <article class="death-row">
              <p><strong>${escapeHtml(formatDeathTimestamp(death))}</strong> — killed by ${escapeHtml(death.killerChampionName ?? "Unknown")}${assists ? `, assisted by ${escapeHtml(assists)}` : ""}</p>
              <p class="muted">Tags: ${escapeHtml(tags || "None")}</p>
            </article>
          `;
        }).join("")}
      </section>
    </details>
  `;
}

function riotEvidenceCard(riotEvidence, context = {}) {
  if (!riotEvidence) {
    return "";
  }

  const sourceLabel = riotEvidence.sourceLabel ? `<p class="eyebrow">${escapeHtml(riotEvidence.sourceLabel)}</p>` : "";
  const reviewHref = toAppHref("/review", context) ?? "/review";
  return `
    <section class="panel riot-evidence-panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Recent Game Evidence</p>
          <h2>${escapeHtml(riotEvidence.title ?? "Riot evidence")}</h2>
          ${sourceLabel}
        </div>
        ${riotEvidence.confidence ? statusBadge(riotEvidence.confidence, riotEvidence.status === "seeded-demo" ? "watch" : riotStatusTrend(riotEvidence.status)) : ""}
      </div>
      <p class="muted">${escapeHtml(riotEvidence.summary ?? "")}</p>
      ${riotReadinessLine(riotEvidence)}
      <section class="compact-list">
        ${(riotEvidence.candidateGames ?? []).length > 0
          ? riotEvidence.candidateGames.slice(0, 3).map((game) => `
            <article class="compact-row game-evidence-row">
              <div class="game-evidence-main">
                <span class="compact-row-main">${escapeHtml(`${game.champion ?? game.championName ?? "Unknown champion"} · ${game.queueLabel ?? "Unknown queue"} · ${game.result ?? "Unknown result"}`)}</span>
                <span class="compact-row-value">${escapeHtml(`${game.kda} · ${game.csPerMinute ?? "?"} cs/min`)}</span>
                <span class="muted">${escapeHtml(game.relevanceReason ?? "")}</span>
                ${evaluationSummaryBlock(game)}
                ${deathDetailsBlock(game)}
              </div>
              <div class="game-evidence-actions">
                <span class="muted">${escapeHtml((game.confidenceLabel ?? "").toUpperCase())}</span>
                <a class="button secondary compact-row-action" href="${escapeHtml(reviewHref)}">Review</a>
              </div>
            </article>
          `).join("")
          : '<p class="muted">No Riot candidate games are available yet.</p>'}
      </section>
    </section>
  `;
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
              ${statusBadge(goal.goalStatus ?? "No data yet", goal.goalStatusTrend ?? "unknown")}
              ${statusBadge(`Trend: ${goal.trend ?? "Unknown"}`, goal.trendKey ?? "unknown")}
              ${statusBadge(`Confidence: ${goal.confidence ?? "Low sample"}`, "unknown")}
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
            ${targetChipGrid(goal.weeklyTargets, "No weekly targets configured yet.")}
          </div>
        </div>
        <div class="active-goal-footer">
          <p class="muted">${escapeHtml(goal.progressSummary ?? "No trend summary yet.")}</p>
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
            <p><strong>Recent team signal:</strong> ${escapeHtml(teamFocus.headlineSignal ? `${teamFocus.headlineSignal.value} ${teamFocus.headlineSignal.label.toLowerCase()}${Number(teamFocus.headlineSignal.value) === 1 ? "" : "s"}` : "Not set")}</p>
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
            ${recentInsights.length > 0
              ? recentInsights.slice(0, 2).map(insightCard).join("")
              : '<p class="muted">No insights yet.</p>'}
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
          ${(goal.signals ?? []).length > 0
            ? goal.signals.map(signalCard).join("")
            : '<p class="muted">No goal-linked signals yet. Review a game to record the first one.</p>'}
        </section>
      </section>

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
      await renderGoalDashboardPage(root, "review", context);
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
