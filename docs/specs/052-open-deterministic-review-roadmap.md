# 052 - Open - Deterministic Review Roadmap

## Status

Open

## Depends on

- 050 - Match Evaluator Persistence
- 051 - Match Evaluator Backfill and API

## Context

The recent-game deterministic review slice is partially implemented:

- recent-game cards render evaluation summaries and review links
- `/review?matchId=...` loads match summary, review signals,
  deterministic tags, and death facts
- recent-game scoring can prefer goal-relevant evaluator signals

This spec tracks the remaining Wiggum Phases 1-3 work. It should not
add AI coaching prose or reopen the content-library roadmap.

## Audit Result

Specs 050 and 051 are closed by the current persistence, backfill, API,
home summary, and raw timeline exclusion behavior. This spec remains
open because the app still needs a deterministic review priority,
expanded evaluator tags, and a single goal-linked review candidate.

## Phase 1: Useful Match Review Page

Goal:

Make the match-specific review page more useful while staying fully
deterministic.

Remaining work:

- add a deterministic review priority or focus area derived from
  `evaluationSummary`, tag counts, and death events
- make pending/missing evaluation states actionable without exposing raw
  timeline JSON
- keep `/review?matchId=...` and `/demo/review?matchId=...` links
  stable

Already satisfied:

- match summary renders
- review signals render
- death facts render
- deterministic tag counts render
- missing `matchId` and missing evaluation states render
- authenticated and demo review links preserve `matchId`

## Phase 2: Expanded Deterministic Evaluator Tags

Goal:

Add more fixture-backed deterministic tags to improve review selection.

Remaining work:

- define a small set of new tag IDs and summary labels
- add evaluator fixtures and tests for each tag
- preserve evaluator semantics unless a version bump is chosen deliberately
- keep summaries concise for cards and review pages

Candidate tag areas:

- repeated deaths in the same lane/side
- deaths shortly after objective spawn or setup
- low-vision death candidates when vision facts are available
- fight participation and tempo conversion signals already represented
  elsewhere in deterministic Riot evidence

Phase 2 versioning:

- expanded evaluator output uses `deterministic-v2`
- `isolated_forward_death_candidate` is reserved as a deterministic tag ID,
  but is not emitted until forward-side position rules are fixture-backed

## Phase 3: Goal-Linked Review Candidate Selection

Goal:

Expose one primary review candidate on the dashboard and link it to the
active personal goal when possible.

Remaining work:

- add a dedicated dashboard candidate such as `reviewCandidate`
- link it to `/review?matchId=...`
- explain selection with deterministic signals only
- prioritize death-related signals for goals such as `Die Less`,
  `death`, or `positioning`
- fall back gracefully when no saved goal or ideal evaluated game exists

Already satisfied:

- recent-game candidate ordering can prefer goal-relevant evaluator
  signals
- recent-game rows link to match-specific review pages
- demo review links preserve `matchId`

Not yet satisfied:

- the dashboard does not expose a single dedicated `reviewCandidate`
- selection rationale is still row-level `relevanceReason`, not a
  primary review-candidate explanation

## Acceptance Criteria

- Review page has a clear deterministic priority/focus section.
- Expanded evaluator tags are covered by fixtures and tests.
- Dashboard exposes one primary goal-linked review candidate.
- Candidate links preserve `matchId` in authenticated and demo routes.
- No raw timeline JSON appears in client responses or rendered UI.
