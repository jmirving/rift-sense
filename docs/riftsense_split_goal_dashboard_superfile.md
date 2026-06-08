# RiftSense: Split Goal Dashboard Super-File

## Objective

Split the current goal-dashboard “super-file” into smaller files with clear responsibilities.

The current direction is good: templates, active instances, evidence events, recommendations, and resolver logic now exist. The risk is that one file holding all of those concerns will become hard to extend as soon as more roles, goals, team focuses, Riot-derived evidence, and onboarding flows are added.

This should be done now while the system is still small.

---

## Current Concern

The goal-dashboard module appears to contain several distinct responsibilities:

1. type definitions / model documentation
2. goal templates
3. signal templates
4. action templates
5. content templates
6. team focus templates
7. default seeded active goal/team instances
8. seeded evidence events
9. seeded recommendations
10. resolution logic
11. normalization/presentation logic
12. insight-building logic

That is too much for one file.

---

## Desired File Structure

Use the existing project style, but aim for a structure like this:

```text
server/goal-dashboard/
  index.js
  model-docs.js              # optional JSDoc typedefs, if not using TS
  templates/
    goals.js
    signals.js
    actions.js
    content.js
    team-focuses.js
    index.js
  seeds/
    default-dashboard-state.js
    demo-dashboard-state.js   # optional, if demo needs public-only variation
  resolve/
    evidence.js
    targets.js
    signals.js
    actions.js
    insights.js
    dashboard.js
  normalize.js
```

If this is too many files for current size, use a simpler split:

```text
server/goal-dashboard/
  index.js
  templates.js
  seeds.js
  resolve.js
  normalize.js
```

The key is not the exact structure. The key is separating **static reusable templates**, **seed/demo instance data**, and **resolver logic**.

---

## Responsibility Boundaries

### Templates

Templates are reusable product definitions. They should not contain user-specific progress.

Examples:

- `goal-template-adc-die-less`
- `signal-known-danger-death`
- `action-death-review-v1`
- `team-focus-template-dragon-setup`
- `content-adc-pre6-trading-check`

Templates answer:

> What reusable concepts does RiftSense know about?

### Active Instances

Active instances represent a player/team using a template.

Examples:

- user has active `goal-template-adc-die-less`
- team has active `team-focus-template-dragon-setup`
- weekly target values for this active goal
- selected signals/actions for this active goal

Instances answer:

> What is this player/team currently working on?

### Evidence Events

Evidence events are observed or manually tagged data.

Examples:

- one known-danger death
- two bad trade reads
- one late objective arrival
- twelve CS missed while present

Evidence answers:

> What happened recently that supports or contradicts progress?

### Recommendations

Recommendations connect evidence and current goals to reusable action templates.

Examples:

- recommend death review because known-danger deaths are present
- recommend ADC pre-6 trade check because bad trade reads are present
- recommend dragon setup checklist because team focus is dragon setup

Recommendations answer:

> What should the user do next?

### Resolver / Normalizer

Resolver logic converts raw templates + active instances + evidence into the dashboard payload.

It should own:

- resolving template references
- summing evidence by signal
- weekly target status
- trend/status labels
- insight generation
- suggested next-step ordering
- empty states

---

## Implementation Requirements

1. Create a `server/goal-dashboard/` folder.
2. Move template arrays into template-focused files.
3. Move default seeded dashboard state into a seed file.
4. Move evidence aggregation and target resolution helpers out of the template file.
5. Preserve the public exports currently used by routes.
6. Do not change the current visual UI in this step.
7. Do not introduce a database in this step.
8. Do not add Riot API integration in this step.
9. Update imports and tests.
10. Keep the old module path working only if needed temporarily; otherwise update callers directly.

---

## Suggested Public API

Expose a small, stable API from `server/goal-dashboard/index.js`:

```js
export { getTemplateLibrary } from "./templates/index.js";
export { buildDefaultGoalDashboardState } from "./seeds/default-dashboard-state.js";
export { resolveGoalDashboardState } from "./resolve/dashboard.js";
export { normalizeGoalDashboard } from "./normalize.js";

export function buildDefaultGoalDashboard(now = new Date()) {
  return normalizeGoalDashboard(
    resolveGoalDashboardState(buildDefaultGoalDashboardState(now))
  );
}
```

Exact names can differ, but routes should import from the index rather than from deep internal files unless there is a good reason.

---

## Acceptance Criteria

This refactor is complete when:

1. Templates are not mixed with resolver logic in one large file.
2. Seed/demo active instances are not mixed with reusable templates.
3. Resolver helpers are isolated and testable.
4. Existing dashboard behavior remains visually/functionally equivalent.
5. `/api/demo/home` and logged-in `/api/home` still work.
6. Tests pass or are updated for the new file structure.
7. Adding a new role goal template would not require editing resolver internals.
8. Adding Riot-derived evidence later would not require editing template definitions.

Acceptance:
- Dashboard still renders the same.
- Demo and logged-in home payloads still resolve goalDashboard.
- Tests pass.
- No single goal-dashboard file contains templates, seed instances, evidence, recommendations, and resolver logic all together.
```
