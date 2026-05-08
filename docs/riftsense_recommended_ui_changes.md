# RiftSense Recommended UI Changes

## Purpose

This document captures recommended UI changes for RiftSense after reviewing the current MVP dashboard direction and the seeded dashboard screenshot.

These recommendations apply to both:

- a public/demo route using seeded data
- a logged-in user dashboard using real user/team state

Do not treat these changes as specific to `/demo`. A demo route should showcase the same reusable dashboard concepts that authenticated users will eventually see.

---

## Current Evaluation

The current dashboard is a strong first pass. It now communicates the intended RiftSense loop much better than the original blank layout:

> Goal → Evidence → Next Action → Team Focus

The page clearly shows:

- an active personal goal: `Die Less`
- a role context: `ADC · personal`
- weekly targets
- a recommended action
- a visible team focus
- goal-linked signals

This is directionally correct.

The main issue is that the page still feels like a polished static brief rather than a fast, reusable training dashboard. It communicates the concept, but the information density and hierarchy should be tightened so the user can understand their state and next action within a few seconds.

---

## Design Goal

The home/dashboard page should answer five questions quickly:

1. What am I working on?
2. How is it going?
3. What evidence supports that?
4. What should I do next?
5. What is my team working on?

The user should not need to read multiple paragraph-style cards before knowing what to do.

---

## Recommended Page Hierarchy

Recommended top-level dashboard order:

1. **Active Goal + Status + Next Action**
2. **Goal Progress / Weekly Targets**
3. **Recent Signals / Evidence**
4. **Team Focus**
5. **Suggested Next Steps / Continue Learning**

The current dashboard is close, but the most actionable item should be more prominent.

---

## Change 1: Make the Hero Card More Action-Oriented

### Current Pattern

The hero card primarily says:

- Active Goal
- Die Less
- description
- weekly targets
- progress summary
- buttons

This is useful, but it reads more like a report than a launch point.

### Recommended Pattern

The hero should combine goal, status, and next action.

Example:

```text
Active Goal: Die Less
ADC · Personal
Status: Needs attention
This week: 3 preventable death patterns tagged; 2 clean disengages logged.
Next action: Review last game deaths
[Start 5-minute review] [View Goal]
```

### Why

The core Chess.com-inspired pattern is:

> “You are here. This is the next useful thing to do.”

The dashboard should make the next action impossible to miss.

---

## Change 2: Turn Weekly Targets Into Compact, Trackable Chips

### Current Pattern

Weekly targets appear as a list:

- No 2v2 deaths
- No known gank/roam deaths
- No bad pre-6 all-ins

### Recommended Pattern

Use compact target chips or small cards:

```text
Weekly Targets
[0 2v2 deaths] [0 known gank deaths] [0 bad pre-6 all-ins]
```

Eventually each chip can show status:

```text
[0/0 2v2 deaths · on track]
[1/0 known gank deaths · missed]
[unknown pre-6 all-ins · needs review]
```

### Why

The user should see target state quickly. A simple bullet list tells the user what matters, but not whether they are succeeding.

---

## Change 3: Add Goal Status, Confidence, and Trend

### Problem

Counts alone are ambiguous.

Example:

> 1 known-danger death

Is that bad? Better than before? A low sample? A severe issue?

### Recommended Fields

Add compact status metadata:

```text
Goal Status: Needs attention
Trend: Unknown / Improving / Slipping
Confidence: Low sample / Medium / High
```

### Why

RiftSense should avoid fake precision. Early data may be incomplete or manually tagged. Showing confidence lets the system say:

> “This looks concerning, but we need more reviewed games.”

That is better than implying certainty from one or two datapoints.

---

## Change 4: Make Recent Signals More Scannable

### Current Pattern

Signal cards include count, status, label, and detailed explanation. This makes the row informative but heavy.

### Recommended Pattern

Signal cards should prioritize:

1. value
2. label
3. status
4. short explanation only if space permits

Example:

```text
1
Known-danger death
Needs attention
```

Detailed descriptions can move to:

- hover tooltip
- expanded detail drawer
- signal detail page
- review flow

### Why

Signals are evidence, not lessons. The dashboard should show what happened. Deeper explanations belong one click away.

---

## Change 5: Add an “Insights” Section

### Current Gap

The current dashboard has signals, but not synthesized insight.

The interview identified “Data, Insights” as a missing part of the experience.

### Recommended Section

Add a small `Recent Insights` panel after signals or alongside suggested next steps.

Examples:

```text
Recent Insight
Most preventable deaths this week came from respecting known threat, not mechanics.
```

```text
Recent Insight
Trading errors are showing up before level 6, so the next useful block is a pre-6 trade check.
```

### Why

Signals tell the user what happened. Insights tell the user what it means.

This is a good place for AI assistance later, but the MVP can use simple rule-based or seeded insights.

---

## Change 6: Make Team Focus More Compact and Operational

### Current Pattern

The team focus card is visible and useful, but the content reads like a paragraph plus checklist.

### Recommended Pattern

Use a compact operational structure:

```text
Team Focus: Dragon Setup
Practice Topic: 90/60/30 setup calls
Assigned Review: Should bot wave be dropped before dragon?

Checklist
90s: reset/wave plan
60s: river access + vision state
30s: fight / trade / delay / give
Spawn: arrive as a team or commit to trade
```

### Why

Team focus should feel like a practice tool, not documentation. The user should be able to glance at it before scrims.

---

## Change 7: De-emphasize Long Explanatory Copy on Dashboard

### Problem

The current dashboard contains several useful explanations, but the page can become text-heavy.

### Recommendation

Use a layered information approach:

- dashboard = summary + state + next action
- detail page = explanation + history + examples
- training/review flow = steps + prompts
- library = deeper reusable content

### Why

The dashboard should not compete with the library or training pages. It should route the user to the right next activity.

---

## Change 8: Make Suggested Next Steps Tied to Templates

Suggested next steps should not be generic content recommendations.

They should be generated from active goals, team focus, recent evidence, or missing data.

Examples:

```text
Suggested Next Steps
- Review last game deaths
- Run ADC pre-6 trade check
- Refresh Dragon Setup checklist
- Add evidence from last scrim
```

Each next step should have:

- title
- type: review / drill / lesson / checklist / reflection
- estimated time
- reason
- linked goal or team focus

---

## Change 9: Keep Demo Routes Representative but Not Special

A route such as `/demo` should render the same dashboard components and data model used by the real app, but with seeded/demo data.

Do not build a separate fake UI just for demo.

Recommended demo route strategy:

- `/demo` — general seeded dashboard demo
- `/demo/adc` — ADC personal goal example
- `/demo/team` — team focus dashboard example
- `/demo/onboarding` — onboarding flow demo

These are examples. The route names can change to match project conventions.

The important requirement is that demo routes should exercise the same components and template/instance model used by logged-in users.

---

## Acceptance Criteria

A revised dashboard is successful when:

1. The first screen makes the active goal and next action obvious.
2. Weekly targets show meaningful state, not just static text.
3. Signal cards are scannable.
4. Team focus remains visible without dominating the whole page.
5. The page includes at least one recent insight or placeholder insight state.
6. Long educational explanations are moved out of the dashboard and into training/review/library contexts.
7. Demo and logged-in dashboards can share the same components.
8. The dashboard feels like a workflow launcher, not a static report.

---

## Suggested Codex Prompt

```text
Revise the RiftSense dashboard UI to make the active goal, goal status, and next action more prominent.

Requirements:
- Apply the changes to the shared dashboard components/routes, not only to a demo route.
- Keep demo routes using seeded data, but make sure the components can also support logged-in user data.
- Make the hero card show active goal, status, trend/confidence if available, weekly summary, and next action CTA.
- Convert weekly targets into compact chips/cards with status where data exists.
- Make recent signal cards more scannable by reducing long text on the dashboard.
- Add a Recent Insights section or placeholder state.
- Keep Team Focus visible and operational with practice topic, assigned review, and compact checklist.
- Do not add AI generation in this task.
- Do not redesign the entire brand or navigation.
```
