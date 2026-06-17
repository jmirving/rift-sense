# RiftSense Review Loop Direction

## Product scope

RiftSense currently contains five unfinished product areas:

1. Goal Coach
2. Match Review
3. Evidence Engine
4. Team Focus
5. Insights / Content

Near-term viability should prioritize the match review loop:

Recent match → match state → deterministic evaluation → guided review plan → user-reviewed evidence → goal updates.

## Product rules

### Deterministic output is not final truth

Programmatic match tags must be treated as detected signals or candidates.

Use language like:

* Detected signal
* Candidate
* Possible
* Flagged because

Avoid language that presents uncertain tags as final conclusions.

### Separate facts, signals, and reviewed conclusions

Raw facts are directly observed data:

* Death time
* Killed by
* Assisted by
* Victim level
* Killer level
* Nearby enemies
* Queue, champion, role, result, KDA

Detected signals are deterministic interpretations:

* Possible unsupported death
* Objective-window candidate
* Enemy level-up timing candidate
* Multi-enemy nearby candidate
* Killer level advantage candidate

Reviewed conclusions require user confirmation:

* Confirmed objective setup death
* Dismissed level-up timing candidate
* Confirmed unsupported positioning
* Not preventable
* Unsure

### Only reviewed evidence updates coaching state

Goal progress, weekly targets, confidence, trends, and coaching conclusions should come from reviewed evidence.

Unreviewed deterministic candidates may suggest what to inspect, but they should not update progress.

### Dashboard should be honest

When no reviewed games exist, the dashboard should say so.

Do not show fake progress, fake weekly target state, fake insights, or fake confidence from onboarding or unreviewed deterministic candidates.

### Team Focus and Insights are secondary

Until Team Focus and Insights are connected to reviewed evidence, they should either be hidden or clearly labeled as seeded/static/empty.

