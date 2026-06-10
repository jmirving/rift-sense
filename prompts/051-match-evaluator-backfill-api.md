Implement Spec 051: Match Evaluator Backfill and API.

Repository:
https://github.com/jmirving/rift-sense

Read first:
- docs/specs/051-open-match-evaluator-backfill-api.md
- docs/specs/050-open-match-evaluator-persistence.md
- The existing recent games API/service
- The evaluator repository/service from phase 050

Context:
- Phase 050 should already have `riftsense.match_evaluations` and deterministic evaluator persistence.
- Recent games are already persisted in raw/perspective tables.

Goal:
Make deterministic evaluation part of the recent-games flow and expose evaluation summaries through an authenticated API.

Requirements:
1. Add a backfill/ensure service for recent persisted match evaluations.
2. Detect current vs stale evaluations using source raw/perspective timestamps.
3. Evaluate missing/stale records idempotently.
4. Skip missing raw matches gracefully.
5. Expose evaluation summaries through the existing recent games API or a focused new endpoint.
6. Enforce authenticated user ownership.
7. Do not expose raw timeline JSON.
8. Add tests for missing/current/stale/failed/skipped cases.
9. Add API tests for auth boundaries and response shape.

Validation:
- npm test
- DATABASE_URL=postgres://nexus:nexus@127.0.0.1:54329/nexus_suite_dev RIFTSENSE_DB_SCHEMA=riftsense npm test

Manual smoke:
- Sign in.
- Load recent games.
- Verify `riftsense.match_evaluations` has rows.
- Verify API returns evaluation summaries.

Commit:
Add match evaluation backfill API
