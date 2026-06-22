# Review Quality Regression Tests

`tests/review-quality` is a deterministic regression suite for RiftSense review quality. It is not a perfect League coaching judge. The goal is to catch broad regressions in the evaluator plus review-plan output before they require manual QA across many personas.

The tests use synthetic Riot-shaped match summary and timeline fixtures, then run the real deterministic evaluator and `buildMatchReviewPlan(review)`. They do not call the Riot API, require auth, connect to Postgres, or depend on saved local match rows.

The suite checks role and goal fit with semantic assertions instead of full prose snapshots. Examples include bot 2v2 lane deaths not becoming generic collapses, top ganks not using bot/ADC language, and jungle objective deaths surfacing objective evidence and an objective replay question.

Current limitation: skill level is not part of `buildMatchReviewPlan`, so skill-specific coaching quality cannot be truly verified until review context includes skill or rank.

Current limitation: farm goals currently appear to rely mostly on death-derived review moments unless farm, economy, or wave evidence exists in the review input.
