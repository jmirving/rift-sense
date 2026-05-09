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
      profile: {
        ...home.profile,
        primaryRole: identity?.profile?.primaryRole ?? home.profile?.primaryRole ?? null,
        secondaryRoles: identity?.profile?.secondaryRoles ?? [],
        riotGameName: identity?.profile?.riotGameName ?? null,
        riotTagline: identity?.profile?.riotTagline ?? null,
        riotPuuid: identity?.profile?.riotPuuid ?? null
      },
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
