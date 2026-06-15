import { normalizeGoalDashboard } from "../goal-dashboard.js";
import { applyRiotEvidenceToDashboard } from "../goal-dashboard/evidence-sources/riot.js";

const REVIEW_SIGNAL_TO_GOAL_SIGNAL = new Map([
  ["signal-known-danger-death", "signal-known-danger-death"],
  ["signal-bad-trade-read", "signal-bad-trade-read"],
  ["signal-greed-wave-death", "signal-greed-wave-death"],
  ["signal-bad-pre6-allin", "signal-bad-pre6-allin"],
  ["multi_enemy_collapse_candidate", "signal-known-danger-death"],
  ["solo_death_candidate", "signal-known-danger-death"],
  ["isolated_forward_death_candidate", "signal-known-danger-death"],
  ["objective_window_candidate", "signal-known-danger-death"],
  ["objective_setup_death_candidate", "signal-known-danger-death"],
  ["objective_exit_death_candidate", "signal-known-danger-death"],
  ["level_up_all_in_candidate", "signal-bad-pre6-allin"],
  ["enemy_level_up_recently_candidate", "signal-bad-pre6-allin"]
]);

const CAUSE_TO_GOAL_SIGNAL = new Map([
  ["walked_without_cover", "signal-known-danger-death"],
  ["outnumbered_fight", "signal-bad-trade-read"],
  ["stayed_too_long", "signal-greed-wave-death"],
  ["objective_setup_mistake", "signal-known-danger-death"],
  ["mechanics_misplay", "signal-bad-trade-read"],
  ["team_fight_already_lost", null],
  ["not_preventable", null],
  ["other", null]
]);

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

function goalSignalForReviewedMoment(moment) {
  if (moment?.causeCategory && CAUSE_TO_GOAL_SIGNAL.has(moment.causeCategory)) {
    return CAUSE_TO_GOAL_SIGNAL.get(moment.causeCategory);
  }
  return REVIEW_SIGNAL_TO_GOAL_SIGNAL.get(moment?.signalId) ?? null;
}

async function applyReviewedMomentEvidence({ goalDashboard, userId, matchEvaluationsRepository }) {
  if (!goalDashboard?.activeGoalInstances?.length || !matchEvaluationsRepository?.listConfirmedReviewedMomentsForUser) {
    return goalDashboard;
  }

  const goalInstance = goalDashboard.activeGoalInstances[0];
  const reviewedMoments = await matchEvaluationsRepository.listConfirmedReviewedMomentsForUser({ userId });
  const reviewedEvents = reviewedMoments
    .map((moment) => {
      const signalId = goalSignalForReviewedMoment(moment);
      if (!signalId) {
        return null;
      }

      return {
        id: `reviewed-${moment.matchId}-${moment.deathIndex}-${moment.signalId}`,
        ownerId: userId,
        sourceType: "reviewed_moment",
        signalId,
        goalInstanceId: goalInstance.id,
        value: 1,
        matchId: moment.matchId,
        detectedSignalId: moment.signalId,
        deathIndex: moment.deathIndex,
        deathTimestampSeconds: moment.deathTimestampSeconds,
        causeCategory: moment.causeCategory,
        createdAt: moment.updatedAt
      };
    })
    .filter(Boolean);

  return {
    ...goalDashboard,
    evidenceEvents: [
      ...(goalDashboard.evidenceEvents ?? []),
      ...reviewedEvents
    ]
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
  matchEvaluationsRepository,
  timing
}) {
  const profile = buildProfile(home.profile, identity?.profile, source);
  const dashboardWithReviewedEvidence = await applyReviewedMomentEvidence({
    goalDashboard: home.goalDashboard,
    userId: effectiveUserId,
    matchEvaluationsRepository
  });

  return {
    user: {
      id: effectiveUserId,
      source,
      profile,
      riot: identity?.riot ?? null
    },
    setupGuide: home.setupGuide ?? null,
    goalDashboard: await applyRiotEvidenceToDashboard({
      goalDashboard: normalizeGoalDashboard(dashboardWithReviewedEvidence),
      identity,
      source,
      demoVariant,
      profile,
      config,
      fetchImpl,
      resolveRecentGames,
      riotMatchesRepository,
      matchEvaluationsRepository,
      timing
    })
  };
}
