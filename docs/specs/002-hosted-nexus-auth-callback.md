# Hosted Nexus Auth Callback

Status: Draft

This spec defines the first RiftSense-owned hosted-auth slice that
consumes the Nexus launch-grant exchange contract and establishes
RiftSense-local recognized session state after a browser callback.

It is assembled from:

- [../roadmap.md](../roadmap.md)
- [../personas-and-users.md](../personas-and-users.md)
- [../functional-requirements.md](../functional-requirements.md)
- [../rift-sense-architecture.md](../rift-sense-architecture.md)
- [../domain-model.md](../domain-model.md)
- [../auth-and-identity-plan.md](../auth-and-identity-plan.md)
- `Nexus/docs/specs/004-hosted-shared-auth-delivery-plan.md`
- `Nexus/docs/contracts/riftsense-hosted-auth-handoff.md`

## 1. Summary

Add the RiftSense-owned callback route that receives a Nexus launch
grant, redeems it against the Nexus exchange endpoint, verifies the
returned access token, establishes RiftSense-local recognized session
state, and redirects the user into the app without manual token paste.

This is the next delivery slice after Nexus-side hosted auth
persistence and exchange have been implemented.

## 2. Problem Statement

RiftSense currently supports:

- direct bearer-token verification
- legacy `nexus_access_token` cookie consumption
- manual token paste through the local UI

RiftSense does not yet support the hosted browser handoff described by
the current Nexus auth contract:

- no `GET /auth/nexus/callback` route exists
- no app-side grant redemption occurs
- no app-owned success or failure state exists for hosted launch
- local users still depend on manual token handling instead of the
  intended browser flow

That leaves the hosted shared-auth contract incomplete even though
RiftSense already has most of the token verification primitives needed.

## 3. Goals

- accept a Nexus-hosted callback at `GET /auth/nexus/callback`
- redeem the launch grant using the RiftSense app secret
- verify the returned access token before trusting the user identity
- establish RiftSense-local recognized session state through an
  app-owned cookie
- redirect the user into RiftSense with no manual token paste
- render intentional app-owned failure behavior when callback or
  exchange fails

## 4. Non-Goals

- implementing full RiftSense authorization or role-based permissions
- adding local username/password auth
- introducing a permanent local canonical identity model
- changing the shared Nexus launch-grant exchange contract

## 5. Users and Stakeholders

- Primary user: learners and players moving from Nexus into RiftSense
- Secondary user: team leads or curators validating the integrated flow
- Internal stakeholders: Nexus platform owner and RiftSense owner

Relevant personas:

- [../personas-and-users.md](../personas-and-users.md)

## 6. User Scenarios

### Scenario 1

When a signed-in Nexus user launches RiftSense from the portal, RiftSense
should receive the callback, redeem the grant, and land the user in a
recognized authenticated RiftSense experience.

### Scenario 2

When the Nexus exchange returns an error such as expired or already
redeemed grant, RiftSense should show an intentional error state with a
clear path back to Nexus instead of leaving the user on a broken page.

### Scenario 3

When a local operator runs Nexus and RiftSense together, the browser
handoff should work without a manual token mint-and-paste step.

## 7. Scope

### In Scope

- `GET /auth/nexus/callback`
- grant redemption against the Nexus exchange endpoint
- verification of exchanged RiftSense access tokens
- app-local session cookie issuance and clearing
- success redirect into RiftSense
- app-owned failure response for callback and exchange errors
- local documentation for live Nexus launch

### Out of Scope

- broader team or workspace authorization rules
- persistent server-side RiftSense sessions
- user profile synchronization beyond token claims already provided by
  Nexus
- DraftEngine changes

## 8. Requirements

### Functional Requirements

- RiftSense shall expose `GET /auth/nexus/callback`.
- RiftSense shall require a `grant` query parameter on that route.
- RiftSense shall redeem the grant through the configured Nexus
  exchange endpoint using the RiftSense app secret.
- RiftSense shall verify the returned access token using the configured
  Nexus issuer, audience, and signing secret before establishing local
  recognized state.
- RiftSense shall establish app-local recognized session state through a
  RiftSense-owned cookie rather than relying on cross-domain cookie
  sharing.
- RiftSense shall redirect the user to a validated app-local `returnTo`
  path when provided, or to `/` otherwise.
- RiftSense shall continue to accept bearer tokens and the legacy
  `nexus_access_token` cookie for transitional local workflows.
- RiftSense shall expose a way to clear the app-local auth session.

Applicable shared requirements:

- [../functional-requirements.md](../functional-requirements.md):
  FR-5.2 and FR-5.3

### Non-Functional Requirements

- Security: app secrets must come from env configuration and must not be
  logged.
- Observability: callback receipt, exchange attempts, success, and
  failure shall be logged with `grantId` when available.
- Reliability: exchange failures shall produce an intentional user
  outcome without making the rest of the app unavailable.
- Compatibility: the implementation shall preserve the existing bearer
  token path for local manual testing.

## 9. UX or Interaction Flow

Success path:

1. Nexus redirects the browser to `/auth/nexus/callback?grant=...`.
2. RiftSense redeems the grant through Nexus.
3. RiftSense verifies the returned access token.
4. RiftSense sets an app-owned auth cookie.
5. RiftSense redirects the user into `/` or a validated `returnTo`
   target.

Failure path:

1. The callback or exchange fails.
2. RiftSense renders an app-owned error page.
3. The page explains the failure briefly and links back to Nexus.

## 10. Domain Model Impact

No new core domain entities are required.

This slice consumes existing shared-context references:

- Learner
- Team

The implementation should not create a new permanent local cross-app
identity model.

## 11. Data and API Contracts

### Inputs

- `grant` query parameter from the Nexus callback
- optional `returnTo` query parameter
- configured Nexus exchange endpoint
- configured RiftSense exchange secret
- configured Nexus signing secret

### Outputs

- app-local auth cookie
- redirect to RiftSense route
- app-owned HTML failure state when the callback cannot complete

### API Endpoints or Service Interfaces

- `GET /auth/nexus/callback`
- `POST /auth/logout`
- Nexus exchange contract:
  `POST <NEXUS_EXCHANGE_URL>` with `Authorization: Bearer <app secret>`

## 12. Dependencies

- Nexus hosted exchange endpoint already implemented
- Nexus launch route already implemented
- current RiftSense token verification middleware
- local environment configuration for Nexus and RiftSense

## 13. Risks and Edge Cases

- missing `grant`
- invalid app secret
- expired or already redeemed grant
- returned token with the wrong `aud`
- open redirect risk from unvalidated `returnTo`
- confusion between legacy cookie handoff and the new app-local cookie

## 14. Acceptance Criteria

- [ ] Launching RiftSense from a live local Nexus portal lands on a
      recognized authenticated RiftSense experience without manual token
      paste.
- [ ] RiftSense verifies that the exchanged token audience is
      `riftsense` before trusting it.
- [ ] Missing, expired, or already-redeemed grants produce an
      intentional RiftSense-owned error response.
- [ ] Existing bearer-token local testing remains functional.

## 15. Validation Plan

- automated tests for callback success and callback failure paths
- automated tests for local auth cookie recognition
- automated tests confirming legacy bearer-token auth still works
- local end-to-end run with Nexus issuing a hosted launch grant

## 16. Rollout Plan

- implement the callback and app-local cookie path
- keep existing bearer-token and legacy cookie compatibility during the
  transition
- validate local Nexus-to-RiftSense launch before relying on hosted
  Render validation

## 17. Open Questions

- none for the first hosted callback slice

## 18. Decision Log

- Date: 2026-04-10
- Decision: establish a RiftSense-owned auth cookie after exchange
- Reason: RiftSense needs app-local recognized state after successful
  hosted launch without depending on cross-domain cookie sharing
