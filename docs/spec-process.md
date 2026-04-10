# Spec Assembly Workflow

`RiftSense` should not rely on feature specs as the first place product
truth is written down.

Instead, each feature spec should be assembled from the repo's canonical
docs plus the feature-specific decisions needed for the selected slice.

## Canonical Sources

Specs should draw from:

- [product.md](./product.md)
- [roadmap.md](./roadmap.md)
- [personas-and-users.md](./personas-and-users.md)
- [functional-requirements.md](./functional-requirements.md)
- [rift-sense-architecture.md](./rift-sense-architecture.md)
- [domain-model.md](./domain-model.md)
- [glossary.md](./glossary.md)

## Workflow

## 1. Start From a Concrete Slice

A spec should begin from a clear product slice, not a vague area of
interest.

Examples:

- upload existing training decks
- create assignable learning modules
- add quiz completion tracking

## 2. Pull Shared Context

Before writing the spec, identify:

- which product goal it supports
- which personas it serves
- which reusable functional requirements apply
- which domain entities it touches
- which boundaries belong locally versus in shared `Nexus` context

## 3. Write Only the Delta

The feature spec should capture:

- the specific problem being solved now
- feature-specific requirements
- implementation choices for the slice
- validation details

If a concept is durable and reusable across multiple specs, update the
canonical source docs instead of inventing it only inside one spec.

## 4. Check Shared Boundary Impact

Every spec review should ask:

- is this creating a local model that should really be shared with
  `Nexus`?
- is this introducing a new recurring learning concept that belongs in
  `domain-model.md` or `functional-requirements.md`?

If yes, the shared docs should be updated alongside the spec.

## 5. Store Specs in Order

Store feature specs in `docs/specs/` using zero-padded ordered
filenames:

- `001-some-feature.md`
- `002-another-feature.md`

Do not casually renumber older specs once they are referenced by
implementation history.
