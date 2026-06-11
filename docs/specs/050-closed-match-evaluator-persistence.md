# 050 - Closed - Match Evaluator Persistence

## Status

Closed

## Closed on

2026-06-11

## Context

RiftSense now persists deterministic match evaluations for stored Riot
matches and user perspectives.

Implemented evidence:

- `server/db/migrations/002_match_evaluations.sql` creates
  `riftsense.match_evaluations`.
- `server/repositories/match-evaluations.js` reads, saves, and
  upserts evaluations keyed by `(match_id, puuid, evaluation_version)`.
- `server/riot/match-evaluator.js` defines
  `DETERMINISTIC_MATCH_EVALUATOR_VERSION = "deterministic-v1"` and
  evaluates persisted match inputs without Riot API calls.
- Tests cover evaluator facts, missing timeline/participant handling,
  zero-death games, idempotent save/reload behavior, and migrations.

## Acceptance Criteria Status

- `match_evaluations` exists: satisfied.
- A persisted raw match plus perspective can be evaluated without Riot
  API calls: satisfied.
- Evaluation output is deterministic and stored: satisfied.
- DB-backed tests cover migration/repository behavior when
  `DATABASE_URL` is available: satisfied.
- No UI goal interpretation is required in this spec: satisfied.

## Follow-Up

Future evaluator changes should use new versioned specs instead of
reopening this persistence foundation.
