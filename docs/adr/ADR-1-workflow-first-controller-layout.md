# Workflow-first controller layout

Status: Superseded by [ADR-8: Grouped workflow source layout](ADR-8-grouped-workflow-source-layout.md).

Klaus keeps each top-level workflow in a readable file (`implement.ts` and `review.ts`) and keeps shared I/O wrappers (`github.ts`, `git.ts`, `tmux.ts`) beside them. A domain/application/infrastructure split would add indirection without improving the current controller, because the meaningful boundary is the workflow and the external tools it shells out to.
