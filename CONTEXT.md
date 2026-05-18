# Klaus Context

Klaus is a local CLI that coordinates coding agents against a GitHub milestone. The project is a single-context repo: the product, controller, prompts, and workflow state all belong to this same context.

## Glossary

- **Klaus**: the product and overall agentic workflow system.
- **Controller Klaus**: the deterministic wrapper started by the `klaus` CLI. It plans work, creates worktrees, starts tmux panes, watches for terminal outcomes, mutates labels, and cleans up local state.
- **Implementer Klaus**: a selected coding-agent CLI session launched by Controller Klaus to turn one GitHub issue into a committed branch and pull request.
- **Reviewer Klaus**: a selected coding-agent CLI session launched by Controller Klaus to inspect one pull request and post one neutral comment-style review.
- **Target repo**: the git repository where `klaus` is run. Klaus assumes the current working directory is the target repo root.
- **Milestone**: the GitHub milestone selected with `--milestone`. It scopes both implementation and review workflows.
- **Issue blocker**: a `#N` reference in an issue body's `## Blocked by` section. Hard blockers prevent dispatch until closed; soft blockers only influence ordering.
- **Lifecycle labels**: labels used by Controller Klaus to move work through the workflow. `ready-for-agent` and `needs-info` are human-facing intake labels; `ready-for-review` and `reviewed-by-agent` are set by Controller Klaus.
- **Implementer worktree**: a git worktree under `.klaus/worktrees/` on an `agent/issue-<n>-<slug>` branch.
- **Reviewer worktree**: a detached git worktree under `.klaus/review-worktrees/` for inspecting a pull request branch.
- **Run directory**: a timestamped directory under `.klaus/runs/` containing rendered prompts and controller logs for one `klaus` invocation.

## Workflow

`klaus implement` reads open milestone issues labeled `ready-for-agent`, orders them by `## Blocked by`, launches Implementer Klaus sessions in isolated worktrees, and flips an issue to `ready-for-review` after a pull request appears.

`klaus review` reads open milestone issues labeled `ready-for-review`, finds the matching pull request branch, launches Reviewer Klaus in a detached worktree, and flips the issue to `reviewed-by-agent` after a new comment review is detected.

Agents do not mutate lifecycle labels directly. Controller Klaus owns label transitions and local worktree cleanup.
