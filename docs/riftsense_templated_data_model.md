# RiftSense Recommended Templated Data Model

## Purpose

This document recommends moving RiftSense from free-text seeded content toward a reusable template-and-instance model.

The current seeded dashboard is useful for proving the UI direction, but the product should not be built around one-off strings like:

> Review last game deaths

Instead, RiftSense should model reusable goals, signals, actions, lessons, drills, and team focus areas as templates. Logged-in users or demo routes should then instantiate those templates with user/team-specific state.

---

## Core Recommendation

Do not build RiftSense as:

```text
Survey answers → AI-generated text blobs → dashboard cards
```

Build it as:

```text
Template library → active user/team instances → evidence/review data → recommendations → optional AI summary
```

AI can help choose, summarize, explain, or personalize templates. It should not be the only source of truth for goals, signals, and actions.

---

## Why Templates Matter

Free-text-only content creates several problems:

1. **Tracking becomes difficult**  
   If every user has a unique text goal, the system cannot reliably trend progress.

2. **Role generalization becomes difficult**  
   “Die less,” “stop inting,” “avoid preventable deaths,” and “respect jungle threat” may be related, but the app needs a canonical structure to know that.

3. **Team assignment becomes inconsistent**  
   Coaches need to assign shared concepts to multiple players without rewriting the same content.

4. **UI becomes harder to build**  
   Dashboards, filters, charts, progress chips, and review forms need structured objects, not arbitrary paragraphs.

5. **AI quality becomes a risk**  
   AI-generated coaching can be useful, but it can also be vague or inconsistent. Templates keep the product opinionated and reusable.

---

## Recommended Architecture

Use these major object types:

1. Goal Templates
2. Signal Templates
3. Action Templates
4. Content Templates
5. Team Focus Templates
6. Active Goal Instances
7. Active Team Focus Instances
8. Evidence / Review Events
9. Recommendations

---

## Goal Template

A reusable improvement area.

Example:

```ts
export interface GoalTemplate {
  id: string;
  title: string;
  role?: Role;
  scope: "personal" | "team";
  category: string;
  description: string;
  defaultSignalIds: string[];
  defaultActionIds: string[];
  relatedContentIds: string[];
  suggestedWeeklyTargets?: TargetTemplate[];
}
```

Example data:

```ts
const adcDieLessGoalTemplate: GoalTemplate = {
  id: "goal-template-adc-die-less",
  title: "Die Less",
  role: "ADC",
  scope: "personal",
  category: "survivability",
  description: "Reduce preventable deaths while preserving farm, tempo, and teamfight output.",
  defaultSignalIds: [
    "signal-known-danger-death",
    "signal-bad-trade-read",
    "signal-greed-wave-death",
    "signal-cs-missed-while-present",
    "signal-clean-disengage"
  ],
  defaultActionIds: [
    "action-death-review-v1",
    "action-pregame-danger-check-v1"
  ],
  relatedContentIds: [
    "content-adc-survivability-basics",
    "content-adc-pre6-trading-check",
    "content-jungle-threat-awareness"
  ],
  suggestedWeeklyTargets: [
    { signalId: "signal-known-danger-death", targetValue: 0 },
    { signalId: "signal-bad-2v2-death", targetValue: 0 },
    { signalId: "signal-bad-pre6-allin", targetValue: 0 }
  ]
};
```

---

## Signal Template

A reusable metric or review tag.

Example:

```ts
export interface SignalTemplate {
  id: string;
  label: string;
  type: "count" | "rating" | "boolean" | "note";
  polarity: "positive" | "negative" | "neutral";
  description: string;
  reviewPrompt?: string;
  roles?: Role[];
  categories?: string[];
}
```

Example data:

```ts
const knownDangerDeathSignal: SignalTemplate = {
  id: "signal-known-danger-death",
  label: "Known-danger death",
  type: "count",
  polarity: "negative",
  description: "A death where enemy threat was visible, pinged, or strongly inferable before the play.",
  reviewPrompt: "What information existed before the death, and what should have changed?",
  roles: ["ADC", "Support", "Mid", "Top", "Jungle"],
  categories: ["survivability", "awareness"]
};
```

---

## Action Template

A reusable activity the user can perform.

Examples:

- review last game deaths
- run a trading decision tree
- complete a pre-game reminder
- refresh a dragon setup checklist
- add evidence from a scrim

Example:

```ts
export interface ActionTemplate {
  id: string;
  title: string;
  type: "review" | "lesson" | "drill" | "checklist" | "reflection";
  estimatedMinutes: number;
  description: string;
  steps: string[];
  producesSignalIds?: string[];
  linkedGoalTemplateIds?: string[];
  linkedTeamFocusTemplateIds?: string[];
}
```

Example data:

```ts
const deathReviewAction: ActionTemplate = {
  id: "action-death-review-v1",
  title: "Review last game deaths",
  type: "review",
  estimatedMinutes: 5,
  description: "Review each death and tag whether it was preventable, acceptable, or caused by a recurring pattern.",
  steps: [
    "Find each death in the game.",
    "Tag the cause: known danger, bad trade read, greed wave, mechanics, team call, or acceptable death.",
    "Write one adjustment for next time.",
    "Pick one death pattern to remember before queueing again."
  ],
  producesSignalIds: [
    "signal-known-danger-death",
    "signal-bad-trade-read",
    "signal-greed-wave-death"
  ],
  linkedGoalTemplateIds: ["goal-template-adc-die-less"]
};
```

---

## Content Template

A reusable lesson, checklist, decision tree, drill, or reference page.

Example:

```ts
export interface ContentTemplate {
  id: string;
  title: string;
  type: "lesson" | "checklist" | "decision-tree" | "drill" | "reference";
  roles?: Role[];
  categories: string[];
  linkedGoalTemplateIds?: string[];
  linkedTeamFocusTemplateIds?: string[];
  summary: string;
  body: string;
}
```

Example data:

```ts
const adcPre6TradingCheck: ContentTemplate = {
  id: "content-adc-pre6-trading-check",
  title: "ADC Pre-6 Trading Check",
  type: "decision-tree",
  roles: ["ADC"],
  categories: ["trading", "lane-phase"],
  linkedGoalTemplateIds: ["goal-template-adc-die-less", "goal-template-adc-trading"],
  summary: "A quick check for whether a pre-6 trade is likely to be winning or dangerous.",
  body: "Before trading, check support position, cooldowns, wave size, level timing, and jungle threat."
};
```

---

## Team Focus Template

A reusable team improvement area.

Example:

```ts
export interface TeamFocusTemplate {
  id: string;
  title: string;
  category: string;
  description: string;
  defaultChecklist: string[];
  defaultSignalIds: string[];
  defaultActionIds: string[];
  relatedContentIds: string[];
}
```

Example data:

```ts
const dragonSetupTeamFocusTemplate: TeamFocusTemplate = {
  id: "team-focus-template-dragon-setup",
  title: "Dragon Setup",
  category: "objective-control",
  description: "Improve objective setup discipline around dragon: waves, vision, arrival timing, and fight/trade/give calls.",
  defaultChecklist: [
    "90s: decide reset/wave plan",
    "60s: confirm river access and vision state",
    "30s: call fight, trade, delay, or give",
    "On spawn: do not arrive late as half a team"
  ],
  defaultSignalIds: [
    "signal-late-objective-arrival",
    "signal-failed-vision-retake",
    "signal-unclear-fight-trade-give-call"
  ],
  defaultActionIds: [
    "action-dragon-setup-review-v1"
  ],
  relatedContentIds: [
    "content-dragon-setup-90-60-30",
    "content-wave-drop-before-objective"
  ]
};
```

---

## Active Goal Instance

A user/team-specific instance of a goal template.

Example:

```ts
export interface ActiveGoalInstance {
  id: string;
  templateId: string;
  ownerType: "player" | "team";
  ownerId: string;
  status: "active" | "paused" | "completed";
  activeSince: string;
  weeklyTargets: ActiveTarget[];
  selectedSignalIds: string[];
  selectedActionIds: string[];
}
```

Example data:

```ts
const activeAdcDieLessGoal: ActiveGoalInstance = {
  id: "active-goal-3nder-adc-die-less",
  templateId: "goal-template-adc-die-less",
  ownerType: "player",
  ownerId: "player-3nderwiggin",
  status: "active",
  activeSince: "2026-05-08",
  weeklyTargets: [
    { signalId: "signal-known-danger-death", targetValue: 0 },
    { signalId: "signal-bad-2v2-death", targetValue: 0 },
    { signalId: "signal-bad-pre6-allin", targetValue: 0 }
  ],
  selectedSignalIds: [
    "signal-known-danger-death",
    "signal-bad-trade-read",
    "signal-greed-wave-death",
    "signal-cs-missed-while-present",
    "signal-clean-disengage"
  ],
  selectedActionIds: ["action-death-review-v1"]
};
```

---

## Evidence / Review Event

A specific tagged observation from a game, scrim, VOD, or manual review.

Example:

```ts
export interface EvidenceEvent {
  id: string;
  ownerId: string;
  sourceType: "solo-queue" | "scrim" | "vod" | "manual";
  matchId?: string;
  timestampInGame?: string;
  signalId: string;
  goalInstanceId?: string;
  teamFocusInstanceId?: string;
  value: number | string | boolean;
  note?: string;
  createdAt: string;
}
```

Example data:

```ts
const evidenceKnownDangerDeath: EvidenceEvent = {
  id: "evidence-001",
  ownerId: "player-3nderwiggin",
  sourceType: "manual",
  signalId: "signal-known-danger-death",
  goalInstanceId: "active-goal-3nder-adc-die-less",
  value: 1,
  note: "Died to a roam that was visible on river ward before the fight.",
  createdAt: "2026-05-08T00:00:00Z"
};
```

---

## Recommendation

A suggested next step generated from current active instances and evidence.

Example:

```ts
export interface Recommendation {
  id: string;
  actionTemplateId: string;
  reason: string;
  linkedGoalInstanceId?: string;
  linkedTeamFocusInstanceId?: string;
  priority: "low" | "medium" | "high";
}
```

Example data:

```ts
const reviewDeathsRecommendation: Recommendation = {
  id: "recommendation-review-deaths",
  actionTemplateId: "action-death-review-v1",
  reason: "Your active goal is Die Less, and recent evidence includes preventable death patterns.",
  linkedGoalInstanceId: "active-goal-3nder-adc-die-less",
  priority: "high"
};
```

---

## Demo Data Guidance

Demo data should use the same templates and instances as real user data.

Recommended demo scenarios:

- general dashboard demo with seeded active goal and team focus
- ADC-specific demo with `Die Less`
- team-focus demo with `Dragon Setup`
- onboarding demo that shows how a user selects templates and creates active instances

Possible route examples:

- `/demo`
- `/demo/adc`
- `/demo/team`
- `/demo/onboarding`

These are only suggested route names. Use whichever conventions fit the app. The important requirement is that demos use the same component and data model as authenticated routes.

---

## AI Usage Guidance

AI should be used as an assistant over structured data, not as the source of truth.

### Good AI Uses

- suggest likely goal templates based on onboarding answers
- summarize recent evidence into a short insight
- explain why a recommendation was chosen
- personalize the tone of a lesson or drill
- generate optional one-off review prompts

### Risky AI Uses for MVP

- inventing arbitrary goals without mapping them to templates
- creating signals that cannot be tracked later
- generating entire lessons as the primary content source
- producing recommendations with no template/action backing
- rewriting team language inconsistently for every user

---

## Acceptance Criteria

The data model refactor is successful when:

1. Goals are represented as reusable templates plus active instances.
2. Signals are represented as reusable templates.
3. Actions are represented as reusable templates.
4. Team focus areas are represented as reusable templates plus active instances.
5. Demo data references templates instead of hardcoding all text directly into dashboard objects.
6. The dashboard can render from active instances and their associated templates.
7. Recommendations point to action templates and include a reason.
8. Logged-in and demo routes can share the same model.
9. No AI generation is required for the MVP to function.

---

## Suggested Codex Prompt

```text
Refactor the RiftSense seeded dashboard data into a reusable template-and-instance model.

Requirements:
- Do not tie the implementation only to /demo; the model should support both demo routes and logged-in user dashboards.
- Add or update TypeScript types for GoalTemplate, SignalTemplate, ActionTemplate, ContentTemplate, TeamFocusTemplate, ActiveGoalInstance, ActiveTeamFocusInstance, EvidenceEvent, and Recommendation.
- Convert the current seeded ADC Die Less and Dragon Setup data into templates plus active instances.
- Dashboard components should render by resolving active instances against templates.
- Keep the current visual UI mostly unchanged in this task.
- Do not add AI generation.
- Do not add a database unless the app already has a clear persistence pattern for this data.
- Include demo data that exercises the model.
```
