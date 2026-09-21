# RiftSense

RiftSense is a League review workspace for goal-linked recent-game evidence.

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
- `/review`
- `/review?matchId=:matchId`
- `/goal-plan`

## License and reuse

This repository is not open source. Copyright © 2026 Joseph Irving. All rights reserved.

No permission is granted to copy, modify, distribute, sublicense, sell, or incorporate this repository's original code, documentation, designs, prompts, schemas, models, or other original material into another project without prior written permission from the copyright owner.

Third-party software, data, trademarks, game assets, APIs, and other third-party materials remain subject to their respective owners' rights and licenses. See [LICENSE](LICENSE).
