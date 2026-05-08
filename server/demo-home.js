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
    goalDashboard: {
      ...goalDashboard,
      suggestedNextSteps: (goalDashboard.suggestedNextSteps ?? []).filter(
        (step) => step.href !== "/library" && step.href !== "/library?topic=laning"
      )
    }
  };
}
