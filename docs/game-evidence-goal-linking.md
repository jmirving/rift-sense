# Game Evidence and Goal Linking

## Purpose

RiftSense should connect deterministic match evidence to existing user goals without requiring AI interpretation for the first pass.

The parser emits evidence categories and tags. Goal types subscribe to those categories and tags. User goals then match evidence through their selected goal type.

```txt
match data
  -> parser evidence
  -> goal matching
  -> review surface
```

Evidence should exist even if no current goal uses it.

## Goal Type Shape

```ts
type GoalType = {
  id: string;
  title: string;
  description: string;
  roleApplicability: Array<
    "TOP" | "JUNGLE" | "MID" | "BOTTOM" | "UTILITY" | "ANY"
  >;
  evidenceCategories: string[];
  tagSubscriptions: string[];
  defaultReviewQuestions: string[];
  createdBySystem: boolean;
  isActiveOption: boolean;
};
```

Example:

```ts
{
  id: "tempo_conversion",
  title: "Convert Plays Cleanly",
  description: "Review whether kills, towers, plates, and objectives turn into rewards or get traded back.",
  roleApplicability: ["ANY"],
  evidenceCategories: ["tempo_conversion"],
  tagSubscriptions: [
    "clean_conversion",
    "failed_conversion",
    "overstay_after_conversion",
    "tempo_spent_but_stayed",
    "reset_window_missed"
  ],
  defaultReviewQuestions: [
    "What did we get from the play?",
    "What did the enemy get back?",
    "Was the next action reset, rotate, crash, or continue?"
  ],
  createdBySystem: true,
  isActiveOption: true
}
```

## User Goal Shape

```ts
type UserGoal = {
  id: string;
  userId: string;
  goalTypeId: string;
  title?: string;
  role?: string;
  championScope?: string[];
  createdAt: string;
  active: boolean;
};
```

Only active user goals should receive goal-linked evidence. Inactive goals can keep historical links for display, but they should not affect current prioritization.

## Initial Goal Type Catalog

Seed goal types for parser categories that exist in the first implementation. Goal types can be shown as selectable options even before a user creates a goal.

```ts
const SYSTEM_GOAL_TYPES = [
  {
    id: "death_review",
    title: "Reduce Avoidable Deaths",
    evidenceCategories: ["death_review"],
    tagSubscriptions: [
      "low_hp_positioning",
      "tower_damage_relevant",
      "minion_damage_relevant",
      "lost_fight_stagger",
      "numbers_disadvantage_or_collapse",
      "post_objective_map_shift"
    ]
  },
  {
    id: "tempo_conversion",
    title: "Convert Plays Cleanly",
    evidenceCategories: ["tempo_conversion"],
    tagSubscriptions: [
      "clean_conversion",
      "failed_conversion",
      "overstay_after_conversion",
      "tempo_spent_but_stayed",
      "reset_window_missed"
    ]
  },
  {
    id: "objective_setup_exit",
    title: "Improve Objective Setup and Exit",
    evidenceCategories: ["objective_setup_exit"],
    tagSubscriptions: [
      "objective_setup_missing",
      "objective_taken_but_exit_failed",
      "post_major_objective_death",
      "enemy_objective_crossmap_trade"
    ]
  },
  {
    id: "fight_participation",
    title: "Arrive to Fights Correctly",
    evidenceCategories: ["fight_participation"],
    tagSubscriptions: [
      "late_to_fight",
      "absent_from_fight",
      "died_before_fight",
      "high_damage_losing_fight",
      "low_damage_death"
    ]
  },
  {
    id: "map_state_safety",
    title: "Recognize Unsafe Map States",
    evidenceCategories: [
      "death_review",
      "tempo_conversion",
      "objective_setup_exit"
    ],
    tagSubscriptions: [
      "post_objective_map_shift",
      "tower_defense_context",
      "enemy_carry_access",
      "overstay_after_conversion",
      "recent_death_reentry"
    ]
  },
  {
    id: "lane_pressure_conversion",
    title: "Turn Lane Pressure Into Rewards",
    evidenceCategories: ["lane_pressure", "tempo_conversion"],
    tagSubscriptions: [
      "plate_conversion",
      "pressure_without_conversion",
      "plate_loss_after_death",
      "crash_or_reset_possible"
    ]
  },
  {
    id: "vision_information",
    title: "Improve Vision and Information",
    evidenceCategories: ["vision_information"],
    tagSubscriptions: [
      "low_vision_activity",
      "objective_without_recent_vision",
      "death_after_no_recent_ward",
      "control_ward_missing"
    ]
  }
];
```

## Matching Evidence to Existing Goals

For every parsed evidence object, compare its category and tags to each active goal type.

```ts
function matchEvidenceToGoals(evidence, activeGoals, goalTypes) {
  const matches = [];

  for (const goal of activeGoals) {
    const goalType = goalTypes[goal.goalTypeId];

    if (!goalType) {
      continue;
    }

    if (goal.role && goal.role !== evidence.playerRole) {
      continue;
    }

    if (
      goal.championScope?.length &&
      !goal.championScope.includes(evidence.championName)
    ) {
      continue;
    }

    const categoryMatch = goalType.evidenceCategories.includes(
      evidence.category
    );

    const matchedTags = evidence.tags
      .map(tag => tag.id)
      .filter(id => goalType.tagSubscriptions.includes(id));

    if (categoryMatch || matchedTags.length > 0) {
      matches.push({
        evidenceId: evidence.id,
        goalId: goal.id,
        matchReason: {
          categoryMatch,
          matchedTags
        }
      });
    }
  }

  return matches;
}
```

Goal matching should not mutate parser output. Store links separately so the same evidence can be re-linked if goal types change.

```ts
type EvidenceGoalLink = {
  evidenceId: string;
  goalId: string;
  categoryMatch: boolean;
  matchedTags: string[];
  linkedAt: string;
};
```

## Missing Goal Type Options

If the parser emits an evidence category or tag that no goal type subscribes to, RiftSense should seed or suggest a system goal type option. It should not create a user goal automatically.

```ts
function findGoalCoverageGaps(parsedEvidence, goalTypes) {
  const uncovered = [];

  for (const evidence of parsedEvidence) {
    const covered = goalTypes.some(goalType =>
      goalType.evidenceCategories.includes(evidence.category) ||
      evidence.tags.some(tag => goalType.tagSubscriptions.includes(tag.id))
    );

    if (!covered) {
      uncovered.push({
        category: evidence.category,
        tags: evidence.tags.map(tag => tag.id)
      });
    }
  }

  return uncovered;
}
```

Initial behavior:

- Seed known system goal types at deploy or startup if they are missing.
- Persist system goal type options under the local `goal-types` repository.
- Return active system goal type options from onboarding metadata without creating active user goals.
- If parsed evidence is uncovered, create an inactive system goal type option when the category is stable.
- If the category or tag is experimental, record a suggestion for review instead of showing it immediately.
- Never block parsing because goal type coverage is missing.
- Never create active user goals without user action.

Example suggestion:

```ts
{
  newGoalTypeSuggestion: {
    id: "baron_exit_safety",
    title: "Exit Baron Safely",
    sourceEvidenceCategory: "objective_setup_exit",
    sourceTags: ["post_major_objective_death", "enemy_carry_access"]
  }
}
```

## Evidence Priority

Matched evidence can be ranked after linking. Priority should be deterministic and explainable.

```ts
let priority = 0;

if (evidence.category matches active goal) priority += 3;
if (evidence has severe tag) priority += 2;
if (evidence happened in first 15 minutes) priority += 1;
if (evidence repeated in same match) priority += 2;
if (evidence repeated across recent matches) priority += 3;
if (evidence.confidence < 0.5) priority -= 2;
```

High-signal tags:

```ts
[
  "tower_damage_relevant",
  "lost_fight_stagger",
  "post_major_objective_death",
  "overstay_after_conversion",
  "full_hp_to_dead",
  "low_return_damage",
  "repeat_death_same_side"
]
```

## Review Surface Inputs

The match review UI should be able to show:

1. Evidence matched to active goals.
2. Strong evidence that is not linked to active goals.
3. Suggested goal type options based on repeated uncovered evidence.
4. Positive examples worth repeating.

Example display model:

```ts
{
  section: "Goal Evidence",
  title: "Convert Plays Cleanly",
  cards: [
    {
      label: "Clean conversion",
      time: "16:24-16:56",
      summary: "Bot kills converted into bot tower."
    },
    {
      label: "Conversion into overstay",
      time: "20:26-20:51",
      summary: "Dragon and towers secured, then player died 22s later."
    }
  ]
}
```

## Product Boundaries

RiftSense should parse reliable evidence first, then use goals to decide what deserves attention.

This planning pass does not include:

- AI-generated coaching as the primary linking mechanism.
- Blocking parser output when no goal type subscribes to it.
- Creating user goals automatically.
- Requiring every evidence item to link to a goal.
- Treating a goal as proof that an event was good or bad.
- Inferring player intent from tags.
- Runtime code changes.

## Suggested Implementation Order

1. Store raw summary and timeline by match ID.
2. Resolve user participant perspective.
3. Implement `death_review` parser output.
4. Implement `tempo_conversion` parser output.
5. Seed goal types for `death_review` and `tempo_conversion`.
6. Add evidence-to-goal matching.
7. Show parser status and partial readiness in the review surface.
8. Add `objective_setup_exit`.
9. Add `fight_participation`.
10. Add `lane_pressure` and `vision_information` after the first categories are stable.
