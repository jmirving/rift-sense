# Spec 001: Learning Content Library and Ingestion

## 1. Summary

Build the first `RiftSense` slice around ingesting existing learning
materials and organizing them into a structured library that can later
support assignments, quizzes, and progress tracking.

This should prioritize fast reuse of current PowerPoints, documents, and
linked media instead of waiting for a fully native authoring system.

This spec aligns with [roadmap.md](../roadmap.md) Milestone 1: Learning
Content Library.

## 1.1 Resolved Decisions

- Uploaded files should support in-app viewing in v1 where practical.
- Uploaded slide decks should remain stored in their original format and
  generate a PDF preview only when a user requests in-app viewing.
- V1 source types are uploaded files and external URLs.
- V1 content types are documents, decks, and videos.
- External videos in v1 are expected to be primarily YouTube links.
- The primary library should show published content, while draft content
  remains curator-visible.
- V1 stops short of full module creation, but content items may be
  grouped, ordered, and tagged to prepare for later module workflows.
- Topic tagging is freeform in v1.
- Audience tagging is not required in v1.
- Patch relevance starts as a simple `patch-sensitive` boolean.
- Content status in v1 is `draft`, `published`, or `archived`.
- External URL validation in v1 only requires a valid URL.
- Library discovery in v1 relies on filters rather than full-text
  search.
- Curators can create, list, view, edit metadata/context, and delete
  content items.
- Published content should require `title`, `description`, `content
  type`, `source type`, a working asset or link, and at least one topic
  tag.
- V1 should use file-backed local storage for uploaded assets and a
  lightweight local metadata store rather than assuming a database.
- Google Docs, Sheets, and Slides should start as link-based external
  content in v1.
- The initial upload size target should be capped at 25 MB per file.

## 2. Problem Statement

Existing League training material already exists, but it is not yet
packaged as a usable application experience.

Today, likely pain points include:

- decks and documents are scattered or stored outside the app
- material is hard to browse consistently
- content is not organized for async assignment or reuse
- teams with limited time cannot easily distribute structured learning
  work

Without this slice, `RiftSense` remains a concept rather than a usable
starting point for real educational workflows.

## 3. Goals

- Make existing decks, docs, and linked media usable inside
  `RiftSense`.
- Introduce a content model that supports organization and future reuse.
- Create a library UX that can later feed assignments and learning
  modules.

## 4. Non-Goals

- Full native authoring for all learning content types.
- Advanced quiz authoring or grading workflows.
- Full shared identity or team-context integration.

## 5. Users

- Primary user: `Content Curator`
- Secondary user: `Amateur Team Lead`
- Secondary user: `Time-Constrained Player`

## 6. Scope

### In Scope

- create content records for uploaded or linked learning assets
- support at minimum documents, decks, and external videos
- store metadata needed for browse and filter behavior
- display a structured library of published content
- allow content records to preserve original assets with minimal rewrite
- support lightweight grouping and ordering metadata without introducing
  full module authoring

### Out of Scope

- assignment execution
- completion tracking
- quiz scoring
- deep team or player profile integration

## 7. Requirements

### Reused Functional Requirements

- FR-1.1 Content Ingestion
- FR-1.2 Mixed Content Types
- FR-1.3 Library Organization
- FR-1.4 Content Status
- FR-1.5 Minimal Rewrite Support

### Feature-Specific Requirements

- The system shall allow a curator to create a content record from an
  uploaded file or an external URL.
- The system shall store a title, description, content type, source
  type, and publication status for each content record.
- The system shall support topic tags, lightweight grouping, lightweight
  ordering, and a `patch-sensitive` flag as metadata in v1.
- The system shall present published content in a browseable library.
- The system shall allow content to exist before it is attached to a
  larger module.
- The system shall require `title`, `description`, `content type`,
  `source type`, a working asset or link, and at least one topic tag
  before a content record can be published.
- The system shall preserve a clear distinction between raw asset
  storage and the metadata record used by the application, even when v1
  uses local file storage and a lightweight local metadata store rather
  than a database.
- The system shall preserve uploaded decks in their original format and
  lazily generate PDF previews for in-app viewing rather than replacing
  the source file.
- The system shall treat Google Docs, Sheets, and Slides as external
  link-based content in v1.
- The system shall validate external content using basic URL validation
  in v1.
- The system shall cap uploaded files at an initial limit of 25 MB per
  file.

## 8. UX or Workflow

### Curator Flow

1. A curator opens a content creation flow.
2. The curator uploads a file or provides an external link.
3. The curator enters core metadata and saves the content as draft or
   published.
4. If publishing, the curator must provide the required publish
   metadata.
5. The content appears in the library once published.

### Learner or Team Lead Flow

1. A user opens the learning library.
2. The user browses or filters by topic or content type.
3. The user opens a content detail view and consumes the material in its
   preserved or lightly adapted format.
4. For uploaded slide decks, the user can request an in-app PDF preview,
   download the original file, or use a share link to the content page.

## 9. Domain and Data Impact

- New entities: `Content Item`
- Updated entities: none beyond initial baseline
- Storage note: uploaded assets may be stored locally in v1, while
  metadata remains modeled separately so it can move to a database or
  object storage layer later
- Shared context dependencies: content may later be scoped or assigned
  using shared user, team, or workspace context, but this slice should
  not require canonical local ownership of those records

## 10. Risks and Edge Cases

- Risk: file-oriented ingestion can become a dumping ground if metadata
  requirements are too weak
- Risk: early support for raw decks and docs may create UX inconsistency
  across content types
- Edge case: linked external content may be removed or changed outside
  the app
- Edge case: a deployment may not have slide-to-PDF conversion tooling
  available, so uploaded decks must still remain downloadable and
  shareable
- Edge case: educational material may become patch-sensitive and need
  visibility or warning metadata

## 11. Acceptance Criteria

- [ ] A curator can create a content record from an uploaded file.
- [ ] A curator can create a content record from an external video or
  reference URL.
- [ ] The system stores and displays core metadata for each content
  record.
- [ ] A curator can group, order, and tag content items without needing
  full module creation.
- [ ] Users can browse a published content library by at least content
  type and topic.
- [ ] Uploaded slide decks can be kept in their original format while
  offering a lazy generated PDF preview for in-app viewing when
  supported by the deployment.
- [ ] A content item cannot be published until all required publish
  metadata is present.
- [ ] The implementation keeps content metadata separate from raw asset
  storage concerns.

## 12. Validation Plan

- unit tests for content record validation and metadata rules
- unit tests for publish eligibility rules
- integration tests for create, list, and filter library workflows
- manual QA using a small set of real existing decks, docs, and video
  links

## 13. Open Questions

- Which uploaded file formats should be included in the first in-app
  viewer beyond the Google external-link paths?
