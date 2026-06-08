import { resolveRecentGames as defaultResolveRecentGames, scoreRecentGames } from "../../riot/recent-games.js";

function normalizeRiotIdentity(identity, profile) {
  const puuid = typeof profile?.riotPuuid === "string" && profile.riotPuuid.trim()
    ? profile.riotPuuid.trim()
    : typeof identity?.riot?.puuid === "string" && identity.riot.puuid.trim()
      ? identity.riot.puuid.trim()
      : "";

  if (!puuid) {
    return null;
  }

  return {
    puuid,
    gameName: typeof profile?.riotGameName === "string" ? profile.riotGameName : null,
    tagLine: typeof profile?.riotTagline === "string" ? profile.riotTagline : null
  };
}

function mapConfidenceLabel(label) {
  if (label === "high") {
    return "High confidence";
  }
  if (label === "medium") {
    return "Medium confidence";
  }
  return "Low confidence";
}

function buildNoRiotLinkedEvidence() {
  return {
    status: "no-riot-linked",
    title: "Riot account not linked",
    summary: "Link a Riot account in Nexus to pull recent games for this goal.",
    confidence: "Setup needed",
    sourceLabel: "No Riot account linked",
    candidateGames: []
  };
}

function buildRoleSetupEvidence(riotIdentity) {
  const handle = riotIdentity.gameName && riotIdentity.tagLine
    ? `${riotIdentity.gameName}#${riotIdentity.tagLine}`
    : "Linked Riot account";

  return {
    status: "riot-setup-needed",
    title: "Riot role setup needed",
    summary: `${handle} is linked. Add a primary role in Nexus so RiftSense can rank games with higher confidence.`,
    confidence: "Low confidence",
    sourceLabel: "Riot account linked",
    candidateGames: []
  };
}

function buildSeededDemoEvidence() {
  return {
    status: "seeded-demo",
    title: "3 relevant ADC games found",
    summary: "Based on 3 ranked ADC games since this goal started.",
    confidence: "Medium confidence",
    sourceLabel: "Seeded demo",
    candidateGames: [
      {
        matchId: "NA1_DEMO_001",
        playedAt: "2026-05-08T02:00:00Z",
        queueLabel: "Ranked Solo/Duo",
        champion: "Caitlyn",
        championName: "Caitlyn",
        role: "ADC",
        result: "Loss",
        kda: "3/6/5",
        kills: 3,
        deaths: 6,
        assists: 5,
        csPerMinute: 7.1,
        gameDurationSeconds: 1920,
        confidenceLabel: "medium",
        relevanceReason: "ADC ranked game after goal start",
        sourceLabel: "Seeded demo"
      },
      {
        matchId: "NA1_DEMO_002",
        playedAt: "2026-05-07T23:15:00Z",
        queueLabel: "Ranked Flex",
        champion: "Jinx",
        championName: "Jinx",
        role: "ADC",
        result: "Win",
        kda: "7/2/8",
        kills: 7,
        deaths: 2,
        assists: 8,
        csPerMinute: 8.4,
        gameDurationSeconds: 2040,
        confidenceLabel: "medium",
        relevanceReason: "Role-matched flex game inside the 7-day window",
        sourceLabel: "Seeded demo"
      },
      {
        matchId: "NA1_DEMO_003",
        playedAt: "2026-05-06T21:40:00Z",
        queueLabel: "Normal Draft",
        champion: "Ashe",
        championName: "Ashe",
        role: "ADC",
        result: "Loss",
        kda: "4/5/9",
        kills: 4,
        deaths: 5,
        assists: 9,
        csPerMinute: 6.9,
        gameDurationSeconds: 1875,
        confidenceLabel: "low",
        relevanceReason: "Low-confidence ADC baseline game",
        sourceLabel: "Seeded demo"
      }
    ]
  };
}

function buildUnavailableEvidence(riotIdentity, recentGamesResult) {
  const handle = riotIdentity.gameName && riotIdentity.tagLine
    ? `${riotIdentity.gameName}#${riotIdentity.tagLine}`
    : "Linked Riot account";

  return {
    status: "riot-linked-unavailable",
    title: "Recent games unavailable",
    summary: `${handle} is linked. ${recentGamesResult.message}`,
    confidence: "Pending",
    sourceLabel: recentGamesResult.sourceLabel ?? "Riot account linked",
    candidateGames: []
  };
}

function buildAvailableEvidence(candidateGames) {
  const topConfidence = candidateGames[0]?.confidenceLabel ?? "low";
  const sourceLabel = candidateGames[0]?.sourceLabel ?? "Riot recent games";

  return {
    status: "recent-games-ready",
    title:
      candidateGames.length > 0
        ? `${candidateGames.length} candidate games selected`
        : "No relevant candidate games found",
    summary:
      candidateGames.length > 0
        ? `Sorted from recent Riot matches for the active goal.`
        : "Recent games were found, but none scored as strong candidates yet.",
    confidence: mapConfidenceLabel(topConfidence),
    sourceLabel,
    candidateGames
  };
}

export async function applyRiotEvidenceToDashboard({
  goalDashboard,
  identity,
  source,
  demoVariant = "default",
  profile,
  config,
  fetchImpl,
  riotMatchesRepository,
  resolveRecentGames = defaultResolveRecentGames
}) {
  if (!goalDashboard?.activePersonalGoal) {
    return goalDashboard;
  }

  let riotEvidence;

  if (source === "demo" && demoVariant === "adc") {
    riotEvidence = buildSeededDemoEvidence();
  } else if (source === "demo" && demoVariant === "no-riot-linked") {
    riotEvidence = buildNoRiotLinkedEvidence();
  } else {
    const riotIdentity = normalizeRiotIdentity(identity, profile);
    if (!riotIdentity) {
      riotEvidence = buildNoRiotLinkedEvidence();
    } else if (!profile?.primaryRole) {
      riotEvidence = buildRoleSetupEvidence(riotIdentity);
    } else {
      const recentGamesResult = await resolveRecentGames({
        identity,
        profile,
        config,
        riotMatchesRepository,
        fetchImpl
      }).catch(() => ({
        status: "unavailable",
        sourceLabel: "Riot account linked",
        message: "Riot account linked. Recent games are temporarily unavailable.",
        games: []
      }));

      if (recentGamesResult.status !== "available") {
        riotEvidence = buildUnavailableEvidence(riotIdentity, recentGamesResult);
      } else {
        riotEvidence = buildAvailableEvidence(
          scoreRecentGames({
            games: recentGamesResult.games,
            goal: goalDashboard.activePersonalGoal,
            profile
          })
        );
      }
    }
  }

  return {
    ...goalDashboard,
    activePersonalGoal: {
      ...goalDashboard.activePersonalGoal,
      role: profile?.primaryRole ?? goalDashboard.activePersonalGoal.role,
      riotEvidence
    }
  };
}
