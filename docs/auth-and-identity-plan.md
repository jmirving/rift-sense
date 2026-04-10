# Auth and Identity Plan

## Purpose

Define how `RiftSense` should adopt shared authentication through
`Nexus` without taking local ownership of cross-app identity.

This document is aligned to the current `Nexus` documentation set,
especially:

- `Nexus/docs/product.md`
- `Nexus/docs/nexus_architecture.md`
- `Nexus/docs/functional-requirements.md`
- `Nexus/docs/roadmap.md`

Those docs already position shared authentication as a Nexus platform
responsibility rather than an app-local concern.

## Problem to Avoid

`RiftSense` should not:

- define its own permanent cross-app identity model
- copy login, registration, and password reset into every app
- require every app to share one long-lived app secret as the permanent
  trust model

That would make later `Nexus` adoption harder instead of easier.

## Separation of Concerns

The clean boundary is:

- `Authentication`: prove who the user is
- `Identity`: define the canonical user record and stable user ID
- `Authorization`: decide what the user may do inside a specific app

Per the documented `Nexus` direction:

- `Nexus` should own authentication and canonical identity
- `DraftEngine` should own DraftEngine-specific authorization
- `RiftSense` should own RiftSense-specific authorization

## Recommended Target Model

`Nexus` should become the token issuer.

`DraftEngine` and `RiftSense` both become token consumers.

Each application verifies a `Nexus`-issued access token and then
applies its own local authorization rules.

That means the shared contract is not "DraftEngine auth" but "trusted
identity claims."

## Shared Token Contract

The first stable shared token contract should include:

- `iss`: token issuer, expected to be `Nexus`
- `sub`: canonical shared user ID, not a local app row ID
- `aud`: intended audience, such as `draftengine`, `riftsense`, or a
  shared audience accepted by both
- `exp`
- `iat`

Optional shared claims:

- `email`
- `displayName`
- `globalRoles`
- `teamIds` or workspace claims if and only if they become stable shared
  concepts

The critical part is `sub`: it must be a stable identity ID that both
apps trust.

## RiftSense Auth Interface

`RiftSense` should integrate against a small auth interface rather than
embedding one app's auth implementation directly.

Recommended contract:

```js
export function verifyAccessToken(token) {
  return {
    subjectId: "usr_123",
    issuer: "nexus",
    audience: "riftsense",
    claims: {}
  };
}

export async function loadIdentity(subjectId) {
  return {
    id: "usr_123",
    email: "user@example.com",
    displayName: "LeadPlayer#NA1"
  };
}

export function createRequireAuth({ verifyAccessToken, loadIdentity }) {
  return async function requireAuth(request, _response, next) {
    // verify bearer token
    // attach request.auth and request.identity
    next();
  };
}
```

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

This keeps the rest of the app from caring whether the token was issued
by temporary DraftEngine-compatible logic or by `Nexus`.

## Near-Term Implementation Strategy

`RiftSense` should consume a `Nexus`-style auth contract from the start,
even if `Nexus` auth is still being implemented.

That means:

- add auth middleware and token verification behind a local adapter
- do not add local login or registration routes to `RiftSense`
- protect curator mutations through the shared auth boundary
- keep the rest of the app agnostic to how the token is issued

The verifier implementation can start simple, but the contract should be
`Nexus`-shaped rather than `DraftEngine`-shaped.

## Hosted Browser Callback

Once the Nexus hosted launch-grant exchange is available, RiftSense
should add an app-owned callback route:

- `GET /auth/nexus/callback`

The RiftSense callback should:

- require a browser-supplied launch grant
- redeem that grant through the Nexus exchange endpoint using the
  RiftSense app secret
- verify the returned access token locally before trusting it
- establish RiftSense-local recognized session state through an
  app-owned cookie
- redirect the user into RiftSense without requiring manual token paste
- render an intentional app-owned failure state when callback or
  exchange fails

This preserves the existing separation of concerns:

- Nexus owns canonical identity and token issuance
- RiftSense owns app-local recognized session state and authorization
- the browser callback is not itself trusted until the exchange
  succeeds

## What Should Stay Local to Each App

Even after `Nexus` owns identity, each app should still own its own
authorization decisions.

For `DraftEngine`, examples include:

- admin privileges
- tag moderation rights
- scoped write permissions
- team-lead write permissions

For `RiftSense`, examples will likely include:

- content curator privileges
- team-lead assignment privileges
- learner visibility rules

Identity is shared. Authorization is not automatically shared.

## Recommended RiftSense Implementation Order

1. Add auth middleware behind an adapter boundary in `RiftSense`.
2. Require auth only for curator routes first.
3. Keep public library browsing open unless product decisions change.
4. Add local app authorization checks for curator-only mutations.
5. Leave login and password reset out of `RiftSense`.
6. Add the hosted Nexus callback plus app-local recognized session
   boundary.
7. Point the verifier at live `Nexus` token issuance once the shared
   auth service is live.

## Immediate Practical Recommendation

For the next implementation step, `RiftSense` should add:

- `server/auth/` with token verification and middleware interfaces
- a `Nexus`-oriented JWT verifier contract
- curator-route protection for create, update, publish, and delete

This gives the app a usable auth boundary now without requiring
`RiftSense` to invent a second long-term auth system.
