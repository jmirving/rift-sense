# RiftSense: Re-Evaluated Next Changes, Ordered

### Priority 1: Add evidence source/confidence metadata to the UI

The dashboard currently shows target status and low sample confidence, but the user also needs to know where the evidence came from.

Add compact source context like:

```text
Based on 1 reviewed game · manual tags · low confidence
```

or:

```text
Seeded from onboarding · no reviewed games yet
```

or:

```text
Based on 3 ranked ADC games · Riot match history + 2 manual tags
```

Why this matters:

- Builds trust.
- Prevents overreading tiny samples.
- Differentiates demo/onboarding/manual/Riot-derived evidence.
- Helps explain why a recommendation exists.

### Priority 2: Connect insights to evidence

Insights should show why they exist.

Example:

```text
Known threat is the main leak
Based on: 1 known-danger death + 1 greed wave death
```

or:

```text
Trade checks need to happen earlier
Based on: 2 overestimated trade strength tags
```

Why this matters:

- Turns insights from “smart-sounding text” into explainable coaching.
- Lets users correct bad assumptions.
- Makes future AI summaries auditable.

### Priority 3: Make Team Focus more actionable

Team Focus is visible, but it should make the user’s assignment more explicit.

Add:

- `Your assignment`
- `Next team action`
- `Team evidence source`
- maybe one compact team signal

Example:

```text
Your assignment: Decide whether bot wave should be dropped before dragon.
Next team action: Run 90/60/30 checklist before scrim.
Recent team signal: 2 unclear fight/trade/give calls.
```

Why this matters:

- The product goal is solo improvement along with team-identified topics.
- Team focus should not feel like a passive note.
- It should, if possible, connect the player’s personal work to team priorities.

### Priority 4: Make suggested next steps more typed and explainable

Suggested next steps should clearly show whether they are:

- Review
- Drill
- Checklist
- Lesson
- Reflection
- Team action

Example:

```text
Review · Personal Goal · 5 min
Review last game deaths
```

Why this matters:

- Helps users choose the right activity quickly.
- Makes the page feel like a workflow, not a content grid.

## Recommended Order of Work

1. Add source/confidence metadata to dashboard payload and UI.
2. Connect insights to the evidence that generated them.
3. Make Team Focus more actionable and assignment-oriented.
4. Add typed next-step cards.