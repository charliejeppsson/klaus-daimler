# klaus-daimler

<p align="center">
  <img src="docs/klaus.jpg" alt="Klaus Daimler from The Life Aquatic" width="320">
</p>

Klaus Daimler is a coding agent. He plans the milestone. He implements the issues. He reviews the pull requests. He runs as many parallel agents as you tell him to, each in its own tmux pane for full visibility and control. Yes, he has heard of Ralph Wiggum. He would rather not discuss Ralph Wiggum. He wears a red beanie. He will not let you down.

- `klaus plan` — TBD
- `klaus implement` — picks issues labeled `ready-for-agent`, dispatches N parallel Claude Code agents into a git worktree per issue, each with its own tmux pane for full visibility and control. Flips the issue label to `ready-for-review` once a PR is open.
- `klaus review` — picks issues with an open PR labeled `ready-for-review`, runs N Claude Code reviewer agents that each post one `COMMENT` review, and flips the issue to `reviewed-by-agent` for a human to merge.

Named after [Klaus Daimler](https://en.wikipedia.org/wiki/The_Life_Aquatic_with_Steve_Zissou), the honorable first mate of the Belafonte. You are the captain. Klaus is your first mate.

```
issue: ready-for-agent (handled manually until plan workflow is implemented)
  └─ klaus implement → opens PR → issue: ready-for-review
       └─ klaus review → posts COMMENT review → issue: reviewed-by-agent
            └─ human merges
```

## Prerequisites

Klaus needs a few things on board before he sails:

- Node 22+
- `gh` (authenticated against the target repo)
- `git`, `tmux`
- `claude` CLI (Claude Code) on `PATH`, with `ANTHROPIC_API_KEY` set

## Install

Klaus is a CLI you run from inside the target repo.

```sh
# global install (recommended for repeated use)
pnpm add -g klaus-daimler   # or: npm i -g klaus-daimler

# or as a project dev dep, then invoke through your package manager
pnpm add -D klaus-daimler
pnpm exec klaus implement --milestone <name>
```

## Quick start

```sh
# in the target repo
gh api repos/:owner/:repo/milestones -f title=v0.1
gh label create ready-for-agent --color 0e8a16
gh label create needs-info      --color fbca04
gh issue create --milestone v0.1 --label ready-for-agent --title "..." --body "..."

klaus implement --milestone v0.1
```

Klaus boots a tmux session named `klaus`, prints the plan, and asks `Set sail, Captain? [y/N]`. He has read the labels. He has read the blockers. He waits for your orders.

## Setup

Before Klaus sails, in the target repo:

1. Create a **milestone** matching the `--milestone` name you'll pass.
2. Create the **`ready-for-agent`** and **`needs-info`** labels. Klaus auto-creates the two lifecycle labels (`ready-for-review`, `reviewed-by-agent`) himself.
3. File issues, optionally with a `## Blocked by` section (see below), and label the ones an agent should pick up `ready-for-agent`.
4. Add `.klaus/` to `.gitignore`. That is where Klaus keeps the worktrees.

## Usage

Run from the root of a git repo with `gh` configured.

```sh
klaus implement --milestone <name> [--parallel N] [--skip-plan-confirmation]
klaus review    --milestone <name> [--parallel N] [--skip-plan-confirmation]
```

| Flag                       | Default | Purpose                                                                            |
| -------------------------- | ------- | ---------------------------------------------------------------------------------- |
| `--milestone <name>`       | —       | Required. Milestone whose issues Klaus picks up.                                   |
| `--parallel N`             | `1`     | Dispatch up to N agents concurrently.                                              |
| `--skip-plan-confirmation` | `false` | Skip the interactive `Set sail, Captain? [y/N]` Klaus shows after the plan is printed. |

Both commands boot a tmux session named `klaus` with a `controller` window (live log) and an `agents` window (one tiled pane per active worktree). `Ctrl-b 0` returns to the controller; `Ctrl-b 1` jumps to agents.

> **Cost:** `--parallel N` runs N concurrent Claude Code sessions against your API key. Start with the default before turning it up, Captain.

### Issue body convention

Klaus reads `## Blocked by` sections to order issues:

```markdown
## Blocked by

#42 — needs the new schema
#7 (soft) — prefer to merge after this
```

Klaus will not start an issue whose hard blockers are still open. Soft blockers only nudge the order in which he picks issues up.

## What Klaus creates on disk

- `.klaus/worktrees/issue-<n>-<slug>/` — implementer worktrees on branch `agent/issue-<n>-<slug>`.
- `.klaus/review-worktrees/pr-<n>-issue-<m>-<slug>/` — detached reviewer worktrees.
- `.klaus/runs/<YYYY-MM-DD-HHMMSS>/` — per-run prompt files and control logs.

## Configuration

All configuration is via environment variables.

| Variable                          | Default              | Purpose                                                                 |
| --------------------------------- | -------------------- | ----------------------------------------------------------------------- |
| `KLAUS_CONVENTIONS_PATH`          | _(unset)_            | Path to a markdown file injected as `{{CONVENTIONS}}` into the implementer and reviewer prompts. |
| `KLAUS_LABEL_READY_FOR_AGENT`     | `ready-for-agent`    | Marks an issue as ready for the implementer.                            |
| `KLAUS_LABEL_NEEDS_INFO`          | `needs-info`         | Causes the implementer to skip an issue.                                |
| `KLAUS_LABEL_READY_FOR_REVIEW`    | `ready-for-review`   | Set after the implementer opens a PR; consumed by the reviewer.         |
| `KLAUS_LABEL_REVIEWED_BY_AGENT`   | `reviewed-by-agent`  | Set after the reviewer posts a comment review.                          |

```sh
export KLAUS_CONVENTIONS_PATH=docs/conventions.md
export KLAUS_LABEL_READY_FOR_AGENT=agent-ready
klaus implement --milestone v0.2
```

## Troubleshooting

- **`tmux session 'klaus' already exists`** — a prior run is still up. Attach with `tmux attach -t klaus`, or end it: `tmux kill-session -t klaus`.
- **No issues dispatched** — Klaus only picks up issues that are open, in the named milestone, labeled `ready-for-agent`, and not labeled `needs-info`. Check with `gh issue list --milestone <name> --label ready-for-agent`.
- **Stale worktrees** — if Klaus was killed mid-run, `.klaus/worktrees/` may have leftovers. Remove with `git worktree remove .klaus/worktrees/<dir> --force`.
- **`gh` not authenticated** — `gh auth status`, then `gh auth login`.
- **`klaus review` hits GitHub 422 `"An internal error occurred, please try again."`** — most often triggered by an inline comment anchored in a file the PR rewrites end-to-end (every original line `-`, every new line `+`). GitHub's diff-position resolver bails out with a generic 422 instead of a structured field error, even though the `line`/`side` combo is valid. **Workaround:** rebase to drop the full-rewrite commit, or remove inline comments anchored on the rewritten file.

## Contributing

Architecture, the per-issue state machine, and the planning algorithm are documented in [`docs/design.md`](docs/design.md). Klaus reads it before he changes course; you should too.

```sh
pnpm install
pnpm typecheck && pnpm test && pnpm build
```

> **Status:** v0.1.x, early. APIs and label names may shift. `klaus plan` is on the roadmap but not yet implemented.

## License

MIT.
