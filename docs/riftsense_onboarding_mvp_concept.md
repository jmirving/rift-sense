# RiftSense Onboarding MVP Concept and Requirements

## Purpose

This document defines a minimal onboarding flow for RiftSense.

The goal of onboarding is not to generate a complete custom coaching plan from free text. The goal is to help a user select useful, reusable improvement templates and create their first active personal/team goals.

Onboarding should work for both:

- public/demo examples
- logged-in users with persistent state

A demo onboarding route can exist, but the concepts should not be tied only to demo pages.

---

## Product Goal

Onboarding should turn a new user from:

> “I want to improve but I don’t know how this app works.”

into:

> “I have an active goal, a few signals to track, a next action, and maybe a team focus.”

The output of onboarding should be structured state, not just text.

---

## MVP Principle

Onboarding should select and configure templates.

It should not rely on AI-generated blobs as the main product output.

Recommended flow:

```text
User answers simple questions
→ app suggests goal templates
→ user chooses a goal
→ app suggests signals and targets
→ user confirms next action
→ dashboard is created from active instances
```

---

## Key User Types

### Solo Player

A player using RiftSense primarily for their own improvement.

Needs:

- choose role
- choose improvement area
- see personal dashboard
- track review evidence
- get next actions

### Team Player

A player who has personal goals but also needs team-assigned focus areas.

Needs:

- personal active goal
- visible team focus
- assigned review or practice item
- shared training context

### Pseudo-Coach / Team Lead

A user assigning or organizing team improvement work.

Needs:

- create team focus
- assign player goals
- maintain previous topics for refresh
- prepare short practice topics
- see team progress

---

## Recommended Onboarding Routes / Demo Strategy

Demo routes should showcase flows using seeded data and the same components/model used by real users.

Possible route examples:

- `/demo` — general seeded dashboard
- `/demo/adc` — ADC dashboard scenario
- `/demo/team` — team focus scenario
- `/demo/onboarding` — onboarding flow demo

These names are suggestions only. Use project routing conventions.

The important part is that onboarding demo routes should create or preview the same structured output that a logged-in onboarding flow would create.

---

## Onboarding MVP Flow

### Step 1: Choose Context

Ask what the user is setting up.

Options:

- Personal improvement
- Team improvement
- Both

Example UI:

```text
What are you setting up?
[Personal improvement]
[Team improvement]
[Both]
```

Output:

```ts
onboardingContext: "personal" | "team" | "both"
```

---

### Step 2: Choose Role

For personal setup, ask role.

Options:

- Top
- Jungle
- Mid
- ADC
- Support
- Fill / Multiple

Output:

```ts
role: "Top" | "Jungle" | "Mid" | "ADC" | "Support" | "Multiple"
```

---

### Step 3: Choose Broad Improvement Area

Offer role-relevant categories rather than a blank text box.

ADC examples:

- Die less
- Trade better
- Improve CS
- Improve wave management
- Improve teamfighting
- Improve support synergy
- Improve matchup knowledge

Jungle examples:

- Clear speed
- Pathing
- Objective setup
- Gank timing
- Tracking enemy jungle
- Playing around lane priority

Team examples:

- Dragon setup
- Side lane assignments
- Coordinated roams
- Vision retakes
- Draft-informed teamfights
- Lane pushes and rotations

Output:

```ts
selectedGoalTemplateId?: string
selectedTeamFocusTemplateId?: string
```

---

### Step 4: Confirm Suggested Goal Template

Show the selected/suggested template and explain it simply.

Example:

```text
Suggested Goal
Die Less — ADC
Reduce preventable deaths while preserving farm, tempo, and teamfight damage.

Default signals:
- Known-danger deaths
- Bad trade reads
- Greed wave deaths
- CS missed while present
- Clean disengages
```

Actions:

- Use this goal
- Pick another goal
- Customize signals

---

### Step 5: Select Signals to Track

Show default signals from the template and allow light customization.

Example:

```text
Track these signals?
[x] Known-danger deaths
[x] Overestimated trade strength
[x] Greed wave deaths / tempo losses
[x] CS missed while present
[x] Clean disengages
[ ] Bad teamfight positioning
```

Avoid making the user design metrics from scratch in MVP.

Output:

```ts
selectedSignalIds: string[]
```

---

### Step 6: Set Weekly Targets

Use suggested defaults where possible.

Example:

```text
Suggested weekly targets
[x] No 2v2 deaths
[x] No known gank/roam deaths
[x] No bad pre-6 all-ins
```

Allow edit later. Do not overcomplicate first setup.

Output:

```ts
weeklyTargets: ActiveTarget[]
```

---

### Step 7: Choose Starting Action

Suggest a first action based on the goal template.

Example:

```text
First action
Review last game deaths
5 minutes

Why: Your goal is Die Less, and death review is the fastest way to create useful evidence.
```

Actions:

- Start now
- Save and go to dashboard
- Pick another first action

Output:

```ts
initialRecommendation: Recommendation
```

---

### Step 8: Optional Team Focus Setup

If the user is setting up team context, ask for a team focus.

Example:

```text
Team Focus
[Dragon Setup]
[Side Lane Assignments]
[Coordinated Roams]
[Vision Retakes]
[Draft-Informed Teamfights]
```

For selected focus, show default checklist and signals.

Example:

```text
Dragon Setup
Practice topic: 90/60/30 objective setup calls

Checklist:
- 90s: reset/wave plan
- 60s: river access + vision state
- 30s: fight/trade/delay/give call
- Spawn: arrive as a team or commit to trade
```

Output:

```ts
activeTeamFocusInstance: ActiveTeamFocusInstance
```

---

### Step 9: Finish to Dashboard

The final screen should preview what will appear on the dashboard.

Example:

```text
You're set up.

Personal Goal: Die Less
Signals: Known-danger deaths, bad trade reads, greed wave deaths
First Action: Review last game deaths
Team Focus: Dragon Setup

[Go to Dashboard]
```

---

## Onboarding Output

A completed onboarding flow should create or preview:

1. `ActiveGoalInstance`
2. selected `SignalTemplate` references
3. weekly targets
4. initial `Recommendation`
5. optional `ActiveTeamFocusInstance`

Example:

```ts
const onboardingResult = {
  activeGoalInstance: {
    templateId: "goal-template-adc-die-less",
    ownerType: "player",
    ownerId: "current-user",
    selectedSignalIds: [
      "signal-known-danger-death",
      "signal-bad-trade-read",
      "signal-greed-wave-death"
    ],
    weeklyTargets: [
      { signalId: "signal-known-danger-death", targetValue: 0 },
      { signalId: "signal-bad-2v2-death", targetValue: 0 }
    ]
  },
  initialRecommendation: {
    actionTemplateId: "action-death-review-v1",
    reason: "Death review is the fastest way to create evidence for the Die Less goal."
  },
  activeTeamFocusInstance: {
    templateId: "team-focus-template-dragon-setup",
    ownerType: "team",
    ownerId: "current-team"
  }
};
```

---

## AI Assistance in Onboarding

AI can be added later or used lightly, but MVP should not require it.

### Good MVP-Compatible AI Use

If the user enters free text like:

> I keep dying to ganks and losing lane trades.

AI can suggest:

- Goal: Die Less
- Secondary Goal: Trade Better
- Signals: known-danger deaths, bad trade reads, greed wave deaths

But the saved result should still map to templates.

### Avoid for MVP

Do not have AI generate an entire custom curriculum as the only onboarding output.

Do not save arbitrary AI-generated signals unless they are mapped to a reusable template or explicitly marked as custom.

---

## UI Requirements

1. Onboarding should be short: ideally 5 minutes or less.
2. Most steps should use buttons, cards, and checkboxes instead of blank text fields.
3. Users should be able to skip team setup.
4. Users should be able to accept defaults quickly.
5. The final screen should show what the dashboard will contain.
6. The flow should create structured state that can power the dashboard.
7. Demo onboarding should not require login, but should use the same underlying templates.
8. Logged-in onboarding should persist the result if persistence exists.

---

## MVP Scope

### In Scope

- role selection
- personal/team/both context selection
- goal template selection
- signal selection
- suggested weekly targets
- initial recommended action
- optional team focus selection
- dashboard preview
- seeded demo onboarding path

### Out of Scope

- full AI-generated lesson plans
- Riot API-based automatic diagnosis
- replay/video upload
- complex team permissions
- coach approval workflow
- advanced analytics
- full custom template authoring UI

---

## Acceptance Criteria

The onboarding MVP is complete when:

1. A user can choose personal improvement, team improvement, or both.
2. A user can choose a role.
3. A user can select a goal from reusable templates.
4. The app suggests default signals for the selected goal.
5. The user can accept or lightly customize signals.
6. The app suggests weekly targets.
7. The app suggests a first action.
8. The user can optionally select a team focus.
9. The final state can render the same dashboard components used elsewhere.
10. Demo onboarding can run without authentication.
11. Logged-in onboarding can reuse the same flow and persist state if persistence is available.
12. The flow does not require AI generation to work.

---

## Suggested Codex Prompt

```text
Design and implement an MVP onboarding flow for RiftSense that creates structured improvement state from reusable templates.

Requirements:
- Do not tie the concept only to /demo; support both demo and logged-in usage.
- A demo onboarding route may be added, such as /demo/onboarding, if it fits project routing conventions.
- The flow should ask for context: personal, team, or both.
- For personal setup, ask for role and let the user choose a goal template.
- Show default signals and weekly targets for the selected goal.
- Let the user accept defaults with minimal friction.
- Suggest a first action from an ActionTemplate.
- For team setup, let the user choose a TeamFocusTemplate and preview its checklist/signals.
- Final step should preview the dashboard state that will be created.
- Use the same template-and-instance model as the dashboard.
- Do not add AI generation in this task.
- Do not build advanced analytics, Riot API integration, or complex permissions.
```
