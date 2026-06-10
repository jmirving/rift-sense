#!/usr/bin/env bash
set -euo pipefail

PHASES=(050 051 052)

ROOT="$(pwd)"
DB_URL="${DATABASE_URL:-}"
SCHEMA="${RIFTSENSE_DB_SCHEMA:-riftsense}"

if [[ ! -f "package.json" ]]; then
  echo "ERROR: run this script from the rift-sense repository root." >&2
  exit 1
fi

echo "RiftSense Wiggum Match Evaluator Loop"
echo "Repo: $ROOT"
echo "Schema: $SCHEMA"
if [[ -z "$DB_URL" ]]; then
  echo "DATABASE_URL is not set. DB-backed validation will likely skip or fail."
  echo "Canonical local command:"
  echo "  DATABASE_URL=postgres://nexus:nexus@127.0.0.1:54329/nexus_suite_dev RIFTSENSE_DB_SCHEMA=riftsense $0"
else
  echo "DATABASE_URL is set."
fi
echo

run_validation() {
  echo
  echo "== Validation: npm test =="
  npm test

  if [[ -n "$DB_URL" ]]; then
    echo
    echo "== Validation: DB-backed npm test =="
    DATABASE_URL="$DB_URL" RIFTSENSE_DB_SCHEMA="$SCHEMA" npm test
  else
    echo
    echo "Skipping explicit DB-backed validation because DATABASE_URL is not set."
  fi
}

show_prompt() {
  local phase="$1"
  local prompt_file="prompts/${phase}-"
  prompt_file="$(ls prompts/${phase}-*.md 2>/dev/null | head -n 1 || true)"
  if [[ -z "$prompt_file" ]]; then
    echo "ERROR: No prompt found for phase $phase under prompts/." >&2
    exit 1
  fi

  echo
  echo "============================================================"
  echo "PHASE $phase"
  echo "Prompt: $prompt_file"
  echo "Spec:"
  ls "docs/specs/${phase}-"*.md 2>/dev/null || true
  echo "============================================================"
  echo
  cat "$prompt_file"
  echo
  echo "============================================================"
  echo
}

wait_for_user() {
  local message="$1"
  echo
  read -r -p "$message [y/N] " answer
  case "${answer,,}" in
    y|yes) return 0 ;;
    *) echo "Stopping."; exit 0 ;;
  esac
}

for phase in "${PHASES[@]}"; do
  show_prompt "$phase"

  wait_for_user "Use the prompt above with the implementing agent. Continue when phase $phase has been implemented/committed?"

  run_validation

  echo
  echo "Phase $phase validation completed."
  wait_for_user "Proceed to next phase?"
done

echo
echo "All Wiggum phases completed."
echo "Milestone smoke checklist:"
echo "1. Sign in through Nexus."
echo "2. Recent persisted Riot games load."
echo "3. At least one match evaluation row exists."
echo "4. UI shows deterministic review evidence."
echo "5. UI shows a review candidate tied to active goal when possible."
