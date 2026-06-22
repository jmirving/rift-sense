# Agent Operating Rules

## Default Git / Worktree Workflow

Agents must assume that all non-trivial development work happens in a dedicated git worktree, not in the main repository checkout.

A task is non-trivial if it may involve any of the following:

* editing more than one file
* changing app behavior
* changing tests
* running migrations
* touching generated data, fixtures, or snapshots
* making commits
* investigating an issue with uncertain scope

For non-trivial work, the agent must first verify the current git context:

```bash
git rev-parse --show-toplevel
git branch --show-current
git worktree list
git status --short
```

If the agent is already inside a dedicated task worktree on an appropriate non-main branch, continue.

If the agent is in the main checkout, or on `main`, `master`, `develop`, or another shared integration branch, the agent must stop before editing files and tell the user that the task should be run from a dedicated worktree.

Preferred worktree setup from the main checkout:

```bash
git fetch --all --prune
git status
git worktree add ../<repo>-<short-task-name> -b codex/<short-task-name>
cd ../<repo>-<short-task-name>
```

After entering the worktree, the agent may proceed.

## Branch Naming

Use short, descriptive task branches:

```text
codex/review-page-cleanup
codex/evaluator-fixtures
codex/remove-dead-setup-route
codex/dashboard-readiness-copy
```

Do not work directly on `main`, `master`, `develop`, or release branches unless the user explicitly instructs otherwise.

## Scope Discipline

The worktree is a task sandbox, not permission to make broad unrelated changes.

Agents must:

* keep changes scoped to the requested task
* avoid drive-by refactors
* avoid unrelated copy, route, formatting, or dependency changes
* preserve existing behavior unless explicitly asked to change it
* update tests only for behavior affected by the task
* avoid modifying secrets, `.env` files, local database files, or user-specific machine config

## Before Committing

Before committing, the agent must summarize:

1. files changed
2. behavior changed
3. tests run
4. risks or follow-up items
5. anything intentionally left out

The agent must not merge back to `main`. Merging is a user decision.

## Cleanup

The agent must not delete the worktree unless the user explicitly asks.

Suggested cleanup after the user has merged or rejected the work:

```bash
git worktree remove ../<repo>-<short-task-name>
git branch -d codex/<short-task-name>
```
