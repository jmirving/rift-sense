#!/usr/bin/env bash
set -u
set -o pipefail

# Wiggum loop for RiftSense game parsing implementation.
#
# Runs implementation tasks in order.
# For each task:
#   1. Run implementation prompt.
#   2. Run checker prompt.
#   3. If checker says PASS, continue.
#   4. If checker says FAIL, run fixer prompt and repeat checker.
#   5. If checker says HUMAN_REQUIRED, stop immediately.
#
# The checker must put one of these as the first line:
#   PASS
#   FAIL
#   HUMAN_REQUIRED
#
# Default agent command:
#   codex exec
#
# Override example:
#   WIGGUM_CMD="codex exec --sandbox workspace-write" ./scripts/wiggum_game_parser_loop.sh

WIGGUM_CMD="${WIGGUM_CMD:-codex exec}"
ROOT_DIR="$(pwd)"
LOG_DIR="${ROOT_DIR}/.wiggum/game-parser"
RUN_ID="$(date +%Y%m%d-%H%M%S)"
RUN_DIR="${LOG_DIR}/${RUN_ID}"

mkdir -p "${RUN_DIR}"

if ! git rev-parse --show-toplevel >/dev/null 2>&1; then
  echo "HUMAN_REQUIRED: run this script from inside the RiftSense git repository."
  exit 2
fi

if ! command -v ${WIGGUM_CMD%% *} >/dev/null 2>&1; then
  echo "HUMAN_REQUIRED: agent command not found: ${WIGGUM_CMD}"
  echo "Set WIGGUM_CMD to the correct command and rerun."
  exit 2
fi

run_agent() {
  local prompt_file="$1"
  local output_file="$2"

  echo
  echo "=== Running agent with prompt: ${prompt_file} ==="
  echo

  # shellcheck disable=SC2086
  ${WIGGUM_CMD} < "${prompt_file}" | tee "${output_file}"
  return "${PIPESTATUS[0]}"
}

write_prompt() {
  local path="$1"
  local content="$2"
  printf "%s\n" "${content}" > "${path}"
}

checker_status() {
  local output_file="$1"
  local first_line
  first_line="$(head -n 1 "${output_file}" | tr -d '\r' | xargs || true)"

  case "${first_line}" in
    PASS) echo "PASS" ;;
    FAIL) echo "FAIL" ;;
    HUMAN_REQUIRED) echo "HUMAN_REQUIRED" ;;
    *)
      echo "HUMAN_REQUIRED"
      ;;
  esac
}

task_prompt() {
  local task_id="$1"

  case "${task_id}" in

    00-docs)
      cat <<'EOF'
You are working in the RiftSense repository.

Implement the lightweight game parsing planning docs. Do not introduce a formal Nexus-style spec lifecycle, spec number, open/closed status, or status metadata.

Create or update these docs:

- docs/game-data-ingestion.md
- docs/game-parser-deterministic-evaluation.md
- docs/game-evidence-goal-linking.md

The docs must cover:

1. When RiftSense gets new game data.
2. How many games RiftSense discovers and parses.
3. How RiftSense avoids blocking the user while parsing.
4. What raw data is stored.
5. How parsing status is represented.
6. What deterministic parser outputs look like.
7. How parsed evidence links to existing goals.
8. How missing goal type options are seeded or suggested.
9. Non-goals and product boundaries.

Do not implement runtime code in this task unless the repository already has an obvious docs-only validation hook that requires it.

After making changes, run the cheapest relevant validation available, such as markdown lint if present, otherwise no-op with a clear note.
EOF
      ;;

    01-raw-match-storage)
      cat <<'EOF'
You are working in the RiftSense repository.

Implement raw match storage for League match summary and timeline data.

Goal:
RiftSense should be able to store raw Riot match summary and timeline payloads by matchId, and associate a user-specific perspective by matchId + puuid.

Requirements:
- Search the repository first to understand existing persistence, database, auth, Riot/Nexus integration, and project conventions.
- Add or extend storage for raw match data:
  - matchId
  - summary JSON
  - timeline JSON
  - createdAt
  - updatedAt
- Add or extend storage for user match perspective:
  - matchId
  - puuid
  - participantId
  - championName when available
  - teamId when available
  - teamPosition or individualPosition when available
  - parse or ingestion status
- Deduplicate raw match data by matchId.
- Deduplicate user perspective by matchId + puuid.
- Do not re-fetch raw data if already stored and fresh enough according to existing cache conventions.
- Preserve current behavior unless a route/function is clearly part of the new match ingestion path.
- Add focused tests around storage/deduplication if test infrastructure exists.

Do not implement deterministic analysis in this task. Only raw storage and perspective storage.

Run the relevant test command(s). If test commands are not obvious, inspect package scripts and run the narrowest appropriate test.
EOF
      ;;

    02-participant-perspective)
      cat <<'EOF'
You are working in the RiftSense repository.

Implement participant perspective resolution for a stored match.

Goal:
Given match summary, match timeline if needed, and a user's PUUID, RiftSense should resolve the participantId and user-facing match metadata needed by deterministic parsers.

Requirements:
- Search the repository first for existing Riot participant, PUUID, and match parsing code.
- Implement a reusable function/module that resolves:
  - puuid
  - participantId
  - championName
  - teamId
  - teamPosition
  - individualPosition
  - gameCreation/gameStart/gameEnd/duration if available
- The function must return a clear typed result or structured error.
- Error cases:
  - missing summary
  - participant not found
  - invalid match shape
- Add tests for:
  - successful participant resolution
  - missing participant
  - missing or invalid summary shape
- Wire this into ingestion/storage if an obvious integration point exists.
- Do not implement death review or other evidence parsing yet.

Run the relevant tests.
EOF
      ;;

    03-death-review-parser)
      cat <<'EOF'
You are working in the RiftSense repository.

Implement deterministic death review parsing.

Goal:
For a resolved user participant in a match timeline, emit deterministic death_review evidence objects.

Requirements:
- Search existing parser/evidence/goal code first.
- Implement a parser that finds CHAMPION_KILL events where victimId equals the user's participantId.
- For each death, collect:
  - timestamp
  - killerId
  - assistingParticipantIds
  - position
  - damage received grouped by champion, minion, tower, monster, or unknown source
  - damage dealt by the player grouped by target
  - prior frame HP/max HP/level/position
  - nearby events before death and after death in separate buckets
- Implement generic reusable tags, not over-specific labels:
  - low_hp_positioning
  - tower_damage_relevant
  - minion_damage_relevant
  - enemy_level_timing_before_death
  - post_objective_map_shift
  - lost_fight_stagger
  - numbers_disadvantage_or_collapse
  - low_return_damage
  - high_return_damage
- Important rule:
  - Level-ups after the death are aftermath only. They must not cause enemy_level_timing_before_death.
  - Structures or objectives after death are aftermath unless supporting pre-death map state evidence already exists.
- Emit review questions from tags.
- Do not use AI or natural language inference inside the parser.
- Add tests using minimal fixture timelines.
- Include a fixture or test case proving post-death level-up does not create a death-cause tag.

Run the relevant tests.
EOF
      ;;

    04-tempo-conversion-parser)
      cat <<'EOF'
You are working in the RiftSense repository.

Implement deterministic tempo/conversion parsing.

Goal:
RiftSense should detect what a team gains after important trigger events, and whether that conversion is clean, neutral, or gives tempo back.

Requirements:
- Search existing parser/evidence code first.
- Trigger events should include:
  - CHAMPION_KILL
  - ELITE_MONSTER_KILL
  - BUILDING_KILL
  - TURRET_PLATE_DESTROYED
- For each trigger, examine a configurable post-window, default 90 seconds.
- Summarize:
  - player team gains after trigger
  - enemy team gains after trigger
  - player deaths after trigger
  - player participation in trigger if relevant
  - objective/structure conversions
  - enemy cross-map trades
- Emit generic tags:
  - clean_conversion
  - failed_conversion
  - overstay_after_conversion
  - objective_into_death
  - kill_into_no_plate
  - plate_into_bad_reset
  - baron_exit_failure
  - tower_take_into_collapse
  - tempo_spent_but_stayed
  - enemy_crossmap_trade
  - reset_window_missed
- Keep labels generic and use params for specifics.
- Do not overclaim intent.
- Add tests covering:
  - kill into tower/plate/objective conversion
  - objective into player death
  - Baron into immediate player death
  - enemy cross-map trade
- Wire into parsed match output if parser aggregation exists.

Run the relevant tests.
EOF
      ;;

    05-goal-type-seeding)
      cat <<'EOF'
You are working in the RiftSense repository.

Implement system goal type seeding for parser evidence categories.

Goal:
RiftSense should have goal type options corresponding to deterministic evidence categories, without requiring users to already have active goals.

Requirements:
- Search existing goal models, seed data, UI options, migrations, tests, and docs.
- Add or extend system goal type definitions for:
  - death_review
  - tempo_conversion
  - objective_setup_exit
  - fight_participation
  - map_state_safety
  - lane_pressure_conversion
  - vision_information
- Each goal type should define:
  - stable id
  - title
  - description
  - role applicability, with ANY for general goals
  - evidence categories
  - tag subscriptions
  - default review questions
  - system-created flag if the data model supports it
- Do not auto-create active user goals.
- Add tests ensuring seed is idempotent and does not duplicate goal types.
- If no goal persistence exists yet, create the smallest structure consistent with the repo.

Run the relevant tests.
EOF
      ;;

    06-evidence-goal-linking)
      cat <<'EOF'
You are working in the RiftSense repository.

Implement deterministic evidence-to-goal linking.

Goal:
Parsed evidence should link to active user goals when the evidence category or tags match a goal type subscription.

Requirements:
- Search existing goal/evidence/match review code first.
- Implement reusable matching logic:
  - category match
  - tag subscription match
  - optional role scope
  - optional champion scope
- Return match reasons:
  - categoryMatch
  - matchedTags
  - skippedByRoleScope
  - skippedByChampionScope
- Do not require every evidence item to match a goal.
- Strong evidence without a matching goal should remain available as unlinked evidence.
- Add tests for:
  - category match
  - tag match
  - no match
  - role scope skip
  - champion scope skip
  - evidence still exists when no goals match

Run the relevant tests.
EOF
      ;;

    07-parser-status-ui)
      cat <<'EOF'
You are working in the RiftSense repository.

Implement non-blocking parser status UI and API behavior.

Goal:
Users should not be locked in a loading state while RiftSense discovers, fetches, or parses recent matches.

Requirements:
- Search existing routes/pages/components for recent games, Riot account status, and match review surfaces.
- Add or update user-visible states:
  - riot_account_not_linked
  - riot_access_not_configured
  - checking_recent_games
  - recent_games_unavailable
  - games_found_parsing
  - some_games_ready
  - all_recent_games_ready
  - parse_failed_retry_available
- UI should show partial readiness:
  - X games ready
  - Y games still being prepared
- Refresh should respect existing Riot/cache cooldown conventions.
- Do not block the page on parsing multiple matches.
- If only one match is ready, the user should still be able to review it.
- Add tests for status derivation if possible.
- Add UI tests only if the repo already has appropriate infrastructure.

Run the relevant tests.
EOF
      ;;

    08-objective-setup-exit-parser)
      cat <<'EOF'
You are working in the RiftSense repository.

Implement deterministic objective setup and objective exit evidence.

Goal:
For dragon, Herald, Baron, and Elder events, RiftSense should identify setup context and post-objective exit outcomes.

Requirements:
- Search existing parser/evidence code first.
- For each ELITE_MONSTER_KILL:
  - Identify objective type/subtype.
  - Determine team that secured it.
  - Capture setup window, default 90 seconds before.
  - Capture exit window, default 60 seconds after.
- Setup facts:
  - deaths before objective
  - player position before objective
  - team positions before objective if available
  - wards placed/killed in setup window if available
- Exit facts:
  - player death after objective
  - ally/enemy deaths after objective
  - structures taken after objective
  - enemy cross-map gains
- Tags:
  - objective_setup_present
  - objective_setup_missing
  - objective_taken_cleanly
  - objective_taken_but_exit_failed
  - objective_contested_and_lost
  - enemy_objective_crossmap_trade
  - post_major_objective_death
- Do not overclaim fog-of-war or intent.
- Add tests for:
  - clean dragon
  - objective taken followed by player death
  - Baron followed by player death
  - enemy cross-map structure after objective

Run the relevant tests.
EOF
      ;;

    09-fight-participation-parser)
      cat <<'EOF'
You are working in the RiftSense repository.

Implement deterministic fight participation evidence.

Goal:
RiftSense should identify whether the user was present, late, absent, dead before, or isolated during meaningful fight clusters.

Requirements:
- Search existing parser/evidence code first.
- Cluster CHAMPION_KILL events that occur within a configurable window, default 15 seconds.
- For each fight cluster, determine:
  - fight start/end
  - kills/deaths by team
  - whether the player got a kill or assist
  - whether the player died
  - player position at start/end if frames allow it
  - player distance from fight center at nearest frame
  - player damage in death events when available
- Tags:
  - present_for_fight
  - late_to_fight
  - absent_from_fight
  - died_before_fight
  - cleaned_up_after_fight
  - high_damage_losing_fight
  - low_damage_death
  - front_to_back_participation_possible
  - isolated_from_team
- Do not claim the player should or should not have joined unless the evidence is deterministic.
- Add tests for:
  - player participates with assist
  - player absent from fight
  - player dies before fight
  - high-damage losing fight
  - low-damage death

Run the relevant tests.
EOF
      ;;

    10-lane-vision-parsers)
      cat <<'EOF'
You are working in the RiftSense repository.

Implement first-pass deterministic lane pressure and vision/information evidence.

Goal:
Add broad, repeatable evidence for early lane pressure and vision/information gaps without overclaiming.

Lane pressure requirements:
- Focus on pre-14-minute windows.
- Use per-minute frames to compute:
  - CS delta
  - XP delta
  - gold delta
  - level delta
  - plates taken/lost
  - deaths in lane window
- Resolve lane opponents using role/teamPosition when available; otherwise use position/lane heuristics only if already present or easy to test.
- Tags:
  - lane_cs_lead
  - lane_cs_deficit
  - xp_lead
  - xp_deficit
  - plate_conversion
  - plate_loss_after_death
  - pressure_without_conversion
  - crash_or_reset_possible
  - repeat_gank_same_lane

Vision/information requirements:
- Use ward placed/killed events from timeline and aggregate summary stats where available.
- Emit cautious evidence, not certainty about fog of war.
- Tags:
  - low_vision_activity
  - objective_without_recent_vision
  - death_after_no_recent_ward
  - control_ward_missing
  - vision_denial_success
  - support_vision_gap
  - carry_no_defensive_ward_before_push

Tests:
- CS/XP/gold deltas by minute.
- Plate conversion.
- Death after no recent ward.
- Objective without recent ward activity.
- Ensure vision parser wording/tag confidence is cautious.

Run the relevant tests.
EOF
      ;;

    11-final-validation)
      cat <<'EOF'
You are working in the RiftSense repository.

Perform final validation of the game parsing and goal-linking implementation.

Requirements:
- Review the docs:
  - docs/game-data-ingestion.md
  - docs/game-parser-deterministic-evaluation.md
  - docs/game-evidence-goal-linking.md
- Review implementation consistency against those docs.
- Run the full available test suite.
- Run lint/build/typecheck commands if present in package scripts.
- Fix any issues found.
- Do not introduce new feature scope.
- Do not commit unless the repository already has an explicit automation convention requiring it.

Produce a concise final summary with:
- changed files
- tests run
- any known limitations
- whether a human decision is required

If no human decision is required, continue fixing until the repository validates.
EOF
      ;;

    *)
      echo "Unknown task id: ${task_id}" >&2
      exit 1
      ;;
  esac
}

checker_prompt() {
  local task_id="$1"

  cat <<EOF
You are checking task '${task_id}' in the RiftSense repository.

Inspect the repository changes and verify whether the task is complete.

Your first line must be exactly one of:

PASS
FAIL
HUMAN_REQUIRED

Use PASS only if:
- the task requirements are implemented,
- relevant tests/validation pass,
- no obvious regression remains.

Use FAIL if:
- code/docs/tests need more work,
- the issue is fixable without a product decision,
- you can give concrete fix instructions.

Use HUMAN_REQUIRED only if:
- a product decision is strictly required,
- required secrets/access are missing,
- repository state is ambiguous in a way an agent cannot safely resolve,
- the requested behavior conflicts with existing product architecture.

After the first line, include:
- evidence reviewed,
- commands run,
- failures found,
- exact fix instructions if FAIL,
- exact human question if HUMAN_REQUIRED.

Do not use HUMAN_REQUIRED for ordinary implementation bugs.
Do not use HUMAN_REQUIRED because work is large.
Do not use HUMAN_REQUIRED because tests failed if the failure is fixable.
EOF
}

fixer_prompt() {
  local task_id="$1"
  local checker_output_file="$2"

  cat <<EOF
You are fixing task '${task_id}' in the RiftSense repository.

The checker found issues. Fix them without asking for confirmation unless a human decision is strictly required.

Checker output:

$(cat "${checker_output_file}")

Requirements:
- Address every fixable issue from the checker.
- Keep scope limited to the current task.
- Preserve existing behavior outside the task.
- Add or update tests when appropriate.
- Run the relevant tests again.
- If a human decision is truly required, explain exactly what decision is required and why.
EOF
}

TASKS=(
  "00-docs"
  "01-raw-match-storage"
  "02-participant-perspective"
  "03-death-review-parser"
  "04-tempo-conversion-parser"
  "05-goal-type-seeding"
  "06-evidence-goal-linking"
  "07-parser-status-ui"
  "08-objective-setup-exit-parser"
  "09-fight-participation-parser"
  "10-lane-vision-parsers"
  "11-final-validation"
)

echo "Starting Wiggum game parser loop"
echo "Repo: ${ROOT_DIR}"
echo "Run dir: ${RUN_DIR}"
echo "Agent command: ${WIGGUM_CMD}"

for task_id in "${TASKS[@]}"; do
  echo
  echo "============================================================"
  echo "TASK: ${task_id}"
  echo "============================================================"

  task_dir="${RUN_DIR}/${task_id}"
  mkdir -p "${task_dir}"

  impl_prompt="${task_dir}/01-implement.prompt.txt"
  impl_output="${task_dir}/01-implement.output.txt"

  task_prompt "${task_id}" > "${impl_prompt}"

  if ! run_agent "${impl_prompt}" "${impl_output}"; then
    echo "Agent implementation command returned non-zero. Continuing to checker; checker will decide whether fixable or human-required."
  fi

  iteration=1

  while true; do
    checker_prompt_file="${task_dir}/check-${iteration}.prompt.txt"
    checker_output_file="${task_dir}/check-${iteration}.output.txt"

    checker_prompt "${task_id}" > "${checker_prompt_file}"

    if ! run_agent "${checker_prompt_file}" "${checker_output_file}"; then
      echo "Checker command returned non-zero. Treating as HUMAN_REQUIRED because checker did not complete."
      echo "See: ${checker_output_file}"
      exit 2
    fi

    status="$(checker_status "${checker_output_file}")"

    echo
    echo "Checker status for ${task_id}: ${status}"
    echo

    if [[ "${status}" == "PASS" ]]; then
      echo "Task ${task_id} passed."
      break
    fi

    if [[ "${status}" == "HUMAN_REQUIRED" ]]; then
      echo "Human decision required during task ${task_id}."
      echo "See checker output: ${checker_output_file}"
      exit 2
    fi

    if [[ "${status}" != "FAIL" ]]; then
      echo "HUMAN_REQUIRED: checker did not emit a valid first-line status."
      echo "See checker output: ${checker_output_file}"
      exit 2
    fi

    fixer_prompt_file="${task_dir}/fix-${iteration}.prompt.txt"
    fixer_output_file="${task_dir}/fix-${iteration}.output.txt"

    fixer_prompt "${task_id}" "${checker_output_file}" > "${fixer_prompt_file}"

    if ! run_agent "${fixer_prompt_file}" "${fixer_output_file}"; then
      echo "Fixer command returned non-zero. Continuing to checker; checker will decide whether fixable or human-required."
    fi

    iteration=$((iteration + 1))
  done
done

echo
echo "================================================------------"
echo "Wiggum game parser loop complete."
echo "All tasks reached PASS."
echo "Logs: ${RUN_DIR}"
echo "================================================------------"
exit 0
