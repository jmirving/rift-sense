# Game Data Ingestion

## Purpose

RiftSense needs a lightweight path for discovering recent League games, storing the raw data needed for repeatable parsing, and exposing progress without making the user wait for every game to finish.

This document covers when new game data is fetched, how many games are discovered and parsed, what raw data is stored, and how parsing status is represented.

## When RiftSense Gets New Game Data

RiftSense should check for new game data when:

1. A user links or refreshes their Riot account through Nexus.
2. An authenticated user opens RiftSense.
3. A user opens a match history, review, or goal evidence surface.
4. A user manually selects refresh for recent games.
5. A scheduled server process runs, if one exists later.

The first implementation does not require a dedicated worker. Request-triggered discovery is acceptable as long as it records status and returns before all parsing is complete.

## Discovery and Parse Limits

Use small limits so page loads stay predictable and Riot calls remain bounded.

```ts
const RECENT_MATCH_LOOKUP_LIMIT = 10;
const MAX_NEW_MATCHES_TO_QUEUE_PER_REFRESH = 5;
const MAX_MATCHES_TO_PARSE_INLINE = 1;
```

Behavior:

1. Fetch up to 10 recent match IDs for the linked PUUID.
2. Compare those IDs with stored match records.
3. Create records only for matches that are not already parsed, pending, failed, or unsupported for that user.
4. Queue at most 5 newly discovered matches per refresh.
5. Parse at most 1 match inline when the current request needs immediate content.
6. Leave the rest as pending parse work.

The newest game should be parsed first unless an existing pending item is already in progress.

## Non-Blocking User Flow

Parsing should not block the rest of RiftSense.

The UI can show partial readiness:

```ts
type RecentGameEvidenceState =
  | "riot_account_not_linked"
  | "riot_access_not_configured"
  | "checking_recent_games"
  | "recent_games_unavailable"
  | "games_found_parsing"
  | "some_games_ready"
  | "all_recent_games_ready"
  | "parse_failed_retry_available";
```

Expected behavior:

- If no game is parsed yet, show the user that games are being checked or parsed.
- If at least one game is parsed, show available evidence immediately.
- If more games are pending, show the count still being prepared.
- If one game fails, keep other games available and expose retry for the failed game.

Example copy:

```txt
1 game ready. 4 parsing.

Recent games are still parsing.

Recent games are unavailable until Riot access is configured.
```

## Stored Raw Data

RiftSense should store enough raw data to re-run deterministic parsing without calling Riot again.

Minimum raw data:

- Match summary JSON.
- Match timeline JSON.
- Match ID.
- User PUUID.
- User participant ID for that match.
- Champion, team, role, queue, and game timestamp metadata from the summary.

Suggested split:

```ts
type RawMatchData = {
  matchId: string;
  summaryJson: unknown;
  timelineJson: unknown;
  fetchedAt: string;
};

type UserMatchPerspective = {
  matchId: string;
  puuid: string;
  participantId: number;
  championName: string;
  teamId: number;
  teamPosition?: string;
  parseStatus: MatchParseStatus;
  parseStatusReason?: string;
  parsedAt?: string;
};
```

Raw match data can be shared by match ID. User perspective data is keyed by `matchId + puuid` because the same game can produce different evidence for different RiftSense users.

## Parsing Status

Represent status per user perspective, not only per raw match, because parser output depends on the player being reviewed.

```ts
type MatchParseStatus =
  | "discovered"
  | "fetching_summary"
  | "fetching_timeline"
  | "raw_data_available"
  | "parsing"
  | "parsed"
  | "parse_failed"
  | "unsupported";
```

Suggested record shape:

```ts
type RiftSenseMatch = {
  matchId: string;
  puuid: string;
  gameCreation?: number;
  gameStartTimestamp?: number;
  gameEndTimestamp?: number;
  gameDurationSeconds?: number;
  queueId?: number;
  gameMode?: string;
  championName?: string;
  teamPosition?: string;
  parseStatus: MatchParseStatus;
  parseStatusReason?: ParseFailureReason;
  rawTimelineStored: boolean;
  rawSummaryStored: boolean;
  parsedAt?: string;
  createdAt: string;
  updatedAt: string;
};
```

Failure reasons should be explicit enough for retry and debugging:

```ts
type ParseFailureReason =
  | "missing_summary"
  | "missing_timeline"
  | "participant_not_found"
  | "unsupported_game_mode"
  | "invalid_timeline_shape"
  | "parser_exception";
```

## Refresh Cooldown

Avoid repeated Riot calls from page refreshes.

```ts
const USER_RECENT_MATCH_REFRESH_COOLDOWN_MS = 5 * 60 * 1000;
```

If a user refreshes during the cooldown, show the last checked time and reuse stored status. A force refresh can be added later for operator workflows.

## Failure Handling

Failures should be isolated to one match perspective.

If one match fails:

- Mark that perspective as `parse_failed`.
- Preserve raw data if it was fetched.
- Continue parsing other queued matches.
- Allow retry.
- Log the failure reason.

Unsupported queues or malformed data should not block the whole recent-games surface.

## Non-Goals

This planning pass does not include:

- A full background job architecture.
- Bulk backfill of a user's full match history.
- Repeated Riot polling while the user is idle.
- Deleting raw data before parser outputs are trusted.
- AI interpretation during ingestion.
- Runtime code changes.

## Initial Implementation Path

1. Resolve linked Riot PUUID from Nexus user context.
2. Fetch recent match IDs with the configured limit.
3. Store discovered match perspectives.
4. Fetch summary and timeline for newly queued matches.
5. Store raw match data by match ID.
6. Resolve the user participant perspective.
7. Parse the newest available match first.
8. Record parse status per match perspective.
9. Show partial results as soon as one match is parsed.
