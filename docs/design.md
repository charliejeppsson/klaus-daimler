# Klaus — issue-driven agentic coding workflows

A small home-built controller that walks a GitHub milestone of your choice and dispatches Claude Code agents for implementation and review. Klaus has two workflows: an implementer workflow for `ready-for-agent` issues and a reviewer workflow for `ready-for-review` pull requests.

## Requirements

1. Walk GitHub issues filtered by `--milestone <name>` (required) + `ready-for-agent` label.
2. **Plan pickup order from each issue's `## Blocked by` section.** Sequential mode picks issues in topological order. Parallel mode runs each wave of unblocked issues concurrently and re-plans after every wave.
3. Per issue: branch (worktree) → implement → test → PR.
4. Configurable parallelism. Default `--parallel 1` (sequential).
5. Each agent visible in its own tmux pane inside the `klaus` tmux session, including `--parallel 1`.

## Permissions

v1 uses Claude Code's **default permission mode** — every tool call surfaces an approval prompt. You approve manually in the agent's tmux pane. No `bypassPermissions`, no `--allowedTools` allowlist.

Consequence: parallelism > 1 is technically supported but painful — you'll be tabbing between panes approving prompts. Treat `--parallel 1` as the real operating mode until a proper sandbox lands.

Once a sandbox layer exists (Docker, sandbox-exec, or whatever the platform settles on), revisit and add `--permission-mode bypassPermissions` so the workflows can actually run unattended.

## Design

### Layout

Klaus opts out of the repo-wide DDD layering from `docs/conventions.md`. Each workflow has one real algorithm (the planner) and three I/O seams (`gh`, `git`, `tmux`); a `domain/application/infrastructure` split would create hypothetical seams that don't pay rent. Instead the layout is **flat workflow-first**: each workflow reads top-to-bottom in one file, and I/O modules sit alongside as siblings.

- `implement.ts` and `review.ts` each contain a complete workflow: planning, dispatch, pane orchestration, label transitions, and cleanup.
- `github.ts` / `git.ts` / `tmux.ts` are the I/O seams — every `gh`, git-worktree, or tmux call goes through them.
- `planner.ts` and `semaphore.ts` are the two pure pieces shared between workflows.
- `prompts.ts` reads templates from `scripts/klaus/prompts/*.md` and renders them.
- `main.ts` is a thin entry point: parse args, maybe bootstrap a tmux session, dispatch to the workflow.

### Stack

- **Driver**: TypeScript (`tsx scripts/klaus/main.ts`), reuses repo's existing tooling.
- **Per-issue agent**: interactive `claude "<prompt>"`, run inside the worktree's directory. Interactive (not `-p`) so prompt approvals work.
- **Isolation**: `git worktree add .klaus/worktrees/issue-<N>-<slug> -b agent/issue-<N>-<slug> main`. The slug is a 40-char-max kebab-case truncation of the issue title (e.g. `agent/issue-11-signal-lifecycle-expiresat-filter`) so branches are scannable at a glance.
- **Tiling**: tmux session `klaus`, shared `agents` window, one pane per concurrent agent. The outer CLI creates the session and auto-attaches before the inner workflow starts.
- **Bookkeeping**: per-run log dir at `.klaus/runs/<iso-ts>/`, prompt files for each agent, and a workflow control log. Per-call cost + token counts come from LangSmith (already wired for agent calls); no controller-side parsing.

### Per-issue state machine

```
queued ──▶ in-progress ──▶ pr-opened          (agent committed + opened PR)
                       └─▶ abandoned          (agent exited without opening a PR)
```

Skip rules on subsequent passes (so the implementer workflow is idempotent and resumable):

- An open PR with branch `agent/issue-<N>` exists → skip
- `needs-info` label present (set by you, not the agent) → skip
- Already on the in-progress list this run → skip

Routing post-exit: query `gh pr list --head agent/issue-<N>`. PR present → `pr-opened`. Absent → `abandoned`. The human handles abandoned issues directly (cancel was probably manual; just rerun if you want another attempt).

### Session lifecycle

Interactive `claude` doesn't exit on its own — when the model finishes a turn, it waits for the next input. Klaus therefore polls `gh pr list --head agent/issue-<N>` every 10s. When the PR appears it:

1. Flips the issue label `ready-for-agent` → `ready-for-review` (creating the label idempotently on first run).
2. Sends `SIGINT` to the claude child; escalates to `SIGTERM` after a 5s grace period.
3. Resolves the per-issue task and routes outcome.

The agent never touches labels or attempts to exit itself — both are Klaus controller concerns so the prompt stays focused on coding.

### Planning

Issue bodies in this repo follow a convention: a trailing `## Blocked by` section listing `#N` references with an optional `(soft)` qualifier, or `None - can start immediately.`

The planner is a code-level parser, not an LLM:

1. `gh issue list --milestone <name> --label ready-for-agent --json number,title,body` → array.
2. For each issue body, extract the `## Blocked by` section, regex `/#(\d+)(\s*\(soft\))?/g`, build a dependency map.
3. A blocker is **satisfied** when the referenced issue is closed (PR merged) — query state via `gh issue view <N> --json state`.
4. **Sequential mode**: topological sort by hard blockers; ties broken by issue number ascending. Soft blockers are treated as ordering hints (lower priority within the topological layer).
5. **Parallel mode**: each iteration computes the current wave (issues whose hard blockers are all satisfied), dispatches the wave concurrently up to `--parallel N`, then re-plans.

No LLM call. Deterministic, free, fast. If the convention drifts, the parser fails loudly rather than silently mis-ordering.

### Concurrency

`--parallel N` defaults to 1. The application semaphore caps in-flight implementer or reviewer targets — each target holds a tmux pane from spawn until Klaus detects the terminal outcome.

### Worktree lifecycle

- **Create**: `git worktree add .klaus/worktrees/issue-<N> -b agent/issue-<N> main` immediately before dispatch.
- **Pre-existence check**: if `.klaus/worktrees/issue-<N>` already exists, refuse to start that issue and print the path. Crashed-run residue should require a deliberate human decision.
- **Cleanup**: after an issue reaches `pr-opened`, remove its local worktree and delete its local `agent/issue-...` branch. The remote PR branch remains on GitHub for review. Abandoned runs keep their worktrees. At the start of every `klaus implement` invocation, scan `gh pr list --state merged --search "head:agent/issue-"` and remove stale merged worktrees/branches left behind by older runs.

### Tiling

```bash
tmux new-session -d -s klaus -n control "tail -f .klaus/runs/<ts>/control.log"
# per issue:
tmux new-window -t klaus: -n "i-<N>" -c "<worktree>" \
  "claude \"\$(cat $PROMPT_FILE)\" 2>&1 | tee .klaus/runs/<ts>/issue-<N>.log; \
   tmux wait-for -S klaus-issue-<N>; \
   exec zsh"
```

`exec zsh` at the end keeps the pane alive after abandoned exits so the user can inspect the worktree. Successful PR detection closes the pane before worktree cleanup. The controller's per-issue task blocks on `tmux wait-for klaus-issue-<N>` (no polling); when the wait-for fires, the agent has exited and Klaus queries GH state to route the outcome.

### What we deliberately don't build

- **No Docker.** Worktrees + the host's `pnpm` / `gh` / `node` work fine for a personal repo. UID juggling was the single biggest sandcastle time-sink.
- **No pre-implementation planner phase.** Triaged `ready-for-agent` issues are scoped to be self-contained; one implementer agent per issue is enough.
- **No CI auto-fix workflow.** If `pnpm test` is red the agent commits + opens a draft PR with the failing test output in the description. Human reviews.
- **No hosted dashboard.** Logs on disk, tmux for live view, LangSmith for any traced LLM calls.

## File layout

```
scripts/klaus/
  main.ts             # CLI parsing, tmux bootstrap, dispatch to workflow
  implement.ts        # implementer workflow top-to-bottom
  review.ts           # reviewer workflow top-to-bottom
  planner.ts          # blocked-by parsing + topological sort
  semaphore.ts        # concurrency primitive
  github.ts           # all gh shelling: types, zod schemas, label constants
  git.ts              # git worktrees + worktree path/slug computation
  tmux.ts             # tmux primitives + poll/grace constants
  prompts.ts          # template load + render
  prompts/
    implementer.md    # implementation task template
    reviewer.md       # PR review task template

.klaus/
  worktrees/          # gitignored
  review-worktrees/   # gitignored
  runs/<iso-ts>/      # gitignored, per-run logs + parsed cost summary
```

`.klaus/` is ignored by git (mirrors `.sandcastle/`'s pattern, but no Dockerfile, no main.ts, no compose files).

## CLI surface

```
klaus implement --milestone <name> [--parallel N] [--skip-plan-confirmation]
klaus review --milestone <name> [--parallel N] [--skip-plan-confirmation]
```

`--milestone` is required for both workflows — there is no default. Examples in this doc use `v0` because that's the current backlog, but Klaus has no v0-specific behaviour.

### Review bot

`klaus review --milestone <name>` lists open issues in the milestone with the `ready-for-review` label, derives each issue's `agent/issue-...` branch, and finds the matching open PR. Issues without an open PR are skipped with an explicit reason.

For each PR, Klaus creates a detached review worktree at `.klaus/review-worktrees/pr-<PR>-issue-<N>-<slug>`, builds a focused review prompt with the linked issue body and `docs/conventions.md`, and launches an interactive reviewer pane. The reviewer inspects local files plus `gh pr view` / `gh pr diff`, then posts exactly one comment-style GitHub review through the Create a pull request review API. That review can include one high-level body and up to 10 thoughtful inline comments on changed lines. It does not approve, request changes, merge, mutate labels directly, or attempt fixes.

After the reviewer exits or posts, Klaus verifies that a new comment review exists after the recorded start timestamp. On success it labels the issue `reviewed-by-agent` and removes the review worktree. On abandonment it preserves the review worktree and leaves labels unchanged.

## Per-issue agent prompt — outline

Single template, lean by design. The agent runs in a real worktree with full Read access — most context comes from files the agent reads on demand, not from inlined prose. The one exception is `docs/conventions.md`, which is inlined because it applies to every commit.

````markdown
# Task: Issue #<N>

<issue body verbatim from `gh issue view <N> --json title,body,labels,comments`>

# Working environment

- You are in a git worktree on branch `agent/issue-<N>`.
- Domain context: read `CONTEXT.md`.
- Architectural decisions: skim titles in `docs/adr/`; read any ADR that touches the area you're modifying.
- Issue tracker conventions: `docs/agents/issue-tracker.md`.

# Conventions (always apply)

<verbatim inline of docs/conventions.md>

# Approach

- Explore the codebase before coding. Pay attention to tests near what you're touching.
- Write a failing test first when adding behaviour.
- Run `pnpm typecheck && pnpm test && pnpm lint` before committing.

# Done

- Commit on the current branch with a focused message.
- Open a draft PR with the body in this exact format (brief — one or two sentences per section):

  ```markdown
  ## What

  <one sentence describing the change>

  ## Why

  <one or two sentences on the motivation; reference the issue's stated goal>

  ## How to validate

  <commands or steps a reviewer can run; if `pnpm test` is currently red, say so here and include the failing test names>

  Closes #<N>
  ```

- Use `gh pr create --draft --title "<commit subject>" --body "$(cat <<'EOF' … EOF)"` so the body renders cleanly.
- Then exit.
````

`prompts.ts` reads the prompt templates and splices in `docs/conventions.md`. The template otherwise points; it does not inline.

## Open questions

1. **Auto-merge on success?** Default no — PR opens ready-for-review, `klaus review` can add a neutral review comment, and a human decides. Could add a `--auto-merge` flag later that squash-merges if all checks pass.
2. **Retry policy for abandoned issues?** With manual approval, abandonment is almost always a deliberate human cancel. v1: take no automatic action — issue stays `ready-for-agent` and gets picked up next run. Revisit when unattended operation lands (sandbox + bypass-permissions).
3. **Per-issue cost cap?** `claude --max-budget-usd <amount>` exists as a built-in flag, but only with `-p`. Since v1 runs interactive `claude`, no controller-side cap. LangSmith captures spend; observe real numbers first, revisit alongside the sandbox work that re-enables `-p`.
4. **Resumability across machine restarts?** Worktrees + open PRs survive; in-progress agents do not. The skip rules above mean a re-run picks up cleanly. No state file needed.
5. **Where do the prompt templates live for editing?** `scripts/klaus/prompts/implementer.md` and `scripts/klaus/prompts/reviewer.md`. Markdown, not TS, so quick iteration without recompile.

## Phased implementation

**Phase 1 — implementer workflow + planner + skip rules** -- DONE --

- `klaus implement --milestone <name>` — iterate `gh issue list`, run planner to topo-sort, apply skip rules, sequential.
- Per-issue runs land in `.klaus/runs/<ts>/issue-<N>.log`.
- Planner ships in this phase because sequential mode still needs it for ordering.

**Phase 2 — parallelism + tmux** -- DONE --

- `--parallel N` flag, semaphore wraps each implementer/reviewer target.
- Each target spawns a tmux pane in session `klaus`.
- Orchestrator polls window pids to detect completion.

**Phase 3 — reviewer workflow** -- DONE --

- Cleanup after successful issue runs: remove created worktrees and local branches once PRs are open; preserve abandoned worktrees for inspection.
- `klaus review --milestone <name>` creates detached review worktrees and launches interactive reviewer agents.

**Phase 4 — multi-model**

- Enable choosing between claude code or codex for harness + model (currently it's always claude code)

**Phase 5 — sandbox klaus to not need any permissions**

**Phase 6 — deploy remotely for AFK usage**

**Phase 7**

- Enable an outer outer loop that triggers implement/refine flow if a PR has comments. Can keep going until reviewer Klaus approves.
