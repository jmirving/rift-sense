# RiftSense Architecture

## Overview

`RiftSense` is a League learning application with an async-first
workflow model.

It should serve as a focused application experience while remaining
compatible with the broader `Nexus` platform direction.

This architecture therefore has two simultaneous goals:

1. Let `RiftSense` move quickly as its own application.
2. Avoid local ownership of concepts that are better treated as shared
   `Nexus` services over time.

## Architectural Intent

The architecture should enable:

- fast use of existing decks, docs, and videos
- structured organization of educational material
- async assignment and completion workflows
- linkage to team and player context
- gradual migration to shared `Nexus` identity and profile foundations

## Relationship to DraftEngine and Nexus

`DraftEngine` already contains team, roster, profile, and workspace
oriented capabilities that are relevant to `RiftSense`.

`RiftSense` should not rebuild those concepts as long-term isolated
models if they are expected to become shared `Nexus` capabilities.

Instead, the application should follow this posture:

- own learning-specific workflows locally
- integrate with existing team or player context where needed
- treat shared identity, team, profile, and workspace concepts as
  externalized or future-shared boundaries

## Conceptual Layers

`RiftSense` is divided into four conceptual layers.

## 1. Experience Layer

User-facing screens and flows for:

- browsing the learning library
- viewing modules
- completing assignments
- taking quizzes
- reviewing progress

This layer should preserve broad visual compatibility with `Nexus`
without losing the product-specific shape of a learning application.

## 2. Learning Application Layer

Application-specific logic for:

- content ingestion and metadata
- module composition
- assignment workflows
- completion tracking
- quiz orchestration
- learner and team-facing progress views

This is the main local ownership area for `RiftSense`.

## 3. Shared Context Layer

Shared or future-shared capabilities that `RiftSense` should consume
rather than permanently redefine:

- user identity
- team identity
- player profiles
- workspace context
- strategic metadata shared across the ecosystem

In early slices, adapters or transitional integration points may be
necessary.

## 4. Asset and Integration Layer

External or stored sources used by the app, such as:

- uploaded documents
- uploaded presentation files
- hosted or linked videos
- future quiz or assessment services
- `DraftEngine` or `Nexus` APIs that provide shared context

## Early Technical Priorities

The first architecture slices should optimize for:

- ingesting existing material with low friction
- storing content metadata separately from raw file format
- keeping assignment and progress models independent from any one file
  type
- isolating integration boundaries so shared `Nexus` services can be
  adopted later without rewriting the product concept

## Ownership Boundaries

`RiftSense` should own:

- content records
- module structure
- assignment records
- learning progress state
- quiz linkage and assessment workflows

`RiftSense` should avoid claiming permanent canonical ownership of:

- users
- teams
- player profiles
- workspace membership
- broader ecosystem identity rules

## Transitional Reality

During early development, it may be practical to duplicate some data
temporarily or use adapter models while shared services are still
forming.

That is acceptable as a migration strategy, but docs and specs should
call it out explicitly so temporary local models are not mistaken for
the desired long-term boundary.
