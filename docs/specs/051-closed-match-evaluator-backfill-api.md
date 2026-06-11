# 051 - Closed - Match Evaluator Backfill and API

## Status

Closed

## Closed on

2026-06-11

## Depends on

- 050 - Match Evaluator Persistence

## Context

RiftSense can backfill deterministic evaluations for recent persisted
matches and expose current summaries through authenticated APIs.

Implemented evidence:

- `ensureRecentMatchEvaluations` in `server/riot/match-evaluator.js`
  evaluates missing records, uses cached current records, recomputes
  stale records, and skips missing raw matches.
- `server/routes/match-evaluations.js` exposes
  `GET /api/matches/recent/evaluations` and
  `GET /api/matches/:matchId/evaluation`.
- `server/routes/home-response.js` and recent-game services include
  evaluation status/summary on home recent-game cards when summaries are
  available.
- API responses expose summaries and death facts, not raw timeline JSON.
- Tests cover backfill behavior, auth boundaries, API response shape,
  raw timeline exclusion, and home API evaluation summaries.

## Acceptance Criteria Status

- Recent persisted matches can be evaluated in a batch: satisfied.
- API exposes evaluation summaries for recent games: satisfied.
- Evaluation is idempotent/current/stale-aware: satisfied.
- Authenticated users are scoped to their Riot `puuid`: satisfied.

## Follow-Up

Remaining product work belongs to the open deterministic review spec:
useful review-page improvements, broader evaluator tags, and a primary
goal-linked review candidate.
