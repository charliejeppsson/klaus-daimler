# Klaus Architecture

Klaus is a local TypeScript CLI that drives GitHub milestone issues through Claude Code sessions. Controller Klaus is deterministic: it plans eligible work, creates local worktrees, launches Claude Code in tmux panes, watches GitHub for terminal outcomes, mutates lifecycle labels, and cleans up local state.

## File Structure

```txt
src/
  main.ts        CLI parsing, tmux bootstrap, workflow dispatch
  implement.ts   implementer workflow
  review.ts      reviewer workflow
  planner.ts     blocked-by parsing and topological planning
  semaphore.ts   concurrency primitive
  github.ts      GitHub CLI shell boundary
  git.ts         git worktree and branch shell boundary
  tmux.ts        tmux shell boundary
  prompts.ts     prompt loading and rendering

prompts/
  implementer.md  prompt for Implementer Klaus
  reviewer.md     prompt for Reviewer Klaus

docs/
  adr/           durable architectural decisions
  agents/        guidance for local engineering skills
  proposals/     future or unsettled designs

.klaus/
  worktrees/          gitignored implementer worktrees
  review-worktrees/   gitignored reviewer worktrees
  runs/<timestamp>/   gitignored rendered prompts and control logs
```

The source layout is workflow-first. `implement.ts` and `review.ts` contain the top-level application flows. External command boundaries are factored into small sibling modules.

## Application Architecture

```txt
GitHub milestone
  -> open issues + labels
  -> Controller Klaus
      -> deterministic planner
      -> git worktrees
      -> rendered prompts
      -> tmux panes
          -> Implementer Klaus
          -> Reviewer Klaus
      -> GitHub PR/review polling
      -> lifecycle label transitions
```

Controller Klaus owns the deterministic loop:

- discover eligible issues and pull requests with `gh`
- apply skip rules and blocker planning
- create worktrees and run directories
- render prompts with injected repo conventions
- launch Implementer Klaus and Reviewer Klaus in tmux
- detect pull requests and comment reviews
- flip lifecycle labels and clean up local worktrees

Implementer Klaus owns one issue-to-PR task. Reviewer Klaus owns one PR-review task. Agents do not mutate lifecycle labels directly.

## Runtime Flows

`klaus implement --milestone <name>`:

1. List open milestone issues labeled `ready-for-agent`.
2. Parse `## Blocked by` sections and order runnable issues.
3. Skip issues with `needs-info`, open matching PRs, or unsafe existing worktrees.
4. Create one implementer worktree per dispatched issue.
5. Launch Implementer Klaus in a tmux pane.
6. Detect the opened PR, flip the issue to `ready-for-review`, close the pane, and clean up the local worktree.

`klaus review --milestone <name>`:

1. List open milestone issues labeled `ready-for-review`.
2. Find each matching open PR by branch.
3. Create one detached review worktree per PR.
4. Launch Reviewer Klaus in a tmux pane.
5. Detect the new comment review, flip the issue to `reviewed-by-agent`, close the pane, and clean up the review worktree.

## Architectural Decisions

- [ADR-1: Workflow-first controller layout](docs/adr/ADR-1-workflow-first-controller-layout.md)
- [ADR-2: GitHub issues and labels as workflow state](docs/adr/ADR-2-github-issues-and-labels-as-workflow-state.md)
- [ADR-3: Git worktrees for agent isolation](docs/adr/ADR-3-git-worktrees-for-agent-isolation.md)
- [ADR-4: Tmux panes for interactive agent sessions](docs/adr/ADR-4-tmux-panes-for-interactive-agent-sessions.md)
- [ADR-5: Deterministic blocked-by planning](docs/adr/ADR-5-deterministic-blocked-by-planning.md)
- [ADR-6: Controller owns labels and session lifecycle](docs/adr/ADR-6-controller-owns-labels-and-session-lifecycle.md)
- [ADR-7: Repo conventions are injected into agent prompts](docs/adr/ADR-7-repo-conventions-are-injected-into-agent-prompts.md)
