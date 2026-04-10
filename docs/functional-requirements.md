# Functional Requirements

This document defines reusable functional requirements for `RiftSense`.

Feature specs should reference the relevant sections here instead of
redefining stable application behavior in every spec.

## Scope

These requirements describe recurring needs for the `RiftSense`
application.

Some concepts may later be fulfilled by shared `Nexus` services, but the
requirements remain valid from the product point of view.

## 1. Content Library

### FR-1.1 Content Ingestion

The system shall support creating learning content records from existing
documents, presentation decks, uploaded files, and external links.

### FR-1.2 Mixed Content Types

The system shall support multiple content types, including at minimum:

- documents
- presentation decks
- videos
- quizzes
- guides or structured learning pages

### FR-1.3 Library Organization

The system shall organize content with metadata that supports browsing,
filtering, and reuse.

### FR-1.4 Content Status

The system shall represent whether a content item is draft, published,
archived, or otherwise unavailable for assignment.

### FR-1.5 Minimal Rewrite Support

The system shall allow existing materials to be used with limited
rework, rather than requiring full conversion into a new native format
before publication.

## 2. Learning Modules and Paths

### FR-2.1 Module Composition

The system shall support grouping one or more content items into a
learning module.

### FR-2.2 Ordered Learning

The system shall support ordering content within a module when sequence
matters.

### FR-2.3 Audience Targeting

The system shall support labeling modules by audience, such as team
lead, player role, skill level, or general use.

## 3. Async Assignment

### FR-3.1 Team or Learner Assignment

The system shall support assigning modules or content items to a team,
subgroup, or individual learner.

### FR-3.2 Due Date Support

The system shall support optional due dates or expected completion
windows.

### FR-3.3 Assignment Visibility

Assigned learners shall be able to see what has been assigned to them
and what remains incomplete.

## 4. Progress and Assessment

### FR-4.1 Completion Tracking

The system shall track completion state for assigned content and
modules.

### FR-4.2 Quiz Attachment

The system shall support attaching quizzes or knowledge checks to
learning modules or standalone content.

### FR-4.3 Progress Visibility

Authorized team leads and learners shall be able to view relevant
progress and completion status.

## 5. Shared Context and Ecosystem Compatibility

### FR-5.1 Team Context Compatibility

The system shall support team- and player-scoped workflows without
defining permanent duplicate ownership of shared team and player
concepts.

### FR-5.2 Shared Identity Adoption

When shared `Nexus` identity, workspace, or profile services are
available, `RiftSense` shall be able to adopt them incrementally.

### FR-5.3 Ecosystem Transition Clarity

The application shall remain visually and conceptually compatible enough
with `Nexus` that movement between the parent ecosystem and `RiftSense`
feels intentional rather than disjoint.
