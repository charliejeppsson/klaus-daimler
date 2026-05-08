# Controller owns labels and session lifecycle

Controller Klaus, not Implementer Klaus or Reviewer Klaus, owns lifecycle label transitions, session detection, pane shutdown, and local worktree cleanup. Keeping those responsibilities in the controller makes agent prompts narrower and keeps workflow state changes observable in one place.
