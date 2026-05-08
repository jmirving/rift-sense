function normalizeRiotIdentity(identity) {
  const riot = identity?.riot ?? null;
  const puuid = typeof riot?.puuid === "string" ? riot.puuid.trim() : "";

  if (!puuid) {
    return null;
  }

  return {
    puuid,
    gameName: typeof riot.gameName === "string" ? riot.gameName : null,
    tagLine: typeof riot.tagLine === "string" ? riot.tagLine : null,
    platformRegion: typeof riot.platformRegion === "string" ? riot.platformRegion : null,
    routingRegion: typeof riot.routingRegion === "string" ? riot.routingRegion : null,
    verifiedAt: typeof riot.verifiedAt === "string" ? riot.verifiedAt : null
  };
}

function buildNoRiotLinkedEvidence() {
  return {
    status: "no-riot-linked",
    title: "Riot account not linked",
    summary: "Link Riot through Nexus to use recent-game evidence, or continue with manual review.",
    confidence: "Manual review only",
    candidateGames: []
  };
}

function buildSeededDemoEvidence() {
  return {
    status: "seeded-demo",
    title: "3 relevant ADC games found",
    summary: "Based on 3 ranked ADC games since this goal started · Riot API · medium confidence",
    confidence: "Medium sample",
    candidateGames: [
      {
        matchId: "NA1_DEMO_001",
        playedAt: "2026-05-08T02:00:00Z",
        queueLabel: "Ranked Solo/Duo",
        champion: "Caitlyn",
        role: "ADC",
        result: "Loss",
        kda: "3/6/5",
        csPerMinute: 7.1,
        relevanceReason: "ADC ranked game after goal start"
      },
      {
        matchId: "NA1_DEMO_002",
        playedAt: "2026-05-07T23:15:00Z",
        queueLabel: "Ranked Flex",
        champion: "Jinx",
        role: "ADC",
        result: "Win",
        kda: "7/2/8",
        csPerMinute: 8.4,
        relevanceReason: "Role-matched flex game inside the 7-day window"
      },
      {
        matchId: "NA1_DEMO_003",
        playedAt: "2026-05-06T21:40:00Z",
        queueLabel: "Normal Draft",
        champion: "Ashe",
        role: "ADC",
        result: "Loss",
        kda: "4/5/9",
        csPerMinute: 6.9,
        relevanceReason: "Low-confidence ADC baseline game"
      }
    ]
  };
}

function buildPlaceholderRiotEvidence(riotIdentity) {
  const handle = riotIdentity.gameName && riotIdentity.tagLine
    ? `${riotIdentity.gameName}#${riotIdentity.tagLine}`
    : "Linked Riot account";

  return {
    status: "riot-linked-pending",
    title: "Riot account linked",
    summary: `${handle} is available for recent-game evidence once match ingestion is enabled.`,
    confidence: "Awaiting match sync",
    candidateGames: []
  };
}

export function applyRiotEvidenceToDashboard({
  goalDashboard,
  identity,
  source,
  demoVariant = "default"
}) {
  if (!goalDashboard?.activePersonalGoal) {
    return goalDashboard;
  }

  const riotIdentity = normalizeRiotIdentity(identity);
  let riotEvidence;

  if (source === "demo" && demoVariant === "adc") {
    riotEvidence = buildSeededDemoEvidence();
  } else if (source === "demo" && demoVariant === "no-riot-linked") {
    riotEvidence = buildNoRiotLinkedEvidence();
  } else if (!riotIdentity) {
    riotEvidence = buildNoRiotLinkedEvidence();
  } else {
    riotEvidence = buildPlaceholderRiotEvidence(riotIdentity);
  }

  return {
    ...goalDashboard,
    activePersonalGoal: {
      ...goalDashboard.activePersonalGoal,
      riotEvidence
    }
  };
}
