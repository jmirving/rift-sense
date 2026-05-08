import { buildDefaultGoalDashboard } from "./goal-dashboard.js";

export function buildPublicDemoHome() {
  const goalDashboard = buildDefaultGoalDashboard();

  return {
    id: "demo_public_dashboard",
    profile: {
      displayName: "Public Demo Player",
      teamName: "Nexus Demo Squad",
      primaryRole: "ADC",
      focusArea: "Goal dashboard walkthrough"
    },
    focusBoard: {
      greeting: "Work on one clear improvement target today.",
      todayGoal: {
        title: "Review last game deaths",
        summary: "Use one short review block to tag death quality before queueing again.",
        progressLabel: "1 focused review queued"
      },
      progress: {
        todayPercent: 100,
        weeklyPercent: 45,
        monthlyPercent: 30
      },
      weeklyGoals: [
        {
          title: "No 2v2 deaths",
          progressLabel: "Primary weekly lane target",
          progressPercent: 65
        },
        {
          title: "No known gank or roam deaths",
          progressLabel: "Tracked from recent reviews",
          progressPercent: 50
        }
      ],
      monthlyGoals: [
        {
          title: "Build matchup-specific trading knowledge",
          progressLabel: "ADC lane-phase focus",
          progressPercent: 35
        }
      ],
      recentGameStats: [
        {
          label: "Known-danger deaths",
          value: "1",
          trend: "Needs attention",
          note: "Enemy threat was visible first"
        },
        {
          label: "Bad trade reads",
          value: "2",
          trend: "Needs attention",
          note: "Pre-6 all-in risk"
        },
        {
          label: "Clean disengages",
          value: "2",
          trend: "Positive",
          note: "Respected danger"
        }
      ]
    },
    coachFeed: {
      headline: "Public demo data only. No authenticated player assignments or history are shown here.",
      sections: []
    },
    continueLearning: [],
    goalDashboard: {
      ...goalDashboard,
      suggestedNextSteps: (goalDashboard.suggestedNextSteps ?? []).filter(
        (step) => step.href !== "/library" && step.href !== "/library?topic=laning"
      )
    }
  };
}
