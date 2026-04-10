# RiftSense Product

## Purpose

`RiftSense` is a League of Legends learning application focused on
organized, adult-oriented improvement.

Its job is to turn scattered educational material into a structured
learning experience that players and amateur teams can actually keep up
with.

The product should support a central location for:

- instructional documents
- presentation decks
- videos
- training guides
- quizzes and knowledge checks
- assignments or learning tasks distributed asynchronously

## Product Position

`RiftSense` is its own application, not just a hidden subsystem.

At the same time, it should not pretend to be fully isolated from the
rest of the ecosystem. Shared concepts such as player profiles, team
profiles, workspace context, and related strategic metadata already
exist or are emerging in `DraftEngine` and are expected to move into
`Nexus` for reuse.

`RiftSense` should therefore be built as:

- a standalone learning experience with its own workflows
- a future `Nexus` application that adopts shared services over time
- a product whose visual and conceptual language should remain broadly
  compatible with `Nexus`

## Product Goal

The goal of `RiftSense` is to help amateur teams and motivated players
learn League more consistently by making improvement work:

- organized instead of scattered
- asynchronous instead of meeting-dependent
- contextual instead of generic
- reusable instead of recreated each session

## Primary Value Proposition

For amateur teams with limited time, `RiftSense` should make it possible
to package learning into clear modules that can be assigned, consumed,
tracked, and discussed without requiring everyone to be live at once.

## What RiftSense Is

`RiftSense` is:

- a structured League learning application
- a home for reusable educational content
- a place to organize team and player development work
- an async-first system for distributing and completing learning tasks
- a bridge between learning content and team/player context

## What RiftSense Is Not

`RiftSense` is not:

- a generic LMS for arbitrary subjects
- only a file dump for old documents
- a replacement for all live coaching sessions
- the canonical owner of shared team/player/workspace identity long term
- a requirement that every learning asset be rewritten before use

## Content Strategy

`RiftSense` should support both:

- curated external content, such as videos or reference material
- original app-specific content, including tailored guides, quizzes, and
  updated versions of existing internal materials

Existing PowerPoints and documents are a key starting point. The first
product slices should make those materials usable quickly, even when the
initial version preserves much of the original format.

## Experience Principles

- Async first: users should be able to receive and complete meaningful
  work without scheduling friction.
- Adult tailored: the system should respect limited time and prefer
  concise, practical, clearly organized learning units.
- Team aware: content should be assignable in the context of a team,
  roster, or shared workspace where relevant.
- Reusable: once content is organized well, it should be reusable across
  cohorts, teams, or future curricula.
- Compatible with Nexus: visual language and high-level concepts should
  not diverge unnecessarily from the broader ecosystem.

## Product Scope

### In Scope

- content ingestion for existing decks, docs, and linked media
- structured learning library organization
- team- and player-oriented learning modules
- quizzes and lightweight assessments
- async assignment and completion workflows
- progress visibility for learners and team leads
- gradual adoption of shared `Nexus` concepts where appropriate

### Out of Scope for the Baseline

- rebuilding every shared identity or workspace concept locally
- replacing `DraftEngine` or future `Nexus` platform services
- full synchronous coaching workflow tooling
- broad non-League educational support

## Current Product Starting Point

`RiftSense` begins as a new repo with product intent but without a local
implementation baseline.

That means the first documentation and feature work should optimize for:

- fast conversion of existing material into usable product slices
- clear scoping around what belongs locally versus in shared services
- a content model that can evolve from simple uploads into structured
  learning paths over time
