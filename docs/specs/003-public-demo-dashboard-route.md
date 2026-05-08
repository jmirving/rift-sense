# Public Demo Dashboard Route

Status: Draft

## 1. Summary

Add a public `/demo` route that renders the RiftSense dashboard with
seeded demo data and no authentication requirement.

The demo must not expose real user data. It should show the MVP goal
dashboard loop from `riftsense_goal_dashboard_mvp_spec.md`:

- active personal goal
- active team focus
- today's recommended action
- recent goal-linked signals
- suggested next steps

The first pass can support a single role and static seeded data, but the
route and data boundaries should leave room for future role-specific
demo routes.

## 2. Goals

- Provide a shareable public demo at `/demo`.
- Render the existing dashboard experience with meaningful seeded MVP
  data.
- Force demo data even if the browser has a valid Nexus/RiftSense
  session or stored bearer token.
- Keep real authenticated user home data isolated from demo mode.
- Avoid building a role/demo variant framework in this first pass.

## 3. Non-Goals

- Full multi-role demo routing.
- Generated coaching content.
- Riot API, match ingestion, VOD ingestion, or analytics integration.
- New permission or authorization model.
- Demo access to curator/admin mutation workflows.

## 4. Functional Requirements

- RiftSense shall serve the client app for `GET /demo`.
- RiftSense shall expose a dedicated demo API endpoint, recommended as
  `GET /api/demo/home`.
- `GET /api/demo/home` shall return only seeded demo dashboard data.
- `GET /api/demo/home` shall not read `request.identity`, bearer tokens,
  session cookies, or authenticated user-home records.
- The `/demo` client route shall fetch the dedicated demo API endpoint
  instead of `/api/home`.
- Demo API requests from the client shall skip stored local bearer tokens.
- The `/demo` dashboard shall clearly identify that it is displaying
  seeded demo data.
- Existing authenticated `/api/home` behavior shall remain unchanged.

## 5. Implementation Plan

### Server

- Add `/demo` to the Express client route list in `server/app.js`.
- Add a small demo router, for example `server/routes/demo.js`, mounted
  at `/api/demo`.
- Build the demo home response from seeded data only. Prefer reusing
  `buildDefaultGoalDashboard()` and `normalizeGoalDashboard()` from
  `server/goal-dashboard.js`.
- If shared response shaping is useful, extract a helper from
  `server/routes/home.js` so `/api/home` and `/api/demo/home` can share
  formatting without sharing identity resolution.
- Keep the demo endpoint independent from `resolveHomeRecord()` or any
  logic that can fall back to authenticated user data.

### Client

- Refactor the dashboard renderer in `public/app/app.js` so it can
  accept a home API URL and a demo-mode flag.
- Render `/` with `/api/home`.
- Render `/demo` with `/api/demo/home` and `skipStoredToken: true`.
- Add a visible demo label or compact banner in the dashboard shell.
- Keep existing navigation stable. A demo nav item is optional for this
  first pass; direct `/demo` access is sufficient.

### Data

- Use the current MVP seeded scenario:
  - role: `ADC`
  - active goal: `Die Less`
  - team focus: `Dragon Setup`
  - today's action: `Review last game deaths`
- Include recent signals and suggested next steps from the existing goal
  dashboard seed.
- Do not include real names, emails, user IDs from authenticated users,
  or persisted personalized home records.

## 6. Future Extension Point

Do not implement multi-role demos yet, but avoid hard-coding in a way
that blocks later additions such as:

- `/demo/adc`
- `/demo/support`
- `/api/demo/home?role=adc`

The first implementation can treat missing or unsupported demo roles as
the single seeded ADC demo.

## 7. Test Plan

- API test: `GET /api/demo/home` succeeds without authentication.
- API test: `GET /api/demo/home` returns demo data even when a valid
  authenticated token is sent.
- API test: `GET /api/home` still returns authenticated user data when a
  valid token is sent.
- Route test: `GET /demo` serves the client app shell.
- Client or integration test, if practical: `/demo` calls the demo API
  with stored-token injection disabled.
- Run `npm test`.

## 8. Acceptance Criteria

- Visiting `/demo` shows the dashboard without sign-in.
- The dashboard includes active goal, team focus, today's action, recent
  signals, and suggested next steps.
- A signed-in user visiting `/demo` still sees seeded demo data, not
  their authenticated home.
- No real user profile data, email, or user-specific home records appear
  in the demo response.
- Existing dashboard, session, and authenticated home behavior are not
  regressed.

