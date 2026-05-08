import { normalizeGoalDashboard } from "../goal-dashboard.js";

export async function buildHomePayload({
  home,
  effectiveUserId,
  source
}) {
  return {
    user: {
      id: effectiveUserId,
      source,
      profile: home.profile
    },
    goalDashboard: normalizeGoalDashboard(home.goalDashboard)
  };
}
