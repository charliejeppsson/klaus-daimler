# Setup Init Command

`klaus setup` or `klaus init` should turn a target repo into a better Klaus target without requiring users to remember every environment variable and label convention.

Likely responsibilities:

- Detect common agent entry files such as `AGENTS.md`, `CLAUDE.md`, and `README.md`.
- Require the user to provide the target repo's conventions file path, then persist that path locally for future prompt injection.
- Check for required GitHub labels and offer to create them.
- Check that `.klaus/` is ignored.

Until this flow exists, conventions injection remains manual configuration.
