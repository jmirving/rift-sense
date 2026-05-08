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

function isDemoPath(pathname) {
  return pathname === "/demo" || pathname.startsWith("/demo/");
}

function getRouteContext() {
  const pathname = window.location.pathname;
  const demoMode = isDemoPath(pathname);

  return {
    pathname,
    demoMode,
    homeApiUrl: demoMode ? "/api/demo/home" : "/api/home",
    requestOptions: demoMode
      ? {
          skipStoredToken: true
        }
      : undefined
  };
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
  const headers = new Headers(options?.headers ?? {});
  const authToken = readStoredAuthToken();
  if (!options?.skipStoredToken && authToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    headers
  });
  const body = response.status === 204 ? null : await response.json();

  if (!response.ok) {
    throw new Error(body?.error?.message ?? "Request failed.");
  }

  return body;
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
    : "Use your Nexus or DraftEngine account to sign in.";

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
  const navCollapsed = window.localStorage.getItem("riftsense.navCollapsed") === "true";
  const searchParams = new URLSearchParams(window.location.search);
  const isCuratorDetail = pathname.startsWith("/content/") && searchParams.get("curator") === "1";
  const heroHidden = hero.hidden === true;
  const heroTitle = hero.title ?? "Study, organize, and publish team knowledge.";
  const heroEyebrow = hero.eyebrow ?? "Teaching And Player Development";
  const heroText = hero.text ?? "Browse the learning library, shape curator metadata, and keep reusable content easy to study.";
  const heroPills = Array.isArray(hero.pills) ? hero.pills : [];
  const heroCompact = hero.compact !== false;

  const navSections = [
    {
      key: "learn",
      title: "Improve",
      items: demoMode
        ? [
            { href: "/demo", label: "Dashboard", active: pathname === "/demo" },
            { href: "/demo/goals", label: "Goals", active: pathname === "/demo/goals" },
            { href: "/demo/review", label: "Review", active: pathname === "/demo/review" },
            { href: "/demo/training", label: "Training", active: pathname === "/demo/training" },
            { href: "/demo/team", label: "Team", active: pathname === "/demo/team" }
          ]
        : [
            { href: "/", label: "Dashboard", active: pathname === "/" },
            { href: "/goals", label: "Goals", active: pathname === "/goals" || pathname.startsWith("/focus/") },
            { href: "/review", label: "Review", active: pathname === "/review" },
            { href: "/training", label: "Training", active: pathname === "/training" || pathname === "/drills" || pathname === "/test" },
            { href: "/team", label: "Team", active: pathname === "/team" },
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
              <span class="brand-mark">N</span>
              <div class="brand-copy">
                <p class="eyebrow">Nexus Application</p>
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
          <p class="nav-meta">League learning workflows inside the shared Nexus navigation.</p>
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

function targetList(items, emptyText) {
  return `
    <ul class="target-list">
      ${(items ?? []).length > 0
        ? items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
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
      <p class="muted">${escapeHtml(signal.description ?? "")}</p>
    </article>
  `;
}

function nextStepCard(step) {
  return `
    <article class="next-step-card">
      <p class="eyebrow">${escapeHtml(step.label ?? "Next")}</p>
      <h3>${escapeHtml(step.title)}</h3>
      <p class="muted">${escapeHtml(step.summary ?? "")}</p>
      ${step.href ? `<a class="button secondary" href="${escapeHtml(step.href)}">Open</a>` : ""}
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
  const { home } = await requestJson(context.homeApiUrl, context.requestOptions);
  const profile = home.user.profile ?? {};
  const dashboard = home.goalDashboard ?? {};
  const goal = dashboard.activePersonalGoal ?? {};
  const action = dashboard.todaysAction ?? {};
  const teamFocus = dashboard.activeTeamFocus ?? {};
  const suggestedNextSteps = (dashboard.suggestedNextSteps ?? []).filter((step) =>
    Boolean(toAppHref(step.href, context) || !step.href)
  );
  const focusTagline = `${goal.role ?? profile.primaryRole ?? "Player"} · ${goal.scope ?? "Personal"}`;
  const reviewHref = toAppHref("/review", context) ?? "#";
  const goalsHref = toAppHref("/goals", context) ?? "#";
  const actionHref = toAppHref(action.href ?? "/review", context) ?? reviewHref;
  const teamHref = toAppHref("/team", context) ?? "#";
  const demoBanner = context.demoMode
    ? `
      <section class="panel panel-slim">
        <p class="eyebrow">Public Demo</p>
        <h2>Seeded MVP dashboard</h2>
        <p class="muted">This view is fixed demo data for the ADC + team-focus scenario from the MVP spec.</p>
      </section>
    `
    : "";

  root.innerHTML = appShell(`
    <section class="goal-dashboard-stack">
      ${demoBanner}
      <section class="panel active-goal-panel">
        <div class="active-goal-hero">
          <div class="active-goal-copy">
            <p class="eyebrow">Active Goal</p>
            <h2>${escapeHtml(goal.title ?? "No active goal yet")}</h2>
            <div class="badge-row">
              <span class="context-badge">${escapeHtml(focusTagline)}</span>
              ${statusBadge(goal.status === "active" ? "Active" : "No data yet", goal.status === "active" ? "positive" : "unknown")}
            </div>
            <p>${escapeHtml(goal.summary ?? "Choose one goal to start tracking.")}</p>
          </div>
          <div class="active-goal-targets">
            <p class="eyebrow">Weekly Targets</p>
            ${targetList(goal.weeklyTargets, "No weekly targets configured yet.")}
          </div>
        </div>
        <div class="active-goal-footer">
          <p class="muted">${escapeHtml(goal.progressSummary ?? "No trend summary yet. Review a game to create your first signal.")}</p>
          <div class="action-row">
            <a class="button" href="${escapeHtml(reviewHref)}">Review Goal</a>
            <a class="button secondary" href="${escapeHtml(goalsHref)}">View Goals</a>
          </div>
        </div>
      </section>

      <section class="dashboard-two-column">
        <section class="panel todays-action-panel">
          <p class="eyebrow">Today's Action</p>
          <h2>${escapeHtml(action.title ?? "No action configured yet")}</h2>
          <p class="action-time">${escapeHtml(action.estimatedMinutes ?? 0)} minutes</p>
          <p>${escapeHtml(action.reason ?? "Choose one small review action to keep momentum.")}</p>
          ${actionStepList(action.steps)}
          <a class="button" href="${escapeHtml(actionHref)}">${escapeHtml(action.ctaLabel ?? "Start review")}</a>
        </section>

        <section class="panel team-focus-panel">
          <div class="panel-header">
            <div>
              <p class="eyebrow">Team Focus</p>
              <h2>${escapeHtml(teamFocus.title ?? "No team focus configured")}</h2>
            </div>
            <a class="button secondary" href="${escapeHtml(teamHref)}">Open Team Focus</a>
          </div>
          <p>${escapeHtml(teamFocus.summary ?? "Add a team practice topic for this week.")}</p>
          <div class="team-focus-meta">
            <p><strong>Practice topic:</strong> ${escapeHtml(teamFocus.practiceTopic ?? "Not set")}</p>
            <p><strong>Assigned review:</strong> ${escapeHtml(teamFocus.assignedReview ?? "Not set")}</p>
          </div>
          ${teamChecklist(teamFocus.checklist)}
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
            : '<p class="muted">No recent signals yet. Review a game to create your first signal.</p>'}
        </section>
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
}

async function renderGoalDashboardPage(root, page, context = getRouteContext()) {
  const { home } = await requestJson(context.homeApiUrl, context.requestOptions);
  const dashboard = home.goalDashboard ?? {};
  const goal = dashboard.activePersonalGoal ?? {};
  const action = dashboard.todaysAction ?? {};
  const teamFocus = dashboard.activeTeamFocus ?? {};

  const pages = {
    goals: {
      eyebrow: "Goals",
      title: "Active Improvement Work",
      text: "Personal and team goals stay visible so review work connects to a concrete target.",
      content: `
        <section class="panel active-goal-panel">
          <div class="active-goal-hero">
            <div class="active-goal-copy">
              <p class="eyebrow">Personal Goal</p>
              <h3>${escapeHtml(goal.title ?? "No active goal yet")}</h3>
              <p>${escapeHtml(goal.summary ?? "Choose one goal to start tracking.")}</p>
            </div>
            <div>
              <p class="eyebrow">Monthly Targets</p>
              ${targetList(goal.monthlyTargets, "No monthly targets configured yet.")}
            </div>
          </div>
        </section>
        <section class="panel recent-signals-panel">
          <p class="eyebrow">Signals</p>
          <h3>What this goal tracks</h3>
          <section class="signal-grid">
            ${(goal.signals ?? []).length > 0
              ? goal.signals.map(signalCard).join("")
              : '<p class="muted">No signals configured yet.</p>'}
          </section>
        </section>
      `
    },
    review: {
      eyebrow: "Review",
      title: action.title ?? "Review",
      text: action.reason ?? "Use review moments to turn games into evidence.",
      content: `
        <section class="panel todays-action-panel">
          <p class="eyebrow">Review Block</p>
          <h3>${escapeHtml(action.title ?? "No review action configured")}</h3>
          <p class="action-time">${escapeHtml(action.estimatedMinutes ?? 0)} minutes</p>
          ${actionStepList(action.steps)}
        </section>
        <section class="panel recent-signals-panel">
          <p class="eyebrow">Tag Against</p>
          <h3>${escapeHtml(goal.title ?? "Active goal")}</h3>
          <section class="signal-grid">
            ${(goal.signals ?? []).length > 0
              ? goal.signals.map(signalCard).join("")
              : '<p class="muted">No signals configured yet.</p>'}
          </section>
        </section>
      `
    },
    training: {
      eyebrow: "Training",
      title: "Small Practice Blocks",
      text: "Training stays tied to the active goal instead of becoming a generic content grid.",
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
          <p>${escapeHtml(goal.summary ?? "Choose one goal to start tracking.")}</p>
        </section>
      `
    },
    team: {
      eyebrow: "Team",
      title: teamFocus.title ?? "Team Focus",
      text: teamFocus.summary ?? "Team practice work will appear here.",
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
}

async function renderFocusPage(root, scope) {
  const { home } = await requestJson("/api/home");
  const focusBoard = home.focusBoard ?? {};
  const config = {
    today: {
      eyebrow: "Focus",
      title: "Today",
      summary: focusBoard.todayGoal?.summary ?? "No daily focus configured yet.",
      items: focusBoard.todayGoal?.title ? [{
        title: focusBoard.todayGoal.title,
        progressLabel: focusBoard.todayGoal.progressLabel ?? "",
        progressPercent: Math.max(0, Math.min(Number(focusBoard.progress?.todayPercent ?? 0), 100))
      }] : []
    },
    week: {
      eyebrow: "Focus",
      title: "This Week",
      summary: "Weekly focus items and progress checkpoints.",
      items: focusBoard.weeklyGoals ?? []
    },
    month: {
      eyebrow: "Focus",
      title: "This Month",
      summary: "Monthly focus items and longer-term goals.",
      items: focusBoard.monthlyGoals ?? []
    }
  }[scope];

  root.innerHTML = appShell(`
    <section class="section-heading">
      <div>
        <p class="eyebrow">${escapeHtml(config.eyebrow)}</p>
        <h2>${escapeHtml(config.title)}</h2>
      </div>
      <p class="section-copy">${escapeHtml(config.summary)}</p>
    </section>
    <section class="panel">
      <div class="goal-list">
        ${config.items.length > 0
          ? config.items.map(goalItem).join("")
          : '<p class="muted">No focus items configured yet.</p>'}
      </div>
    </section>
  `, {
    eyebrow: "Focus",
    title: config.title,
    text: config.summary,
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
    title: "Reusable material, with less friction.",
    text: "Open published content quickly, then narrow it only when you need to.",
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
      <p class="section-copy">Curator-only library management for drafts, published assets, and grouped learning material.</p>
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
    title: "Shape the library before it goes live.",
    text: "Review drafts, maintain published records, and keep grouped learning content organized for the wider team.",
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
      <p class="section-copy">Add a reusable learning asset through upload or external link, then shape its metadata for publication.</p>
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
    title: "Add a new asset with publish-ready context.",
    text: "Start with an upload or external link, then add the metadata that makes the item reusable inside the library.",
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
      title: "Review content inside its context page.",
      text: "Open one record at a time so the asset, metadata, and curator actions stay in one place.",
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
    title: "Review the asset and refine its curator context.",
    text: "Keep the viewer, metadata, publish status, and destructive actions together on one page.",
    compact: true
  } : {
    title: "Study the asset without leaving the library.",
    text: "Use the detail page for topic context, in-app viewing when available, and a clean fallback when the source cannot be embedded.",
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
    if (pathname === "/" || pathname === "/demo") {
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
      await renderFocusPage(root, "today");
      bindNavControls(root);
      bindNavSectionControls(root);
      bindSessionControls(root);
      return;
    }

    if (pathname === "/focus/week") {
      await renderFocusPage(root, "week");
      bindNavControls(root);
      bindNavSectionControls(root);
      bindSessionControls(root);
      return;
    }

    if (pathname === "/focus/month") {
      await renderFocusPage(root, "month");
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
      title: "Study, organize, and publish team knowledge.",
      compact: true
    });
    bindNavControls(root);
    bindNavSectionControls(root);
    bindSessionControls(root);
  } catch (error) {
    root.innerHTML = appShell(`<section class="panel"><p>${escapeHtml(error.message)}</p></section>`, {
      title: "Study, organize, and publish team knowledge.",
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
