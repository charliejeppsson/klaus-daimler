# Klaus Conventions

These conventions apply when changing `klaus-daimler` itself. They are intentionally smaller than a general application style guide because Klaus is a compact workflow-first CLI.

## General

- Prefer the existing workflow-first structure over adding new architectural layers.
- Let `CONTEXT.md`, `ARCHITECTURE.md`, and relevant ADRs set the vocabulary and boundaries.
- Comments should explain hidden constraints, external tool quirks, or non-obvious trade-offs. Do not comment obvious control flow.

## TypeScript

- ESM only. Use `.js` extensions in relative imports.
- Keep TypeScript strict. `any` is banned. Use `unknown` and narrow.
- Prefer `type` aliases. Use `interface` only when it is clearly more suitable.
- Use named exports only.
- Use `readonly` arrays and `Readonly<T>` for data that should not be mutated.
- Keep public exports near the top of a module and private helpers below the main flow.

## Workflow Modules

- `implement.ts` and `review.ts` should read top-to-bottom as complete workflows.
- Keep shell boundaries in sibling modules:
  - GitHub CLI calls in `github.ts`
  - git worktree and branch calls in `git.ts`
  - tmux calls in `tmux.ts`
- Keep deterministic planning in code. Do not use an LLM for `## Blocked by` parsing or issue ordering.
- Controller Klaus owns lifecycle labels, pane/session detection, and local cleanup. Implementer Klaus and Reviewer Klaus prompts should stay focused on their single target.

## External Data

- Validate external command JSON with Zod at the boundary.
- Prefer clear thrown errors at command boundaries over silently continuing with partial state.
- Preserve useful stderr/stdout details in errors from `gh`, `git`, and `tmux`.

## Tests

- Use Vitest.
- Keep tests colocated as `*.test.ts`.
- Add or update tests for new controller behavior, planning behavior, prompt rendering, shell command construction, and config parsing.
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
