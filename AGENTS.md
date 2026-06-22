# RiftSense Agent Instructions

## Operation Rules
Do not edit files when running from the main checkout. For any implementation task, use a dedicated worktree first. Follow `WORKTREES.md` for the required worktree workflow.

## Response Efficiency

- Be concise by default.
- Do not restate the task unless needed to clarify a blocker.
- Do not provide long summaries unless explicitly requested.
- Prefer the smallest useful status or final result: what changed, blockers, and exact next action if blocked.
- Keep non-code responses under 150 words unless the user asks for more detail.
- Avoid narrating routine exploration, reasoning, or implementation details when the user is not required to act.

## Repository Discovery

- Minimize repository exploration.
- Do not scan unrelated directories or read large numbers of files unless necessary.
- Prefer the nearest existing pattern and extend it.
- Reuse established project conventions instead of searching for alternatives.
- Stop exploring once the relevant implementation path is clear.

## Failure Behavior

- Do not repeatedly retry the same failing approach.
- After two failed attempts on the same issue, stop and report the smallest useful blocker.
- Do not invent fallback architectures unless explicitly requested.
- If required information is missing and cannot be discovered locally, ask a concise clarifying question.

## Completion Workflow

- When implementation work is complete, commit and push to `main` unless the user says otherwise.

## Product Copy

- Do not add user-facing text whose only purpose is to explain design intent, product positioning, or why the interface exists.
- Avoid sales-pitch phrasing such as "so review work connects to a concrete target", "with less friction", or similar subtext.
- UI copy should describe the user action, current state, required input, or result. Prefer labels like "Active goals", "Filter content", "Save setup", and "Review signals".
- Keep rationale and product/design explanation in docs or specs, not in runtime UI.
