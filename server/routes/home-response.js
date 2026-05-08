import { normalizeGoalDashboard } from "../goal-dashboard.js";
import { applyRiotEvidenceToDashboard } from "../goal-dashboard/evidence-sources/riot.js";

export async function buildHomePayload({
  home,
  effectiveUserId,
  source,
  identity,
  demoVariant
}) {
  return {
    user: {
      id: effectiveUserId,
      source,
      profile: home.profile,
      riot: identity?.riot ?? null
    },
    goalDashboard: applyRiotEvidenceToDashboard({
      goalDashboard: normalizeGoalDashboard(home.goalDashboard),
      identity,
      source,
      demoVariant
    })
  };
}
