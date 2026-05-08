# Grouped workflow source layout

Klaus keeps its source layout workflow-first, but the flat `src/` layout no longer scales cleanly as Klaus grows beyond Implementer Klaus and Reviewer Klaus.

Controller Klaus now keeps executable workflow code under `src/workflows/`, shared deterministic controller mechanics under `src/controller/`, and external command boundaries under `src/shell/`. The package keeps `src/main.ts` as the stable executable shim so the published `dist/main.js` entry point does not move.

`src/workflows/plan/` is reserved for the future Planner Klaus workflow. Existing blocked-by parsing and issue ordering belongs to Controller Klaus as `src/controller/scheduler.ts`; it must not use `plan` or `planning` names because that would confuse Controller Klaus dispatch scheduling with Planner Klaus.

This supersedes ADR-1's flat-file layout while preserving its core decision: Klaus remains workflow-first and does not adopt a generic domain/application/infrastructure split.
