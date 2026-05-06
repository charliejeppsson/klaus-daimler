# Task: Issue #{{ISSUE_NUMBER}} — {{ISSUE_TITLE}}

{{ISSUE_BODY}}

# Working environment

- You are in a git worktree on branch `{{BRANCH}}`.
- Read the repository's `CLAUDE.md` and `README.md` first if present; follow whatever entry-point conventions they describe.

# Conventions

{{CONVENTIONS}}

# Approach

- Explore the codebase before coding. Pay attention to tests near what you're touching.
- Write a failing test first when adding behaviour.
- Run the project's typecheck, test, and lint commands before committing.

# Done

- Commit on the current branch with a focused message.
- Open a PR (ready for review, not draft) with the body in this exact format (brief — one or two sentences per section):

  ```markdown
  ## What
  <one sentence describing the change>

  ## Why
  <one or two sentences on the motivation; reference the issue's stated goal>

  ## How to validate
  <commands or steps a reviewer can run; if the test suite is currently red, say so here and include the failing test names>

  Closes #{{ISSUE_NUMBER}}
  ```

- Use `gh pr create --title "<commit subject>" --body "$(cat <<'EOF' … EOF)"` so the body renders cleanly.

Once the PR is open, your work is done. Klaus will detect it, flip the issue label, and close this session — you don't need to do anything else.
