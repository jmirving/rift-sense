# 051 - Open - Match Evaluator Backfill and API

## Status

Open

## Depends on

- 050 - Match Evaluator Persistence

## Context

RiftSense can persist deterministic evaluations for stored Riot match/perspective records. The next step is to make evaluation part of the real recent-games flow.

## Goal

When recent games are loaded/refreshed, RiftSense should ensure each relevant persisted recent match has a current deterministic evaluation. The UI/API should be able to request recent games with evaluation summaries.

## Non-goals

- No fancy coaching.
- No full review page yet.
- No user-facing essay.
- No final goal-scoring algorithm yet.

## Evaluation freshness

Evaluation is current when:

- row exists for `(match_id, puuid, evaluation_version)`
- `source_raw_match_updated_at` matches or is newer than the raw match row used
- `source_perspective_updated_at` matches or is newer than perspective row used

If source data changes, recompute.

## Backfill/service behavior

Add a service such as:

`ensureRecentMatchEvaluations({ puuid, limit })`

Behavior:

1. Load recent persisted perspectives for `puuid`.
2. For each perspective:
   - find matching raw match
   - skip gracefully if raw match is missing
   - evaluate if no current evaluation exists
   - save evaluation
3. Return a summary:
   - `evaluated`
   - `cached`
   - `skipped`
   - `failed`
   - per-match status

## API behavior

Extend or add an authenticated API endpoint.

Acceptable options:

- Extend existing recent games API to include `evaluationSummary`.
- Add `GET /api/matches/recent/evaluations`.
- Add `POST /api/matches/recent/evaluate`.

Preferred product behavior:

- Recent games response includes evaluation state:
  - `none`
  - `current`
  - `stale`
  - `failed`

- If cheap enough, recent games loading should ensure evaluations exist.
- If expensive, add explicit endpoint called by UI after recent games load.

## Security

- Authenticated users can only evaluate/load evaluations for their own Riot `puuid`.
- Do not expose raw timeline JSON.
- Do not allow arbitrary `puuid` query param unless it matches authenticated identity.

## API response shape

For each game, include:

- `matchId`
- `championName`
- `queueId`
- `gameCreation`
- `win`
- `kills`
- `deaths`
- `assists`
- `evaluationStatus`
- `evaluationVersion`
- `evaluationSummary`

`evaluationSummary` should include:

- `deathCount`
- `topTags`
- `reviewSignals`
- `evaluatedAt`

Example:

```json
{
  "deathCount": 7,
  "topTags": [
    {"tag": "multi_enemy_collapse_candidate", "count": 3},
    {"tag": "objective_window_candidate", "count": 2}
  ],
  "reviewSignals": [
    "7 deaths",
    "3 multi-enemy collapse candidates",
    "2 objective-window candidates"
  ]
}
```

## Tests

Required tests:

- Backfill evaluates missing recent persisted matches.
- Backfill uses cached current evaluations.
- Backfill recomputes stale evaluations when source timestamps change.
- Backfill skips missing raw match gracefully.
- Authenticated API returns only current user's evaluations.
- API does not expose raw timeline JSON.
- Recent games API includes evaluation status/summary or the new endpoint provides it.

## Validation

Run:

```bash
npm test
```

Then:

```bash
DATABASE_URL=postgres://nexus:nexus@127.0.0.1:54329/nexus_suite_dev \
RIFTSENSE_DB_SCHEMA=riftsense \
npm test
```

Manual smoke:

1. Sign in locally.
2. Load recent games.
3. Confirm `riftsense.match_evaluations` rows exist.
4. Confirm API returns evaluation summaries.

## Acceptance criteria

- Recent persisted matches can be evaluated in a batch.
- API exposes evaluation summaries for recent games.
- Evaluation is idempotent/current/stale-aware.
- Auth boundaries are enforced.
