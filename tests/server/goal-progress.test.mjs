import { describe, expect, it } from "vitest";

import { buildGoalProgress } from "../../server/goal-dashboard.js";

function state({
  activeSince = "2026-06-23",
  focusSelectedAt = "2026-06-23",
  evidenceEvents = []
} = {}) {
  return {
    activeGoalInstances: [
      {
        id: "goal-1",
        templateId: "goal-template-adc-die-less",
        status: "active",
        activeSince,
        weeklyTargets: [
          { signalId: "signal-known-danger-death", targetValue: 0, selectedAt: focusSelectedAt }
        ],
        selectedSignalIds: ["signal-known-danger-death"]
      }
    ],
    evidenceEvents
  };
}

function event(overrides = {}) {
  return {
    id: `event-${overrides.matchId ?? "NA1"}-${overrides.createdAt ?? "now"}`,
    sourceType: "reviewed_moment",
    signalId: "signal-known-danger-death",
    goalInstanceId: "goal-1",
    value: 1,
    matchId: "NA1",
    createdAt: "2026-06-23T14:00:00.000Z",
    ...overrides
  };
}

describe("goal progress view model", () => {
  it("labels a goal started today without misleading weekly completion language", () => {
    const progress = buildGoalProgress(state(), { now: new Date("2026-06-23T18:00:00.000Z") });

    expect(progress.goalAge.label).toBe("Active today");
    expect(progress.windows.weekToDate.status).toBe("no-data");
    expect(progress.windows.weekToDate.valueLabel).toBe("No data yet");
  });

  it("keeps week-to-date and since-focus windows separate for mid-week focus starts", () => {
    const progress = buildGoalProgress(state({
      activeSince: "2026-06-21",
      focusSelectedAt: "2026-06-23",
      evidenceEvents: [
        event({ id: "before-focus", matchId: "NA0", createdAt: "2026-06-22T14:00:00.000Z" }),
        event({ id: "after-focus-1", matchId: "NA1", createdAt: "2026-06-23T14:00:00.000Z" }),
        event({ id: "after-focus-2", matchId: "NA2", createdAt: "2026-06-24T14:00:00.000Z" })
      ]
    }), { now: new Date("2026-06-24T18:00:00.000Z") });

    expect(progress.windows.weekToDate.matchingMoments).toBe(2);
    expect(progress.windows.sinceFocusStarted.matchingMoments).toBe(2);
    expect(progress.windows.sinceFocusStarted.gamesReviewed).toBe(2);
  });

  it("distinguishes goal age from focus age", () => {
    const progress = buildGoalProgress(state({
      activeSince: "2026-06-15",
      focusSelectedAt: "2026-06-22"
    }), { now: new Date("2026-06-23T18:00:00.000Z") });

    expect(progress.goalAge.daysActive).toBe(8);
    expect(progress.focusAge.daysActive).toBe(1);
    expect(progress.goalAge.label).toBe("Active for 8 days");
    expect(progress.focusAge.label).toBe("Selected for 1 day");
  });

  it("shows no data without marking the target missed", () => {
    const progress = buildGoalProgress(state(), { now: new Date("2026-06-23T18:00:00.000Z") });

    expect(progress.windows.today.status).toBe("no-data");
    expect(progress.windows.weekToDate.status).toBe("no-data");
    expect(progress.windows.weekToDate.status).not.toBe("missed");
  });

  it("marks exceeded max targets off track without ambiguous ratios", () => {
    const progress = buildGoalProgress(state({
      evidenceEvents: [
        event({ id: "one", matchId: "NA1" }),
        event({ id: "two", matchId: "NA2" })
      ]
    }), { now: new Date("2026-06-23T18:00:00.000Z") });

    expect(progress.windows.weekToDate.matchingMoments).toBe(2);
    expect(progress.windows.weekToDate.target).toBe(0);
    expect(progress.windows.weekToDate.status).toBe("off-track-early");
    expect(progress.windows.weekToDate.valueLabel).toBe("2 known-danger deaths");
    expect(progress.windows.weekToDate.valueLabel).not.toContain("2/0");
  });

  it("hides age when no exact start timestamp exists", () => {
    const progress = buildGoalProgress({
      activeGoalInstances: [
        {
          id: "goal-1",
          templateId: "goal-template-adc-die-less",
          status: "active",
          weeklyTargets: [{ signalId: "signal-known-danger-death", targetValue: 0 }],
          selectedSignalIds: ["signal-known-danger-death"]
        }
      ],
      evidenceEvents: []
    }, { now: new Date("2026-06-23T18:00:00.000Z") });

    expect(progress.goalAge).toBeNull();
    expect(progress.focusAge).toBeNull();
  });
});
