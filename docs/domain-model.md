# Domain Model

This document defines the core concepts used by `RiftSense`.

It focuses on the learning domain and only references shared ecosystem
concepts where `RiftSense` depends on them.

## Core Entities

## Content Item

A reusable unit of learning content.

Examples:

- uploaded document
- uploaded presentation deck
- linked video
- native guide page
- quiz

Key attributes:

- title
- description
- content type
- source type
- status
- topic tags
- audience tags
- patch relevance when applicable

## Learning Module

A structured grouping of one or more content items intended to be
consumed together.

Key attributes:

- title
- summary
- ordered content list
- target audience
- estimated effort
- publication status

## Assignment

A record that a content item or learning module has been assigned to a
learner scope.

Key attributes:

- assigned target
- assigner
- due date or expected window
- status
- required or optional flag

## Progress Record

A record of a learner's interaction with assigned material.

Key attributes:

- learner reference
- assigned item or module
- completion state
- completion timestamp
- score or assessment result when applicable

## Quiz

A structured assessment used to validate understanding.

A quiz may be:

- a standalone content item
- attached to a module
- attached to another content item as a checkpoint

## Shared Context References

These concepts are important to `RiftSense`, but are expected to become
shared ecosystem records rather than permanent local canon.

## Learner

A person consuming content.

In the long term, this should map to shared user and player concepts
from `Nexus`.

## Team

A roster, group, or organized learner cohort that can receive assigned
content.

In the long term, this should map to shared team and workspace concepts
instead of remaining an isolated `RiftSense` model.

## Relationships

- A `Learning Module` contains one or more `Content Item` records.
- An `Assignment` targets a `Learner`, `Team`, or equivalent learner
  scope.
- An `Assignment` references either a `Content Item` or a `Learning
  Module`.
- A `Progress Record` belongs to a learner and an assigned target.
- A `Quiz` may be represented as a `Content Item` or linked from one.

## Modeling Notes

- Content metadata should be separable from raw file storage.
- Assignment and progress models should not depend on one file format.
- Team and learner references should be modeled in a way that can
  migrate to shared `Nexus` identity and workspace services.
