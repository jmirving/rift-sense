# RiftSense: Remove Legacy UI / FocusBoard Path

## Objective

Remove the old dashboard/focus-board UI and data model where it is still present. The product is not yet deployed as a stable public product, so legacy compatibility should not drive architecture. The app should converge around the new goal-dashboard model:

**Goal templates → active goal instances → evidence events → recommendations → dashboard UI**

Do not keep duplicate dashboard models unless there is a clearly documented migration reason.

---

## Current Concern

The codebase appears to still contain an older `focusBoard` / `coachFeed` / `continueLearning` shape alongside the newer `goalDashboard` shape.

The old model may include concepts like:

- `focusBoard.todayGoal`
- `focusBoard.progress`
- `focusBoard.weeklyGoals`
- `focusBoard.monthlyGoals`
- `focusBoard.recentGameStats`
- old route labels like `Focus Today`, `Focus This Week`, `Focus This Month`
- placeholder cards such as `Pick a focus and begin a short study block`
- `No coach recommendations configured yet`
- `No recent signals yet`

These were useful during early exploration but now risk creating two competing dashboard systems.

---

## Desired End State

The app should have one primary dashboard model:

```text
home.goalDashboard
```

The UI should render dashboard content from `goalDashboard` and its resolved objects, not from legacy focus-board fields.

The dashboard should be driven by:

- active personal goal
- active team focus
- weekly targets
- recent signals / evidence
- insights
- recommended actions
- suggested next steps

---

## Implementation Requirements

### 1. Find all legacy focus-board usages

Search for the following terms:

```text
focusBoard
todayGoal
weeklyGoals
monthlyGoals
recentGameStats
coachFeed
Focus Today
Focus This Week
Focus This Month
Pick a focus
No coach recommendations configured
No recent signals
```

Classify each usage as one of:

1. active UI path
2. API response compatibility
3. dead/demo-only code
4. test fixture
5. documentation only

### 2. Remove active UI rendering from the legacy model

The dashboard UI should not render from `focusBoard` if equivalent `goalDashboard` data exists.

Replace old UI cards with goal-dashboard-backed cards:

- Active Goal
- Weekly Targets
- Next Action
- Team Focus
- Insights
- Recent Signals
- Suggested Next Steps

### 3. Remove or deprecate legacy nav labels

The sidebar should support the improvement loop, not the old focus-page structure.

Preferred MVP nav:

- Dashboard
- Goals
- Review
- Training
- Team
- Onboarding
- Library

Remove or stop surfacing:

- Focus Today
- Focus This Week
- Focus This Month

If any of those pages still exist for route safety, they should redirect or show a minimal “moved to Goals” state, not maintain a separate product concept.

### 4. Remove duplicate demo payload fields

If `/demo` or other demo routes still build both `focusBoard` and `goalDashboard`, remove the old fields unless they are still required by tests during the same PR.

If tests require the old fields, update the tests rather than preserving the old product shape.

### 5. Update API response shape carefully

For MVP, it is acceptable for `/api/home` and `/api/demo/home` to return only the new goal-dashboard structure plus basic user/session metadata.

Recommended shape:

```json
{
  "home": {
    "user": { ... },
    "goalDashboard": { ... }
  }
}
```

Avoid returning both:

```json
{
  "focusBoard": { ... },
  "goalDashboard": { ... }
}
```

unless `focusBoard` is explicitly marked temporary and removed in the same milestone.

---

## Acceptance Criteria

This cleanup is complete when:

1. Dashboard UI renders from `goalDashboard`, not `focusBoard`.
2. Old focus cards are no longer visible in authenticated or demo dashboard routes.
3. The sidebar no longer presents `Focus Today`, `Focus This Week`, or `Focus This Month` as primary product areas.
4. Demo routes still work and show meaningful goal-dashboard data.
5. Logged-in home still works and either shows real goal-dashboard data or a clear empty/onboarding state.
6. Tests are updated to match the new model.
7. No legacy placeholder text appears in the default UI.
8. Any intentionally retained compatibility code is clearly commented with a removal note.

---

Acceptance:
- Dashboard works for demo and logged-in users.
- No old placeholder dashboard cards are visible.
- No active frontend component renders from focusBoard when goalDashboard exists.
- Any retained compatibility code is documented as temporary with a removal note.
```
