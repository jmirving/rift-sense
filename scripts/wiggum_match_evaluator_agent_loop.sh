#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

DB_URL="${DATABASE_URL:-}"
DB_SCHEMA="${RIFTSENSE_DB_SCHEMA:-riftsense}"
AGENT_CMD="${WIGGUM_AGENT_CMD:-}"
AGENT_STDIN="${WIGGUM_AGENT_STDIN:-0}"
AUTO_COMMIT="${WIGGUM_AUTO_COMMIT:-0}"

PHASES=("050" "051" "052")

prompt_for_phase() {
  case "$1" in
    050) echo "prompts/050-match-evaluator-persistence.md" ;;
    051) echo "prompts/051-match-evaluator-backfill-api.md" ;;
    052) echo "prompts/052-match-evaluator-ui-goal-evidence.md" ;;
    *) echo "Unknown phase: $1" >&2; exit 2 ;;
  esac
}

default_agent_available() {
  command -v codex >/dev/null 2>&1
}

run_agent() {
  local phase="$1"
  local prompt_file="$2"
  local prompt_text
  prompt_text="$(cat "$prompt_file")"

  echo
  echo "============================================================"
  echo "WIGGUM PHASE $phase: invoking implementation agent"
  echo "Prompt: $prompt_file"
  echo "============================================================"
  echo

  if [[ -n "$AGENT_CMD" ]]; then
    if [[ "$AGENT_STDIN" == "1" ]]; then
      echo "Running custom stdin agent command: $AGENT_CMD"
      bash -lc "$AGENT_CMD" < "$prompt_file"
    else
      echo "Running custom argv agent command: $AGENT_CMD"
      "$SHELL" -lc "$AGENT_CMD \"\$1\"" _ "$prompt_text"
    fi
    return
  fi

  if default_agent_available; then
    echo "No WIGGUM_AGENT_CMD set; using default: codex exec --full-auto"
    codex exec --full-auto "$prompt_text"
    return
  fi

  cat >&2 <<'ERR'
No implementation agent command is configured.

Set WIGGUM_AGENT_CMD to a command that runs your implementation agent.

Examples:
  WIGGUM_AGENT_CMD='codex exec --full-auto'
  WIGGUM_AGENT_CMD='codex exec --full-auto -' WIGGUM_AGENT_STDIN=1

This script is intentionally strict: it will not pretend implementation happened.
ERR
  exit 10
}

run_tests() {
  echo
  echo "Running npm test..."
  npm test

  if [[ -z "$DB_URL" ]]; then
    echo "DATABASE_URL is not set; DB-backed validation cannot run." >&2
    exit 11
  fi

  echo
  echo "Running DB-backed npm test with schema: $DB_SCHEMA"
  DATABASE_URL="$DB_URL" RIFTSENSE_DB_SCHEMA="$DB_SCHEMA" npm test
}

assert_file_exists_matching() {
  local label="$1"
  shift
  local pattern
  for pattern in "$@"; do
    if compgen -G "$pattern" >/dev/null; then
      return 0
    fi
  done
  echo "Missing expected artifact: $label" >&2
  echo "Patterns checked:" >&2
  printf '  %s\n' "$@" >&2
  exit 20
}

assert_grep() {
  local label="$1"
  local regex="$2"
  shift 2
  if grep -R -E "$regex" "$@" >/dev/null 2>&1; then
    return 0
  fi
  echo "Missing expected code marker: $label" >&2
  echo "Regex: $regex" >&2
  echo "Paths: $*" >&2
  exit 21
}

assert_no_grep() {
  local label="$1"
  local regex="$2"
  shift 2
  if grep -R -E "$regex" "$@" >/dev/null 2>&1; then
    echo "Forbidden marker found: $label" >&2
    echo "Regex: $regex" >&2
    echo "Paths: $*" >&2
    exit 22
  fi
}

assert_db_table_exists() {
  local table="$1"
  if ! command -v psql >/dev/null 2>&1; then
    echo "psql not installed; skipping live table existence check for $table"
    return
  fi
  if [[ -z "$DB_URL" ]]; then
    echo "DATABASE_URL missing; cannot check DB table $table" >&2
    exit 23
  fi

  local count
  count="$(psql "$DB_URL" -Atc "select count(*) from information_schema.tables where table_schema = '$DB_SCHEMA' and table_name = '$table';")"
  if [[ "$count" != "1" ]]; then
    echo "Expected DB table $DB_SCHEMA.$table to exist, found count=$count" >&2
    exit 24
  fi
}

phase_050_static_checks_only() {
  assert_file_exists_matching \
    "match_evaluations migration" \
    "server/db/migrations/*match*evaluation*.sql" \
    "server/db/migrations/*match_evaluations*.sql"

  assert_file_exists_matching \
    "match evaluations repository" \
    "server/repositories/*match*evaluation*.js" \
    "server/repositories/match-evaluations.js"

  assert_file_exists_matching \
    "match evaluator service" \
    "server/riot/match-evaluator.js" \
    "server/match-evaluator/*.js" \
    "server/match-evaluator.js"

  assert_grep "match_evaluations table usage" "match_evaluations" server tests
}

phase_050_checks() {
  echo "Checking Phase 050 artifacts..."

  phase_050_static_checks_only
  assert_grep "evaluation version marker" "DETERMINISTIC_MATCH_EVALUATOR_VERSION|EVALUATION_VERSION|evaluationVersion|evaluation_version" server tests
  assert_grep "death events output" "deathsJson|deathEvents|death_events|deaths_json|deathEventsJson|death_events_json" server tests
  assert_grep "evaluator tests" "match evaluator|match-evaluator|match evaluations|death events|deathsJson" tests

  run_tests
  assert_db_table_exists "match_evaluations"
}

phase_051_checks() {
  echo "Checking Phase 051 artifacts..."

  phase_050_static_checks_only

  assert_grep \
    "startup/app wiring for match evaluations repository" \
    "createMatchEvaluationsRepository|matchEvaluationsRepository" \
    server/index.js server/app.js server/routes tests

  assert_grep \
    "recent persisted match evaluation service usage" \
    "evaluateRecentPersistedMatchesForUser|evaluatePersistedMatch|evaluate.*recent.*match|recent.*match.*evaluation" \
    server tests

  assert_grep \
    "authenticated evaluation API or integrated home/recent-games response" \
    "/api/.{0,40}evaluation|evaluate-recent|evaluationSummary|reviewEvidence|evidenceSummary|deathCount|deathsJson" \
    server/routes server/app.js tests

  assert_grep \
    "idempotent evaluation/backfill test" \
    "idempotent|duplicate|rerun|already.*evaluation|existing.*evaluation|upsert|does not duplicate" \
    tests

  assert_grep \
    "match evaluations repository initialized or passed into app" \
    "matchEvaluationsRepository.*initialize|createMatchEvaluationsRepository|matchEvaluationsRepository" \
    server/index.js server/app.js

  run_tests
}

phase_052_checks() {
  echo "Checking Phase 052 artifacts..."

  phase_050_static_checks_only

  assert_grep \
    "UI deterministic review evidence rendering" \
    "Deterministic review|Review signals|review evidence|death count|death events|evaluationSummary|reviewEvidence" \
    public server/routes tests

  assert_grep \
    "review candidate rendering/selection" \
    "review candidate|reviewCandidate|selected.*review|Why this game|Review this game|review-worthy" \
    public server tests

  assert_grep \
    "goal evidence connection" \
    "active goal|Active goal|goal evidence|goal.*review|activePersonalGoal|Die Less" \
    public server tests

  assert_no_grep \
    "AI interpretation claim in review evidence" \
    "AI interpretation|AI-reviewed|LLM interpreted" \
    public server tests

  assert_grep \
    "client-visible review evidence surface" \
    "Review signals|Deterministic review|review candidate|reviewCandidate|death count|death events|evaluationSummary|reviewEvidence" \
    public

  run_tests
}

phase_checks() {
  case "$1" in
    050) phase_050_checks ;;
    051) phase_051_checks ;;
    052) phase_052_checks ;;
    *) echo "Unknown phase: $1" >&2; exit 2 ;;
  esac
}

commit_if_requested() {
  local phase="$1"
  if [[ "$AUTO_COMMIT" != "1" ]]; then
    return
  fi

  if git diff --quiet && git diff --cached --quiet; then
    echo "No changes to commit for phase $phase."
    return
  fi

  git add .
  case "$phase" in
    050) git commit -m "Add deterministic match evaluation persistence" ;;
    051) git commit -m "Evaluate persisted recent matches" ;;
    052) git commit -m "Show deterministic review evidence" ;;
  esac
}

main() {
  echo "RiftSense Wiggum Agent Loop"
  echo "Repo: $ROOT"
  echo "Schema: $DB_SCHEMA"
  echo

  if [[ ! -f package.json ]]; then
    echo "Run from the RiftSense repository root." >&2
    exit 1
  fi

  for phase in "${PHASES[@]}"; do
    prompt_file="$(prompt_for_phase "$phase")"
    if [[ ! -f "$prompt_file" ]]; then
      echo "Missing prompt file: $prompt_file" >&2
      exit 3
    fi

    run_agent "$phase" "$prompt_file"
    phase_checks "$phase"
    commit_if_requested "$phase"

    echo
    echo "Phase $phase passed strict checks."
    echo
  done

  echo "All strict Wiggum phases completed."
  echo
  echo "Milestone smoke checklist to verify manually:"
  echo "1. Sign in through Nexus."
  echo "2. Recent persisted Riot games load."
  echo "3. At least one match evaluation row exists in $DB_SCHEMA.match_evaluations."
  echo "4. UI shows deterministic review evidence."
  echo "5. UI shows a review candidate tied to active goal when possible."
}

main "$@"
