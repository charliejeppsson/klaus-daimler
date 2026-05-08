# Git worktrees for agent isolation

Implementer Klaus and Reviewer Klaus run in git worktrees under `.klaus/` rather than sharing the target repo checkout. Worktrees provide cheap local isolation, preserve abandoned runs for inspection, and avoid the operational weight of Docker for the current personal CLI use case.
