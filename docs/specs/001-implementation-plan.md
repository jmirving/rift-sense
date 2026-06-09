# Implementation Plan 001: Learning Content Library and Ingestion

## 1. Goal

Translate [Spec 001](./001-learning-content-library-and-ingestion.md)
into the first buildable application slice for `RiftSense`.

This plan is intentionally concrete about data shape, storage
boundaries, workflows, and validation while staying neutral on the
exact frontend and backend framework.

## 2. Delivery Slice

The first implementation slice should deliver:

- curator creation of content items from uploaded files or external URLs
- curator metadata editing on a content detail page
- curator deletion of content items
- published library browse and filter by content type and topic
- content detail viewing with in-app rendering where practical
- lightweight grouping and ordering metadata on content items
- local file-backed assets and a lightweight local metadata store

The slice should not yet deliver:

- full learning module authoring
- assignments
- completion tracking
- quiz workflows
- audience targeting
- full-text search

## 2.1 Recommended Stack Alignment

`RiftSense` should align its first implementation with the current
`DraftEngine` stack unless a slice-specific constraint forces a change.

Recommended baseline:

- runtime: Node.js with ESM modules
- package manager: npm
- backend: Express 5
- frontend: static `public/` application served by Express
- frontend style: plain JavaScript, HTML, and CSS rather than a UI
  framework for the first slice
- upload handling: `multer`
- tests: Vitest for unit and API tests, `supertest` for HTTP coverage,
  `jsdom` if UI interaction tests are added

This keeps `RiftSense` compatible with the repo style already used in
`DraftEngine`:

- `server/app.js` style app composition
- `server/routes/*` route modules
- `server/repositories/*` storage abstraction
- `tests/server/*` API coverage
- `public/app/*` frontend organization

## 2.2 Shared Navigation Direction

`RiftSense` should not inherit `DraftEngine` visual theming, but it
should inherit the Nexus navigation concept.

For the first implementation:

- desktop layouts should use a flush left navigation drawer that is part
  of the app frame, not a detached panel
- the rail should carry app identity, primary destinations, and session
  or orientation context
- the desktop app frame should support a collapsed state for the drawer
- sidebar copy should stay structural, while page-specific intent should
  live in the main hero or page body
- the navigation model should follow
  [initial-menu-concepts.md](../initial-menu-concepts.md), with not-yet-
  implemented areas shown as upcoming rather than presented as live
  routes
- desktop navigation should present those areas as top-level categories
  with a single-open accordion interaction, rather than a fully expanded
  list that forces extra scrolling
- `/` should be a neutral landing page that introduces the live and
  planned product areas before users enter the library
- user-facing landing copy should orient the user toward available
  actions, not explain the design rationale of the page itself
- the library landing view should prioritize content and filters over
  decorative framing, using a lighter hero and a compact toolbar
- uploaded slide decks should keep the original `.pptx` asset and offer
  three clear user options on the detail page: in-app PDF preview,
  original-file download, and share link
- content surfaces may adapt their own reading-friendly treatment inside
  that frame
- mobile layouts should expose the same frame as a menu-driven drawer
  while preserving the same navigation hierarchy

## 3. Working Assumptions

- V1 has no database.
- Uploaded assets should live outside the metadata record.
- Metadata must remain shaped so it can move into a database later
  without changing product behavior.
- Google Docs, Sheets, and Slides are treated as external links in v1.
- Videos are primarily YouTube links.
- In-app viewing means rendering within a `RiftSense` detail page where
  possible, not necessarily native conversion for every file type.

## 4. Proposed V1 Architecture

### 4.1 Core Boundaries

- `Content Repository`: reads and writes metadata records
- `Asset Store`: saves, resolves, and deletes uploaded files
- `Viewer Resolver`: determines how a content item is rendered in-app
- `Library Service`: applies publish rules, filtering, grouping, and
  ordering

These boundaries should exist even if the first implementation keeps
them simple and local.

### 4.2 Initial Persistence Strategy

Use the local filesystem for both metadata and uploaded assets.

Suggested runtime structure:

```text
storage/
  content-items/
    <content-id>.json
  assets/
    <content-id>/
      <original-or-normalized-filename>
```

This gives v1:

- clear separation of metadata and asset bytes
- easy inspection during development
- a migration path to database plus object storage later

### 4.3 Repository Shape

Avoid a single monolithic JSON file. Use one metadata file per content
item so updates and deletions stay simple.

The repository contract should support:

- `createContentItem`
- `getContentItem`
- `listContentItems`
- `updateContentItem`
- `deleteContentItem`
- `publishContentItem`

## 5. Data Model

## Content Item

Recommended metadata shape:

```json
{
  "id": "cnt_001",
  "title": "Wave Control Basics",
  "description": "Intro deck for lane state management.",
  "contentType": "deck",
  "sourceType": "upload",
  "status": "draft",
  "topicTags": ["wave-management", "laning"],
  "patchSensitive": true,
  "grouping": {
    "groupKey": "fundamentals",
    "groupLabel": "Fundamentals",
    "order": 1
  },
  "asset": {
    "kind": "uploaded-file",
    "originalFilename": "wave-control.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 481230,
    "storageKey": "cnt_001"
  },
  "viewer": {
    "mode": "pdf"
  },
  "createdAt": "2026-03-25T00:00:00Z",
  "updatedAt": "2026-03-25T00:00:00Z",
  "publishedAt": null,
  "archivedAt": null
}
```

## Field Notes

- `contentType`: `document | deck | video`
- `sourceType`: `upload | external_url`
- `status`: `draft | published | archived`
- `topicTags`: freeform strings, normalized for filter use
- `patchSensitive`: boolean
- `grouping`: optional lightweight organizational metadata, not a full
  module record
- `asset`: metadata about either an uploaded file or an external link
- `viewer`: resolved render strategy for the detail page

## External Asset Shape

For links, the `asset` block should instead look like:

```json
{
  "kind": "external-link",
  "url": "https://www.youtube.com/watch?v=example",
  "provider": "youtube"
}
```

## 6. Publish Rules

A content item may move to `published` only if all of the following are
present:

- `title`
- `description`
- `contentType`
- `sourceType`
- at least one topic tag
- a resolvable uploaded asset or a valid external URL

Validation should happen:

- on create and update, with field-level errors
- on publish, with explicit publish eligibility errors

Draft items may be incomplete. Published items may not.

## 7. Viewer Rules

The content detail page should provide context first, then render the
asset.

Recommended v1 viewer behavior:

- uploaded PDF: render inline in-app
- uploaded PowerPoint deck: keep the source file, generate a PDF preview
  on first in-app view request when conversion tooling is available, and
  otherwise fall back to download plus share-link options
- YouTube link: embed in-app
- Google Docs, Sheets, and Slides: render in-app when the share link can
  be embedded; otherwise keep the context page and provide open-in-new-
  tab behavior
- unsupported uploaded file types: show metadata and a controlled
  open/download action from the detail page

This satisfies the in-app viewing requirement without introducing a file
conversion pipeline in v1.

## 8. Library and Curator Flows

## 8.1 Curator Create Flow

1. Curator opens a create form.
2. Curator chooses `upload` or `external URL`.
3. System captures the asset or URL first.
4. Curator enters metadata.
5. Curator saves as draft or publishes if the publish rules pass.

## 8.2 Curator Detail Flow

1. Curator opens a content detail page.
2. Curator sees asset preview plus metadata.
3. Curator edits title, description, topics, patch-sensitive flag, and
   grouping/order fields.
4. Curator publishes, archives, or deletes the item.

## 8.3 Library Browse Flow

1. User opens the published library.
2. User filters by content type and topic.
3. User opens a content detail page.
4. User consumes the content within the page when supported.

## 9. Suggested Route and API Surface

The exact framework is open, but the first slice should expose
equivalent behavior to the following:

- `GET /library`
- `GET /content/:id`
- `GET /curator/content`
- `GET /curator/content/new`
- `POST /api/content-items`
- `GET /api/content-items`
- `GET /api/content-items/:id`
- `PUT /api/content-items/:id`
- `POST /api/content-items/:id/publish`
- `DELETE /api/content-items/:id`

Filter support for `GET /api/content-items` should include:

- `status`
- `contentType`
- `topic`

## 10. Validation and Error Handling

Validation rules should include:

- required fields by status
- allowed enum values
- upload size cap at 25 MB
- accepted URL format for external links
- normalized topic tags
- valid integer ordering when grouping is present

Expected user-facing failures:

- invalid upload type
- upload too large
- malformed URL
- publish attempted with missing required metadata
- missing asset for upload-backed content

## 11. Test Plan

## 11.1 Unit Tests

- content item validation by status
- publish eligibility checks
- topic normalization
- viewer resolution for PDF, YouTube, Google links, and unsupported
  uploads
- repository read and write behavior for local metadata files

## 11.2 Integration Tests

- create content item from upload
- create content item from external URL
- update metadata on the detail page
- publish eligible content item
- prevent publish for incomplete draft
- list only published content in the main library
- filter library by content type and topic
- delete content item and remove linked local asset

## 11.3 Manual QA

Use real examples for:

- one PDF document
- one deck file that should fall back to open/download if not natively
  viewable
- one YouTube link
- one Google Docs or Slides link

## 12. Delivery Order

## Phase 1: Scaffold

- scaffold Node ESM app structure aligned with `DraftEngine`
- add Express server, static frontend frame, and local storage
  directories
- implement content repository and asset store interfaces
- create local filesystem persistence

## Phase 2: Curator Workflow

- build create form
- build content detail and metadata edit page
- add publish, archive, and delete actions

## Phase 3: Library Experience

- build published library listing
- add content type and topic filters
- build detail page rendering logic

## Phase 4: Validation and QA

- add unit and integration coverage
- run manual QA with representative real assets

## 13. Deferred Work

- audience tags
- estimated effort
- patch version metadata beyond `patchSensitive`
- stale or invalid content flag such as `noLongerWorks`
- full module creation
- search indexing
- shared identity or team context integration
- migration from local metadata files to database-backed records

## 14. Immediate Next Build Decisions

Before scaffolding code, pick:

- exact supported upload MIME types for v1
- local runtime storage path conventions for development and deployment
