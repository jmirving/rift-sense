Implement Spec 052: Match Evaluator UI and Goal Evidence.

Repository:
https://github.com/jmirving/rift-sense

Read first:
- docs/specs/052-open-match-evaluator-ui-goal-evidence.md
- docs/specs/051-open-match-evaluator-backfill-api.md
- Current recent games UI/client code
- Current home/dashboard code

Context:
- Phase 050 added deterministic evaluator persistence.
- Phase 051 added evaluation backfill/API summaries.
- This phase makes the evaluator visible and lightly goal-relevant.

Goal:
Show deterministic review evidence in the UI and surface a first review candidate tied to the user's active goal when possible.

Requirements:
1. Recent games cards show evaluation summary:
   - death count
   - top deterministic tags/signals
   - evaluation status
2. Selected/expanded game shows death-level facts:
   - timestamp
   - killer
   - assists
   - tags
3. Home/dashboard shows a simple review candidate:
   - selected from recent evaluated games
   - explains why it was selected
   - references active goal/focus when available
4. Implement simple deterministic candidate ranking.
5. Handle missing/zero-death/no-goal cases gracefully.
6. Do not expose raw timeline JSON in UI.
7. Add client/UI tests or server-render tests matching existing repo style.

Validation:
- npm test
- DATABASE_URL=postgres://nexus:nexus@127.0.0.1:54329/nexus_suite_dev RIFTSENSE_DB_SCHEMA=riftsense npm test

Manual smoke:
- Sign in.
- Load recent games.
- Confirm evaluator summaries appear.
- Confirm review candidate appears.
- Refresh and confirm evidence persists.

Commit:
Show match evaluation evidence in UI
