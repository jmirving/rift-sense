# Auth and Identity Plan

## Purpose

Define how `RiftSense` adopts shared authentication through `Nexus`
without becoming a second canonical account system.

This document is aligned to the current `Nexus` documentation set,
especially:

- `Nexus/docs/product.md`
- `Nexus/docs/nexus_architecture.md`
- `Nexus/docs/roadmap.md`
- `Nexus/docs/domain-model.md`

## Product Boundary

`RiftSense` should support two entry paths:

- standalone entry: the user opens `RiftSense` directly and signs in from
  an app-owned form
- Nexus launch: the user launches `RiftSense` from `Nexus` and arrives
  already authenticated through the launch-grant exchange

Those are two entry paths into one identity system, not two separate
account systems.

## Problem to Avoid

`RiftSense` should not:

- define its own permanent cross-app identity model
- create a second durable account database separate from `Nexus`
- own password truth independently of `Nexus`
- force users through a different credential story depending on which app
  they open first

## Separation of Concerns

The clean boundary is:

- `Authentication`: prove who the user is
- `Identity`: define the canonical user record and stable user ID
- `Authorization`: decide what the user may do inside a specific app

Per the current direction:

- `Nexus` owns authentication and canonical identity
- `RiftSense` owns RiftSense-specific authorization
- `RiftSense` may own its standalone sign-in UI, but not its own source of
  credential truth

## Recommended Target Model

`Nexus` is the token issuer and canonical account authority.

`RiftSense` is a token consumer. It can receive identity in either of two
ways:

- hosted launch: exchange a Nexus launch grant for an app-scoped access token
- standalone login: submit app-owned sign-in form data to a Nexus-backed
  app-login endpoint and receive the same kind of app-scoped access token

In both cases, `RiftSense` should establish its own app cookie after
receiving a valid RiftSense audience token.

## Shared Token Contract

The stable shared token contract should include:

- `iss`: token issuer, expected to be `Nexus`
- `sub`: canonical shared user ID, not a local app row ID
- `aud`: intended audience, expected to include `riftsense`
- `exp`
- `iat`

Optional shared claims:

- `email`
- `displayName`
- `globalRoles`

The critical part is `sub`: it must be a stable identity ID that all apps
trust.

## RiftSense Auth Interface

`RiftSense` should continue to integrate against a small auth interface
rather than embedding Nexus internals directly.

Recommended request shape after auth middleware:

```js
request.auth = {
  subjectId: "usr_123",
  issuer: "nexus",
  audience: "riftsense",
  claims: {}
};

request.identity = {
  id: "usr_123",
  email: "user@example.com",
  displayName: "LeadPlayer#NA1"
};
```

This keeps the rest of the app from caring whether the token arrived from
standalone login or hosted launch.

## Hosted Browser Callback

For Nexus-launched entry, `RiftSense` owns:

- `GET /auth/nexus/callback`

The callback should:

- require a browser-supplied launch grant
- redeem that grant through the Nexus exchange endpoint using the
  RiftSense app secret
- verify the returned token locally before trusting it
- establish RiftSense-local recognized session state through an app-owned
  cookie
- redirect the user into RiftSense without a second login
- render an intentional app-owned failure state when callback or
  exchange fails

## Standalone Sign-In

For direct-entry usage, `RiftSense` should expose an app-owned sign-in
form and submit credentials to a Nexus-backed app-login path.

That means:

- the UI is local to `RiftSense`
- canonical credential validation still happens in `Nexus`
- the returned access token is still audience-scoped to `riftsense`
- successful login still results in a RiftSense-local session cookie

This preserves one account system while allowing users to start in either
app.

## Developer Fallback

Manual token entry may exist only as a local or non-production fallback
for contract testing. It should not be the primary user-facing auth path.

## What Should Stay Local to RiftSense

Even with shared identity, `RiftSense` still owns app-local authorization
decisions such as:

- content curator privileges
- team-lead assignment privileges
- learner visibility rules

Identity is shared. Authorization is not automatically shared.

## Recommended Implementation Order

1. Keep app-local token verification and auth middleware stable.
2. Support standalone sign-in through Nexus canonical auth.
3. Support Nexus launch-grant callback for hosted entry.
4. Keep public browsing decisions separate from auth decisions.
5. Add RiftSense-specific authorization checks on top of shared identity.

## Immediate Practical Recommendation

For current implementation work, `RiftSense` should maintain:

- auth middleware and token verification behind an adapter boundary
- app-owned standalone sign-in backed by `Nexus`
- hosted Nexus callback plus app-local recognized session boundary
- developer-only token tooling strictly as a fallback

That gives RiftSense a usable dual-entry auth story without introducing a
second long-term account system.
