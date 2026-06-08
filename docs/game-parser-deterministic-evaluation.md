# Deterministic Game Parser

## Purpose

RiftSense should turn raw League match summary and timeline data into repeatable evidence objects. The first parser pass should produce facts, tags, and review questions, not final coaching prose.

```txt
raw data
  -> normalized events
  -> evidence objects
  -> tags
  -> review questions
```

The parser should be deterministic: the same raw summary, timeline, PUUID, and parser version should produce the same output.

## Parser Inputs

Required inputs:

- Match summary JSON.
- Match timeline JSON.
- User PUUID.

Optional later:

- Active user goals.
- Champion pool.
- Role preferences.
- Prior parsed matches.
- Known review focus.

Goals may affect ranking and display later, but they should not decide whether an evidence object exists.

## Participant Resolution

Resolve the reviewed player before parsing evidence.

```ts
function resolveParticipant(matchSummary, puuid) {
  const participant = matchSummary.info.participants.find(
    p => p.puuid === puuid
  );

  if (!participant) {
    throw new ParseFailure("participant_not_found");
  }

  return {
    puuid,
    participantId: participant.participantId,
    championName: participant.championName,
    teamId: participant.teamId,
    teamPosition: participant.teamPosition,
    individualPosition: participant.individualPosition
  };
}
```

## Normalized Events

The parser should normalize Riot timeline events into a smaller vocabulary before emitting evidence.

```ts
type NormalizedEvent =
  | ChampionKillEvent
  | PlayerDeathEvent
  | ObjectiveKillEvent
  | StructureKillEvent
  | PlateEvent
  | LevelUpEvent
  | SkillLevelEvent
  | ItemPurchaseEvent
  | WardPlacedEvent
  | WardKilledEvent
  | FrameSnapshotEvent;
```

Normalization should preserve the original timestamp and enough raw references to inspect the source event later.

## Parser Output Shape

A parsed match should produce a stable envelope plus zero or more evidence objects.

```ts
type ParsedMatchOutput = {
  matchId: string;
  puuid: string;
  participantId: number;
  parserVersion: string;
  parsedAt: string;
  evidence: ParsedEvidence[];
  warnings: ParserWarning[];
};
```

```ts
type ParsedEvidence = {
  id: string;
  matchId: string;
  puuid: string;
  participantId: number;
  championName: string;
  playerRole?: string;
  category:
    | "death_review"
    | "tempo_conversion"
    | "objective_setup_exit"
    | "fight_participation"
    | "map_state_safety"
    | "lane_pressure"
    | "damage_context"
    | "cc_catch_engage"
    | "vision_information"
    | "resource_to_impact";
  timestamp: number;
  windowStart: number;
  windowEnd: number;
  tags: EvidenceTag[];
  facts: Record<string, unknown>;
  reviewQuestions: string[];
  confidence: number;
  sourceEventIds: string[];
  createdAt: string;
};
```

```ts
type EvidenceTag = {
  id: string;
  confidence: number;
  params?: Record<string, unknown>;
};
```

Review questions should be grounded in observed facts. Avoid claims about intent.

Bad:

```txt
Player inted by greeding for tower.
```

Better:

```ts
{
  id: "tower_damage_relevant",
  confidence: 0.9,
  params: {
    towerDamage: 805,
    totalDamageReceived: 1876
  }
}
```

## Death Review Parser

For each death by the user:

```ts
for (const death of playerDeaths) {
  const beforeFrame = frameAtOrBefore(death.timestamp);
  const afterFrame = frameAtOrAfter(death.timestamp);
  const damageReceived = summarizeVictimDamageReceived(death);
  const damageDealt = summarizeVictimDamageDealt(death);
  const nearbyEventsBefore = eventsBetween(
    death.timestamp - 60_000,
    death.timestamp
  );
  const nearbyEventsAfter = eventsBetween(
    death.timestamp,
    death.timestamp + 30_000
  );

  const tags = [];

  if (isLowHpBeforeDeath(beforeFrame, participantId)) {
    tags.push("low_hp_positioning");
  }

  if (hasTowerDamage(damageReceived)) {
    tags.push("tower_damage_relevant");
  }

  if (hasMinionDamageAboveThreshold(damageReceived)) {
    tags.push("minion_damage_relevant");
  }

  if (enemyLevelUpBeforeDeath(nearbyEventsBefore)) {
    tags.push("enemy_level_timing_before_death");
  }

  if (objectiveRecentlyChangedMapState(nearbyEventsBefore)) {
    tags.push("post_objective_map_shift");
  }

  if (alliesDiedBeforePlayer(nearbyEventsBefore)) {
    tags.push("lost_fight_stagger");
  }

  emitEvidence("death_review", death.timestamp, tags, facts, questions);
}
```

Rules:

- Level-ups after death are aftermath, not death cause.
- Structures falling after death are aftermath unless structure pressure existed before death.
- Summoner spell loadout can be review context, but not cast timing unless the cast appears in data.

## Tempo and Conversion Parser

Trigger events:

- Champion kill.
- Objective kill.
- Tower kill.
- Plate taken.
- Baron, dragon, Herald, or Elder taken.
- Inhibitor taken.

For each trigger:

```ts
const postWindow = eventsBetween(
  trigger.timestamp,
  trigger.timestamp + 90_000
);

const conversion = {
  trigger,
  teamGains: summarizeTeamGains(postWindow, playerTeamId),
  enemyGains: summarizeTeamGains(postWindow, enemyTeamId),
  playerStateChange: summarizePlayerDeltas(
    trigger.timestamp,
    trigger.timestamp + 60_000
  )
};

classifyConversion(conversion);
```

Candidate tags:

```ts
[
  "clean_conversion",
  "failed_conversion",
  "overstay_after_conversion",
  "objective_into_death",
  "kill_into_no_plate",
  "plate_into_bad_reset",
  "baron_exit_failure",
  "tower_take_into_collapse",
  "tempo_spent_but_stayed",
  "enemy_crossmap_trade",
  "reset_window_missed"
]
```

## Objective Setup and Exit Parser

For each dragon, Herald, Baron, or Elder:

```ts
const setupWindow = eventsBetween(
  objective.timestamp - 90_000,
  objective.timestamp
);

const exitWindow = eventsBetween(
  objective.timestamp,
  objective.timestamp + 60_000
);

const setupFacts = {
  deathsBeforeObjective: deathsInWindow(setupWindow),
  wardsPlacedBeforeObjective: wardsInArea(setupWindow, objectiveArea),
  playerPositionBeforeObjective: playerPositionAt(objective.timestamp - 15_000),
  teamPositionBeforeObjective: teamPositionsAt(objective.timestamp - 15_000)
};

const exitFacts = {
  deathsAfterObjective: deathsInWindow(exitWindow),
  towersAfterObjective: structuresInWindow(exitWindow),
  playerDeathAfterObjective: playerDeathInWindow(exitWindow)
};
```

Candidate tags:

```ts
[
  "objective_setup_present",
  "objective_setup_missing",
  "objective_taken_cleanly",
  "objective_taken_but_exit_failed",
  "objective_contested_and_lost",
  "enemy_objective_crossmap_trade",
  "post_major_objective_death"
]
```

## Fight Participation Parser

For each champion kill cluster:

```ts
const fight = clusterKillsWithin(15_000);

const playerParticipation = {
  playerKillOrAssist: didPlayerGetKillOrAssist(fight),
  playerDied: didPlayerDie(fight),
  playerNearbyAtFightStart: wasPlayerNearby(fight.start, participantId),
  playerNearbyAtFightEnd: wasPlayerNearby(fight.end, participantId),
  playerDamageInDeathEvents: summarizePlayerDamageInFight(fight)
};
```

Candidate tags:

```ts
[
  "present_for_fight",
  "late_to_fight",
  "absent_from_fight",
  "died_before_fight",
  "cleaned_up_after_fight",
  "high_damage_losing_fight",
  "low_damage_death",
  "front_to_back_participation_possible",
  "isolated_from_team"
]
```

## Lane Pressure Parser

Lane pressure evidence is most useful before 14 minutes.

At each minute:

```ts
const playerFrame = frame.participantFrames[playerId];
const laneOpponentFrames = resolveLaneOpponents(playerPosition, teamPosition);

const deltas = {
  csDelta,
  xpDelta,
  goldDelta,
  levelDelta,
  platesTakenByTeam,
  platesLostByTeam,
  deaths,
  recallsInferred
};
```

Candidate tags:

```ts
[
  "lane_cs_lead",
  "lane_cs_deficit",
  "xp_lead",
  "xp_deficit",
  "plate_conversion",
  "plate_loss_after_death",
  "pressure_without_conversion",
  "crash_or_reset_possible",
  "repeat_gank_same_lane"
]
```

## Vision Parser

Timeline data has ward placed and ward killed events. Match summary has aggregate vision stats.

Evidence inputs:

- Ward placed timestamps.
- Ward killed timestamps.
- Vision score.
- Control wards placed.
- Wards killed.
- Objective and death timing near ward gaps.

Candidate tags:

```ts
[
  "low_vision_activity",
  "objective_without_recent_vision",
  "death_after_no_recent_ward",
  "control_ward_missing",
  "vision_denial_success",
  "support_vision_gap",
  "carry_no_defensive_ward_before_push"
]
```

The timeline alone does not show full fog of war. Vision tags should be review prompts, not certainty.

## Example Output

```ts
{
  matchId: "NA1_123",
  puuid: "user-puuid",
  participantId: 4,
  parserVersion: "game-parser-0",
  parsedAt: "2026-06-08T12:00:00.000Z",
  evidence: [
    {
      id: "NA1_123:user-puuid:tempo_conversion:1251315",
      matchId: "NA1_123",
      puuid: "user-puuid",
      participantId: 4,
      championName: "Ashe",
      playerRole: "BOTTOM",
      category: "tempo_conversion",
      timestamp: 1251315,
      windowStart: 1251315,
      windowEnd: 1341315,
      tags: [
        {
          id: "clean_conversion",
          confidence: 0.9,
          params: {
            gains: ["dragon", "bot_tower", "top_tower"]
          }
        },
        {
          id: "overstay_after_conversion",
          confidence: 0.8,
          params: {
            millisecondsAfterObjective: 22538
          }
        }
      ],
      facts: {
        teamGains: ["dragon", "bot_tower", "top_tower"],
        playerDiedAfterGains: true
      },
      reviewQuestions: [
        "What did the team gain from this play?",
        "After the objective and towers, was the next action reset, rotate, or continue?"
      ],
      confidence: 0.85,
      sourceEventIds: ["event-148", "event-151", "event-155"],
      createdAt: "2026-06-08T12:00:00.000Z"
    }
  ],
  warnings: []
}
```

## Status Interaction

The parser writes only parsed output and parser warnings. Match-level progress is represented by ingestion status:

- `raw_data_available` before parsing starts.
- `parsing` while deterministic output is being created.
- `parsed` after output is stored.
- `parse_failed` when deterministic parsing cannot complete.
- `unsupported` when the queue or data shape should not be parsed yet.

## Non-Goals

This planning pass does not include:

- AI-generated coaching as parser output.
- Video, replay, or fog-of-war reconstruction.
- Champion-specific coaching rules.
- Runtime code changes.
- Final ranking of evidence in the UI.
- Inferring player intent from match data.
