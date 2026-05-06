# klaus-daimler

A Ralph Wiggum-style coding agent that drives GitHub issues to PRs end-to-end. Klaus dispatches Claude Code agents into git worktrees inside a tmux session, watches for the PR they open, flips labels, and (separately) reviews the resulting PRs with a neutral comment review.

Named after [Klaus Daimler](https://en.wikipedia.org/wiki/The_Life_Aquatic_with_Steve_Zissou) — a loyal, capable second mate who just keeps doing the work.

## Prerequisites

- Node 22+
- `gh` (authenticated against the target repo)
- `git`
- `tmux`
- `claude` CLI (Claude Code) on `PATH`
- `ANTHROPIC_API_KEY` (or whatever `claude` is configured to use)

## Install

One-shot:

```sh
npx klaus-daimler implement --milestone v0.1
```

As a project dev dependency:

```sh
pnpm add -D klaus-daimler
# then
klaus implement --milestone v0.1
```

## Usage

Run from the root of a git repo with `gh` configured.

```sh
klaus implement --milestone <name> [--parallel N] [--skip-plan-confirmation]
klaus review    --milestone <name> [--parallel N] [--skip-plan-confirmation]
```

- `implement` — finds open issues in `<milestone>` labeled `ready-for-agent`, plans a dependency-aware dispatch order, opens a git worktree per issue, and runs Claude Code against it. When a PR is detected, the issue is flipped to `ready-for-review`.
- `review` — finds open issues in `<milestone>` labeled `ready-for-review` with an open PR, opens a detached review worktree, and runs Claude Code as a neutral PR reviewer that posts one `COMMENT` review via `gh api`. The issue is then flipped to `reviewed-by-agent`.

Both commands boot a tmux session named `klaus` with a `controller` window (live log) and an `agents` window (one tiled pane per active worktree). Ctrl-b 0 returns to the controller; Ctrl-b 1 jumps to agents.

### Issue body convention

Klaus reads `## Blocked by` sections to order issues:

```markdown
## Blocked by

#42 — needs the new schema
#7 (soft) — prefer to merge after this
```

Hard blockers gate dispatch; soft blockers only influence ordering within a wave.

## Configuration

All configuration is via environment variables.

| Variable                          | Default              | Purpose                                                                 |
| --------------------------------- | -------------------- | ----------------------------------------------------------------------- |
| `KLAUS_CONVENTIONS_PATH`          | _(unset)_            | Path (absolute or relative to the repo root) to a markdown file injected as `{{CONVENTIONS}}` in the implementer and reviewer prompts. If unset, the conventions block renders empty. |
| `KLAUS_LABEL_READY_FOR_AGENT`     | `ready-for-agent`    | Label that marks an issue as ready for the implementer.                 |
| `KLAUS_LABEL_NEEDS_INFO`          | `needs-info`         | Label that causes the implementer to skip an issue.                     |
| `KLAUS_LABEL_READY_FOR_REVIEW`    | `ready-for-review`   | Label set after the implementer opens a PR; consumed by the reviewer.   |
| `KLAUS_LABEL_REVIEWED_BY_AGENT`   | `reviewed-by-agent`  | Label set after the reviewer posts a comment review.                    |

Example: a project with custom labels and a conventions file:

```sh
export KLAUS_CONVENTIONS_PATH=docs/conventions.md
export KLAUS_LABEL_READY_FOR_AGENT=agent-ready
export KLAUS_LABEL_READY_FOR_REVIEW=agent-pr-open
klaus implement --milestone v0.2
```

## What Klaus creates on disk

- `.klaus/worktrees/issue-<n>-<slug>/` — implementer worktrees on branch `agent/issue-<n>-<slug>`.
- `.klaus/review-worktrees/pr-<n>-issue-<m>-<slug>/` — detached reviewer worktrees.
- `.klaus/runs/<YYYY-MM-DD-HHMMSS>/` — per-run prompt files and control logs.

These are created under the repo root and intentionally not git-ignored by Klaus itself — add `.klaus` to your `.gitignore` if you want.

## License

MIT.
