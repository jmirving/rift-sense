# RiftSense Wiggum Loop: Match Evaluator Milestone

This bundle is intended to be copied into `jmirving/rift-sense` and run from the repository root.

Assumptions:
- Tasks 1 and 2 are already complete:
  - Postgres-only persistence is deployed and working.
  - `riftsense.riot_raw_matches` and `riftsense.riot_match_perspectives` are populated from recent games.
- Local DB validation should use:
  - `DATABASE_URL=postgres://nexus:nexus@127.0.0.1:54329/nexus_suite_dev`
  - `RIFTSENSE_DB_SCHEMA=riftsense`

Milestone target:

> RiftSense can take a real authenticated user's persisted Riot match, run deterministic evaluation, persist the evaluation, and show useful goal-relevant review evidence in the UI.

## Files

- `docs/specs/050-open-match-evaluator-persistence.md`
- `docs/specs/051-open-match-evaluator-backfill-api.md`
- `docs/specs/052-open-match-evaluator-ui-goal-evidence.md`
- `prompts/050-match-evaluator-persistence.md`
- `prompts/051-match-evaluator-backfill-api.md`
- `prompts/052-match-evaluator-ui-goal-evidence.md`
- `scripts/wiggum_match_evaluator_loop.sh`

## Execution

From the repo root:

```bash
chmod +x scripts/wiggum_match_evaluator_loop.sh
DATABASE_URL=postgres://nexus:nexus@127.0.0.1:54329/nexus_suite_dev \
RIFTSENSE_DB_SCHEMA=riftsense \
scripts/wiggum_match_evaluator_loop.sh
```

The script does not implement the feature itself. It organizes the agent loop:
1. Displays each phase prompt.
2. Runs a pre-check.
3. Waits for the agent/developer to implement the phase.
4. Runs validation commands.
5. Requires confirmation before proceeding to the next phase.

Use the prompts with the implementing agent. After each phase lands, return to the script and continue.
