# 052 - Open - Match Evaluator UI and Goal Evidence

## Status

Open

## Depends on

- 050 - Match Evaluator Persistence
- 051 - Match Evaluator Backfill and API

## Context

RiftSense can now produce deterministic evaluation summaries for recent persisted matches and expose them through an authenticated API.

The next step is to make this useful in the product UI and lightly connect it to the user's saved goal.

## Goal

Show deterministic review evidence on recent games and surface a first "review candidate" tied to the user's active goal.

This is the milestone completion phase.

## Non-goals

- No AI coaching prose.
- No subjective blame analysis.
- No polished full replay review UI.
- No advanced ranking/scoring model yet.

## UI surfaces

### Recent games cards

For each recent game with evaluation summary, show:

- champion
- result
- KDA
- death count
- top deterministic tags/signals
- evaluation status

Example:

```text
Ashe — Loss — 4/7/9
Review signals:
- 7 deaths
- 3 multi-enemy collapse candidates
- 2 objective-window candidates
```

### Death review details

For a selected game, show death facts:

- timestamp
- killer champion
- assisting champions
- tags

Example:

```text
08:14 — killed by LeBlanc, assisted by Briar
Tags: multi-enemy collapse candidate
```

This can be a simple expandable section; no fancy page required.

### Home / dashboard review candidate

Add a lightweight "Today's review candidate" or equivalent:

- selected from recent evaluated games
- shows why it was selected
- references active user goal if available

Example:

```text
Review Ashe loss from today
Why: 7 deaths, 3 multi-enemy collapse candidates
Goal: Die Less
```

## Goal linkage

Start simple and deterministic.

If active goal/focus contains death-related meaning, such as:

- "Die Less"
- "death"
- "positioning"
- selected goal template with death-related tags

Then prioritize death-related evaluation signals.

If no known goal exists, show generic review signals.

Do not overfit the saved goal model. Use safe fallback behavior.

## Candidate selection v1

Simple ranking:

1. Prefer games with evaluation summaries.
2. Prefer games with death count > 0.
3. Prefer games with more goal-relevant tags.
4. Prefer recent games.
5. Prefer ranked/SR if queue information is available.
6. Do not hide all games if no ideal candidate exists.

## Tests

Required tests:

- Recent game card renders evaluation summary.
- Death details render deterministic death facts.
- UI handles missing evaluation summary.
- UI handles zero-death games.
- Review candidate picks a game with stronger goal-relevant evidence.
- Review candidate falls back gracefully with no saved goal.
- API/client does not expose raw timeline.

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

1. Sign in locally or in prod after deploy.
2. Confirm recent games display evaluator summaries.
3. Confirm one review candidate appears.
4. Confirm refresh keeps the same persisted evidence.
5. Confirm no raw timeline dump appears in the UI.

## Milestone acceptance criteria

This milestone is complete when:

1. User signs in through Nexus.
2. RiftSense loads persisted Riot recent games.
3. RiftSense evaluates at least one real match deterministically.
4. Evaluation is saved in Postgres.
5. UI shows a review candidate with concrete evidence.
6. Evidence is connected to the user's saved goal when possible.
7. Refresh/redeploy does not lose anything.
