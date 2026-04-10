# RiftSense

## Local MVP

Install dependencies:

```bash
npm install
```

Run the local MVP with seeded sample content and no Nexus dependency:

```bash
npm run local:mvp
```

Open `http://localhost:3000`.

This mode:

- starts only `RiftSense`
- seeds sample content into `.local/storage` on first run
- leaves shared auth disabled
- is the fastest way to iterate on the current UI and content workflows

## Local Auth Contract Testing

Run `RiftSense` with Nexus-style auth enabled:

```bash
npm run local:mvp:auth
```

Mint a compatible local dev token:

```bash
npm run local:token
```

Paste that token into the `Session` panel in the app UI. This still
does not require a live `Nexus` instance.

If you launch `RiftSense` from a local `Nexus` portal that is issuing
the shared `nexus_access_token` cookie, the manual token paste is not
needed.

## Local Hosted Nexus Launch

`RiftSense` now supports the hosted callback flow described by the Nexus
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
npm run local:mvp:auth
```

With the matching Nexus local env active, launch `RiftSense` from the
portal. The browser should redirect through
`/auth/nexus/callback`, redeem the grant, set the RiftSense-local auth
cookie, and land in the authenticated home without manual token paste.

## Automated Checks

Run the test suite:

```bash
npm test
```

## Current Routes

- `/library`
- `/curator/content`
- `/curator/content/new`
- `/content/:id`
