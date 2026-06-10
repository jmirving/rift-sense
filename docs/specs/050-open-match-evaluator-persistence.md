# 050 - Open - Match Evaluator Persistence

## Status

Open

## Context

RiftSense now has the required persistence foundation:

- Postgres-only runtime persistence.
- Prod Render deployment proven.
- Recent games are visible in the UI.
- Raw Riot match records are persisted in `riftsense.riot_raw_matches`.
- User match perspectives are persisted in `riftsense.riot_match_perspectives`.

Tasks 1 and 2 from the milestone plan are considered complete. This spec starts the evaluator layer.

## Goal

Add deterministic match evaluation persistence for already-ingested Riot matches.

RiftSense should be able to evaluate a persisted `(match_id, puuid)` pair without refetching Riot data and store a stable evaluator output in Postgres.

## Non-goals

- No AI interpretation.
- No coaching prose.
- No subjective blame/why analysis.
- No final goal scoring system yet.
- No large UI redesign.

## Data model

Add a migration for:

`riftsense.match_evaluations`

Recommended fields:

- `match_id text not null`
- `puuid text not null`
- `evaluation_version text not null`
- `source_raw_match_updated_at timestamptz`
- `source_perspective_updated_at timestamptz`
- `summary_json jsonb not null`
- `deaths_json jsonb not null`
- `tags_json jsonb not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- primary key `(match_id, puuid, evaluation_version)`

Add indexes:

- `(puuid, updated_at desc)`
- `(match_id)`
- `(evaluation_version)`

## Evaluator version

Start with a constant:

`deterministic-v1`

A versioned evaluator lets future logic change without corrupting old results.

## Evaluator input

Use only persisted DB records:

- `riot_raw_matches.summary_json`
- `riot_raw_matches.timeline_json`
- `riot_match_perspectives.record`
- target `puuid`

Do not call Riot from the evaluator.

## Evaluator output

The first output should be boring and stable.

`summary_json` should include:

- `matchId`
- `puuid`
- `championName`
- `queueId`
- `gameCreation`
- `gameDuration`
- `win`
- `kills`
- `deaths`
- `assists`
- `teamId`
- `participantId`
- `role`
- `lane`
- `evaluatedAt`
- `evaluationVersion`

`deaths_json` should be an array of death facts:

- `deathIndex`
- `timestampMs`
- `timestampSeconds`
- `minute`
- `victimParticipantId`
- `killerParticipantId`
- `killerChampionName`
- `assistingParticipantIds`
- `assistingChampionNames`
- `position`
- `victimLevel` if inferable
- `killerLevel` if inferable
- `enemyParticipantsInvolved`
- `tags`

`tags_json` should include match-level and death-level tag counts:

- `death_count`
- `solo_death_candidate`
- `multi_enemy_collapse_candidate`
- `objective_window_candidate`
- `enemy_level_up_recently_candidate`
- `missing_timeline`
- `missing_participant`

## Deterministic tag definitions

Keep the first version conservative.

### `multi_enemy_collapse_candidate`

A death where at least two enemy champions were involved as killer/assists.

### `solo_death_candidate`

A death where only one enemy champion was involved.

### `objective_window_candidate`

A death within a configurable window around major objective events if objective events are available in the timeline.

Initial window: 45 seconds before or after dragon, herald, baron, elder, or tower/inhibitor events.

### `enemy_level_up_recently_candidate`

A death where an enemy participant involved in the death leveled up shortly before the death.

Initial window: 20 seconds before death.

Only apply when timeline level-up events make this inferable. Do not guess.

### `missing_timeline`

Set if timeline JSON is missing or lacks frames/events.

### `missing_participant`

Set if the target `puuid` cannot be matched to a participant.

## Repository/service

Add an evaluator repository or service with methods such as:

- `getMatchEvaluation({ matchId, puuid, evaluationVersion })`
- `saveMatchEvaluation(record)`
- `evaluatePersistedMatch({ matchId, puuid, evaluationVersion })`
- `evaluateRecentPersistedMatchesForUser({ puuid, limit })`

Naming may follow existing repo style.

## API exposure

This phase may expose a minimal internal/dev endpoint only if useful for tests or manual smoke. Full UI/API is phase 051/052.

Acceptable examples:

- `POST /api/matches/:matchId/evaluate`
- or no route, service-only, if the next phase owns route design.

If a route is added:
- require auth
- only allow evaluating the authenticated user's own `puuid`
- do not expose raw timeline

## Tests

Required tests:

- Migration creates `match_evaluations`.
- Evaluator finds participant by `puuid`.
- Evaluator extracts death events from timeline fixtures.
- Evaluator handles zero-death games.
- Evaluator handles missing/malformed timeline gracefully.
- Evaluator produces stable `evaluation_version`.
- Evaluation save/reload is idempotent.
- Re-running evaluation updates/no-ops, not duplicates.
- Existing DB-backed tests still pass.

Use fixture data where possible. Avoid tests that require live Riot calls.

## Validation

Run:

```bash
npm test
```

Then with DB:

```bash
DATABASE_URL=postgres://nexus:nexus@127.0.0.1:54329/nexus_suite_dev \
RIFTSENSE_DB_SCHEMA=riftsense \
npm test
```

Optional manual DB check:

```sql
select match_id, puuid, evaluation_version, updated_at
from riftsense.match_evaluations
order by updated_at desc
limit 10;
```

## Acceptance criteria

- `match_evaluations` exists.
- At least one persisted raw match + perspective can be evaluated without Riot API calls.
- Evaluation output is deterministic and stored.
- DB-backed tests pass.
- No UI goal interpretation is required yet.
