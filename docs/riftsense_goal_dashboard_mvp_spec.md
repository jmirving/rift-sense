# RiftSense Goal Dashboard MVP Spec

## Source Context

This spec was produced from a RiftSense improvement interview focused on turning the current dashboard into a bare-MVP usable product slice.

The core finding:

> RiftSense should start as a goal tracker and shared learning dashboard, not primarily as a content library.

---

# Synthesis: RiftSense MVP Direction

## Core Product Shape

RiftSense should start as a **goal tracker and shared learning dashboard**, not primarily as a content library.

The home page should answer three questions immediately:

1. **What am I working on?**
2. **How am I progressing?**
3. **What should I do next?**

The current layout has the right broad idea — dashboard first, library nearby — but the priority and density are off. The “Focus This...” cards are too small and abstract. They show completion, but not meaning.

## Primary MVP User Loop

The MVP loop should be:

**Choose Goal → Track Signals → Review Evidence → Take Next Action → Refresh Goal**

For a player, that means:

1. Pick a goal like “Die less as ADC.”
2. Attach concrete signals to it:
   - known-danger roam/gank deaths
   - overestimated trade strength
   - lost trades that should be winning
   - greeding a wave and dying or losing tempo
   - CS missed while present
3. Review recent games against those signals.
4. Show progress and trend.
5. Recommend the next small action.

For a team, the same loop applies:

1. Pick team focus like “Dragon setup discipline.”
2. Attach signals:
   - late objective arrival
   - poor side-lane assignment
   - failed vision retake
   - unclear fight/trade/give call
3. Review scrims against those signals.
4. Assign next practice topic.
5. Keep previous topics easy to refresh.

## Home Page Priority Order

The ideal home page should show:

1. **My active goals and progress**
2. **My team’s required/upcoming training**
3. **Recent stats and trends related to my goals**
4. **Recent insights: what I did well or poorly**
5. **Suggested next steps**

This means the current layout should probably change from:

- Focus Board
- Recommended Next
- Recent Game Stats

To something more like:

- **Active Goals**
- **Today’s Action**
- **Recent Signals**
- **Team Focus**
- **Continue Learning / Library**

## Chess.com Reference Takeaway

Chess.com works because it constantly tells the user what the next useful action is:

- solve a puzzle
- review a game
- continue a lesson
- keep a streak alive
- play a game

RiftSense should borrow that idea, but avoid becoming cluttered or ad-like.

The useful pattern is not the exact layout. The useful pattern is:

> “You are here. This is your next useful action. Click it.”

For RiftSense, that could become:

> “Your ADC goal is Die Less. You had 2 known-danger deaths last review. Do a 5-minute review block.”

Or:

> “Your team focus is Dragon Setup. Scrim starts tonight. Review the 90/60/30 setup checklist.”

## MVP Priority

### Priority 1: Easy Goal Selection & Tracking

Users need to be able to select goals, see progress, and attach measurable signals.

Goal examples:

- Die less as ADC
- Improve pre-6 trading
- Improve CS while present
- Improve dragon setup
- Improve support roam timing
- Improve jungle clear speed

Each goal needs:

- description
- role/team scope
- active/inactive status
- measurable signals
- current progress
- next action

### Priority 2: Team Focus

The team mode should show:

- team-wide active focus
- assigned player goals
- upcoming/required training
- previous topics to refresh
- practice topic for the week

Team focus examples:

- dragon setup
- side-lane assignments
- coordinated roaming
- draft-informed teamfights
- vision retakes
- lane pushes and rotations

### Priority 3: Library / Quizzes / Lessons

The library should exist, but it should support goals rather than dominate the product.

Generated content should not be central in MVP. Start with common ranked-level knowledge, manually authored lessons, reusable checklists, and structured review prompts.

## Recommended MVP Page Structure

### Home / Dashboard

Purpose: “What am I working on and what should I do next?”

Sections:

1. Active personal goal
2. Active team focus
3. Today’s action
4. Recent goal-linked signals
5. Trend snapshot
6. Suggested next step

### Goals

Purpose: choose and manage focus areas.

Sections:

1. Personal goals
2. Team goals
3. Role-specific goal templates
4. Goal history

### Review

Purpose: tag evidence from games.

Sections:

1. Add review moment
2. Tag against active goal
3. Mark as good/bad/unclear
4. Add short note
5. Optional video/link/reference

### Training

Purpose: run a small study or practice block.

Sections:

1. Short lesson
2. Drill
3. Decision tree
4. Review prompt
5. Pre-game reminder

### Team

Purpose: pseudo-coach view.

Sections:

1. Team focus
2. Player assignments
3. Practice topic
4. Shared resources
5. Recently reviewed problems

### Library

Purpose: searchable supporting content.

Sections:

1. Concepts
2. Role guides
3. Team macro topics
4. Draft/playstyle topics
5. Saved team resources

## Concrete UI Changes From Current Screenshot

### Change 1: Make “Active Goals” the hero, not “Pick a focus”

Current:

> Pick a focus and begin a short study block

Better:

> Active Goal: Die Less as ADC  
> Weekly target: 0 known-danger deaths, 0 2v2 deaths, 0 pre-6 bad all-ins  
> Current trend: needs data / improving / slipping  
> Next action: Review last game deaths

### Change 2: Replace generic percentages with meaningful goal cards

Instead of:

- Today: 0 of 1 completed
- This Week: 0%
- This Month: 0%

Use:

- Today: 1 action due
- This Week: 0 / 3 goal checks complete
- This Month: Lane phase trend unknown / improving / slipping

### Change 3: Make “Recommended Next” specific and reasoned

Current:

> No coach recommendations configured yet.

Better:

> Recommended next: Review your last 3 deaths.  
> Why: Your active goal is Die Less, and death quality is the highest-impact signal.

### Change 4: Make “Recent Signals” goal-linked

Current:

> No recent signals yet.

Better:

> Recent Signals for Die Less  
> - Known-danger death: 1  
> - Bad 2v2 death: 0  
> - Greed wave death: 1  
> - Good disengage: 2

### Change 5: Add a visible Team Focus panel

Example:

> Team Focus: Dragon Setup  
> Practice topic: 90/60/30 objective setup calls  
> Assigned review: identify whether bot wave should be dropped before dragon

## Suggested Next Build Step

Build the dashboard around one hardcoded example first:

**User:** ADC  
**Personal goal:** Die Less  
**Team focus:** Dragon Setup  
**Today’s action:** Review last game deaths  
**Signals:** known-danger deaths, bad 2v2 deaths, greed wave deaths, pre-6 bad trades  
**Team signals:** late objective arrival, failed vision retake, unclear fight/trade/give call

Do not build the full library first. Do not build generated lessons first. Prove the goal dashboard loop first.

---

# Codex-Ready Implementation Spec: RiftSense Goal Dashboard MVP

## Objective

Implement the first usable RiftSense MVP slice as a **goal tracker and shared learning dashboard**.

The dashboard should stop being a mostly-empty learning/library landing page and instead answer:

1. **What am I working on?**
2. **How am I progressing?**
3. **What should I do next?**
4. **What is my team working on?**

This is intentionally **not** a full generated-content system, not a full lesson platform, and not a complete analytics pipeline. The goal is to prove the product loop with structured, mostly static/demo data first.

---

## Product Direction

RiftSense should feel like a less-cluttered Chess.com-style study dashboard for League of Legends.

Borrow the Chess.com pattern:

> “Here is the next useful thing to do.”

Do **not** borrow the clutter, ads, or overstuffed layout.

For this MVP, the home page should make one player’s active improvement work obvious immediately.

Example target experience:

> Active Goal: Die Less as ADC  
> Weekly Targets: No 2v2 deaths, no known gank/roam deaths, no bad pre-6 all-ins  
> Current Signals: 1 known-danger death, 1 greed wave death, 2 clean disengages  
> Today’s Action: Review last game deaths  
> Team Focus: Dragon Setup

---

## MVP Scope

### In Scope

Build a functional dashboard using structured local/demo data.

Must include:

1. Active personal goal card
2. Active team focus card
3. Today’s recommended action card
4. Recent goal-linked signals card
5. Goal progress/trend snapshot
6. Simple navigation to goals/review/training/team/library areas if those pages already exist
7. Empty-state handling for missing data
8. Seed/demo data representing the current ADC + team use case

### Out of Scope

Do **not** build these yet:

1. Generated AI coaching content
2. Full Riot API integration
3. Full match ingestion
4. Full video/VOD integration
5. Complex permissions
6. Full quiz engine
7. Fully generalized lesson authoring CMS
8. Deep analytics pipeline

The MVP should be able to run with local static/demo data and still communicate the intended product loop.

---

## Primary User Scenario

As an ADC player on a team, I open RiftSense before playing or reviewing games.

I want to know:

- my current improvement goal
- what evidence/signals I am tracking
- whether I am improving
- what I should do next
- what my team is currently focused on

The current seeded scenario should be:

**User Role:** ADC / Bot  
**Personal Goal:** Die Less  
**Team Focus:** Dragon Setup  
**Today’s Action:** Review last game deaths

---

## Seed Data Requirements

Create or update seed/demo data so the dashboard has meaningful content immediately.

### Personal Goal Seed

```ts
const activePersonalGoal = {
  id: "goal-adc-die-less",
  title: "Die Less",
  scope: "personal",
  role: "ADC",
  status: "active",
  summary: "Reduce preventable deaths so ADC can keep farming, preserve tempo, and contribute damage in fights.",
  weeklyTargets: [
    "No 2v2 deaths",
    "No known gank/roam deaths",
    "No pre-6 all-ins where I badly misread who wins"
  ],
  monthlyTargets: [
    "Climb ranked toward Emerald",
    "Show consistently improved lane phase",
    "Build matchup-specific trading knowledge"
  ],
  signals: [
    {
      id: "known-danger-deaths",
      label: "Known-danger roam/gank deaths",
      value: 1,
      trend: "needs-attention",
      description: "Deaths where enemy threat was visible or strongly implied before the death."
    },
    {
      id: "bad-trade-read",
      label: "Overestimated trade strength",
      value: 2,
      trend: "needs-attention",
      description: "Trades or all-ins where I thought I won but the matchup/state said otherwise."
    },
    {
      id: "greed-wave",
      label: "Greed wave deaths or tempo losses",
      value: 1,
      trend: "watch",
      description: "Stayed for a wave and died, got chunked, or lost the next tempo window."
    },
    {
      id: "cs-present-missed",
      label: "CS missed while present",
      value: 12,
      trend: "watch",
      description: "Minions missed while in lane and able to last-hit."
    },
    {
      id: "clean-disengages",
      label: "Clean disengages",
      value: 2,
      trend: "positive",
      description: "Moments where I correctly respected danger and preserved life/tempo."
    }
  ]
};
```

### Today’s Action Seed

```ts
const todaysAction = {
  id: "action-review-last-game-deaths",
  title: "Review last game deaths",
  type: "review",
  estimatedMinutes: 5,
  reason: "Your active goal is Die Less, and death quality is the highest-impact signal to review first.",
  steps: [
    "Find each death in the last game.",
    "Tag the death: known danger, bad trade read, greed wave, mechanics, team call, or acceptable death.",
    "Write one sentence: what should I do next time?",
    "Mark one death pattern to remember before queueing again."
  ],
  ctaLabel: "Start 5-minute review"
};
```

### Team Focus Seed

```ts
const activeTeamFocus = {
  id: "team-focus-dragon-setup",
  title: "Dragon Setup",
  scope: "team",
  status: "active",
  summary: "Improve objective setup discipline around dragon: waves, vision, arrival timing, and fight/trade/give calls.",
  practiceTopic: "90/60/30 objective setup calls",
  assignedReview: "Identify whether bot wave should be dropped before dragon.",
  signals: [
    {
      id: "late-objective-arrival",
      label: "Late objective arrival",
      value: 1,
      trend: "needs-attention"
    },
    {
      id: "failed-vision-retake",
      label: "Failed vision retake",
      value: 1,
      trend: "watch"
    },
    {
      id: "unclear-call",
      label: "Unclear fight/trade/give call",
      value: 2,
      trend: "needs-attention"
    }
  ],
  checklist: [
    "90s: decide reset/wave plan",
    "60s: confirm river access and vision state",
    "30s: call fight, trade, delay, or give",
    "On spawn: do not arrive late as half a team"
  ]
};
```

---

## Dashboard Layout Requirements

Replace or substantially revise the current home content.

### Page Order

The home page should display sections in this order:

1. **Active Goals**
2. **Today’s Action**
3. **Recent Signals**
4. **Team Focus**
5. **Suggested Next Steps / Continue Learning**

### Section 1: Active Goals

This should be the hero section.

Required content:

- Personal active goal title
- Role/scope badge, e.g. `ADC · Personal`
- Short description
- Weekly targets
- Trend/progress summary
- Primary button: `Review Goal`
- Secondary button: `Change Goal` or `View Goals`

Example copy:

> **Die Less**  
> ADC · Personal  
> Reduce preventable deaths so you can keep farming, preserve tempo, and contribute damage.  
> Weekly Targets: No 2v2 deaths · No known gank deaths · No bad pre-6 all-ins

### Section 2: Today’s Action

This should be the clearest “do this next” card.

Required content:

- Action title
- Estimated time
- Why this was recommended
- 3–4 action steps
- CTA button

Example copy:

> **Review last game deaths**  
> 5 minutes  
> Recommended because your active goal is Die Less.  
> Start by tagging each death by cause.

### Section 3: Recent Signals

Goal-linked metrics/evidence, not generic stats.

Required content:

- Signal name
- Count/value
- Trend/status visual label
- Short explanatory tooltip/copy if simple to add

Recommended statuses:

- `positive`
- `watch`
- `needs-attention`
- `unknown`

Avoid showing generic percentages unless the percentage has a clear meaning.

### Section 4: Team Focus

Required content:

- Active team focus title
- Practice topic
- Assigned review
- Team checklist
- Team signal summary
- Button: `Open Team Focus`

Example copy:

> **Dragon Setup**  
> Practice topic: 90/60/30 objective setup calls  
> Assigned review: identify whether bot wave should be dropped before dragon.

### Section 5: Suggested Next Steps / Continue Learning

Required content:

Show 2–4 next-step cards.

Examples:

1. Review last game deaths
2. Run ADC trading decision tree
3. Refresh Dragon Setup checklist
4. Open matchup notes

This should not be a generic content library grid. Suggestions should be tied to the active goal or team focus.

---

## UX Requirements

1. The page should communicate the product loop without needing real data.
2. Avoid large empty cards.
3. Avoid dashboard cards that only say `0%` without context.
4. Prefer labels like `Needs attention`, `Watch`, `Improving`, `No data yet` over raw unexplained percentages.
5. Keep the page visually calm and less cluttered than Chess.com.
6. The first screen should make the user want to click the next action.
7. Team focus should be visible on the home page, not hidden in a later tab.
8. Library should be secondary to goals, signals, and next action.

---

## Navigation / Sidebar Recommendations

Current sidebar can remain, but labels should support the MVP loop.

Recommended nav for MVP:

- Dashboard
- Goals
- Review
- Training
- Team
- Library

Future/disabled sections can remain as `Soon`, but should not distract from the active MVP loop.

If keeping the current nav labels, map them as follows:

- Focus Today / This Week / This Month → consolidate or move under `Goals`
- Drills / Test / Review → keep, but connect to active goals
- Library → keep as supporting content
- Fundamentals / Playbooks / Drafting → future library categories

---

## Data Model Guidance

Implement simple typed models if the app is TypeScript.

Suggested types:

```ts
export type GoalScope = "personal" | "team";
export type GoalStatus = "active" | "paused" | "completed";
export type SignalTrend = "positive" | "watch" | "needs-attention" | "unknown";
export type ActionType = "review" | "lesson" | "drill" | "checklist" | "reflection";

export interface GoalSignal {
  id: string;
  label: string;
  value: number | string;
  trend: SignalTrend;
  description?: string;
}

export interface ImprovementGoal {
  id: string;
  title: string;
  scope: GoalScope;
  role?: "Top" | "Jungle" | "Mid" | "ADC" | "Support" | "Team";
  status: GoalStatus;
  summary: string;
  weeklyTargets?: string[];
  monthlyTargets?: string[];
  signals: GoalSignal[];
}

export interface RecommendedAction {
  id: string;
  title: string;
  type: ActionType;
  estimatedMinutes: number;
  reason: string;
  steps: string[];
  ctaLabel: string;
}

export interface TeamFocus {
  id: string;
  title: string;
  scope: "team";
  status: GoalStatus;
  summary: string;
  practiceTopic: string;
  assignedReview?: string;
  signals: GoalSignal[];
  checklist: string[];
}
```

---

## Implementation Plan

### Step 1: Locate Current Dashboard

Find the current home/dashboard route. Likely files may be something like:

- `app/page.tsx`
- `src/app/page.tsx`
- `pages/index.tsx`
- `components/dashboard/*`
- `components/layout/*`

Do not rewrite unrelated routing or authentication.

### Step 2: Add Demo Data

Create a small local data file if one does not already exist.

Suggested path:

- `src/data/riftsenseDemoData.ts`

or, if project conventions differ, use the closest existing equivalent.

This file should export:

- `activePersonalGoal`
- `todaysAction`
- `activeTeamFocus`
- `suggestedNextSteps`

### Step 3: Add or Refactor Dashboard Components

Create reusable components only as needed.

Suggested components:

- `ActiveGoalCard`
- `TodaysActionCard`
- `SignalSummaryCard`
- `TeamFocusCard`
- `NextStepCard`
- `StatusBadge`

Avoid over-abstracting. This is an MVP slice.

### Step 4: Replace Empty Placeholder Content

Replace current placeholder cards like:

- `Pick a focus and begin a short study block`
- `No coach recommendations configured yet`
- `No recent signals yet`

with seeded functional dashboard content.

### Step 5: Preserve Existing Styling Language

Keep the current dark Nexus/RiftSense style unless a small adjustment improves readability.

Do not do a full visual redesign in this ticket.

Focus on information architecture and useful content.

### Step 6: Add Empty States

If demo data is disabled or missing, show useful empty states.

Examples:

- `No active goal yet. Choose one goal to start tracking.`
- `No recent signals yet. Review a game to create your first signal.`
- `No team focus configured yet. Add a practice topic for this week.`

### Step 7: Validate Locally

Run the project’s normal checks.

Use whichever commands are already defined in the repo, likely one or more of:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Do not invent new tooling unless the repo already uses it.

---

## Acceptance Criteria

The implementation is complete when:

1. Home/dashboard page clearly shows the active personal goal `Die Less`.
2. The user can see why the goal matters.
3. Weekly targets are visible.
4. Today’s recommended action is visible and specific.
5. Recent signals are populated with meaningful demo values.
6. Team focus `Dragon Setup` is visible on the home page.
7. Suggested next steps are tied to either the personal goal or team focus.
8. There are no large blank dashboard sections in the default seeded state.
9. Empty states are still handled if seeded data is absent.
10. Existing authentication/session/sidebar layout is not broken.
11. Build/lint/typecheck pass, or any failures are documented clearly if unrelated to this change.

---

## Non-Goals / Guardrails for Codex

Do not:

1. Build AI-generated lessons.
2. Add Riot API integration.
3. Add a database unless the app already has one and this task naturally fits existing patterns.
4. Rebuild the entire navigation system.
5. Redesign the whole visual brand.
6. Add complex charts unless the project already has chart components.
7. Hide the team focus behind a secondary page only.
8. Use generic percentages without explaining what they measure.
9. Leave the dashboard empty in the default demo state.

---

## Suggested Commit Message

```text
Add goal-focused RiftSense dashboard MVP
```

---

## Suggested PR Summary

```md
## Summary
- Reworked the RiftSense dashboard around the MVP improvement loop: active goal, today’s action, recent signals, and team focus.
- Added seeded/demo data for ADC “Die Less” and team “Dragon Setup.”
- Replaced empty placeholder dashboard cards with goal-linked recommendations and signals.

## Validation
- [ ] npm run lint
- [ ] npm run typecheck
- [ ] npm run build
```
