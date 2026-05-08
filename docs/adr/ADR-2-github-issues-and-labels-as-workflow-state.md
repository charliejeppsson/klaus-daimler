# GitHub issues and labels as workflow state

Klaus uses GitHub issues, milestones, pull requests, and labels as the source of truth for workflow state instead of maintaining a separate database or state file. This makes runs idempotent and inspectable with normal GitHub tooling, at the cost of depending on label discipline and `gh` availability.
