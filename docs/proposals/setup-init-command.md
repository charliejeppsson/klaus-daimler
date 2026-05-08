# Setup Init Command

`klaus setup` or `klaus init` should turn a target repo into a better Klaus target without requiring users to remember every environment variable and label convention.

Likely responsibilities:

- Detect common agent entry files such as `AGENTS.md`, `CLAUDE.md`, and `README.md`.
- Ask for or discover the repo conventions file, then persist that path locally for future prompt injection.
- Check for required GitHub labels and offer to create them.
- Check that `.klaus/` is ignored.

The current escape hatch remains `KLAUS_CONVENTIONS_PATH`.
