# RiftSense

RiftSense is a League review workspace for goal-linked recent-game evidence, team focus, training actions, and curated learning content.

## Requirements

- Node.js and npm
- Postgres

RiftSense requires Postgres for persistence. The canonical local database is the shared Nexus suite database with a RiftSense-owned schema:

```bash
DATABASE_URL=postgres://nexus:nexus@127.0.0.1:54329/nexus_suite_dev
RIFTSENSE_DB_SCHEMA=riftsense
```

`DATABASE_URL` is required in production. `RIFTSENSE_DB_SCHEMA` defaults to `riftsense`.

## Install

```bash
npm install
```

## Local MVP

Run RiftSense locally with seeded sample content and auth disabled:

```bash
DATABASE_URL=postgres://nexus:nexus@127.0.0.1:54329/nexus_suite_dev \
RIFTSENSE_DB_SCHEMA=riftsense \
npm run local:mvp
```

Open `http://localhost:3000`.

## Local Auth MVP

Run with Nexus-style auth enabled:

```bash
PORT=3101 \
NEXUS_AUTH_ENABLED=true \
NEXUS_AUTH_ISSUER=nexus-local \
NEXUS_APP_SIGNING_SECRET=change-me-local-dev-secret \
NEXUS_EXCHANGE_URL=http://127.0.0.1:3000/api/auth/exchange \
RIFTSENSE_EXCHANGE_SECRET=change-me-riftsense-exchange-secret \
NEXUS_PORTAL_BASE_URL=http://127.0.0.1:3000 \
DATABASE_URL=postgres://nexus:nexus@127.0.0.1:54329/nexus_suite_dev \
RIFTSENSE_DB_SCHEMA=riftsense \
npm run local:mvp:auth
```

## Tests

Run the test suite:

```bash
npm test
```

Run against the canonical local database:

```bash
DATABASE_URL=postgres://nexus:nexus@127.0.0.1:54329/nexus_suite_dev \
RIFTSENSE_DB_SCHEMA=riftsense \
npm test
```

## Performance Logging

Performance logs are off by default.

Enable server timing logs:

```bash
RIFTSENSE_PERF_LOGGING=true
```

Enable client timing logs in the browser console:

```js
localStorage.setItem("riftsense.perfLogging", "true");
```

Disable client timing logs:

```js
localStorage.removeItem("riftsense.perfLogging");
```

Opening a route with `?perf=1` also enables client timing logs for that browser session.

## Current Routes

- `/`
- `/about`
- `/demo`
- `/goals`
- `/review`
- `/review?matchId=:matchId`
- `/demo/review?matchId=:matchId`
- `/training`
- `/team`
- `/onboarding`
- `/library`
- `/curator/content`
- `/curator/content/new`
- `/content/:id`
