# RiftSense Roadmap

This roadmap guides near-term spec order. RiftSense is currently focused
on the recent-game and deterministic match-review vertical slice.

## Roadmap Principles

- Keep persisted Riot data and deterministic review evidence durable.
- Make match review useful before adding subjective coaching or AI prose.
- Prefer small, versioned evaluator changes with test fixtures.
- Preserve the content library as a later product track.
- Keep the product compatible with future `Nexus` identity, team, and
  profile integration.

## Milestone 0: Foundation and Spec Cleanup

Objective:

Bring docs and spec status in line with the implemented recent-game
review foundation.

Target outcomes:

- completed match evaluator persistence/API specs are closed
- remaining review work is captured in open specs
- the content-library direction is preserved as later work

Status:

Complete. Specs 050 and 051 are closed; spec 052 tracks remaining
deterministic review work.

## Milestone 1: Deterministic Review MVP

Objective:

Use persisted Riot matches, perspectives, and evaluator rows as the
primary review evidence path.

Target outcomes:

- recent games load from persisted records when available
- deterministic evaluations are current, versioned, and persisted
- recent-game APIs expose evaluator summaries without raw timeline JSON

Status:

Implemented as the current foundation. Keep future changes scoped to
versioned evaluator specs.

## Milestone 2: Useful Match Review Page

Objective:

Make `/review?matchId=...` a practical deterministic review surface.

Target outcomes:

- the page shows match summary, review signals, deterministic tags, and
  death facts
- missing or pending evaluation states are handled clearly
- review links preserve the selected `matchId`

Status:

Partially implemented. The remaining work is a clear deterministic
priority or focus area for the selected match.

## Milestone 3: Expanded Deterministic Evaluator Tags

Objective:

Increase review coverage with more deterministic, fixture-backed tags.

Target outcomes:

- new tags stay versioned and explainable
- tests cover zero-data and malformed-data cases
- summaries remain concise enough for recent-game cards and review pages

## Milestone 4: Goal-Linked Review Candidate Selection

Objective:

Select one primary review candidate from recent evaluated games and link
it to the active personal goal when possible.

Target outcomes:

- the dashboard exposes a primary review candidate
- candidate ranking prefers goal-relevant deterministic evidence
- fallback behavior still offers reviewable games when no saved goal
  exists

Status:

Partially implemented. Candidate ordering already uses evaluator
signals; a dedicated dashboard `reviewCandidate` is still open.

## Later Tracks

### Coach Workflow

Support coach review, saved notes, and follow-up recommendations after
the deterministic review foundation is useful.

### Team Workflow

Support team-level review patterns, shared focus areas, and async team
coordination.

### Learning Content Library

Preserve the original content-library direction as a later product
track:

- upload or link PowerPoints, documents, and videos
- organize materials into reusable modules
- support assignments, progress, and lightweight assessments
