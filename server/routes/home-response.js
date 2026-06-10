import { normalizeGoalDashboard } from "../goal-dashboard.js";
import { applyRiotEvidenceToDashboard } from "../goal-dashboard/evidence-sources/riot.js";

function buildProfile(homeProfile, sharedProfile, source) {
  const baseProfile = {
    ...homeProfile
  };

  if (source !== "authenticated") {
    return {
      ...baseProfile,
      primaryRole: baseProfile.primaryRole ?? null,
      secondaryRoles: Array.isArray(baseProfile.secondaryRoles) ? baseProfile.secondaryRoles : [],
      riotGameName: baseProfile.riotGameName ?? null,
      riotTagline: baseProfile.riotTagline ?? null,
      riotPuuid: baseProfile.riotPuuid ?? null,
      preferredTeamId: baseProfile.preferredTeamId ?? null,
      activeTeamId: baseProfile.activeTeamId ?? null
    };
  }

  return {
    ...baseProfile,
    primaryRole: sharedProfile?.primaryRole ?? null,
    secondaryRoles: Array.isArray(sharedProfile?.secondaryRoles) ? sharedProfile.secondaryRoles : [],
    riotGameName: sharedProfile?.riotGameName ?? null,
    riotTagline: sharedProfile?.riotTagline ?? null,
    riotPuuid: sharedProfile?.riotPuuid ?? null,
    preferredTeamId: sharedProfile?.preferredTeamId ?? null,
    activeTeamId: sharedProfile?.activeTeamId ?? null
  };
}

export async function buildHomePayload({
  home,
  effectiveUserId,
  source,
  identity,
  demoVariant,
  config,
  fetchImpl,
  resolveRecentGames,
  riotMatchesRepository,
  matchEvaluationsRepository
}) {
  const profile = buildProfile(home.profile, identity?.profile, source);

  return {
    user: {
      id: effectiveUserId,
      source,
      profile,
      riot: identity?.riot ?? null
    },
    setupGuide: home.setupGuide ?? null,
    goalDashboard: await applyRiotEvidenceToDashboard({
      goalDashboard: normalizeGoalDashboard(home.goalDashboard),
      identity,
      source,
      demoVariant,
      profile,
      config,
      fetchImpl,
      resolveRecentGames,
      riotMatchesRepository,
      matchEvaluationsRepository
    })
  };
}
