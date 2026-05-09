# RiftSense: Nexus Profile Bootstrap Plan

## 1. Summary

Switch RiftSense from relying primarily on Nexus token claims for Riot
identity to relying on Nexus-owned shared profile data.

The preferred flow is:

- use the Nexus-issued app token for authentication
- use the hosted auth exchange `profile` payload when available
- fall back to Nexus shared profile read for standalone sign-in and
  refresh flows

This aligns RiftSense with the current Nexus contracts and removes the
need to expand JWT claims just to carry Riot-linked profile data.

## 2. Problem Statement

RiftSense currently reads Riot identity only if it appears in token
claims. Nexus now exposes Riot-linked identity more cleanly through the
hosted auth exchange `profile` payload and the shared profile read
endpoint.

That creates a mismatch:

- Nexus treats Riot identity as shared profile data
- RiftSense still behaves as if Riot identity must come from claims

As a result, hosted auth can send the needed Riot bootstrap data, but
RiftSense does not yet treat that payload as the canonical source of
truth.

## 3. Goals

- Make Nexus shared profile data the canonical Riot identity source in
  RiftSense.
- Support both hosted auth and standalone sign-in without requiring Riot
  fields in JWT claims.
- Preserve current dashboard behavior while improving identity
  correctness for Riot evidence work.

## 4. Non-Goals

- Live Riot match-history ingestion.
- Redesigning Nexus token claims.
- Adding `platformRegion` or `routingRegion` to Nexus unless a separate
  upstream contract change is approved.

## 5. Users

- Primary user: authenticated RiftSense player using Nexus sign-in
- Secondary user: developer validating hosted and standalone auth flows

## 6. Scope

### In Scope

- consume hosted auth exchange `profile` bootstrap payload
- persist or cache the bootstrap profile inside RiftSense app state
- add a Nexus shared profile fetch path for standalone sign-in
- unify Riot identity reads behind one RiftSense resolver
- update empty-state behavior to depend on resolved profile data instead
  of token-claim presence

### Out of Scope

- Riot API match fetching
- cross-app profile editing from RiftSense
- region derivation heuristics

## 7. Requirements

### Feature-Specific Requirements

- RiftSense shall authenticate the user from the Nexus-issued app token.
- RiftSense shall treat Nexus shared profile data as the canonical source
  for `riotGameName`, `riotTagline`, and `riotPuuid`.
- When hosted auth exchange returns a `profile` object, RiftSense shall
  use that payload as the initial shared profile bootstrap.
- When standalone sign-in succeeds without a `profile` bootstrap,
  RiftSense shall fetch the user profile from Nexus shared profile read.
- RiftSense shall expose one internal resolved Riot identity shape to the
  dashboard and evidence layers.
- RiftSense shall not require Riot-linked fields to be present in JWT
  claims.
- If no Riot-linked profile is available, RiftSense shall show the
  existing blocker/manual-review state.

## 8. UX or Workflow

Hosted auth:

1. Nexus returns `accessToken`, `user`, and `profile`.
2. RiftSense validates the token.
3. RiftSense stores the access token for auth.
4. RiftSense stores the returned `profile` bootstrap for shared identity
   use.
5. Dashboard and evidence logic read Riot identity from the stored
   profile bootstrap.

Standalone sign-in:

1. RiftSense receives `accessToken` and `user`.
2. RiftSense validates and stores the access token.
3. RiftSense requests Nexus shared profile read using the same app token.
4. RiftSense stores the returned shared profile.
5. Dashboard and evidence logic read Riot identity from that shared
   profile.

Fallback:

- If shared profile read fails or returns no Riot linkage, show the
  current manual-review blocker state.

## 9. Domain and Data Impact

- New entities: none
- Updated entities:
  - RiftSense local authenticated session/bootstrap state
  - RiftSense internal identity resolver
- Shared context dependencies:
  - Nexus hosted auth exchange `profile`
  - Nexus `GET /api/me/profile`

Suggested RiftSense internal shape:

```js
{
  userId: "usr_123",
  riotGameName: "RetroMonkey",
  riotTagline: "NA1",
  riotPuuid: "puuid_123",
  primaryRole: "Support",
  secondaryRoles: ["ADC", "Mid"]
}
```

## 10. Risks and Edge Cases

- Risk: hosted auth and standalone sign-in could populate different
  local state shapes if bootstrapping is not normalized.
- Risk: stale local bootstrap data could outlive a changed Nexus profile
  if no refresh policy is defined.
- Edge case: hosted auth returns `profile`, but standalone profile read
  later disagrees.
- Edge case: shared profile exists but `riotPuuid` is null.
- Edge case: shared profile endpoint is temporarily unavailable.

## 11. Acceptance Criteria

- [ ] Hosted auth flow uses Nexus `profile` bootstrap rather than relying
      on Riot token claims.
- [ ] Standalone sign-in resolves shared profile through Nexus profile
      read.
- [ ] Dashboard Riot-evidence gating depends on resolved shared profile
      data.
- [ ] RiftSense works when JWT claims contain no Riot-linked fields.
- [ ] Unlinked-account blocker state still appears when no Riot profile
      data exists.
- [ ] Existing auth tests are updated to cover hosted bootstrap and
      standalone profile read behavior.

## 12. Validation Plan

- unit tests for RiftSense identity/profile normalization
- integration tests for hosted auth bootstrap behavior
- integration tests for standalone sign-in plus shared profile read
- manual QA:
  - hosted auth with Riot-linked profile
  - standalone sign-in with Riot-linked profile
  - no Riot-linked profile

## 13. Recommended Implementation Order

1. Add one RiftSense internal shared-profile normalization helper.
2. Teach hosted auth callback flow to retain Nexus `profile` bootstrap.
3. Add a Nexus shared profile read client for standalone sign-in.
4. Update dashboard/evidence code to read from resolved shared profile.
5. Remove any remaining assumption that Riot identity must come from JWT
   claims.

## 14. Open Questions

- Should RiftSense persist the shared profile only in memory/session, or
  save a local copy alongside existing auth/session state?
- When both hosted bootstrap and later profile read exist, should later
  reads always overwrite bootstrap?
- Should Nexus add `platformRegion` and `routingRegion` to shared
  profile before live Riot evidence work begins?
