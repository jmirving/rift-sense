import { buildDefaultGoalDashboard } from "./goal-dashboard.js";

export function buildPublicDemoHome(variant = "default") {
  const goalDashboard = buildDefaultGoalDashboard();
  const focusArea = {
    default: "Goal dashboard walkthrough",
    adc: "Riot ADC evidence walkthrough",
    "no-riot-linked": "Riot account linking blocker"
  }[variant] ?? "Goal dashboard walkthrough";

  return {
    id: "demo_public_dashboard",
    profile: {
      displayName: "Public Demo Player",
      teamName: "Nexus Demo Squad",
      primaryRole: "ADC",
      focusArea
    },
    goalDashboard: {
      ...goalDashboard,
      suggestedNextSteps: (goalDashboard.suggestedNextSteps ?? []).filter(
        (step) => step.href !== "/library" && step.href !== "/library?topic=laning"
      )
    }
  };
}
