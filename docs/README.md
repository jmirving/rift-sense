# RiftSense Docs

This repo uses a lean spec-driven documentation set.

The goal is to keep durable product and architecture truth in shared
docs, then assemble implementation specs from those sources instead of
reinventing assumptions in each feature writeup.

## Why This Set Is Lean

`RiftSense` is intended to be a real application in its own right, but
it is also expected to share foundations with `Nexus` over time.

That means this repo needs enough documentation to:

- define the product clearly
- explain how `RiftSense` relates to `DraftEngine` and `Nexus`
- capture shared user and domain concepts
- support feature specs that can drive implementation

It does not yet need a full ADR, contracts, or legal doc tree.

## Canonical Docs

- [product.md](./product.md)
- [roadmap.md](./roadmap.md)
- [personas-and-users.md](./personas-and-users.md)
- [functional-requirements.md](./functional-requirements.md)
- [rift-sense-architecture.md](./rift-sense-architecture.md)
- [domain-model.md](./domain-model.md)
- [glossary.md](./glossary.md)
- [auth-and-identity-plan.md](./auth-and-identity-plan.md)
- [spec-process.md](./spec-process.md)
- [spec-template.md](./spec-template.md)

## Feature Specs

Feature specs live in `docs/specs/`.

Current starting spec:

- [specs/001-learning-content-library-and-ingestion.md](./specs/001-learning-content-library-and-ingestion.md)
- [specs/001-implementation-plan.md](./specs/001-implementation-plan.md)
- [specs/002-hosted-nexus-auth-callback.md](./specs/002-hosted-nexus-auth-callback.md)
- [specs/003-public-demo-dashboard-route.md](./specs/003-public-demo-dashboard-route.md)
