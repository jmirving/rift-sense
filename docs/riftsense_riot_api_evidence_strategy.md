# RiftSense: Riot API Evidence Strategy for Goal Tracking

## Objective

Begin using Riot API data to provide evidence for goal tracking, while avoiding expensive or irrelevant match scans.

The goal is not to build a full analytics platform yet. The goal is to support the MVP loop:

**Goal → relevant recent games → evidence candidates → review/signals → insights → next action**

---

## Core Problem

A logged-in user may have an active goal like:

> ADC · Die Less

The app may provide suggestions to "review recent games" or have trending data, but how is this gathered? Getting all recent games is easy, but not every recent game is useful evidence.

Examples:

- A recent mid game does not help much for an ADC goal.
- A normal game may or may not be useful depending on the goal.
- A game from a week ago may be less useful if the goal was created today.
- A stomp, remake, off-role fill game, or ARAM may be misleading.
- Fetching and deeply analyzing 20 matches on every page load is wasteful.

RiftSense needs a relevance strategy before it needs a huge analytics pipeline.

---

## Required Account Assumption

The logged-in user should have Riot identity available through the Nexus user scope.

Minimum needed:

- Riot `puuid`
- game name / tag line if available
- region / routing region
- preferred role(s), especially primary role

If the current Nexus-authenticated user does **not** store PUUID, note this as a blocker and add a linking flow or storage field.

**Note** use existing profile or other interface if it already exists, otherwise:
Recommended user profile shape:

```ts
interface NexusRiotIdentity {
  puuid: string;
  gameName?: string;
  tagLine?: string;
  platformRegion?: "NA1" | "EUW1" | "EUN1" | "KR" | string;
  routingRegion?: "americas" | "europe" | "asia" | "sea";
  verifiedAt?: string;
}
```

RiftSense should not ask for Riot credentials directly. It should use whatever Riot identity Nexus stores or provides.

---

## Riot API Data Sources

For MVP evidence, use Riot match history data:

1. Match IDs by PUUID
2. Match details by match ID
3. Participant data for the logged-in user

Useful match fields depend heavily on the goal but likely include:

- queue ID
- game creation / start time
- game duration
- champion played
- individual position / team position
- kills / deaths / assists
- total minions killed
- neutral minions killed
- vision score
- gold earned
- damage dealt
- items
- team result
- timeline data if added later

Timeline data is more expensive and should not be required for the first pass unless needed for specific signals.

---

## Match Relevance Rules

### Step 1: Start with a small match window

Do not fetch 20 full matches on every dashboard load.

Recommended initial flow:

1. Fetch recent match IDs, limit 8–10.
2. Check cache for already-known match details.
3. Fetch details only for uncached candidates until enough relevant matches are found.
4. Stop once the dashboard has 3–5 relevant matches or the candidate list is exhausted.

### Step 2: Match active goal role

For an ADC goal, prefer games where participant role/position maps to Bot/ADC.
**Note** this implies the ability for a user to position-specific goals. This is not currently a feature, do not implement it yet but develop with the idea of expanding to this feature later.

Acceptable mapping:

```text
Riot individualPosition/teamPosition: BOTTOM → ADC/Bot
```

Avoid showing off-role games as primary evidence unless no matching games exist.

If no role-matching games are found, show an empty/near-empty state:

```text
No recent ADC games found for this goal.
Play an ADC game, review manually, or widen filters.
```

### Step 3: Respect goal creation date

If a goal was created today, games before goal creation are less useful as progress evidence.

Recommended behavior:

- For progress metrics: prefer games after `goal.activeSince`.
- For baseline/context: optionally show older games separately.
- Do not mix older games into “this goal progress” without labeling them.

Example UI copy:

```text
No games since this goal was started.
Showing one recent ADC game as baseline only.
```

### Step 4: Queue relevance

Queue relevance should depend on goal and user/team context.

For solo improvement goals:

Recommended priority:

1. Ranked solo/duo
2. Ranked flex
3. Normal draft
4. Quickplay/blind/other SR queues
5. ARAM and special modes: exclude by default

For team/scrim goals:

- Riot API may not capture custom/scrim data reliably unless match IDs are provided.
- Manual review entries should remain first-class evidence.

For ADC mechanics or laning goals:

- A normal draft ADC game can still be useful.
- A ranked mid game is usually not useful.

For team objective goals:

- Flex, clash, custom, or manually tagged scrim data may be more relevant than solo queue.

### Step 5: Recency relevance

Recommended default lookback:

- Primary: games in the last 7 days
- Secondary fallback: last 14 days
- Baseline only: older than 14 days

Do not let old games silently drive current goal progress.

### Step 6: Quality filters

Exclude or down-rank games that are poor evidence:

- very short games / remakes
- off-role games
- non-Summoner’s Rift modes for SR goals
- games before the goal was active, unless used as baseline
- games where participant data is incomplete

---

## Evidence Types: Riot-Derived vs Manual

Riot API can directly provide some evidence, but not all of the user’s desired signals.

### Good Riot-derived signals

These can be computed from match detail without timeline/manual tagging:

- deaths count
- KDA
- CS/min
- gold/min
- damage share, if team totals are computed
- vision score
- champion played
- role/position
- queue type
- game result

### Weak Riot-derived signals

These may require timeline or extra logic:

- death timing
- CS at 10/15
- lane opponent comparison
- gold difference at 10/15
- damage taken before death
- objective presence/participation

### Manual or VOD-required signals

These should remain review tags for now:

- known-danger death
- overestimated trade strength
- losing trades you should win
- greeding wave and dying or losing tempo
- CS missed while present
- late objective arrival caused by bad wave assignment
- unclear fight/trade/give call

Riot data should help identify candidate games/moments, not pretend to know things it cannot know.

**NOTE** There is not currently a "Riot API Evidence" to "Goal" link. A Goal of "farm better" should take "CS at minute X" as a strong signal and not a weak signal. While, "die less" could use "CS at minute X" as evidence to support a claim of death consequences, but not as a strong signal itself. The concept of emperical data linking to specific goals needs to be implemented though whether or not it is required for this stage is something to be determined. Either implement the behavior or write a TODO doc to do so.

---

## Recommended MVP Evidence Flow

### 1. Dashboard loads active goal

Example:

```text
Goal: ADC · Die Less
Active since: 2026-05-08
Selected signals: known-danger death, bad trade read, greed wave death, CS missed while present
```

### 2. Server finds relevant recent matches

Algorithm:

```text
fetch recent match IDs for user PUUID, count 8–10
for each match ID:
  use cache if available
  otherwise fetch match details
  find participant by PUUID
  score relevance against active goal
keep top 3–5 relevant games
```

### 3. Server returns evidence candidates

Example:

```json
{
  "evidenceSource": {
    "type": "riot-api",
    "matchedGames": 3,
    "candidateGamesScanned": 8,
    "roleMatched": true,
    "confidence": "medium"
  },
  "candidateGames": [
    {
      "matchId": "NA1_...",
      "playedAt": "2026-05-08T02:00:00Z",
      "queue": "Ranked Solo/Duo",
      "champion": "Caitlyn",
      "role": "ADC",
      "result": "Loss",
      "kda": "3/6/5",
      "csPerMinute": 7.1,
      "relevanceReason": "ADC ranked game after goal start"
    }
  ]
}
```

### 4. Dashboard suggests review, not automatic certainty

Example:

```text
3 relevant ADC games found since this goal started.
Review deaths from your most recent Caitlyn loss.
```

or:

```text
No role-matching games since this goal started.
Play a ranked/flex ADC game or review manually.
```

**Note** Text should not be free-form. Make use of replaceable fields in pre-formatted strings. "# relevant <role> games found" and "Review <goal-item> from your most recent <character> <game-result>" etc. This should be true of nearly all text where possible. 

---

## Match Relevance Score

Use a simple score first. Do not over-engineer.

Example:

```ts
function scoreMatchForGoal(match, participant, goal) {
  let score = 0;

  if (goal.role === "ADC" && participant.position === "BOTTOM") score += 50;
  if (match.playedAt >= goal.activeSince) score += 25;
  if (isRankedSolo(match.queueId)) score += 15;
  if (isRankedFlex(match.queueId)) score += 10;
  if (isNormalDraft(match.queueId)) score += 5;
  if (match.durationMinutes >= 15) score += 10;

  if (isAramOrSpecialMode(match.queueId)) score -= 100;
  if (goal.role === "ADC" && participant.position !== "BOTTOM") score -= 50;
  if (match.playedAt < goal.activeSince) score -= 20;

  return score;
}
```

Suggested buckets:

```text
80+ = high relevance
50–79 = medium relevance
25–49 = low relevance / baseline
<25 = ignore by default
```

---

## Caching Requirements

Do not repeatedly fetch the same match details.

Cache:

- recent match ID list per PUUID + region + timestamp
- match details by match ID
- parsed participant summary by match ID + PUUID
- relevance results by active goal ID + match ID, if useful

Suggested cache policy:

- recent match IDs: 5–15 minutes
- match details: effectively permanent; match data does not change after processing
- relevance score: recomputable, but can be cached briefly

---

## UI Requirements

The dashboard should show evidence source context.

Examples:

```text
Based on 3 ranked ADC games since this goal started · Riot API · medium confidence
```

```text
No relevant games since this goal started · showing onboarding seed only
```

```text
Based on 1 normal draft ADC game · low confidence
```

```text
No Riot account linked · manual review only
```

The UI should not imply manual/VOD-level conclusions from Riot-only data.

Bad:

```text
You died to known threat 3 times.
```

Good:

```text
You had 6 deaths in your most recent ADC game. Review them for known-threat patterns.
```

**Note** Reminder to use pre-fabricated text patterns. These can be kept in a separate json file for retrieval if needed. They may be goal-specific in some cases but generalizable in others. Find a storage mechanism that makes sense, allows for easy retrieval/modification, etc.

---

## Handling Specific Edge Cases

### User has no PUUID

Show:

```text
Riot account not linked.
Link Riot through Nexus to use recent-game evidence, or continue with manual review.
```

Also log this as a product dependency:

> Nexus user scope must expose or store Riot PUUID for Riot evidence features.

### User has PUUID but no recent games

Show:

```text
No recent games found.
Play a game or add manual review evidence.
```

### User has recent games but wrong role

Show:

```text
Recent games found, but none match your ADC goal.
Found: Mid, Jungle. Play/review ADC games or widen filters.
```

### User has only normal games

Show:

```text
Found one normal draft ADC game. Using it as low-confidence practice evidence.
```

### Goal created today but recent game is a week old

Show:

```text
No games since this goal started.
Showing older ADC game as baseline only.
```

### Riot data conflicts with manual review

Manual review should win for qualitative signals.

Example:

- Riot says 6 deaths.
- Manual review says 2 known-danger deaths, 1 acceptable death, 3 mechanics/teamfight deaths.

Use manual tags for signal cards; use Riot data for game context.

---

## First-Pass Signals From Riot API

**Note** Be aware of and respect the Riot API developer token rate limits. Note: this is not a licensed product and thus does not have the higher token rate limits.

Start with safe, objective signals:

1. recent ADC games found
2. deaths per relevant game
3. CS/min
4. KDA
5. queue type
6. champion played
7. win/loss
8. game age
9. role match status

Do not automatically derive:

- known-danger death
- bad trade read
- greed wave death
- CS missed while present

Those require manual review, timeline analysis, or VOD context.

---

## Suggested API Shape

Add a server-side service like:

```text
server/riot/
  client.js
  match-history.js
  match-relevance.js
  participant-summary.js
  cache.js
```

Add a goal-evidence integration layer like:

```text
server/goal-dashboard/evidence-sources/riot.js
```

Possible endpoint:

```text
GET /api/home
```

should include Riot-derived evidence automatically for logged-in users when available.

Optional debug/demo endpoint:

```text
GET /api/demo/adc
```

could show seeded Riot-like candidate games without real Riot calls.

---

## Demo Routes

Demo routes should illustrate multiple states without requiring auth.

Recommended examples:

```text
/demo
/demo/adc
/demo/onboarding
/demo/no-riot-linked
/demo/no-recent-role-games
```

These should all use the same dashboard/onboarding components and payload shapes as logged-in routes.

Do not make `/demo` the only implementation path. Demo routes should be examples of reusable product states.

---

## Acceptance Criteria

Riot evidence MVP is complete when:

1. Logged-in user profile can provide or resolve Riot PUUID.
2. If PUUID is missing, dashboard shows a clear link/manual-review state.
3. Server fetches a small recent match ID window, not 20 full match details every load.
4. Match details are cached by match ID.
5. Matches are scored for relevance against the active goal.
6. ADC goals prioritize BOTTOM/ADC games.
7. Games before goal creation are not silently counted as progress.
8. Queue type and recency affect confidence.
9. Dashboard shows evidence source and confidence.
10. Riot-only data does not claim qualitative signals it cannot know.
11. Manual review evidence remains first-class and overrides qualitative signal interpretation.

---

Summary:

Preconditions:
- First verify whether the logged-in Nexus user scope exposes a Riot PUUID.
- If not, add a documented blocker/empty state and do not fake auth-derived Riot identity.

Goals:
- For logged-in users with PUUID, fetch a small recent match ID window, around 8–10 IDs.
- Use cached match details where available; do not fetch 20 full matches on every dashboard load.
- Parse participant data for the logged-in user.
- Score matches for relevance against the active goal, especially role match, recency, queue type, and goal activeSince.
- For ADC goals, prioritize BOTTOM/ADC games.
- Return top 3–5 relevant candidate games as evidence context.
- Add evidence source/confidence metadata to the goalDashboard payload.
- Do not automatically claim qualitative signals like known-danger death or bad trade read from Riot data alone.
- Suggest manual review when Riot data finds relevant games.

Edge states:
- no PUUID
- no recent games
- recent games but wrong role
- only normal games
- no games since goal start

Do not add generated AI content outside of minimal string fabrication.
Do not deeply analyze timelines in this first pass unless existing code already supports it.
Do not make /demo the only route. Demo states can include /demo/adc or /demo/no-riot-linked, but logged-in /api/home should be the real target.
```
