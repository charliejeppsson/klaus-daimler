# Klaus Conventions

These conventions apply when changing `klaus-daimler` itself. They are intentionally smaller than a general application style guide because Klaus is a compact workflow-first CLI.

## General

- Prefer the workflow-first source structure over adding generic architectural layers.
- Let `CONTEXT.md`, `ARCHITECTURE.md`, and relevant ADRs set the vocabulary and boundaries.
- Comments should explain hidden constraints, external tool quirks, or non-obvious trade-offs. Do not comment obvious control flow.

## TypeScript

- ESM only. Use `.js` extensions in relative imports.
- Keep TypeScript strict. `any` is banned. Use `unknown` and narrow.
- Prefer `type` aliases. Use `interface` only when it is clearly more suitable.
- Use named exports only.
- Use `readonly` arrays and `Readonly<T>` for data that should not be mutated.
- Keep public exports near the top of a module and private helpers below the main flow.

## Source Layout

- Keep executable Klaus hats under `src/workflows/`: `implement/`, `review/`, and eventually `plan/`.
- Reserve `src/workflows/plan/` for Planner Klaus. Do not use `plan` or `planning` names for Controller Klaus scheduling.
- Put shared deterministic Controller Klaus mechanics in `src/controller/`.
- Put shell boundaries in `src/shell/`:
  - GitHub CLI calls in `github.ts`
  - git worktree and branch calls in `git.ts`
  - tmux calls in `tmux.ts`
- Keep deterministic scheduling in code. Do not use an LLM for `## Blocked by` parsing or issue ordering.
- Controller Klaus owns lifecycle labels, pane/session detection, and local cleanup. Implementer Klaus and Reviewer Klaus prompts should stay focused on their single target.

## External Data

- Validate external command JSON with Zod at the boundary.
- Prefer clear thrown errors at command boundaries over silently continuing with partial state.
- Preserve useful stderr/stdout details in errors from `gh`, `git`, and `tmux`.

## Tests

- Use Vitest.
- Keep tests colocated as `*.test.ts`.
- Add or update tests for new controller behavior, scheduler behavior, prompt rendering, shell command construction, and config parsing.
- Documentation-only changes do not need tests, but run `pnpm test` when code or prompt behavior changes.
- Full quality gate: `pnpm typecheck && pnpm test && pnpm build`.

## Commits

Use this message structure for commits:

```txt
{title}

* Change description 1
* Change description 2
...
* Change description N

Co-authored-by: {current coding agent details}
```

Use concise bullets that describe concrete changes.
