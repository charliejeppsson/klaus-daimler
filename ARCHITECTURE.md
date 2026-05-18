# Klaus Architecture

Klaus is a local TypeScript CLI that drives GitHub milestone issues through selected coding-agent CLI sessions. Controller Klaus is deterministic: it schedules eligible work, creates local worktrees, launches agents in tmux panes, watches GitHub for terminal outcomes, mutates lifecycle labels, and cleans up local state.

## File Structure

```txt
src/
  main.ts             stable executable shim for the package bin
  cli/                argument parsing, tmux bootstrap, workflow dispatch, summaries
  workflows/
    implement/        Implementer Klaus workflow
    review/           Reviewer Klaus workflow
    plan/             reserved for the future Planner Klaus workflow; not tracked yet
  controller/         shared deterministic Controller Klaus mechanics
    scheduler.ts      blocked-by parsing and dispatch ordering
  shell/              coding-agent, gh, git, and tmux shell boundaries
  prompting/          prompt loading and rendering

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

The source layout is workflow-first. Each Klaus hat gets a directory under `src/workflows/` once it has executable behavior. `workflows/plan/` is reserved for Planner Klaus and should not be used for Controller Klaus scheduling helpers.

Controller Klaus mechanics that are shared across workflows live in `src/controller/`. The current `scheduler.ts` module is deterministic dispatch ordering: it parses `## Blocked by`, classifies blocker state, and orders issues for the implement workflow. It is not Planner Klaus.

External command boundaries live in `src/shell/` because they shell out to coding-agent CLIs, `gh`, `git`, and `tmux`.

## Application Architecture

```txt
GitHub milestone
  -> open issues + labels
  -> Controller Klaus
      -> deterministic scheduler
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
- apply skip rules and blocker scheduling
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
- [ADR-5: Deterministic blocked-by scheduling](docs/adr/ADR-5-deterministic-blocked-by-scheduling.md)
- [ADR-6: Controller owns labels and session lifecycle](docs/adr/ADR-6-controller-owns-labels-and-session-lifecycle.md)
- [ADR-7: Repo conventions are injected into agent prompts](docs/adr/ADR-7-repo-conventions-are-injected-into-agent-prompts.md)
- [ADR-8: Grouped workflow source layout](docs/adr/ADR-8-grouped-workflow-source-layout.md)
