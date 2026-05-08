# Klaus — agent entry point

Standalone npm package (`klaus-daimler`, binary `klaus`) that drives a GitHub milestone of issues through Claude Code agents running in tmux panes. Two workflows: `klaus implement` (issue → PR) and `klaus review` (PR → review comment).

## Always load before any work in this repo

- **`CONTEXT.md`** — canonical Klaus vocabulary: Controller Klaus, Implementer Klaus, Reviewer Klaus, lifecycle labels, worktrees, and run directories.
- **`ARCHITECTURE.md`** — high-level file structure, application architecture, runtime flows, and ADR index. Read before changing controller behavior.
- **`docs/conventions.md`** — coding style, testing rules, shell-boundary patterns, and commit message format. Follow it for all code changes.
- **Relevant `docs/adr/` records** — durable decisions and trade-offs. Read any ADRs that touch the area you are changing.
- **Relevant `docs/proposals/` notes** — future or unsettled ideas. Read these only when working on a feature they describe.

## Tooling

- pnpm. Node 22+. TypeScript strict. Vitest. ESM only.
- `pnpm test` runs the unit suite; `pnpm typecheck && pnpm test && pnpm build` is the full quality gate.
- Configuration is via env vars (`KLAUS_CONVENTIONS_PATH`, `KLAUS_LABEL_*`); see `src/config.ts` and the README.

## Agent skills

### Issue tracker

GitHub Issues at `charliejeppsson/klaus-daimler`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage labels using the default names (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). Klaus additionally defines two lifecycle labels (`ready-for-review`, `reviewed-by-agent`) it sets itself during workflow execution. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the repo root, ADRs at `docs/adr/`, proposals at `docs/proposals/`. See `docs/agents/domain.md`.
