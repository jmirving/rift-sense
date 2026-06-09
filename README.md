# RiftSense

## Local MVP

Install dependencies:

```bash
npm install
```

RiftSense requires Postgres for persistence. For local Docker Desktop/Postgres,
create a database such as `riftsense_dev` and use:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/riftsense_dev
```

Run the local MVP with seeded sample content and no Nexus dependency:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/riftsense_dev npm run local:mvp
```

Open `http://localhost:3000`.

This mode:

- starts only `RiftSense`
- runs database migrations automatically on startup
- seeds sample content into Postgres on first run
- leaves shared auth disabled
- is the fastest way to iterate on the current UI and content workflows

Production only needs `DATABASE_URL` configured. No build or start command
change is required; migrations run automatically during startup.

## Local Auth Testing

Run `RiftSense` with Nexus-style auth enabled:

```bash
npm run local:mvp:auth
```

In this mode, direct visits to `RiftSense` show an app-owned sign-in form.
Use the same canonical account that exists in `Nexus` and `DraftEngine`.

For local contract testing without a live `Nexus` instance, you can still
mint a compatible dev token:

```bash
npm run local:token
```

The token can be pasted into the small developer-only session tool in the
sidebar. That fallback is for local testing only, not the primary product
flow.

## Local Hosted Nexus Launch

`RiftSense` supports the hosted callback flow described by the Nexus
launch-grant exchange contract.

To run against a live local `Nexus` instance:

```bash
PORT=3101 \
NEXUS_AUTH_ENABLED=true \
NEXUS_AUTH_ISSUER=nexus-local \
NEXUS_APP_SIGNING_SECRET=change-me-local-dev-secret \
NEXUS_EXCHANGE_URL=http://127.0.0.1:3000/api/auth/exchange \
RIFTSENSE_EXCHANGE_SECRET=change-me-riftsense-exchange-secret \
NEXUS_PORTAL_BASE_URL=http://127.0.0.1:3000 \
DATABASE_URL=postgres://postgres:postgres@localhost:5432/riftsense_dev \
npm run local:mvp:auth
```

With the matching local `Nexus` env active:

- launching `RiftSense` from the portal should redirect through
  `/auth/nexus/callback`, redeem the grant, set the RiftSense session
  cookie, and land in the authenticated app
- opening `RiftSense` directly should still show the standalone sign-in
  form

## Automated Checks

Run the test suite:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/riftsense_dev npm test
```

Without `DATABASE_URL`, tests that require Postgres are skipped; startup/config
tests still verify that the app refuses to run without a database URL.

## Current Routes

- `/library`
- `/curator/content`
- `/curator/content/new`
- `/content/:id`
