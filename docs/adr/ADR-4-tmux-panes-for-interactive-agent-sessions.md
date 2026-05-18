# Tmux panes for interactive agent sessions

Klaus launches each agent in a tmux pane so the user can see prompts, approve coding-agent tool calls, and inspect abandoned sessions. This preserves control while the selected agent runs in interactive mode, even though it makes high parallelism noisy until unattended sandboxing exists.
