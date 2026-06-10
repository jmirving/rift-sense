Implement Spec 050: Match Evaluator Persistence.

Repository:
https://github.com/jmirving/rift-sense

Read first:
- docs/specs/050-open-match-evaluator-persistence.md
- Current DB migration/repository code
- Current recent games / Riot persistence code

Context:
- Postgres-only persistence is already implemented and deployed.
- Recent games are visible.
- `riftsense.riot_raw_matches` and `riftsense.riot_match_perspectives` already contain prod rows.
- This task begins the deterministic evaluator layer.

Goal:
Add deterministic match evaluation persistence for already-ingested Riot matches.

Requirements:
1. Add migration for `riftsense.match_evaluations`.
2. Add evaluator version constant, starting with `deterministic-v1`.
3. Add evaluator logic that reads persisted raw match summary/timeline + perspective and computes deterministic facts.
4. Add repository/service methods to save and retrieve evaluations.
5. Do not call Riot from the evaluator.
6. Do not use AI.
7. Keep tags conservative and deterministic:
   - death_count
   - solo_death_candidate
   - multi_enemy_collapse_candidate
   - objective_window_candidate where inferable
   - enemy_level_up_recently_candidate where inferable
   - missing_timeline
   - missing_participant
8. Add fixture/unit tests and DB-backed repository tests.
9. Ensure rerunning evaluation is idempotent.
10. Keep UI changes out unless a tiny dev/manual route is needed.

Validation:
- npm test
- DATABASE_URL=postgres://nexus:nexus@127.0.0.1:54329/nexus_suite_dev RIFTSENSE_DB_SCHEMA=riftsense npm test

Manual DB check:
select match_id, puuid, evaluation_version, updated_at
from riftsense.match_evaluations
order by updated_at desc
limit 10;

Commit:
Add deterministic match evaluation persistence
